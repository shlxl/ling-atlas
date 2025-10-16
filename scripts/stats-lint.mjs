import fs from 'node:fs/promises'
import { globby } from 'globby'
import matter from 'gray-matter'

const files = await globby('docs/*/content/**/index.md')
const cat = new Map(), tag = new Map()

for (const f of files) {
  const { data } = matter(await fs.readFile(f,'utf8'))
  cat.set(data.category_zh, (cat.get(data.category_zh)||0)+1)
  for (const t of (data.tags_zh||[])) tag.set(t, (tag.get(t)||0)+1)
}
console.log('分类Top5：', [...cat.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5))
console.log('标签Top10：', [...tag.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10))
