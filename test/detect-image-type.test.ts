import { equal } from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { imageTypes } from '../src/definitions.ts'
import { detectImageType } from '../src/index.ts'

const fixturesDir = join(import.meta.dirname, 'fixtures')

test('detectImageType returns null for empty/unknown buffers', () => {
  equal(detectImageType(Buffer.alloc(0)), null)
  equal(detectImageType(Buffer.from('not-an-image')), null)
})

test('detectImageType matches all configured signatures and trims aliases', () => {
  for (const [key, signature] of imageTypes) {
    const buffer = Buffer.from(signature.map(value => (value === -1 ? 0x42 : value)))
    const expectedType = key.includes('_') ? key.split('_')[0] : key
    equal(detectImageType(buffer), expectedType, `failed for ${key}`)
  }
})

test('detectImageType supports wildcard bytes in signatures', () => {
  const webpLike = Buffer.from([0x52, 0x49, 0x46, 0x46, 0xaa, 0xbb, 0xcc, 0xdd, 0x57, 0x45, 0x42, 0x50])
  equal(detectImageType(webpLike), 'webp')
})

test('detectImageType matches all before fixtures', () => {
  const expectedTypes: Record<string, string> = {
    'animated.png': 'png',
    'source.avif': 'avif',
    'source.jpg': 'jpeg',
    'source.png': 'png',
    'source.svg': 'svg',
    'source.webp': 'webp'
  }

  for (const [file, expectedType] of Object.entries(expectedTypes)) {
    const buffer = readFileSync(join(fixturesDir, 'before', file))
    equal(detectImageType(buffer), expectedType, `failed for before/${file}`)
  }
})

test('detectImageType matches all after fixtures', () => {
  const expectedTypes: Record<string, string> = {
    'source.avif': 'avif',
    'source.jpg': 'jpeg',
    'source.png': 'png',
    'source.webp': 'webp'
  }

  for (const [file, expectedType] of Object.entries(expectedTypes)) {
    const buffer = readFileSync(join(fixturesDir, 'after', file))
    equal(detectImageType(buffer), expectedType, `failed for after/${file}`)
  }
})
