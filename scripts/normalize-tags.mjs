import fs from 'node:fs/promises'
import { globby } from 'globby'
import matter from 'gray-matter'

const alias = JSON.parse(await fs.readFile('schema/tag-alias.json', 'utf8'))
const files = await globby('docs/content.*/**/index.md')

let changed = 0
for (const f of files) {
  const src = await fs.readFile(f, 'utf8')
  const { data, content } = matter(src)
  const tags = (data.tags_zh || []).map(t => alias[t] || t)
  const next = matter.stringify(content, { ...data, tags_zh: tags })
  if (next !== src) { await fs.writeFile(f, next); changed++ }
}
console.log(`✔ 标签已归一化：修改 ${changed} 篇`)
