import fs from 'node:fs/promises'
import path from 'node:path'
import { globby } from 'globby'
import matter from 'gray-matter'
import { marked } from 'marked'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DOCS = path.join(__dirname, '..', 'docs')
const CONTENT = path.join(DOCS, 'content')
const GEN = path.join(DOCS, '_generated')
const PUB = path.join(DOCS, 'public')

await fs.mkdir(GEN, { recursive: true })
await fs.mkdir(PUB, { recursive: true })

function toExcerpt(md) {
  const html = marked.parse((md || '').split('\n\n')[0] || '')
  return String(html).replace(/<[^>]+>/g, '').slice(0, 180)
}

function ymd(s) { return s?.slice(0,10) || '' }

// Always use POSIX-style separators from globby and normalize backslashes just in case
const files = await globby('**/index.md', { cwd: CONTENT })
const posts = []
for (const f of files) {
  const raw = await fs.readFile(path.join(CONTENT, f), 'utf8')
  const { data, content } = matter(raw)
  if (data.status === 'draft') continue

  // 🔧 Cross-platform path handling: normalize to POSIX
  const posix = String(f).replace(/\\/g, '/')
  const without = posix.includes('/') ? posix.substring(0, posix.lastIndexOf('/')) : ''
  const url = '/content/' + (without ? without + '/' : '')

  posts.push({
    title: data.title,
    date: ymd(data.date),
    updated: ymd(data.updated),
    status: data.status,
    category_zh: data.category_zh,
    series: data.series,
    series_slug: data.series_slug,
    tags_zh: data.tags_zh || [],
    slug: data.slug,
    path: url,
    excerpt: data.excerpt || toExcerpt(content)
  })
}

posts.sort((a,b)=> (b.updated||b.date).localeCompare(a.updated||a.date))

const meta = { byCategory:{}, bySeries:{}, byTag:{}, byYear:{}, all: posts }
for (const p of posts) {
  ;(meta.byCategory[p.category_zh] ||= []).push(p)
  if (p.series) (meta.bySeries[p.series_slug||p.series] ||= []).push(p)
  for (const t of p.tags_zh) (meta.byTag[t] ||= []).push(p)
  const y = (p.updated||p.date).slice(0,4); (meta.byYear[y] ||= []).push(p)
}

await fs.writeFile(path.join(GEN, 'meta.json'), JSON.stringify(meta, null, 2))

function mdList(items){
  return items.map(p=>`- [${p.title}](${p.path}) · ${p.date}${p.updated?`（更:${p.updated}）`:''}  \n  ${p.excerpt?`> ${p.excerpt}`:''}`).join('\n\n')
}
async function writePage(dir, name, title, items){
  const outDir = path.join(GEN, dir, name)
  await fs.mkdir(outDir, { recursive: true })
  const md = `---\ntitle: ${title}\n---\n\n${mdList(items)}\n`
  await fs.writeFile(path.join(outDir, 'index.md'), md)
}
function slug(input){
  return String(input).normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/(^-|-$)/g, '')
    .toLowerCase()
}

for (const [cat, items] of Object.entries(meta.byCategory))
  await writePage('categories', slug(cat), `分类 · ${cat}`, items)
for (const [ser, items] of Object.entries(meta.bySeries))
  await writePage('series', ser, `连载 · ${ser}`, items)
for (const [tag, items] of Object.entries(meta.byTag))
  await writePage('tags', slug(tag), `标签 · ${tag}`, items)
for (const [year, items] of Object.entries(meta.byYear))
  await writePage('archive', year, `归档 · ${year}`, items)

await genRSS(posts)
await genSitemap(posts)
console.log('✔ pagegen 完成')

async function genRSS(items){
  const site = process.env.SITE_ORIGIN || 'https://example.com'
  const feed = [`<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0"><channel>`,
    `<title>Ling Atlas</title>`,
    `<link>${site}</link>`,
    `<description>最新更新</description>`]
  for (const p of items.slice(0, 50)) {
    feed.push(`<item><title>${escapeXml(p.title)}</title>`+ 
      `<link>${site}${p.path}</link>`+
      `<pubDate>${new Date(p.updated||p.date).toUTCString()}</pubDate>`+
      `<description>${escapeXml(p.excerpt||'')}</description></item>`)
  }
  feed.push(`</channel></rss>`)
  await fs.writeFile(path.join(PUB, 'rss.xml'), feed.join(''))
}
async function genSitemap(items){
  const site = process.env.SITE_ORIGIN || 'https://example.com'
  const urls = items.map(p=>`<url><loc>${site}${p.path}</loc><lastmod>${(p.updated||p.date)}</lastmod></url>`)
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`
  await fs.writeFile(path.join(PUB, 'sitemap.xml'), xml)
}
function escapeXml(s){
  return String(s).replace(/[<>&"']/g, c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]))
}
