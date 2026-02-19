// @ts-expect-error
import isAnimated from 'is-animated'
import sharp from 'sharp'
import { animatableTypes, bypassTypes, imageTypes, maxImageSize } from './definitions.ts'
import { ImageError } from './errors.ts'
import type { Image } from './types.ts'

// Based on https://en.wikipedia.org/wiki/List_of_file_signatures
export function detectImageType (buffer: Buffer): string | null {
  for (let e = 0; e < imageTypes.length; e++) {
    const [key, bytes] = imageTypes[e]

    if (buffer.length < bytes.length) {
      continue
    }

    let match = true
    for (let i = 0; i < bytes.length; i++) {
      const s = bytes[i]
      if (s !== -1 && buffer[i] !== s) {
        match = false
        break
      }
    }

    if (!match) {
      continue
    }

    // This is a match
    const index = key.indexOf('_')
    return index === -1 ? key : key.slice(0, index)
  }

  return null
}

export async function optimize (buffer: Buffer, width: number, quality: number, allowSVG = false): Promise<Buffer> {
  const upstreamType = detectImageType(buffer)

  if (!upstreamType) {
    throw new ImageError(400, 'Invalid input image')
  }

  if (animatableTypes.includes(upstreamType) && isAnimated(buffer)) {
    throw new ImageError(400, 'Unable to optimize and animated image')
  }

  if (upstreamType === 'svg' && !allowSVG) {
    throw new ImageError(400, 'Optimization of SVG images is not allowed')
  }

  if (bypassTypes.includes(upstreamType)) {
    return buffer
  }

  const transformer = sharp(buffer, { limitInputPixels: maxImageSize }).rotate()
  transformer.resize({ width, withoutEnlargement: true })

  if (upstreamType === 'avif') {
    transformer.avif({ quality: Math.max(quality - 20, 1), effort: 3 })
  } else if (upstreamType === 'webp') {
    transformer.webp({ quality })
  } else if (upstreamType === 'png') {
    transformer.png({ quality })
  } else if (upstreamType === 'jpeg') {
    transformer.jpeg({ quality, mozjpeg: true })
  }

  return transformer.toBuffer()
}

export async function fetchAndOptimize (
  url: string,
  width: number,
  quality: number,
  allowSVG = false
): Promise<Image<Buffer>> {
  const response = await fetch(url)

  if (!response.ok) {
    throw new ImageError(response.statusText, `Unable to fetch the image. [HTTP ${response.statusText}]`, {
      response: await response.text()
    })
  }

  return {
    buffer: await optimize(Buffer.from(await response.arrayBuffer()), width, quality, allowSVG),
    contentType: response.headers.get('content-type'),
    cacheControl: response.headers.get('cache-control')
  }
}
