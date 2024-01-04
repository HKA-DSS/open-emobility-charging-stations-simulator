import type { IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'

import { StatusCodes } from 'http-status-codes'
import { type RawData, WebSocket, WebSocketServer } from 'ws'

import { AbstractUIServer } from './AbstractUIServer.js'
import { UIServerUtils } from './UIServerUtils.js'
import {
  type ProtocolRequest,
  type ProtocolResponse,
  type UIServerConfiguration,
  WebSocketCloseEventStatusCode
} from '../../types/index.js'
import {
  Constants,
  getWebSocketCloseEventStatusString,
  isNotEmptyString,
  logPrefix,
  logger,
  validateUUID
} from '../../utils/index.js'

const moduleName = 'UIWebSocketServer'

export class UIWebSocketServer extends AbstractUIServer {
  private readonly webSocketServer: WebSocketServer

  public constructor (protected readonly uiServerConfiguration: UIServerConfiguration) {
    super(uiServerConfiguration)
    this.webSocketServer = new WebSocketServer({
      handleProtocols: UIServerUtils.handleProtocols,
      noServer: true
    })
  }

  public start (): void {
    this.webSocketServer.on('connection', (ws: WebSocket, _req: IncomingMessage): void => {
      if (!UIServerUtils.isProtocolAndVersionSupported(ws.protocol)) {
        logger.error(
          `${this.logPrefix(
            moduleName,
            'start.server.onconnection'
          )} Unsupported UI protocol version: '${ws.protocol}'`
        )
        ws.close(WebSocketCloseEventStatusCode.CLOSE_PROTOCOL_ERROR)
      }
      const [, version] = UIServerUtils.getProtocolAndVersion(ws.protocol)
      this.registerProtocolVersionUIService(version)
      ws.on('message', (rawData) => {
        const request = this.validateRawDataRequest(rawData)
        if (request === false) {
          ws.close(WebSocketCloseEventStatusCode.CLOSE_INVALID_PAYLOAD)
          return
        }
        const [requestId] = request as ProtocolRequest
        this.responseHandlers.set(requestId, ws)
        this.uiServices
          .get(version)
          ?.requestHandler(request)
          .then((protocolResponse?: ProtocolResponse) => {
            if (protocolResponse != null) {
              this.sendResponse(protocolResponse)
            }
          })
          .catch(Constants.EMPTY_FUNCTION)
      })
      ws.on('error', (error) => {
        logger.error(`${this.logPrefix(moduleName, 'start.ws.onerror')} WebSocket error:`, error)
      })
      ws.on('close', (code, reason) => {
        logger.debug(
          `${this.logPrefix(
            moduleName,
            'start.ws.onclose'
          )} WebSocket closed: '${getWebSocketCloseEventStatusString(
            code
          )}' - '${reason.toString()}'`
        )
      })
    })
    this.httpServer.on('connect', (req: IncomingMessage, socket: Duplex, _head: Buffer) => {
      if (req.headers.connection !== 'Upgrade' || req.headers.upgrade !== 'websocket') {
        socket.write(`HTTP/1.1 ${StatusCodes.BAD_REQUEST} Bad Request\r\n\r\n`)
        socket.destroy()
      }
    })
    this.httpServer.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer): void => {
      this.authenticate(req, (err) => {
        if (err != null) {
          socket.write(`HTTP/1.1 ${StatusCodes.UNAUTHORIZED} Unauthorized\r\n\r\n`)
          socket.destroy()
          return
        }
        try {
          this.webSocketServer.handleUpgrade(req, socket, head, (ws: WebSocket) => {
            this.webSocketServer.emit('connection', ws, req)
          })
        } catch (error) {
          logger.error(
            `${this.logPrefix(
              moduleName,
              'start.httpServer.on.upgrade'
            )} Error at handling connection upgrade:`,
            error
          )
        }
      })
    })
    this.startHttpServer()
  }

  public sendRequest (request: ProtocolRequest): void {
    this.broadcastToClients(JSON.stringify(request))
  }

  public sendResponse (response: ProtocolResponse): void {
    const responseId = response[0]
    try {
      if (this.hasResponseHandler(responseId)) {
        const ws = this.responseHandlers.get(responseId) as WebSocket
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(response))
        } else {
          logger.error(
            `${this.logPrefix(
              moduleName,
              'sendResponse'
            )} Error at sending response id '${responseId}', WebSocket is not open: ${
              ws.readyState
            }`
          )
        }
      } else {
        logger.error(
          `${this.logPrefix(
            moduleName,
            'sendResponse'
          )} Response for unknown request id: ${responseId}`
        )
      }
    } catch (error) {
      logger.error(
        `${this.logPrefix(
          moduleName,
          'sendResponse'
        )} Error at sending response id '${responseId}':`,
        error
      )
    } finally {
      this.responseHandlers.delete(responseId)
    }
  }

  public logPrefix = (modName?: string, methodName?: string, prefixSuffix?: string): string => {
    const logMsgPrefix =
      prefixSuffix != null ? `UI WebSocket Server ${prefixSuffix}` : 'UI WebSocket Server'
    const logMsg =
      isNotEmptyString(modName) && isNotEmptyString(methodName)
        ? ` ${logMsgPrefix} | ${modName}.${methodName}:`
        : ` ${logMsgPrefix} |`
    return logPrefix(logMsg)
  }

  private broadcastToClients (message: string): void {
    for (const client of this.webSocketServer.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message)
      }
    }
  }

  private validateRawDataRequest (rawData: RawData): ProtocolRequest | false {
    // logger.debug(
    //   `${this.logPrefix(
    //     moduleName,
    //     'validateRawDataRequest'
    //     // eslint-disable-next-line @typescript-eslint/no-base-to-string
    //   )} Raw data received in string format: ${rawData.toString()}`
    // )

    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    const request = JSON.parse(rawData.toString()) as ProtocolRequest

    if (!Array.isArray(request)) {
      logger.error(
        `${this.logPrefix(
          moduleName,
          'validateRawDataRequest'
        )} UI protocol request is not an array:`,
        request
      )
      return false
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (request.length !== 3) {
      logger.error(
        `${this.logPrefix(moduleName, 'validateRawDataRequest')} UI protocol request is malformed:`,
        request
      )
      return false
    }

    if (!validateUUID(request[0])) {
      logger.error(
        `${this.logPrefix(
          moduleName,
          'validateRawDataRequest'
        )} UI protocol request UUID field is invalid:`,
        request
      )
      return false
    }

    return request
  }
}
