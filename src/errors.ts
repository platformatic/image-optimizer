import type { ErrorProperties } from './types.ts'

export class ImageError extends Error {
  code: string | number

  constructor (code: string | number, message: string, { cause, ...rest }: ErrorProperties = {}) {
    super(message, cause ? { cause } : {})
    this.name = 'ImageError'
    this.code = code

    Reflect.defineProperty(this, 'message', { enumerable: true })
    Reflect.defineProperty(this, 'code', { enumerable: true })

    if ('stack' in this) {
      Reflect.defineProperty(this, 'stack', { enumerable: true })
    }

    for (const [key, value] of Object.entries(rest)) {
      Reflect.defineProperty(this, key, { value, enumerable: true })
    }

    Error.captureStackTrace(this, this.constructor)
  }
}
