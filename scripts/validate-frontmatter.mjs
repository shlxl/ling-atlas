import fs from 'node:fs/promises'
import { globby } from 'globby'
import matter from 'gray-matter'
import Ajv from 'ajv'

// Load schema
const schema = JSON.parse(await fs.readFile('schema/frontmatter.schema.json', 'utf8'))

// Ajv options: allow vendor keys and collect all errors
const ajv = new Ajv({
  allErrors: true,
  allowUnionTypes: true,
  strict: false
})
const validate = ajv.compile(schema)

function toYMD(v) {
  if (!v) return v
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'number') return new Date(v).toISOString().slice(0, 10)
  if (typeof v === 'string') return v.slice(0, 10)
  return v
}

const files = await globby('docs/content/**/index.md')
let failed = 0
for (const f of files) {
  const src = await fs.readFile(f, 'utf8')
  const { data } = matter(src)
  // Normalize date fields so YAML's auto-parsed Date won't fail schema
  data.date = toYMD(data.date)
  data.updated = toYMD(data.updated)

  const ok = validate(data)
  if (!ok) {
    failed++
    console.error(`✖ ${f}`)
    for (const e of validate.errors || []) console.error('  -', e.instancePath, e.message)
  }
}

if (failed) {
  console.error(`\n❌ Frontmatter 校验失败：${failed} 篇文件`)
  process.exit(1)
} else {
  console.log('✔ Frontmatter 全部通过校验')
}
