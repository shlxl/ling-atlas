import { test } from 'node:test'
import assert from 'node:assert/strict'
import { navFromMeta, slug } from '../../docs/.vitepress/theme/nav-core.mjs'

const zhTranslations = {
  latest: '最新',
  categories: '分类',
  series: '系列',
  tags: '标签',
  about: 'About',
  metrics: '观测指标',
  qa: '常见问答',
  guides: '指南',
  deploy: '部署指南',
  migration: '迁移与重写'
}

function buildOptions(locale = 'zh') {
  const routeRoot = locale === 'zh' ? '/zh' : '/en'
  return {
    locale,
    translations: zhTranslations,
    routeRoot,
    collator: new Intl.Collator(locale === 'en' ? 'en' : 'zh-CN')
  }
}

test('navFromMeta filters aggregates to manifest-backed entries', () => {
  const meta = {
    byCategory: {
      '工程笔记': [{}],
      '缺失分类': [{}]
    },
    bySeries: {
      'series-one': [{ series: '深入专题' }],
      'missing-series': [{ series: '缺失专题' }]
    },
    byTag: {
      Automation: [{}],
      'Vector Search': [{}],
      Ghost: [{}]
    },
    byYear: {
      '2024': [{}],
      '2025': [{}]
    }
  }

  const manifest = {
    locale: 'zh',
    categories: {
      [slug('工程笔记')]: '/zh/_generated/categories/工程笔记/'
    },
    series: {
      'series-one': '/zh/_generated/series/series-one/'
    },
    tags: {
      [slug('Automation')]: '/zh/_generated/tags/automation/',
      [slug('Vector Search')]: '/zh/_generated/tags/vector-search/'
    },
    archive: {
      '2025': '/zh/_generated/archive/2025/'
    }
  }

  const nav = navFromMeta(meta, manifest, buildOptions('zh'))

  assert.equal(nav[0].text, zhTranslations.latest)
  assert.equal(nav[0].link, '/zh/_generated/archive/2025/')

  const categoriesEntry = nav.find(item => item.text === zhTranslations.categories)
  assert.ok(categoriesEntry, 'categories entry should exist when manifest has categories')
  assert.equal(categoriesEntry.items.length, 1)
  assert.equal(categoriesEntry.items[0].text, '工程笔记')
  assert.equal(categoriesEntry.items[0].link, '/zh/_generated/categories/工程笔记/')

  const seriesEntry = nav.find(item => item.text === zhTranslations.series)
  assert.ok(seriesEntry)
  assert.equal(seriesEntry.items.length, 1)
  assert.equal(seriesEntry.items[0].link, '/zh/_generated/series/series-one/')

  const tagsEntry = nav.find(item => item.text === zhTranslations.tags)
  assert.ok(tagsEntry)
  assert.equal(tagsEntry.link, '/zh/_generated/tags/automation/')

  const aboutEntry = nav.find(item => item.text === zhTranslations.about)
  assert.ok(aboutEntry)
  assert.deepEqual(aboutEntry.items, [
    { text: zhTranslations.metrics, link: '/zh/about/metrics.html' },
    { text: zhTranslations.qa, link: '/zh/about/qa.html' }
  ])
})

test('navFromMeta falls back to first manifest archive when meta year missing', () => {
  const meta = {
    byCategory: {},
    bySeries: {},
    byTag: {},
    byYear: {
      '2023': [{}]
    }
  }

  const manifest = {
    locale: 'zh',
    categories: {},
    series: {},
    tags: {},
    archive: {
      '2024': '/zh/_generated/archive/2024/'
    }
  }

  const nav = navFromMeta(meta, manifest, buildOptions('zh'))
  assert.equal(nav[0].text, zhTranslations.latest)
  assert.equal(nav[0].link, '/zh/_generated/archive/2024/')
})

test('navFromMeta falls back to legacy navigation when manifest missing', () => {
  const meta = {
    byCategory: {
      '工程笔记': [{}]
    },
    bySeries: {
      'series-one': [{}]
    },
    byTag: {
      Automation: [{}]
    },
    byYear: {
      '2025': [{}]
    }
  }

  const nav = navFromMeta(meta, null, buildOptions('zh'))
  assert.equal(nav[0].link, '/zh/_generated/archive/2025/')
  const categoriesEntry = nav.find(item => item.text === zhTranslations.categories)
  assert.ok(categoriesEntry)
  assert.equal(categoriesEntry.items[0].link, '/zh/_generated/categories/' + slug('工程笔记') + '/')
  const tagsEntry = nav.find(item => item.text === zhTranslations.tags)
  assert.ok(tagsEntry)
  assert.equal(tagsEntry.link, '/zh/_generated/tags/' + slug('Automation') + '/')
})
