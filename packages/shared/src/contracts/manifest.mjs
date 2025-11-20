const manifestSchema = {
  type: 'object',
  properties: {
    version: { type: 'string', minLength: 1 },
    sourceCommit: { type: 'string', minLength: 7 },
    generatedAt: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}T.+Z$' },
    warnings: {
      type: 'array',
      items: { type: 'string' }
    },
    artifacts: {
      type: 'object',
      properties: {
        nav: {
          type: 'array',
          minItems: 1,
          items: { $ref: '#/definitions/artifact' }
        },
        i18n: { $ref: '#/definitions/artifact' },
        telemetry: { $ref: '#/definitions/artifact' },
        search: {
          type: 'array',
          items: { $ref: '#/definitions/artifact' }
        },
        graphrag: {
          type: 'array',
          items: { $ref: '#/definitions/artifact' }
        }
      },
      required: ['nav', 'i18n'],
      additionalProperties: false
    }
  },
  required: ['version', 'sourceCommit', 'generatedAt', 'artifacts'],
  additionalProperties: false,
  definitions: {
    artifact: {
      type: 'object',
      properties: {
        kind: { type: 'string' },
        locale: { type: 'string' },
        path: { type: 'string', minLength: 1 },
        checksum: { type: 'string', pattern: '^[a-f0-9]{64}$' },
        size: { type: 'integer', minimum: 0 }
      },
      required: ['path'],
      additionalProperties: false
    }
  }
}

function validateManifest(manifest) {
  const errors = []

  function fail(instancePath, message) {
    errors.push({ instancePath, message })
  }

  function isString(value) {
    return typeof value === 'string' && value.length > 0
  }

  if (!manifest || typeof manifest !== 'object') {
    fail('', 'manifest must be an object')
  } else {
    if (!isString(manifest.version)) fail('/version', 'version is required')
    if (!isString(manifest.sourceCommit)) fail('/sourceCommit', 'sourceCommit is required')
    if (!isString(manifest.generatedAt)) fail('/generatedAt', 'generatedAt is required')
    if (manifest.generatedAt && !/^\d{4}-\d{2}-\d{2}T.+Z$/.test(manifest.generatedAt)) {
      fail('/generatedAt', 'generatedAt must be ISO-8601 UTC string')
    }

    const artifacts = manifest.artifacts
    if (!artifacts || typeof artifacts !== 'object') {
      fail('/artifacts', 'artifacts is required')
    } else {
      if (!Array.isArray(artifacts.nav) || artifacts.nav.length === 0) {
        fail('/artifacts/nav', 'nav must be a non-empty array')
      }
      if (!artifacts.i18n) {
        fail('/artifacts/i18n', 'i18n artifact is required')
      }

      const groups = [
        ['nav', artifacts.nav],
        ['search', artifacts.search],
        ['graphrag', artifacts.graphrag]
      ]

      for (const [groupName, items] of groups) {
        if (!items) continue
        if (!Array.isArray(items)) {
          fail(`/artifacts/${groupName}`, `${groupName} must be an array when provided`)
          continue
        }
        for (const [index, item] of items.entries()) {
          if (!item || typeof item !== 'object') {
            fail(`/artifacts/${groupName}/${index}`, 'artifact must be an object')
            continue
          }
          if (!isString(item.path)) fail(`/artifacts/${groupName}/${index}/path`, 'path is required')
          if (item.checksum && !/^[a-f0-9]{64}$/.test(item.checksum)) {
            fail(`/artifacts/${groupName}/${index}/checksum`, 'checksum must be sha256 hex')
          }
        }
      }

      if (artifacts.i18n && typeof artifacts.i18n === 'object') {
        if (!isString(artifacts.i18n.path)) {
          fail('/artifacts/i18n/path', 'i18n path is required')
        }
      }

      if (artifacts.telemetry) {
        if (typeof artifacts.telemetry !== 'object' || !isString(artifacts.telemetry.path)) {
          fail('/artifacts/telemetry/path', 'telemetry path is required when telemetry artifact exists')
        }
      }
    }
  }

  validateManifest.errors = errors
  return errors.length === 0
}

export { manifestSchema, validateManifest }
