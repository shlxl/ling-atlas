import test from 'node:test'
import assert from 'node:assert/strict'
import seoConfig from '../../schema/seo.json' with { type: 'json' }
import {
  resolveSeoHead,
  resolveRoutePathFromRelative,
  normalizeRoutePath as normalizeSeoRoutePath
} from '../../docs/.vitepress/seo-head.mjs'

const previousBase = process.env.BASE
process.env.BASE = '/ling-atlas/'

function findHeadEntry(head, predicate) {
  for (const entry of head) {
    if (predicate(entry)) return entry
  }
  return null
}

test('zh locale uses defaults and resolves canonical', () => {
  const routePath = resolveRoutePathFromRelative('zh/content/example/index.md')
  const normalizedPath = normalizeSeoRoutePath(routePath)
  const { head } = resolveSeoHead({
    seoConfig,
    locale: 'zh',
    normalizedPath,
    siteOrigin: 'https://example.dev'
  })

  const canonical = findHeadEntry(head, ([tag, attrs]) => tag === 'link' && attrs.rel === 'canonical')
  assert.ok(canonical, 'canonical link should exist')
  assert.equal(canonical[1].href, 'https://example.dev/ling-atlas/zh/content/example/')

  const description = findHeadEntry(head, ([tag, attrs]) => tag === 'meta' && attrs.name === 'description')
  assert.ok(description, 'description meta should exist')
  assert.equal(
    description[1].content,
    'Ling Atlas · 知识库：聚焦现代化、可演进、可检索的技术与工程实践。'
  )

  const ogLocale = findHeadEntry(head, ([tag, attrs]) => tag === 'meta' && attrs.property === 'og:locale')
  assert.ok(ogLocale, 'og:locale should exist')
  assert.equal(ogLocale[1].content, 'zh_CN')

  const twitterImage = findHeadEntry(head, ([tag, attrs]) => tag === 'meta' && attrs.name === 'twitter:image')
  assert.ok(twitterImage, 'twitter:image should exist')
  assert.equal(twitterImage[1].content, 'https://example.dev/ling-atlas/icons/icon-512.png')
})

test('en locale overrides description and locale fields', () => {
  const routePath = resolveRoutePathFromRelative('en/content/example/index.md')
  const normalizedPath = normalizeSeoRoutePath(routePath)
  const { head } = resolveSeoHead({
    seoConfig,
    locale: 'en',
    normalizedPath,
    siteOrigin: 'https://example.dev'
  })

  const canonical = findHeadEntry(head, ([tag, attrs]) => tag === 'link' && attrs.rel === 'canonical')
  assert.ok(canonical)
  assert.equal(canonical[1].href, 'https://example.dev/ling-atlas/en/content/example/')

  const description = findHeadEntry(head, ([tag, attrs]) => tag === 'meta' && attrs.name === 'description')
  assert.ok(description)
  assert.equal(
    description[1].content,
    'Ling Atlas is a modern, evolvable, and searchable knowledge base for engineering notes.'
  )

  const ogLocale = findHeadEntry(head, ([tag, attrs]) => tag === 'meta' && attrs.property === 'og:locale')
  assert.ok(ogLocale)
  assert.equal(ogLocale[1].content, 'en_US')

  const keywords = findHeadEntry(head, ([tag, attrs]) => tag === 'meta' && attrs.name === 'keywords')
  assert.ok(keywords)
  assert.equal(keywords[1].content, 'Ling Atlas, knowledge base, VitePress')
})

process.on('exit', () => {
  process.env.BASE = previousBase
})
