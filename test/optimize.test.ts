import { deepEqual, equal, ok, rejects } from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import sharp from 'sharp'
import { optimize } from '../src/index.ts'

const fixtures = join(import.meta.dirname, 'fixtures')
const beforeDir = join(fixtures, 'before')
const afterDir = join(fixtures, 'after')

const width = 120
const quality = 60

test('optimize throws on invalid input image', async () => {
  await rejects(optimize(Buffer.from('definitely-not-an-image'), width, quality), {
    name: 'BadRequestError',
    code: 'HTTP_ERROR_BAD_REQUEST',
    statusCode: 400,
    message: 'Invalid input image'
  })
})

test('optimize throws for animated images', async () => {
  const animatedPng = readFileSync(join(beforeDir, 'animated.png'))

  await rejects(optimize(animatedPng, width, quality), {
    name: 'BadRequestError',
    code: 'HTTP_ERROR_BAD_REQUEST',
    statusCode: 400,
    message: 'Unable to optimize and animated image'
  })
})

test('optimize blocks svg by default and allows it when requested', async () => {
  const svg = readFileSync(join(beforeDir, 'source.svg'))

  await rejects(optimize(svg, width, quality), {
    name: 'BadRequestError',
    code: 'HTTP_ERROR_BAD_REQUEST',
    statusCode: 400,
    message: 'SVG images are not allowed'
  })

  const allowed = await optimize(svg, width, quality, true)
  deepEqual(allowed, svg)
})

test('optimize transforms image formats and matches after fixtures', async () => {
  for (const name of ['source.jpg', 'source.png', 'source.webp', 'source.avif']) {
    const before = readFileSync(join(beforeDir, name))
    const expectedAfter = readFileSync(join(afterDir, name))

    const optimized = await optimize(before, width, quality)

    ok(optimized.byteLength < before.byteLength, `${name} did not get smaller`)

    const [optimizedMeta, expectedMeta] = await Promise.all([
      sharp(optimized).metadata(),
      sharp(expectedAfter).metadata()
    ])

    deepEqual(optimizedMeta.width, expectedMeta.width)
    deepEqual(optimizedMeta.height, expectedMeta.height)
    deepEqual(optimizedMeta.format, expectedMeta.format)
  }
})

test('optimize does not enlarge small images', async () => {
  const tiny = await sharp({
    create: {
      width: 20,
      height: 10,
      channels: 3,
      background: { r: 255, g: 0, b: 0 }
    }
  })
    .png()
    .toBuffer()

  const optimized = await optimize(tiny, 200, quality)
  const meta = await sharp(optimized).metadata()

  equal(meta.width, 20)
  equal(meta.height, 10)
})
