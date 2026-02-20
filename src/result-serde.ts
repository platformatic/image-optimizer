import type { Serde } from '@platformatic/job-queue'
import type { Image } from './types.ts'

const UINT64_SIZE = 8

export const queueResultSerde: Serde<Image<Buffer>> = {
  serialize (value: Image<Buffer>): Buffer {
    const imageBuffer = value.buffer
    const contentTypeLength = value.contentType != null ? Buffer.byteLength(value.contentType) : 0
    const cacheControlLength = value.cacheControl != null ? Buffer.byteLength(value.cacheControl) : 0
    const totalSize = UINT64_SIZE * 3 + imageBuffer.length + contentTypeLength + cacheControlLength

    const serialized = Buffer.allocUnsafe(totalSize)
    let offset = 0

    serialized.writeBigUInt64BE(BigInt(imageBuffer.length), offset)
    imageBuffer.copy(serialized, offset + UINT64_SIZE)
    offset += UINT64_SIZE + imageBuffer.length

    serialized.writeBigUInt64BE(BigInt(contentTypeLength), offset)
    if (value.contentType) {
      serialized.write(value.contentType, offset + UINT64_SIZE, 'utf8')
    }
    offset += UINT64_SIZE + contentTypeLength

    serialized.writeBigUInt64BE(BigInt(cacheControlLength), offset)
    if (value.cacheControl) {
      serialized.write(value.cacheControl, offset + UINT64_SIZE, 'utf8')
    }

    return serialized
  },

  deserialize (raw: Buffer): Image<Buffer> {
    const available = raw.length
    let offset = 0

    if (offset + UINT64_SIZE > available) {
      throw new Error('Invalid queue result payload: missing image buffer length')
    }

    const bufferLengthRaw = raw.readBigUInt64BE(offset)
    if (bufferLengthRaw > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('Invalid queue result payload: image buffer length is too large')
    }

    const bufferLength = Number(bufferLengthRaw)
    if (offset + UINT64_SIZE + bufferLength > available) {
      throw new Error('Invalid queue result payload: image buffer length exceeds total buffer size')
    }

    const buffer = raw.subarray(offset + UINT64_SIZE, offset + UINT64_SIZE + bufferLength)
    offset += UINT64_SIZE + bufferLength

    if (offset + UINT64_SIZE > available) {
      throw new Error('Invalid queue result payload: missing content type length')
    }

    let contentType: string | null = null
    const contentTypeLengthRaw = raw.readBigUInt64BE(offset)
    if (contentTypeLengthRaw > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('Invalid queue result payload: content type length is too large')
    }

    const contentTypeLength = Number(contentTypeLengthRaw)
    if (contentTypeLength > 0) {
      if (offset + UINT64_SIZE + contentTypeLength > available) {
        throw new Error('Invalid queue result payload: content type length exceeds total buffer size')
      }

      contentType = raw.toString('utf8', offset + UINT64_SIZE, offset + UINT64_SIZE + contentTypeLength)
    }
    offset += UINT64_SIZE + contentTypeLength

    if (offset + UINT64_SIZE > available) {
      throw new Error('Invalid queue result payload: missing cache control length')
    }

    let cacheControl: string | null = null
    const cacheControlLengthRaw = raw.readBigUInt64BE(offset)
    if (cacheControlLengthRaw > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('Invalid queue result payload: cache control length is too large')
    }

    const cacheControlLength = Number(cacheControlLengthRaw)
    if (cacheControlLength > 0) {
      if (offset + UINT64_SIZE + cacheControlLength > available) {
        throw new Error('Invalid queue result payload: cache control length exceeds total buffer size')
      }

      cacheControl = raw.toString('utf8', offset + UINT64_SIZE, offset + UINT64_SIZE + cacheControlLength)
    }

    offset += UINT64_SIZE + cacheControlLength

    if (offset !== available) {
      throw new Error('Invalid queue result payload: trailing bytes found')
    }

    return { buffer, contentType, cacheControl }
  }
}
