import { equal } from 'node:assert'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { name, version } from '../src/version.ts'

test('version exports package name and version', () => {
  const pkg = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8'))

  equal(name, pkg.name)
  equal(version, pkg.version)
})
