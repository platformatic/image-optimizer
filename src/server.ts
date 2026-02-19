import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import Fastify from 'fastify'
import {
  addAdditionalProperties,
  BadRequestError,
  type HttpError,
  InternalServerError,
  isHttpError,
  messagesByCodes,
  NotFoundError,
  PayloadTooLargeError,
  serializeError
} from 'http-errors-enhanced'
import { imageMimeTypes } from './definitions.ts'
import { detectImageType } from './operations.ts'
import type { Queue } from './queue.ts'
import { createQueue } from './queue.ts'
import type { OptimizeQuery, ServerOptions } from './types.ts'

function readNumberQueryParam (query: OptimizeQuery, name: string): number {
  const value = Number(query[name])

  if (!Number.isFinite(value) || value <= 0) {
    throw new BadRequestError(`Invalid ${name} parameter`)
  }

  return value
}

function handleError (error: HttpError, reply: FastifyReply): void {
  const statusCode = error.statusCode
  const body: Record<string, any> = {
    statusCode,
    error: messagesByCodes[statusCode],
    message: error.message
  }

  addAdditionalProperties(body, error)

  if (statusCode === 500 && process.env.NODE_ENV !== 'production' && error.cause) {
    body.cause = serializeError(error.cause as Error)
  }

  reply.code(statusCode).send(body)
}

async function fetchAndOptimizeHandler (
  queue: Queue,
  { allowSVG }: ServerOptions,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const query = request.query as OptimizeQuery
  const url = query.url

  if (!url) {
    throw new BadRequestError('Missing url parameter')
  }

  const width = readNumberQueryParam(query, 'width')
  const quality = readNumberQueryParam(query, 'quality')

  const image = await queue.fetchAndOptimize(url, width, quality, allowSVG)

  if (image.contentType) {
    reply.header('content-type', image.contentType)
  }
  if (image.cacheControl) {
    reply.header('cache-control', image.cacheControl)
  }

  return reply.send(image.buffer)
}

async function optimizeHandler (
  queue: Queue,
  { allowSVG, maxBodySize }: ServerOptions,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const query = request.query as OptimizeQuery
  const width = readNumberQueryParam(query, 'width')
  const quality = readNumberQueryParam(query, 'quality')
  const body = request.body
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body ?? ''))

  if (payload.length > maxBodySize!) {
    throw new PayloadTooLargeError(`Request body exceeds the maximum allowed size of ${maxBodySize} bytes.`)
  }

  const optimized = await queue.optimize(payload, width, quality, allowSVG)
  const type = detectImageType(optimized)

  reply.header('content-type', type ? (imageMimeTypes[type] ?? 'application/octet-stream') : 'application/octet-stream')
  return reply.send(optimized)
}

export async function createServer (options: ServerOptions = {}): Promise<FastifyInstance> {
  const queue = options.queue ?? (await createQueue(options.queueOptions))
  const ownQueue = !options.queue
  const normalizedOptions = {
    path: options.path ?? '/',
    allowSVG: options.allowSVG ?? false,
    maxBodySize: options.maxBodySize ?? 10 * 1024 * 1024
  }

  const app = Fastify()

  app.addContentTypeParser('*', { parseAs: 'buffer' }, (_request, payload, done) => {
    done(null, payload)
  })

  app.setNotFoundHandler((_, reply) => {
    handleError(new NotFoundError('Invalid endpoint'), reply)
    throw new NotFoundError('Path not found.')
  })

  app.setErrorHandler((error: Error, _, reply) => {
    handleError(
      isHttpError(error) ? error : new InternalServerError('An unexpected error occurred.', { cause: error }),
      reply
    )
  })

  app.route({
    method: 'GET',
    url: normalizedOptions.path,
    handler: fetchAndOptimizeHandler.bind(null, queue, normalizedOptions)
  })

  app.route({
    method: 'POST',
    url: normalizedOptions.path,
    handler: optimizeHandler.bind(null, queue, normalizedOptions)
  })

  if (ownQueue) {
    app.addHook('onClose', async () => {
      await queue.stop()
    })
  }

  await app.ready()
  return app
}
