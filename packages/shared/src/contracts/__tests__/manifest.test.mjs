import assert from 'node:assert'
import test from 'node:test'
import { manifestSchema, validateManifest } from '../manifest.mjs'

const validManifest = {
  version: '0.1.0',
  sourceCommit: 'abcdef1',
  generatedAt: '2024-09-10T12:00:00.000Z',
  warnings: ['missing graphrag export'],
  artifacts: {
    nav: [
      {
        kind: 'nav',
        locale: 'zh',
        path: 'dist/data/nav/nav.manifest.zh.json',
        checksum: '4d186321c1a7f0f354b297e8914ab2407f0ac1b9835e1c9fb0e29d6cfe8ef78f',
        size: 128
      }
    ],
    i18n: {
      kind: 'i18n-map',
      path: 'dist/data/i18n/i18n-map.json',
      checksum: '4d186321c1a7f0f354b297e8914ab2407f0ac1b9835e1c9fb0e29d6cfe8ef78f'
    },
    telemetry: {
      kind: 'telemetry',
      path: 'dist/data/telemetry/telemetry.json'
    },
    search: [
      {
        kind: 'knowledge',
        path: 'dist/data/search/knowledge.json',
        checksum: '4d186321c1a7f0f354b297e8914ab2407f0ac1b9835e1c9fb0e29d6cfe8ef78f'
      }
    ]
  }
}

test('accepts manifest schema baseline', () => {
  assert.equal(validateManifest(validManifest), true, JSON.stringify(validateManifest.errors, null, 2))
})

test('rejects manifest missing required artifacts', () => {
  const invalid = {
    version: '0.1.0',
    sourceCommit: 'abcdef1',
    generatedAt: '2024-09-10T12:00:00.000Z',
    artifacts: {
      i18n: { path: 'dist/data/i18n/i18n-map.json' },
      nav: []
    }
  }

  assert.equal(validateManifest(invalid), false)
  assert.ok(validateManifest.errors?.some(err => err.instancePath === '/artifacts/nav'), 'nav should be required')
})

test('exposes schema for external validators', () => {
  assert.equal(manifestSchema.type, 'object')
})
