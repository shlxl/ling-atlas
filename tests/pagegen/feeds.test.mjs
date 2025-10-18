import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateRss, generateSitemap } from '../../scripts/pagegen/feeds.mjs'

const TMP_PREFIX = 'pagegen-feeds-test-'

test('generateRss produces RSS feed for latest posts', async t => {
  const publicDir = await fs.mkdtemp(path.join(os.tmpdir(), TMP_PREFIX))
  t.after(async () => {
    await fs.rm(publicDir, { recursive: true, force: true })
  })

  const lang = {
    code: 'zh',
    localeRoot: '/zh/',
    rssFile: 'rss.xml',
    labels: {
      rssTitle: 'Ling Atlas',
      rssDesc: '最新更新'
    }
  }

  const posts = [
    {
      title: 'Post A',
      path: '/zh/content/post-a/',
      date: '2025-01-01',
      updated: '2025-01-02',
      excerpt: '摘要 A'
    },
    {
      title: 'Post B',
      path: '/zh/content/post-b/',
      date: '2025-01-03',
      updated: '2025-01-03',
      excerpt: '摘要 B'
    }
  ]

  await generateRss(lang, posts, { publicDir, siteOrigin: 'https://example.com', preferredLocale: 'zh' })

  const rss = await fs.readFile(path.join(publicDir, 'rss.xml'), 'utf8')
  assert.ok(rss.includes('<rss version="2.0">'))
  assert.ok(rss.includes('<title>Ling Atlas</title>'))
  assert.ok(rss.includes('<link>https://example.com/</link>'))
  assert.ok(rss.includes('<item><title>Post A</title>'))
  assert.ok(rss.includes('<description>摘要 B</description>'))
})

test('generateSitemap outputs sitemap with lastmod dates', async t => {
  const publicDir = await fs.mkdtemp(path.join(os.tmpdir(), TMP_PREFIX))
  t.after(async () => {
    await fs.rm(publicDir, { recursive: true, force: true })
  })

  const lang = {
    code: 'en',
    sitemapFile: 'sitemap-en.xml'
  }

  const posts = [
    {
      title: 'Post',
      path: '/en/content/post/',
      date: '2025-02-01',
      updated: '2025-02-05',
      excerpt: ''
    }
  ]

  await generateSitemap(lang, posts, { publicDir, siteOrigin: 'https://example.com' })

  const sitemap = await fs.readFile(path.join(publicDir, 'sitemap-en.xml'), 'utf8')
  assert.ok(sitemap.includes('<urlset'))
  assert.ok(sitemap.includes('<loc>https://example.com/en/content/post/</loc>'))
  assert.ok(sitemap.includes('<lastmod>2025-02-05</lastmod>'))
})

test('feeds respect dry run flag', async t => {
  const publicDir = await fs.mkdtemp(path.join(os.tmpdir(), TMP_PREFIX))
  t.after(async () => {
    await fs.rm(publicDir, { recursive: true, force: true })
  })

  const lang = {
    code: 'zh',
    localeRoot: '/zh/',
    rssFile: 'rss.xml',
    sitemapFile: 'sitemap.xml',
    labels: { rssTitle: 'Ling Atlas', rssDesc: '最新更新' }
  }

  const posts = [
    { title: 'Post', path: '/zh/content/post/', date: '2025-01-01', updated: '2025-01-02', excerpt: '' }
  ]

  await generateRss(lang, posts, {
    publicDir,
    siteOrigin: 'https://example.com',
    preferredLocale: 'zh',
    dryRun: true
  })
  await generateSitemap(lang, posts, {
    publicDir,
    siteOrigin: 'https://example.com',
    dryRun: true
  })

  await assert.rejects(() => fs.readFile(path.join(publicDir, 'rss.xml')), /ENOENT/)
  await assert.rejects(() => fs.readFile(path.join(publicDir, 'sitemap.xml')), /ENOENT/)
})
