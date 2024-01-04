import process from 'node:process'

import chalk from 'chalk'

import { logger } from './Logger.js'
import { isNotEmptyString } from './Utils.js'
import type { ChargingStation } from '../charging-station/index.js'
import type {
  EmptyObject,
  FileType,
  HandleErrorParams,
  IncomingRequestCommand,
  JsonType,
  RequestCommand
} from '../types/index.js'

const defaultErrorParams = {
  throwError: true,
  consoleOut: false
}

export const handleUncaughtException = (): void => {
  process.on('uncaughtException', (error: Error) => {
    console.error(chalk.red('Uncaught exception: '), error)
  })
}

export const handleUnhandledRejection = (): void => {
  process.on('unhandledRejection', (reason: unknown) => {
    console.error(chalk.red('Unhandled rejection: '), reason)
  })
}

export const handleFileException = (
  file: string,
  fileType: FileType,
  error: NodeJS.ErrnoException,
  logPrefix: string,
  params: HandleErrorParams<EmptyObject> = defaultErrorParams
): void => {
  setDefaultErrorParams(params)
  const prefix = isNotEmptyString(logPrefix) ? `${logPrefix} ` : ''
  let logMsg: string
  switch (error.code) {
    case 'ENOENT':
      logMsg = `${fileType} file ${file} not found:`
      break
    case 'EEXIST':
      logMsg = `${fileType} file ${file} already exists:`
      break
    case 'EACCES':
      logMsg = `${fileType} file ${file} access denied:`
      break
    case 'EPERM':
      logMsg = `${fileType} file ${file} permission denied:`
      break
    default:
      logMsg = `${fileType} file ${file} error:`
  }
  if (params.consoleOut === true) {
    logMsg = `${logMsg} `
    if (params.throwError === true) {
      console.error(`${chalk.green(prefix)}${chalk.red(logMsg)}`, error)
    } else {
      console.warn(`${chalk.green(prefix)}${chalk.yellow(logMsg)}`, error)
    }
  } else if (params.consoleOut === false) {
    if (params.throwError === true) {
      logger.error(`${prefix}${logMsg}`, error)
    } else {
      logger.warn(`${prefix}${logMsg}`, error)
    }
  }
  if (params.throwError === true) {
    throw error
  }
}

export const handleSendMessageError = (
  chargingStation: ChargingStation,
  commandName: RequestCommand | IncomingRequestCommand,
  error: Error,
  params: HandleErrorParams<EmptyObject> = { throwError: false, consoleOut: false }
): void => {
  setDefaultErrorParams(params, { throwError: false, consoleOut: false })
  logger.error(`${chargingStation.logPrefix()} Request command '${commandName}' error:`, error)
  if (params.throwError === true) {
    throw error
  }
}

export const setDefaultErrorParams = <T extends JsonType>(
  params: HandleErrorParams<T>,
  defaultParams: HandleErrorParams<T> = defaultErrorParams
): HandleErrorParams<T> => {
  params = { ...defaultParams, ...params }
  return params
}
