import { equal, ok, rejects } from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { MockAgent, getGlobalDispatcher, setGlobalDispatcher } from 'undici'
import { fetchAndOptimize } from '../src/index.ts'

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

test('fetchAndOptimize fetches an image, optimizes it and returns response metadata', async () => {
  const upstream = readFileSync(join(fixtures, 'source.jpg'))

  const mockPool = mockAgent.get('https://images.example')
  mockPool.intercept({ path: '/source.jpg', method: 'GET' }).reply(200, upstream, {
    headers: {
      'content-type': 'image/jpeg',
      'cache-control': 'public, max-age=3600'
    }
  })

  const optimized = await fetchAndOptimize('https://images.example/source.jpg', width, quality)

  ok(optimized.buffer.byteLength < upstream.byteLength)
  equal(optimized.contentType, 'image/jpeg')
  equal(optimized.cacheControl, 'public, max-age=3600')
})

test('fetchAndOptimize returns null metadata when headers are missing', async () => {
  const upstream = readFileSync(join(fixtures, 'source.png'))

  const mockPool = mockAgent.get('https://images.example')
  mockPool.intercept({ path: '/source.png', method: 'GET' }).reply(200, upstream)

  const optimized = await fetchAndOptimize('https://images.example/source.png', width, quality)

  equal(optimized.contentType, null)
  equal(optimized.cacheControl, null)
})

test('fetchAndOptimize throws BadGatewayError on non-2xx response', async () => {
  const mockPool = mockAgent.get('https://images.example')
  mockPool.intercept({ path: '/missing.jpg', method: 'GET' }).reply(404, 'missing')

  await rejects(fetchAndOptimize('https://images.example/missing.jpg', width, quality), {
    name: 'BadGatewayError',
    code: 'HTTP_ERROR_BAD_GATEWAY',
    statusCode: 502,
    message: 'Unable to fetch the image. [HTTP 404]',
    response: 'missing'
  })
})
