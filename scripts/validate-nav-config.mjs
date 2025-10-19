import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv from 'ajv'
import { validateNavIntegrity } from './pagegen/nav-validation.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(__dirname, '..')
const schemaPath = path.join(ROOT_DIR, 'schema', 'nav.schema.json')
const configPath = path.join(ROOT_DIR, 'schema', 'nav.json')

function loadJson(target) {
  try {
    const raw = fs.readFileSync(target, 'utf8')
    return JSON.parse(raw)
  } catch (error) {
    throw new Error(`无法读取 ${target}: ${error.message}`)
  }
}

const schema = loadJson(schemaPath)
const config = loadJson(configPath)

const ajv = new Ajv({ allErrors: true, strict: false })
const validate = ajv.compile(schema)

if (!validate(config)) {
  const details = (validate.errors || [])
    .map(err => `${err.instancePath || 'root'} ${err.message}`)
    .join('\n - ')
  console.error('导航配置校验失败:\n - ' + details)
  process.exit(1)
}

const { errors: referenceErrors, warnings: referenceWarnings } = validateNavIntegrity(config)
if (referenceWarnings.length) {
  for (const warning of referenceWarnings) {
    console.warn(`[nav-config] ${warning}`)
  }
}

if (referenceErrors.length) {
  console.error('导航配置引用校验失败:\n - ' + referenceErrors.join('\n - '))
  process.exit(1)
}

console.log('导航配置校验通过')
