import type { Queue } from './queue.ts'

export type ErrorProperties = { cause?: Error } & Record<string, any>

export interface OptimizeJobPayload {
  type: 'optimize'
  buffer: string
  width: number
  quality: number
  allowSVG: boolean
}

export interface FetchAndOptimizeJobPayload {
  type: 'fetchAndOptimize'
  url: string
  width: number
  quality: number
  allowSVG: boolean
}

export type QueuePayload = OptimizeJobPayload | FetchAndOptimizeJobPayload

export interface QueueOptions {
  storage?: unknown
  workerId?: string
  concurrency?: number
  blockTimeout?: number
  maxRetries?: number
  visibilityTimeout?: number
  processingQueueTTL?: number
  resultTTL?: number
}

export interface Job {
  payload: QueuePayload
}

export interface ServerOptions {
  queue?: Queue
  queueOptions?: QueueOptions
  path?: string
  allowSVG?: boolean
  maxBodySize?: number
}

export type OptimizeQuery = Record<string, string | undefined>

export interface Image<T = Buffer | string> {
  buffer: T
  contentType?: string | null
  cacheControl?: string | null
}
