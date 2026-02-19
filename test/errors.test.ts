import { equal, ok } from 'node:assert'
import { test } from 'node:test'
import { ImageError } from '../src/index.ts'

test('ImageError exposes enumerable properties and cause', () => {
  const cause = new Error('root cause')
  const error = new ImageError(418, 'teapot', {
    cause,
    detail: 'extra',
    retryable: false
  })

  equal(error.name, 'ImageError')
  equal(error.code, 418)
  equal(error.message, 'teapot')
  equal(error.cause, cause)
  // @ts-expect-error
  equal(error.detail, 'extra')
  // @ts-expect-error
  equal(error.retryable, false)

  const enumerableKeys = Object.keys(error)
  ok(enumerableKeys.includes('message'))
  ok(enumerableKeys.includes('code'))
  ok('stack' in error)
  ok(enumerableKeys.includes('detail'))
  ok(enumerableKeys.includes('retryable'))
})

test('ImageError works without optional properties', () => {
  const error = new ImageError('E_IMG', 'boom')

  equal(error.code, 'E_IMG')
  equal(error.message, 'boom')
  equal(error.cause, undefined)
})
