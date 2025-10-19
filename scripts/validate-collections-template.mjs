import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv from 'ajv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(__dirname, '..')
const schemaPath = path.join(ROOT_DIR, 'schema', 'collections.templates.schema.json')
const configPath = path.join(ROOT_DIR, 'schema', 'collections.templates.json')
const localesPath = path.join(ROOT_DIR, 'schema', 'locales.json')

function readJson(target) {
  try {
    const raw = fs.readFileSync(target, 'utf8')
    return JSON.parse(raw)
  } catch (error) {
    throw new Error(`无法读取 ${target}: ${error.message}`)
  }
}

const schema = readJson(schemaPath)
const config = readJson(configPath)
const locales = readJson(localesPath)

const ajv = new Ajv({ allErrors: true, strict: false })
const validate = ajv.compile(schema)

if (!validate(config)) {
  const details = (validate.errors || [])
    .map(err => `${err.instancePath || 'root'} ${err.message}`)
    .join('\n - ')
  console.error('聚合模板配置校验失败:\n - ' + details)
  process.exit(1)
}

const templateKeys = new Set(Object.keys(config.templates || {}))
const missingTemplates = []

for (const locale of locales.locales || []) {
  const key = locale.collectionsTemplate
  if (typeof key === 'string' && key.trim()) {
    if (!templateKeys.has(key.trim())) {
      missingTemplates.push({ locale: locale.code, template: key.trim() })
    }
  }
}

if (missingTemplates.length) {
  const message = missingTemplates
    .map(entry => `${entry.locale || 'unknown'} -> ${entry.template}`)
    .join('\n - ')
  console.error('语言配置引用了缺失的聚合模板:\n - ' + message)
  process.exit(1)
}

console.log('聚合模板配置校验通过')
