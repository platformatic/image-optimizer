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
  serializeError
} from 'http-errors-enhanced'
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

function handleError (error: HttpError, reply: FastifyReply, includeErrorCausesInResponse: boolean): void {
  const statusCode = error.statusCode
  const body: Record<string, any> = {
    statusCode,
    error: messagesByCodes[statusCode],
    message: error.message
  }

  addAdditionalProperties(body, error)

  if (statusCode === 500 && includeErrorCausesInResponse && error.cause) {
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

export async function createServer (options: ServerOptions = {}): Promise<FastifyInstance> {
  const queue = options.queue ?? (await createQueue(options.queueOptions))
  const ownQueue = !options.queue
  const normalizedOptions = {
    path: options.path ?? '/',
    allowSVG: options.allowSVG ?? false,
    includeErrorCausesInResponse: options.includeErrorCausesInResponse ?? false
  }

  const app = Fastify()

  app.setNotFoundHandler((_, reply) => {
    handleError(new NotFoundError('Invalid endpoint'), reply, normalizedOptions.includeErrorCausesInResponse)
    throw new NotFoundError('Path not found.')
  })

  app.setErrorHandler((error: Error, _, reply) => {
    handleError(
      isHttpError(error) ? error : new InternalServerError('An unexpected error occurred.', { cause: error }),
      reply,
      normalizedOptions.includeErrorCausesInResponse
    )
  })

  app.route({
    method: 'GET',
    url: normalizedOptions.path,
    handler: fetchAndOptimizeHandler.bind(null, queue, normalizedOptions)
  })

  if (ownQueue) {
    app.addHook('onClose', async () => {
      await queue.stop()
    })
  }

  await app.ready()
  return app
}
