import fs from 'node:fs/promises'
import { globby } from 'globby'
import matter from 'gray-matter'
import Ajv from 'ajv'

const schema = JSON.parse(await fs.readFile('schema/frontmatter.schema.json', 'utf8'))
const ajv = new Ajv({ allErrors: true, allowUnionTypes: true })
const validate = ajv.compile(schema)

const files = await globby('docs/content/**/index.md')
let failed = 0
for (const f of files) {
  const src = await fs.readFile(f, 'utf8')
  const { data } = matter(src)
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
