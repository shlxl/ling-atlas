import fs from 'node:fs'
import path from 'node:path'
import Ajv from 'ajv'

const ROOT_DIR = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const schemaPath = path.join(ROOT_DIR, 'schema', 'tag-alias.schema.json')
const configPath = path.join(ROOT_DIR, 'schema', 'tag-alias.json')

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
  console.error('标签别名配置校验失败:\n - ' + details)
  process.exit(1)
}

console.log('标签别名配置校验通过')
