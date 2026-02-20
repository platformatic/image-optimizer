import type { EnqueueAndWaitOptions, Queue as JobQueue, MemoryStorage } from '@platformatic/job-queue'
import { InternalServerError } from 'http-errors-enhanced'
import { randomUUID } from 'node:crypto'
import { fetchAndOptimize } from './operations.ts'
import { queueResultSerde } from './result-serde.ts'
import type { Image, Job, QueueOptions, QueuePayload } from './types.ts'

interface JobQueueModule {
  Queue: typeof JobQueue
  MemoryStorage: typeof MemoryStorage
}

export class Queue {
  protected static jobQueueModulePromise: Promise<JobQueueModule> | null = null

  #queue: JobQueue<QueuePayload, Image<Buffer>> | null = null
  #started = false
  #options: QueueOptions

  constructor (options: QueueOptions = {}) {
    this.#options = options
  }

  // This is separated into its own method to allow easier mocking during tests.
  protected static async loadJobQueueModule (): Promise<JobQueueModule> {
    if (this.jobQueueModulePromise) {
      return this.jobQueueModulePromise
    }

    this.jobQueueModulePromise = import('@platformatic/job-queue')
    return this.jobQueueModulePromise
  }

  async start (): Promise<void> {
    if (this.#started) {
      return
    }

    const queueClass = this.constructor as typeof Queue

    let jobQueueModule: JobQueueModule
    try {
      jobQueueModule = await queueClass.loadJobQueueModule()
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND' &&
        (error as Error).message.includes("'@platformatic/job-queue'")
      ) {
        throw new InternalServerError('The Queue requires @platformatic/job-queue to be installed', {
          cause: error as Error
        })
      }

      throw error
    }

    const { Queue: JobQueue, MemoryStorage } = jobQueueModule

    const storage = (this.#options.storage ?? new MemoryStorage()) as any

    const queue = new JobQueue<QueuePayload, Image<Buffer>>({
      storage,
      workerId: this.#options.workerId,
      concurrency: this.#options.concurrency,
      blockTimeout: this.#options.blockTimeout,
      maxRetries: this.#options.maxRetries,
      visibilityTimeout: this.#options.visibilityTimeout,
      processingQueueTTL: this.#options.processingQueueTTL,
      resultTTL: this.#options.resultTTL,
      resultSerde: queueResultSerde
    })

    queue.execute(this.#execute.bind(this))

    await queue.start()

    this.#queue = queue
    this.#started = true
  }

  async stop (): Promise<void> {
    if (!this.#queue || !this.#started) {
      return
    }

    await this.#queue.stop()
    this.#queue = null
    this.#started = false
  }

  async fetchAndOptimize (
    url: string,
    width: number,
    quality: number,
    allowSVG = false,
    options?: EnqueueAndWaitOptions
  ): Promise<Image<Buffer>> {
    const result = await this.#enqueueAndWait(
      {
        type: 'fetchAndOptimize',
        url,
        width,
        quality,
        allowSVG
      },
      options
    )

    return {
      buffer: result.buffer,
      contentType: result.contentType ?? null,
      cacheControl: result.cacheControl ?? null
    }
  }

  async #enqueueAndWait (payload: QueuePayload, options?: EnqueueAndWaitOptions): Promise<Image<Buffer>> {
    if (!this.#queue || !this.#started) {
      await this.start()
    }

    return this.#queue!.enqueueAndWait(randomUUID(), payload, options)
  }

  async #execute ({ payload }: Job): Promise<Image<Buffer>> {
    return fetchAndOptimize(payload.url, payload.width, payload.quality, payload.allowSVG)
  }
}

export async function createQueue (options: QueueOptions = {}): Promise<Queue> {
  const queue = new Queue(options)
  await queue.start()
  return queue
}
