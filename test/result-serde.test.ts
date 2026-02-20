import { deepEqual, throws } from 'node:assert'
import { test } from 'node:test'
import { queueResultSerde } from '../src/result-serde.ts'

test('queueResultSerde serializes and deserializes image results', () => {
  const image = {
    buffer: Buffer.from('binary-result'),
    contentType: 'image/webp',
    cacheControl: 'public, max-age=300'
  }

  const serialized = queueResultSerde.serialize(image)
  const deserialized = queueResultSerde.deserialize(serialized)

  deepEqual(deserialized, image)
})

test('queueResultSerde supports null metadata fields', () => {
  const image = {
    buffer: Buffer.from('binary-result'),
    contentType: null,
    cacheControl: null
  }

  const serialized = queueResultSerde.serialize(image)
  const deserialized = queueResultSerde.deserialize(serialized)

  deepEqual(deserialized, image)
})

test('queueResultSerde deserialize validates malformed payloads', () => {
  const tooLarge = BigInt(Number.MAX_SAFE_INTEGER) + 1n

  throws(
    () => {
      queueResultSerde.deserialize(Buffer.alloc(0))
    },
    { message: 'Invalid queue result payload: missing image buffer length' }
  )

  throws(
    () => {
      const raw = Buffer.alloc(8)
      raw.writeBigUInt64BE(tooLarge, 0)
      queueResultSerde.deserialize(raw)
    },
    { message: 'Invalid queue result payload: image buffer length is too large' }
  )

  throws(
    () => {
      const raw = Buffer.alloc(8)
      raw.writeBigUInt64BE(10n, 0)
      queueResultSerde.deserialize(raw)
    },
    { message: 'Invalid queue result payload: image buffer length exceeds total buffer size' }
  )

  throws(
    () => {
      const raw = Buffer.alloc(8)
      raw.writeBigUInt64BE(0n, 0)
      queueResultSerde.deserialize(raw)
    },
    { message: 'Invalid queue result payload: missing content type length' }
  )

  throws(
    () => {
      const raw = Buffer.alloc(16)
      raw.writeBigUInt64BE(0n, 0)
      raw.writeBigUInt64BE(tooLarge, 8)
      queueResultSerde.deserialize(raw)
    },
    { message: 'Invalid queue result payload: content type length is too large' }
  )

  throws(
    () => {
      const raw = Buffer.alloc(16)
      raw.writeBigUInt64BE(0n, 0)
      raw.writeBigUInt64BE(5n, 8)
      queueResultSerde.deserialize(raw)
    },
    { message: 'Invalid queue result payload: content type length exceeds total buffer size' }
  )

  throws(
    () => {
      const raw = Buffer.alloc(16)
      raw.writeBigUInt64BE(0n, 0)
      raw.writeBigUInt64BE(0n, 8)
      queueResultSerde.deserialize(raw)
    },
    { message: 'Invalid queue result payload: missing cache control length' }
  )

  throws(
    () => {
      const raw = Buffer.alloc(24)
      raw.writeBigUInt64BE(0n, 0)
      raw.writeBigUInt64BE(0n, 8)
      raw.writeBigUInt64BE(tooLarge, 16)
      queueResultSerde.deserialize(raw)
    },
    { message: 'Invalid queue result payload: cache control length is too large' }
  )

  throws(
    () => {
      const raw = Buffer.alloc(24)
      raw.writeBigUInt64BE(0n, 0)
      raw.writeBigUInt64BE(0n, 8)
      raw.writeBigUInt64BE(5n, 16)
      queueResultSerde.deserialize(raw)
    },
    { message: 'Invalid queue result payload: cache control length exceeds total buffer size' }
  )

  throws(
    () => {
      const raw = Buffer.alloc(25)
      raw.writeBigUInt64BE(0n, 0)
      raw.writeBigUInt64BE(0n, 8)
      raw.writeBigUInt64BE(0n, 16)
      queueResultSerde.deserialize(raw)
    },
    { message: 'Invalid queue result payload: trailing bytes found' }
  )
})
