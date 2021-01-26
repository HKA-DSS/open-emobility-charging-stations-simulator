import { WorkerEvents, WorkerSetElement } from '../types/Worker';

import Constants from '../utils/Constants';
import Utils from '../utils/Utils';
import { Worker } from 'worker_threads';
import Wrk from './Wrk';

export default class WorkerSet<T> extends Wrk {
  public maxElementsPerWorker: number;
  private workers: Set<WorkerSetElement>;

  /**
   * Create a new `WorkerSet`.
   *
   * @param {string} workerScript
   * @param {number} maxElementsPerWorker
   */
  constructor(workerScript: string, maxElementsPerWorker = 1) {
    super(workerScript);
    this.workers = new Set<WorkerSetElement>();
    this.maxElementsPerWorker = maxElementsPerWorker;
  }

  get size(): number {
    return this.workers.size;
  }

  /**
   *
   * @return {Promise<void>}
   * @public
   */
  public async addElement(elementData: T): Promise<void> {
    if (!this.workers) {
      throw Error('Cannot add a WorkerSet element: workers\' set does not exist');
    }
    if (this.getLastWorkerSetElement().numberOfWorkerElements >= this.maxElementsPerWorker) {
      this.startWorker();
      // Start worker sequentially to optimize memory at startup
      await Utils.sleep(Constants.START_WORKER_DELAY);
    }
    this.getLastWorker().postMessage({ id: WorkerEvents.START_WORKER_ELEMENT, workerData: elementData });
    this.getLastWorkerSetElement().numberOfWorkerElements++;
  }

  /**
   *
   * @return {Promise<void>}
   * @public
   */
  public async start(): Promise<void> {
    this.startWorker();
    // Start worker sequentially to optimize memory at startup
    await Utils.sleep(Constants.START_WORKER_DELAY);
  }

  /**
   *
   * @return {Promise}
   * @private
   */
  private startWorker(): void {
    const worker = new Worker(this.workerScript);
    worker.on('message', () => { });
    worker.on('error', () => { });
    worker.on('exit', (code) => {
      if (code !== 0) {
        console.error(`Worker stopped with exit code ${code}`);
      }
      // FIXME: remove matching worker set element
    });
    this.workers.add({ worker, numberOfWorkerElements: 0 });
  }

  private getLastWorkerSetElement(): WorkerSetElement {
    let workerSetElement: WorkerSetElement;
    // eslint-disable-next-line no-empty
    for (workerSetElement of this.workers) { }
    return workerSetElement;
  }

  private getLastWorker(): Worker {
    return this.getLastWorkerSetElement().worker;
  }

  private getWorkerSetElementByWorker(worker: Worker): WorkerSetElement {
    let workerSetElt: WorkerSetElement;
    this.workers.forEach((workerSetElement) => {
      if (JSON.stringify(workerSetElement.worker) === JSON.stringify(worker)) {
        workerSetElt = workerSetElement;
      }
    });
    return workerSetElt;
  }
}
