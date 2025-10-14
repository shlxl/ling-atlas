import { defineConfig } from 'vitepress'
import cssnano from 'cssnano'
import fs from 'node:fs'
import { VitePWA } from 'vite-plugin-pwa'

function loadCspTemplate() {
  try {
    const raw = fs.readFileSync('security/csp-base.json', 'utf8')
    return JSON.parse(raw)
  } catch (error) {
    console.warn('[security] failed to read security/csp-base.json:', error)
    return null
  }
}

function serializeCsp(directives: Record<string, string[] | string> | null) {
  if (!directives) return ''
  return Object.entries(directives)
    .map(([name, values]) => {
      const parts = Array.isArray(values) ? values : [values]
      return `${name} ${parts.join(' ')}`
    })
    .join('; ')
}

function slug(input:string){
  return input.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/[^\p{Letter}\p{Number}]+/gu,'-')
    .replace(/(^-|-$)/g,'')
    .toLowerCase()
}

const baseFromEnv = (process.env.BASE as string) || '/'
const normalizedBase = baseFromEnv.endsWith('/') ? baseFromEnv : `${baseFromEnv}/`

const metaPath = 'docs/_generated/meta.json'
let meta = { byCategory:{}, bySeries:{}, byTag:{}, byYear:{}, all:[] } as any
if (fs.existsSync(metaPath)) {
  meta = JSON.parse(fs.readFileSync(metaPath,'utf8'))
}

const cspTemplate = loadCspTemplate()
const cspContent = serializeCsp(cspTemplate)

function navFromMeta(){
  const years = Object.keys(meta.byYear || {}).sort().reverse()
  const firstTag = Object.keys(meta.byTag || {})[0] || 'all'
  return [
    { text: '最新', link: '/_generated/archive/' + (years[0] || '') + '/' },
    { text: '分类', items: Object.keys(meta.byCategory||{}).sort().map(c=>({ text:c, link:`/_generated/categories/${slug(c)}/` })) },
    { text: '系列', items: Object.keys(meta.bySeries||{}).sort().map(s=>({ text:s, link:`/_generated/series/${s}/` })) },
    { text: '标签', link: '/_generated/tags/' + slug(firstTag) + '/' },
    {
      text: 'About',
      items: [
        { text: '观测指标', link: '/about/metrics.html' },
        { text: '常见问答', link: '/about/qa.html' }
      ]
    },
    {
      text: '指南',
      items: [
        { text: '部署指南', link: '/DEPLOYMENT.html' },
        { text: '迁移与重写', link: '/MIGRATION.html' }
      ]
    }
  ]
}

export default defineConfig({
  // Inject base from env to support GitHub Pages subpath deployment
  base: baseFromEnv,
  lang: 'zh-CN',
  title: 'Ling Atlas · 小凌的个人知识库',
  description: '现代化、可演进、可检索的知识库工程',
  head: [
    ['meta', { 'http-equiv': 'Content-Security-Policy', content: cspContent }],
    ['meta', { name: 'referrer', content: 'no-referrer' }]
  ],
  themeConfig: {
    nav: navFromMeta(),
    sidebar: 'auto',
    socialLinks: [{ icon: 'github', link: 'https://github.com/shlxl/ling-atlas' }]
  },
  vite: {
    plugins: [
      VitePWA({
        registerType: 'autoUpdate',
        base: normalizedBase,
        workbox: {
          globPatterns: [
            '**/*.{js,css,html,svg,png,ico,json,txt,xml}',
            'pagefind/**/*',
            'worker/**/*'
          ],
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.startsWith(`${normalizedBase}pagefind/`),
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'pagefind-cache',
                expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 7 }
              }
            },
            {
              urlPattern: ({ url }) => url.pathname.endsWith('embeddings-texts.json'),
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'embeddings-cache',
                expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 3 }
              }
            },
            {
              urlPattern: ({ url }) => url.pathname.endsWith('worker/embeddings.worker.js'),
              handler: 'CacheFirst',
              options: {
                cacheName: 'embeddings-worker-cache',
                expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 30 }
              }
            }
          ]
        },
        manifest: {
          name: 'Ling Atlas · 小凌的个人知识库',
          short_name: 'Ling Atlas',
          start_url: normalizedBase,
          scope: normalizedBase,
          display: 'standalone',
          background_color: '#1f1f24',
          theme_color: '#1f1f24',
          icons: [
            {
              src: `${normalizedBase}icons/icon-192.png`,
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: `${normalizedBase}icons/icon-512.png`,
              sizes: '512x512',
              type: 'image/png'
            }
          ]
        }
      })
    ],
    server: { fs: { allow: ['..'] } },
    build: { cssMinify: 'lightningcss' },
    css: {
      postcss: {
        plugins: [cssnano({ preset: 'default' })]
      }
    }
  }
})
