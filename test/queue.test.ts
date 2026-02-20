import { deepEqual, equal, ok, rejects } from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { getGlobalDispatcher, MockAgent, setGlobalDispatcher } from 'undici'
import { createQueue, fetchAndOptimize, Queue } from '../src/index.ts'

class ProbeQueue extends Queue {
  static resetModuleCache (): void {
    this.jobQueueModulePromise = null
  }

  static async exposeLoadJobQueueModule (): Promise<any> {
    return super.loadJobQueueModule()
  }
}

class MissingJobQueueModuleQueue extends Queue {
  protected static async loadJobQueueModule (): Promise<any> {
    const error = new Error("Cannot find package '@platformatic/job-queue'") as NodeJS.ErrnoException
    error.code = 'ERR_MODULE_NOT_FOUND'
    throw error
  }
}

class BrokenJobQueueModuleQueue extends Queue {
  protected static async loadJobQueueModule (): Promise<any> {
    throw new Error('boom')
  }
}

class EnqueueOptionsSpyJobQueue {
  static calls: Array<{ payload: any; options: any }> = []

  execute (): void {}

  async start (): Promise<void> {}

  async stop (): Promise<void> {}

  async enqueueAndWait (_id: string, payload: any, options?: any): Promise<any> {
    EnqueueOptionsSpyJobQueue.calls.push({ payload, options })

    return {
      buffer: Buffer.from('queued-image'),
      contentType: 'image/webp',
      cacheControl: 'public, max-age=10'
    }
  }
}

class EnqueueOptionsQueue extends Queue {
  protected static async loadJobQueueModule (): Promise<any> {
    return {
      Queue: EnqueueOptionsSpyJobQueue,
      MemoryStorage: class {}
    }
  }
}

const fixtures = join(import.meta.dirname, 'fixtures', 'before')
const width = 120
const quality = 60

const previousDispatcher = getGlobalDispatcher()
const mockAgent = new MockAgent()

before(() => {
  setGlobalDispatcher(mockAgent)
  mockAgent.disableNetConnect()
})

after(async () => {
  await mockAgent.close()
  setGlobalDispatcher(previousDispatcher)
})

test('Queue loads @platformatic/job-queue module and caches it', async () => {
  ProbeQueue.resetModuleCache()

  const first = await ProbeQueue.exposeLoadJobQueueModule()
  const second = await ProbeQueue.exposeLoadJobQueueModule()

  equal(typeof first.Queue, 'function')
  equal(typeof first.MemoryStorage, 'function')
  equal(first, second)
})

test('Queue.start throws InternalServerError when @platformatic/job-queue is missing', async () => {
  const optimizer = new MissingJobQueueModuleQueue()

  await rejects(optimizer.start(), {
    name: 'InternalServerError',
    code: 'HTTP_ERROR_INTERNAL_SERVER_ERROR',
    statusCode: 500,
    message: 'The Queue requires @platformatic/job-queue to be installed'
  })
})

test('Queue.start rethrows unknown module loading errors', async () => {
  const optimizer = new BrokenJobQueueModuleQueue()

  await rejects(optimizer.start(), {
    name: 'Error',
    message: 'boom'
  })
})

test('Queue.start is idempotent', async () => {
  const optimizer = new Queue()

  await optimizer.start()
  await optimizer.start()
  await optimizer.stop()
})

test('createQueue returns a started queue', async () => {
  const optimizer = await createQueue()
  const source = readFileSync(join(fixtures, 'source.png'))

  const mockPool = mockAgent.get('https://queue-images.example')
  mockPool.intercept({ path: '/create-queue.png', method: 'GET' }).reply(200, source)

  const optimized = await optimizer.fetchAndOptimize('https://queue-images.example/create-queue.png', width, quality)

  ok(optimized.buffer.byteLength <= source.byteLength)

  await optimizer.stop()
})

test('Queue.stop is a no-op when queue is not started', async () => {
  const optimizer = new Queue()

  await optimizer.stop()
})

test('Queue starts on demand when fetchAndOptimize is called before start', async () => {
  const optimizer = new Queue()
  const source = readFileSync(join(fixtures, 'source.jpg'))

  const mockPool = mockAgent.get('https://queue-images.example')
  mockPool.intercept({ path: '/on-demand.jpg', method: 'GET' }).reply(200, source)

  const optimized = await optimizer.fetchAndOptimize('https://queue-images.example/on-demand.jpg', width, quality)

  ok(optimized.buffer.byteLength < source.byteLength)

  await optimizer.stop()
})

test('Queue fetchAndOptimize works through queue jobs', async () => {
  const optimizer = new Queue({ concurrency: 2 })
  await optimizer.start()

  const source = readFileSync(join(fixtures, 'source.jpg'))

  const mockPool = mockAgent.get('https://queue-images.example')
  mockPool.intercept({ path: '/queue-jobs.jpg', method: 'GET' }).reply(200, source, {
    headers: {
      'content-type': 'image/jpeg',
      'cache-control': 'public, max-age=42'
    }
  })
  mockPool.intercept({ path: '/queue-jobs.jpg', method: 'GET' }).reply(200, source, {
    headers: {
      'content-type': 'image/jpeg',
      'cache-control': 'public, max-age=42'
    }
  })

  const [queuedOptimized, directOptimized] = await Promise.all([
    optimizer.fetchAndOptimize('https://queue-images.example/queue-jobs.jpg', width, quality),
    fetchAndOptimize('https://queue-images.example/queue-jobs.jpg', width, quality)
  ])

  ok(queuedOptimized.buffer.byteLength < source.byteLength)
  deepEqual(queuedOptimized, directOptimized)

  await optimizer.stop()
})

test('Queue fetchAndOptimize forwards enqueue options', async () => {
  EnqueueOptionsSpyJobQueue.calls = []

  const optimizer = new EnqueueOptionsQueue()
  await optimizer.start()

  const fetchOptions = { timeout: 2400, maxAttempts: 2, resultTTL: 60_000 }
  await optimizer.fetchAndOptimize('https://queue-images.example/source.webp', width, quality, false, fetchOptions)

  equal(EnqueueOptionsSpyJobQueue.calls.length, 1)
  deepEqual(EnqueueOptionsSpyJobQueue.calls[0].options, fetchOptions)

  await optimizer.stop()
})

test('Queue fetchAndOptimize returns buffer and response metadata', async () => {
  const optimizer = new Queue()
  await optimizer.start()

  const source = readFileSync(join(fixtures, 'source.webp'))

  const mockPool = mockAgent.get('https://queue-images.example')
  mockPool.intercept({ path: '/source.webp', method: 'GET' }).reply(200, source, {
    headers: {
      'content-type': 'image/webp',
      'cache-control': 'public, max-age=42'
    }
  })

  const result = await optimizer.fetchAndOptimize('https://queue-images.example/source.webp', width, quality)

  ok(result.buffer.byteLength < source.byteLength)
  equal(result.contentType, 'image/webp')
  equal(result.cacheControl, 'public, max-age=42')

  await optimizer.stop()
})

test('Queue fetchAndOptimize returns null metadata when upstream headers are missing', async () => {
  const optimizer = new Queue()
  await optimizer.start()

  const source = readFileSync(join(fixtures, 'source.png'))

  const mockPool = mockAgent.get('https://queue-images.example')
  mockPool.intercept({ path: '/source.png', method: 'GET' }).reply(200, source)

  const result = await optimizer.fetchAndOptimize('https://queue-images.example/source.png', width, quality)

  equal(result.contentType, null)
  equal(result.cacheControl, null)

  await optimizer.stop()
})
