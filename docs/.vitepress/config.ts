import { defineConfig } from 'vitepress'
import fs from 'node:fs'

function slug(input:string){
  return input.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/[^\p{Letter}\p{Number}]+/gu,'-')
    .replace(/(^-|-$)/g,'')
    .toLowerCase()
}

const metaPath = 'docs/_generated/meta.json'
let meta = { byCategory:{}, bySeries:{}, byTag:{}, byYear:{}, all:[] } as any
if (fs.existsSync(metaPath)) {
  meta = JSON.parse(fs.readFileSync(metaPath,'utf8'))
}

function navFromMeta(){
  const years = Object.keys(meta.byYear || {}).sort().reverse()
  const firstTag = Object.keys(meta.byTag || {})[0] || 'all'
  return [
    { text: '最新', link: '/_generated/archive/' + (years[0] || '') + '/' },
    { text: '分类', items: Object.keys(meta.byCategory||{}).sort().map(c=>({ text:c, link:`/_generated/categories/${slug(c)}/` })) },
    { text: '系列', items: Object.keys(meta.bySeries||{}).sort().map(s=>({ text:s, link:`/_generated/series/${s}/` })) },
    { text: '标签', link: '/_generated/tags/' + slug(firstTag) + '/' }
  ]
}

export default defineConfig({
  // Inject base from env to support GitHub Pages subpath deployment
  base: (process.env.BASE as string) || '/',
  lang: 'zh-CN',
  title: 'Ling Atlas · 小凌的个人知识库',
  description: '现代化、可演进、可检索的知识库工程',
  themeConfig: {
    nav: navFromMeta(),
    sidebar: 'auto',
    socialLinks: [{ icon: 'github', link: 'https://github.com/shlxl/ling-atlas' }]
  },
  vite: { server: { fs: { allow: ['..'] } } }
})
