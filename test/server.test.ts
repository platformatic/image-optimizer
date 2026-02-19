import { deepEqual, equal, ok } from 'node:assert'
import type { FastifyInstance } from 'fastify'
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

test('createServer handles POST / requests', async () => {
  const calls: Array<Record<string, any>> = []

  const queue = {
    async fetchAndOptimize () {
      throw new Error('unexpected')
    },
    async optimize (buffer: Buffer, width: number, quality: number, allowSVG: boolean) {
      calls.push({ width, quality, allowSVG, payload: buffer.toString() })
      return Buffer.from([0xff, 0xd8, 0xff, 0xdb])
    }
  } as any

  const server = await createServer({ queue })
  servers.push(server)

  const response = await server.inject({
    method: 'POST',
    url: '/?width=320&quality=80',
    payload: Buffer.from('source-image'),
    headers: {
      'content-type': 'application/octet-stream'
    }
  })

  equal(response.statusCode, 200)
  equal(response.headers['content-type'], 'image/jpeg')
  ok(response.rawPayload.byteLength > 0)
  deepEqual(calls, [{ width: 320, quality: 80, allowSVG: false, payload: 'source-image' }])
})

test('createServer handles POST requests without a body', async () => {
  const queue = {
    async fetchAndOptimize () {
      throw new Error('unexpected')
    },
    async optimize (buffer: Buffer) {
      equal(buffer.byteLength, 0)
      return Buffer.from([0xff, 0xd8, 0xff])
    }
  } as any

  const server = await createServer({ queue })
  servers.push(server)

  const response = await server.inject({
    method: 'POST',
    url: '/?width=100&quality=70'
  })

  equal(response.statusCode, 200)
  equal(response.headers['content-type'], 'image/jpeg')
})

test('createServer handles non-buffer POST body and falls back to octet-stream content type', async () => {
  const queue = {
    async fetchAndOptimize () {
      throw new Error('unexpected')
    },
    async optimize (buffer: Buffer) {
      equal(buffer.toString(), 'plain-text-body')
      return Buffer.from('not-an-image')
    }
  } as any

  const server = await createServer({ queue })
  servers.push(server)

  const response = await server.inject({
    method: 'POST',
    url: '/?width=100&quality=70',
    payload: 'plain-text-body',
    headers: {
      'content-type': 'text/plain'
    }
  })

  equal(response.statusCode, 200)
  equal(response.headers['content-type'], 'application/octet-stream')
})

test('createServer falls back to octet-stream for detected types without a mime mapping', async () => {
  const queue = {
    async fetchAndOptimize () {
      throw new Error('unexpected')
    },
    async optimize () {
      return Buffer.from([0x00, 0x00, 0x00, 0x0c, 0x6a, 0x50, 0x20, 0x20, 0x0d, 0x0a, 0x87, 0x0a])
    }
  } as any

  const server = await createServer({ queue })
  servers.push(server)

  const response = await server.inject({
    method: 'POST',
    url: '/?width=100&quality=70',
    payload: Buffer.from('source-image'),
    headers: {
      'content-type': 'application/octet-stream'
    }
  })

  equal(response.statusCode, 200)
  equal(response.headers['content-type'], 'application/octet-stream')
})

test('createServer returns cause stack for 500 errors outside production', async () => {
  const queue = {
    async fetchAndOptimize () {
      throw new Error('boom')
    },
    async optimize () {
      throw new Error('unexpected')
    }
  } as any

  const previousNodeEnv = process.env.NODE_ENV
  delete process.env.NODE_ENV

  const server = await createServer({ queue })
  servers.push(server)

  const response = await server.inject({
    method: 'GET',
    url: '/?url=https%3A%2F%2Fimages.example%2Fa.jpg&width=120&quality=75'
  })

  process.env.NODE_ENV = previousNodeEnv

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

test('createServer does not return cause stack for 500 errors in production', async () => {
  const queue = {
    async fetchAndOptimize () {
      throw new Error('boom')
    },
    async optimize () {
      throw new Error('unexpected')
    }
  } as any

  const previousNodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'

  const server = await createServer({ queue })
  servers.push(server)

  const response = await server.inject({
    method: 'GET',
    url: '/?url=https%3A%2F%2Fimages.example%2Fa.jpg&width=120&quality=75'
  })

  process.env.NODE_ENV = previousNodeEnv

  equal(response.statusCode, 500)

  const payload = response.json()
  equal(payload.statusCode, 500)
  equal(payload.error, 'Internal Server Error')
  equal(payload.message, 'An unexpected error occurred.')
  equal('causeStack' in payload, false)
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

test('createServer enforces maxBodySize and supports custom path', async () => {
  const queue = {
    async fetchAndOptimize () {
      throw new Error('unexpected')
    },
    async optimize () {
      throw new Error('unexpected')
    }
  } as any

  const server = await createServer({ queue, maxBodySize: 2, path: '/img' })
  servers.push(server)

  const response = await server.inject({
    method: 'POST',
    url: '/img?width=100&quality=80',
    payload: Buffer.from('too-big'),
    headers: {
      'content-type': 'application/octet-stream'
    }
  })

  equal(response.statusCode, 413)
  deepEqual(response.json(), {
    statusCode: 413,
    error: 'Payload Too Large',
    message: 'Request body exceeds the maximum allowed size of 2 bytes.'
  })
})

test('createServer stops internally created queue on close', async () => {
  const server = await createServer()
  servers.push(server)

  const response = await server.inject({ method: 'GET', url: '/?url=https%3A%2F%2Fa&width=0&quality=1' })
  equal(response.statusCode, 400)

  await server.close()
  servers.pop()
})
