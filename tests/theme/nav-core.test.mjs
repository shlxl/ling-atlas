import { test } from 'node:test'
import assert from 'node:assert/strict'
import { navFromMeta } from '../../docs/.vitepress/theme/nav-core.mjs'

const baseTranslations = {
  nav: {
    latest: '最新',
    categories: '分类',
    series: '系列',
    tags: '标签',
    about: '关于',
    guides: '指南',
    metrics: '观测指标',
    qa: '问答',
    deploy: '部署',
    migration: '迁移',
    chat: '知识问答'
  }
}

function withTranslations(locale = 'zh') {
  const map = baseTranslations.nav || {}
  return {
    nav: {
      [locale]: map,
      zh: map,
      en: {
        latest: 'Latest',
        categories: 'Categories',
        series: 'Series',
        tags: 'Tags',
        about: 'About',
        guides: 'Guides',
        metrics: 'Metrics',
        qa: 'FAQ',
        deploy: 'Deployment',
        migration: 'Migration',
        chat: 'Chat'
      }
    }
  }.nav[locale]
}

const defaultOptions = (locale = 'zh') => ({
  locale,
  translations: withTranslations(locale),
  routeRoot: locale === 'zh' ? '/zh' : '/en',
  collator: new Intl.Collator(locale === 'en' ? 'en' : 'zh-CN')
})

test('renders aggregate sections based on nav config', () => {
  const meta = {
    byCategory: { '工程笔记': [{}], '缺失分类': [{}] },
    bySeries: { alpha: [{ series: 'Alpha 系列' }] },
    byTag: { Automation: [{}], 'Vector Search': [{}] },
    byYear: { '2024': [{}], '2025': [{}] }
  }

  const manifest = {
    locale: 'zh',
    archive: {
      '2025': '/zh/_generated/archive/2025/'
    },
    categories: {
      '工程笔记': '/zh/_generated/categories/工程笔记/'
    },
    series: {
      alpha: '/zh/_generated/series/alpha/'
    },
    tags: {
      automation: '/zh/_generated/tags/automation/'
    }
  }

  let nav
  try {
    nav = navFromMeta(meta, manifest, defaultOptions())
  } catch (error) {
    console.error('navFromMeta threw', error)
    throw error
  }

  assert.equal(nav[0].text, '最新')
  assert.equal(nav[0].link, '/zh/_generated/archive/2025/')

  const categoriesEntry = nav.find(item => item.text === '分类')
  assert.ok(categoriesEntry)
  assert.deepEqual(categoriesEntry.items, [{ text: '工程笔记', link: '/zh/_generated/categories/工程笔记/' }])

  const seriesEntry = nav.find(item => item.text === '系列')
  assert.ok(seriesEntry)
  assert.deepEqual(seriesEntry.items, [{ text: 'Alpha 系列', link: '/zh/_generated/series/alpha/' }])

  const tagsEntry = nav.find(item => item.text === '标签')
  assert.ok(tagsEntry)
  assert.equal(tagsEntry.link, '/zh/_generated/tags/automation/')
})

test('hides aggregate sections when manifest entries missing', () => {
  const meta = {
    byCategory: { '工程笔记': [{}] },
    bySeries: { alpha: [{ series: 'Alpha 系列' }] },
    byTag: { Automation: [{}] },
    byYear: { '2025': [{}] }
  }

  const manifest = {
    locale: 'zh',
    archive: {},
    categories: {},
    series: {},
    tags: {}
  }

  const nav = navFromMeta(meta, manifest, defaultOptions())

  assert.ok(nav.find(item => item.text === '最新') == null)
  assert.ok(nav.find(item => item.text === '分类') == null)
  assert.ok(nav.find(item => item.text === '系列') == null)
  assert.ok(nav.find(item => item.text === '标签') == null)

  const aboutEntry = nav.find(item => item.text === '关于')
  assert.ok(aboutEntry)
  assert.equal(aboutEntry.items[0].link, '/zh/about/metrics.html')
})

test('renders group sections from nav config links', () => {
  const meta = {}
  const manifest = { locale: 'zh', archive: {}, categories: {}, series: {}, tags: {} }

  const nav = navFromMeta(meta, manifest, defaultOptions())

  const guidesEntry = nav.find(item => item.text === '指南')
  assert.ok(guidesEntry)
  const links = guidesEntry.items.map(entry => entry.link)
  assert.deepEqual(links, [
    '/zh/DEPLOYMENT.html',
    '/zh/MIGRATION.html'
  ])
})

test('falls back to legacy structure when manifest missing', () => {
  const meta = {
    byCategory: { '工程笔记': [{}] },
    byTag: { Automation: [{}] },
    byYear: { '2025': [{}] }
  }

  const nav = navFromMeta(meta, null, defaultOptions())

  const latestEntry = nav.find(item => item.text === '最新')
  assert.ok(latestEntry)
  assert.equal(latestEntry.link, '/zh/_generated/archive/2025/')

  const categoryEntry = nav.find(item => item.text === '分类')
  assert.ok(categoryEntry)
  assert.equal(categoryEntry.items[0].link, '/zh/_generated/categories/工程笔记/')
})
