import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv from 'ajv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(__dirname, '..')
const schemaPath = path.join(ROOT_DIR, 'schema', 'feeds.templates.schema.json')
const configPath = path.join(ROOT_DIR, 'schema', 'feeds.templates.json')
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
  console.error('Feed 模板配置校验失败:\n - ' + details)
  process.exit(1)
}

const templateEntries = Object.entries(config.templates || {})
const templateKeys = new Set(templateEntries.map(([key]) => key))
const templatesWithoutSections = templateEntries
  .filter(([, value]) => !value || (!value.rss && !value.sitemap))
  .map(([key]) => key)

if (templatesWithoutSections.length) {
  console.error('以下 Feed 模板未定义 rss 或 sitemap 段落:\n - ' + templatesWithoutSections.join('\n - '))
  process.exit(1)
}

const missingTemplates = []

for (const locale of locales.locales || []) {
  const key = typeof locale.feedsTemplate === 'string' ? locale.feedsTemplate.trim() : ''
  if (!key) continue
  if (!templateKeys.has(key)) {
    missingTemplates.push({ locale: locale.code, template: key })
  }
}

if (missingTemplates.length) {
  const message = missingTemplates
    .map(entry => `${entry.locale || 'unknown'} -> ${entry.template}`)
    .join('\n - ')
  console.error('语言配置引用了缺失的 Feed 模板:\n - ' + message)
  process.exit(1)
}

console.log('Feed 模板配置校验通过')
