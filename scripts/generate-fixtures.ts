#!/usr/bin/env -S node

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import sharp from 'sharp'

import { optimize } from '../src/index.ts'

const width = 320
const height = 240
const channels = 3

const optimizeWidth = 120
const optimizeQuality = 60

const fixturesDir = join(process.cwd(), 'test', 'fixtures')
const beforeDir = join(fixturesDir, 'before')
const afterDir = join(fixturesDir, 'after')

function chunk (type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)

  // CRC is irrelevant for these tests because `is-animated` does not validate it.
  return Buffer.concat([length, Buffer.from(type), data, Buffer.alloc(4)])
}

async function createBaseImage () {
  const data = Buffer.alloc(width * height * channels)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * channels
      data[index] = Math.round((x / width) * 255)
      data[index + 1] = Math.round((y / height) * 255)
      data[index + 2] = Math.round(((x + y) / (width + height)) * 255)
    }
  }

  return sharp(data, { raw: { width, height, channels } })
}

async function generate (): Promise<void> {
  await rm(fixturesDir, { recursive: true, force: true })
  await mkdir(beforeDir, { recursive: true })
  await mkdir(afterDir, { recursive: true })

  const image = await createBaseImage()

  await image.clone().jpeg({ quality: 95 }).toFile(join(beforeDir, 'source.jpg'))
  await image.clone().png({ compressionLevel: 0 }).toFile(join(beforeDir, 'source.png'))
  await image.clone().webp({ quality: 95 }).toFile(join(beforeDir, 'source.webp'))
  await image.clone().avif({ quality: 80 }).toFile(join(beforeDir, 'source.avif'))

  await writeFile(
    join(beforeDir, 'source.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#f00"/><stop offset="100%" stop-color="#00f"/></linearGradient></defs><rect width="320" height="240" fill="url(#g)"/></svg>'
  )

  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const animatedPng = Buffer.concat([
    pngSignature,
    chunk('acTL', Buffer.alloc(8)),
    chunk('fcTL', Buffer.alloc(26)),
    chunk('IDAT', Buffer.from([0x00])),
    chunk('fcTL', Buffer.alloc(26)),
    chunk('fdAT', Buffer.alloc(4))
  ])

  await writeFile(join(beforeDir, 'animated.png'), animatedPng)

  for (const name of ['source.jpg', 'source.png', 'source.webp', 'source.avif']) {
    const buffer = await readFile(join(beforeDir, name))
    const optimized = await optimize(buffer, optimizeWidth, optimizeQuality)
    await writeFile(join(afterDir, name), optimized)
  }
}

await generate()
