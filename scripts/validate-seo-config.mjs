import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv from 'ajv'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(__dirname, '..')
const schemaPath = path.join(ROOT_DIR, 'schema', 'seo.schema.json')
const configPath = path.join(ROOT_DIR, 'schema', 'seo.json')
const localesConfigPath = path.join(ROOT_DIR, 'schema', 'locales.json')

function loadJson(target) {
  try {
    return JSON.parse(fs.readFileSync(target, 'utf8'))
  } catch (error) {
    throw new Error(`无法读取 ${target}: ${error.message}`)
  }
}

function validateCanonical(entry, label, errors) {
  const base = entry?.canonical?.base
  if (!base) return
  try {
    const parsed = new URL(base)
    if (!parsed.protocol || !parsed.host) {
      errors.push(`${label} canonical.base 缺少协议或主机名：${base}`)
    }
  } catch (error) {
    errors.push(`${label} canonical.base 不是有效的 URL：${base}`)
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
  console.error('SEO 配置校验失败:\n - ' + details)
  process.exit(1)
}

const configuredLocales = (() => {
  try {
    const localesConfig = loadJson(localesConfigPath)
    if (!Array.isArray(localesConfig?.locales)) return new Set()
    return new Set(localesConfig.locales.map(entry => entry.code).filter(Boolean))
  } catch (error) {
    console.warn('[seo-config] 无法读取 schema/locales.json，跳过 locale 对齐校验：', error.message)
    return new Set()
  }
})()

const referenceWarnings = []
const referenceErrors = []

validateCanonical(config.defaults || {}, 'defaults', referenceErrors)

if (config.locales && typeof config.locales === 'object') {
  for (const [locale, entry] of Object.entries(config.locales)) {
    if (configuredLocales.size && !configuredLocales.has(locale)) {
      referenceWarnings.push(`locale \`${locale}\` 未在 schema/locales.json 中声明`)
    }
    validateCanonical(entry, `locales.${locale}`, referenceErrors)
  }
}

if (referenceWarnings.length) {
  for (const warning of referenceWarnings) {
    console.warn(`[seo-config] ${warning}`)
  }
}

if (referenceErrors.length) {
  console.error('SEO 配置引用校验失败:\n - ' + referenceErrors.join('\n - '))
  process.exit(1)
}

console.log('SEO 配置校验通过')
