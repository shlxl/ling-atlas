import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { globby } from 'globby'
import matter from 'gray-matter'
import { LOCALE_REGISTRY } from './pagegen.locales.mjs'

const ROOT = process.cwd()
const OUT_PATH = path.join(ROOT, 'docs', 'public', 'embeddings-texts.json')
const LANG_SOURCES = LOCALE_REGISTRY.map(locale => ({
  code: locale.code,
  dir: locale.contentDir,
  basePath: locale.basePath
}))

function toExcerpt(md){
  const paragraphs = (md || '').split(/\n\s*\n/)
  const first = paragraphs.find(Boolean) || ''
  return first.slice(0, 300)
}
function toUrl(rel, source){
  const posix = rel.replace(/\\/g, '/')
  const index = posix.lastIndexOf('/')
  const dir = index === -1 ? '' : posix.slice(0, index)
  return `${source.basePath}${dir ? dir + '/' : ''}`
}

async function main(){
  const items = []
  for (const source of LANG_SOURCES){
    if(!fsSync.existsSync(source.dir)) continue
    const files = await globby('**/index.md', { cwd: source.dir })
    for (const rel of files){
      const abs = path.join(source.dir, rel)
      const raw = await fs.readFile(abs, 'utf8')
      const { data, content } = matter(raw)
      if (String(data.status).toLowerCase() === 'draft') continue
      const url = toUrl(rel, source)
      const title = String(data.title || '').trim()
      const excerpt = String(data.excerpt || toExcerpt(content)).trim()
      if (!title && !excerpt) continue
      items.push({
        url,
        title,
        text: `${title}\n\n${excerpt}`.trim(),
        lang: source.code
      })
    }
  }
  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true })
  await fs.writeFile(OUT_PATH, JSON.stringify({ version: 1, items }, null, 2), 'utf8')
  console.log(`✔ embeddings-texts.json 写入 ${items.length} 条`)
}

main().catch(err=>{
  console.error('build-embeddings failed:', err)
  process.exit(1)
})

export const __test__ = { toUrl }
