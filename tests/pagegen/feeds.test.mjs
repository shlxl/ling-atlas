import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateRss, generateSitemap } from '../../scripts/pagegen/feeds.mjs'

const TMP_PREFIX = 'pagegen-feeds-test-'

const TEST_TEMPLATES = {
  templates: {
    custom: {
      rss: {
        limit: 10,
        header: [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<rss version="2.0"><channel>',
          '<title>{rssTitle}</title>',
          '<link>{siteOrigin}{homePath}</link>',
          '<description>{rssDesc}</description>',
          '<generator>Custom Feed</generator>'
        ],
        item: [
          '<item>',
          '<title>{postTitle}</title>',
          '<link>{postLink}</link>',
          '<guid>{postGuid}</guid>',
          '<pubDate>{postPubDate}</pubDate>',
          '<lastBuildDate>{postLastModIso}</lastBuildDate>',
          '<description>{postDescription}</description>',
          '</item>'
        ],
        footer: ['</channel></rss>']
      },
      sitemap: {
        header: [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          '<!-- custom sitemap -->'
        ],
        item: [
          '<url>',
          '<loc>{postLink}</loc>',
          '<lastmod>{postLastMod}</lastmod>',
          '<changefreq>weekly</changefreq>',
          '<priority>0.5</priority>',
          '</url>'
        ],
        footer: ['</urlset>']
      }
    },
    tiny: {
      rss: {
        limit: 2,
        header: [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<rss version="2.0"><channel>',
          '<title>{rssTitle}</title>',
          '<link>{siteOrigin}{homePath}</link>',
          '<description>{rssDesc}</description>'
        ],
        item: [
          '<item>',
          '<title>{postTitle}</title>',
          '<link>{postLink}</link>',
          '<pubDate>{postPubDate}</pubDate>',
          '<description>{postDescription}</description>',
          '</item>'
        ],
        footer: ['</channel></rss>']
      },
      sitemap: {
        header: ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'],
        item: ['<url>', '<loc>{postLink}</loc>', '<lastmod>{postLastMod}</lastmod>', '</url>'],
        footer: ['</urlset>']
      }
    }
  }
}

function createLang(overrides = {}) {
  return {
    code: 'zh',
    manifestLocale: 'zh',
    localeRoot: '/zh/',
    rssFile: 'rss.xml',
    sitemapFile: 'sitemap.xml',
    feedsTemplate: 'zh-default',
    labels: {
      rssTitle: 'Ling Atlas',
      rssDesc: '最新更新'
    },
    ...overrides
  }
}

test('generateRss produces RSS feed for latest posts (default template)', async t => {
  const publicDir = await fs.mkdtemp(path.join(os.tmpdir(), TMP_PREFIX))
  t.after(async () => {
    await fs.rm(publicDir, { recursive: true, force: true })
  })

  const lang = createLang({ feedsTemplate: 'zh-default' })
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

  const rssStats = await generateRss(lang, posts, {
    publicDir,
    siteOrigin: 'https://example.com',
    preferredLocale: 'zh'
  })

  const rss = await fs.readFile(path.join(publicDir, 'rss.xml'), 'utf8')
  assert.ok(rss.includes('<rss version="2.0"><channel>'))
  assert.ok(rss.includes('<title>Ling Atlas</title>'))
  assert.ok(rss.includes('<link>https://example.com/</link>'))
  assert.ok(rss.includes('<item><title>Post A</title>'))
  assert.ok(rss.includes('<description>摘要 B</description>'))
  assert.deepEqual(rssStats, { count: 2, limited: false })
})

test('generateRss supports custom template overrides', async t => {
  const publicDir = await fs.mkdtemp(path.join(os.tmpdir(), TMP_PREFIX))
  t.after(async () => {
    await fs.rm(publicDir, { recursive: true, force: true })
  })

  const lang = createLang({ feedsTemplate: 'custom' })
  const posts = [
    {
      title: 'Post A',
      path: '/zh/content/post-a/',
      date: '2025-01-01',
      updated: '2025-01-02',
      excerpt: '摘要 A'
    }
  ]

  const rssStats = await generateRss(lang, posts, {
    publicDir,
    siteOrigin: 'https://example.com',
    preferredLocale: 'zh',
    templates: TEST_TEMPLATES
  })
  const rss = await fs.readFile(path.join(publicDir, 'rss.xml'), 'utf8')
  assert.ok(rss.includes('<generator>Custom Feed</generator>'))
  assert.ok(rss.includes('<guid>https://example.com/zh/content/post-a/</guid>'))
  assert.ok(rss.includes('<lastBuildDate>2025-01-02T'))
  assert.deepEqual(rssStats, { count: 1, limited: false })

  const sitemapStats = await generateSitemap(lang, posts, {
    publicDir,
    siteOrigin: 'https://example.com',
    templates: TEST_TEMPLATES
  })
  const sitemap = await fs.readFile(path.join(publicDir, 'sitemap.xml'), 'utf8')
  assert.ok(sitemap.includes('<!-- custom sitemap -->'))
  assert.ok(sitemap.includes('<priority>0.5</priority>'))
  assert.deepEqual(sitemapStats, { count: 1 })
})

test('generateRss enforces template-defined limit', async t => {
  const publicDir = await fs.mkdtemp(path.join(os.tmpdir(), TMP_PREFIX))
  t.after(async () => {
    await fs.rm(publicDir, { recursive: true, force: true })
  })

  const lang = createLang({ feedsTemplate: 'tiny' })
  const posts = Array.from({ length: 5 }).map((_, idx) => ({
    title: `Post ${idx + 1}`,
    path: `/zh/content/post-${idx + 1}/`,
    date: `2025-01-0${idx + 1}`,
    updated: `2025-01-0${idx + 1}`,
    excerpt: `摘要 ${idx + 1}`
  }))

  const rssStats = await generateRss(lang, posts, {
    publicDir,
    siteOrigin: 'https://example.com',
    preferredLocale: 'zh',
    templates: TEST_TEMPLATES
  })
  assert.deepEqual(rssStats, { count: 2, limited: true })
  const rss = await fs.readFile(path.join(publicDir, 'rss.xml'), 'utf8')
  const itemMatches = rss.match(/<item>/g) || []
  assert.equal(itemMatches.length, 2)
})

test('generateRss falls back when template missing', async t => {
  const publicDir = await fs.mkdtemp(path.join(os.tmpdir(), TMP_PREFIX))
  t.after(async () => {
    await fs.rm(publicDir, { recursive: true, force: true })
  })

  const lang = createLang({ feedsTemplate: 'missing-template' })
  const posts = [
    {
      title: 'Post',
      path: '/zh/content/post/',
      date: '2025-02-01',
      updated: '2025-02-05',
      excerpt: '摘要'
    }
  ]

  const rssStats = await generateRss(lang, posts, {
    publicDir,
    siteOrigin: 'https://example.com',
    preferredLocale: 'zh'
  })
  const rss = await fs.readFile(path.join(publicDir, 'rss.xml'), 'utf8')
  assert.ok(rss.includes('<rss version="2.0"><channel>'))
  assert.ok(rss.includes('<link>https://example.com/</link>'))
  assert.deepEqual(rssStats, { count: 1, limited: false })

  const sitemapStats = await generateSitemap(lang, posts, {
    publicDir,
    siteOrigin: 'https://example.com'
  })
  const sitemap = await fs.readFile(path.join(publicDir, 'sitemap.xml'), 'utf8')
  assert.ok(sitemap.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'))
  assert.ok(sitemap.includes('<lastmod>2025-02-05</lastmod>'))
  assert.deepEqual(sitemapStats, { count: 1 })
})

test('feeds respect dry run flag', async t => {
  const publicDir = await fs.mkdtemp(path.join(os.tmpdir(), TMP_PREFIX))
  t.after(async () => {
    await fs.rm(publicDir, { recursive: true, force: true })
  })

  const lang = createLang()
  const posts = [
    { title: 'Post', path: '/zh/content/post/', date: '2025-01-01', updated: '2025-01-02', excerpt: '' }
  ]

  const dryRss = await generateRss(lang, posts, {
    publicDir,
    siteOrigin: 'https://example.com',
    preferredLocale: 'zh',
    dryRun: true
  })
  const drySitemap = await generateSitemap(lang, posts, {
    publicDir,
    siteOrigin: 'https://example.com',
    dryRun: true
  })

  await assert.rejects(() => fs.readFile(path.join(publicDir, 'rss.xml')), /ENOENT/)
  await assert.rejects(() => fs.readFile(path.join(publicDir, 'sitemap.xml')), /ENOENT/)
  assert.deepEqual(dryRss, { count: 1, limited: false })
  assert.deepEqual(drySitemap, { count: 1 })
})

test('generateRss propagates fs write failures', async t => {
  const publicDir = await fs.mkdtemp(path.join(os.tmpdir(), TMP_PREFIX))
  t.after(async () => {
    await fs.rm(publicDir, { recursive: true, force: true })
  })

  const lang = createLang()
  const posts = [{ title: 'Post', path: '/zh/content/post/', date: '2025-01-01', updated: '2025-01-02', excerpt: '' }]

  const writeSpy = t.mock.method(fs, 'writeFile', async () => {
    throw new Error('mock fs failure')
  })

  await assert.rejects(
    () => generateRss(lang, posts, { publicDir, siteOrigin: 'https://example.com', preferredLocale: 'zh' }),
    /mock fs failure/
  )
  assert.ok(writeSpy.mock.callCount() >= 1)
})

test('generateSitemap propagates fs write failures', async t => {
  const publicDir = await fs.mkdtemp(path.join(os.tmpdir(), TMP_PREFIX))
  t.after(async () => {
    await fs.rm(publicDir, { recursive: true, force: true })
  })

  const lang = createLang()
  const posts = [{ title: 'Post', path: '/zh/content/post/', date: '2025-01-01', updated: '2025-01-02', excerpt: '' }]

  const writeSpy = t.mock.method(fs, 'writeFile', async () => {
    throw new Error('mock sitemap failure')
  })

  await assert.rejects(
    () => generateSitemap(lang, posts, { publicDir, siteOrigin: 'https://example.com' }),
    /mock sitemap failure/
  )
  assert.ok(writeSpy.mock.callCount() >= 1)
})
