import type { FastifyInstance } from 'fastify'
import { deepEqual, equal, ok } from 'node:assert'
import { afterEach, test } from 'node:test'
import { createServer } from '../src/index.ts'

const servers: FastifyInstance[] = []

afterEach(async () => {
  while (servers.length > 0) {
    const server = servers.pop()
    if (!server) {
      continue
    }

    await server.close()
  }
})

test('createServer handles GET / requests', async () => {
  const calls: Array<Record<string, any>> = []

  const queue = {
    async fetchAndOptimize (url: string, width: number, quality: number, allowSVG: boolean) {
      calls.push({ url, width, quality, allowSVG })
      return {
        buffer: Buffer.from('ok'),
        contentType: 'image/webp',
        cacheControl: 'public, max-age=60'
      }
    },
    async optimize () {
      throw new Error('unexpected')
    }
  } as any

  const server = await createServer({ queue })
  servers.push(server)

  const response = await server.inject({
    method: 'GET',
    url: '/?url=https%3A%2F%2Fimages.example%2Fa.jpg&width=120&quality=75'
  })

  equal(response.statusCode, 200)
  equal(response.headers['content-type'], 'image/webp')
  equal(response.headers['cache-control'], 'public, max-age=60')
  equal(response.body, 'ok')
  deepEqual(calls, [{ url: 'https://images.example/a.jpg', width: 120, quality: 75, allowSVG: false }])
})

test('createServer returns cause stack for unexpected 500 errors when enabled', async () => {
  const queue = {
    async fetchAndOptimize () {
      throw new Error('boom')
    },
    async optimize () {
      throw new Error('unexpected')
    }
  } as any

  const server = await createServer({ queue, includeErrorCausesInResponse: true })
  servers.push(server)

  const response = await server.inject({
    method: 'GET',
    url: '/?url=https%3A%2F%2Fimages.example%2Fa.jpg&width=120&quality=75'
  })

  equal(response.statusCode, 500)

  const payload = response.json()
  equal(payload.statusCode, 500)
  equal(payload.error, 'Internal Server Error')
  equal(payload.message, 'An unexpected error occurred.')
  ok(payload.cause)
  equal(payload.cause.message, '[Error] boom')
  ok(Array.isArray(payload.cause.stack))
  ok(payload.cause.stack.length > 0)
})

test('createServer does not return cause stack for unexpected 500 errors by default', async () => {
  const queue = {
    async fetchAndOptimize () {
      throw new Error('boom')
    },
    async optimize () {
      throw new Error('unexpected')
    }
  } as any

  const server = await createServer({ queue })
  servers.push(server)

  const response = await server.inject({
    method: 'GET',
    url: '/?url=https%3A%2F%2Fimages.example%2Fa.jpg&width=120&quality=75'
  })

  equal(response.statusCode, 500)

  const payload = response.json()
  equal(payload.statusCode, 500)
  equal(payload.error, 'Internal Server Error')
  equal(payload.message, 'An unexpected error occurred.')
  equal('cause' in payload, false)
})

test('createServer returns 400 for invalid query parameters', async () => {
  const queue = {
    async fetchAndOptimize () {
      throw new Error('unexpected')
    },
    async optimize () {
      throw new Error('unexpected')
    }
  } as any

  const server = await createServer({ queue })
  servers.push(server)

  const response = await server.inject({ method: 'GET', url: '/?quality=80' })

  equal(response.statusCode, 400)
  deepEqual(response.json(), {
    statusCode: 400,
    error: 'Bad Request',
    message: 'Missing url parameter'
  })
})

test('createServer returns 400 for invalid width value', async () => {
  const queue = {
    async fetchAndOptimize () {
      throw new Error('unexpected')
    },
    async optimize () {
      throw new Error('unexpected')
    }
  } as any

  const server = await createServer({ queue })
  servers.push(server)

  const response = await server.inject({ method: 'GET', url: '/?url=https%3A%2F%2Fa&width=0&quality=80' })

  equal(response.statusCode, 400)
  deepEqual(response.json(), {
    statusCode: 400,
    error: 'Bad Request',
    message: 'Invalid width parameter'
  })
})

test('createServer returns 404 for unsupported routes', async () => {
  const queue = {
    async fetchAndOptimize () {
      throw new Error('unexpected')
    },
    async optimize () {
      throw new Error('unexpected')
    }
  } as any

  const server = await createServer({ queue })
  servers.push(server)

  const notFound = await server.inject({ method: 'GET', url: '/nope' })
  equal(notFound.statusCode, 404)
  deepEqual(notFound.json(), {
    statusCode: 404,
    error: 'Not Found',
    message: 'Invalid endpoint'
  })
})

test('createServer supports custom path', async () => {
  const calls: Array<Record<string, any>> = []

  const queue = {
    async fetchAndOptimize (url: string, width: number, quality: number, allowSVG: boolean) {
      calls.push({ url, width, quality, allowSVG })
      return {
        buffer: Buffer.from('ok'),
        contentType: 'image/webp',
        cacheControl: null
      }
    }
  } as any

  const server = await createServer({ queue, path: '/img' })
  servers.push(server)

  const response = await server.inject({
    method: 'GET',
    url: '/img?url=https%3A%2F%2Fimages.example%2Fa.jpg&width=100&quality=80'
  })

  equal(response.statusCode, 200)
  equal(response.body, 'ok')
  deepEqual(calls, [{ url: 'https://images.example/a.jpg', width: 100, quality: 80, allowSVG: false }])
})

test('createServer stops internally created queue on close', async () => {
  const server = await createServer()
  servers.push(server)

  const response = await server.inject({ method: 'GET', url: '/?url=https%3A%2F%2Fa&width=0&quality=1' })
  equal(response.statusCode, 400)

  await server.close()
  servers.pop()
})
