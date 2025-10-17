const DEFAULT_COLLATOR_LOCALES = new Map([
  ['en', 'en'],
  ['zh', 'zh-CN']
])

export function slug(input) {
  return String(input || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/(^-|-$)/g, '')
    .toLowerCase()
}

function toArray(input) {
  if (Array.isArray(input)) return input
  if (input == null) return []
  return [input]
}

function getCollator(locale, provided) {
  if (provided) return provided
  const collatorLocale = DEFAULT_COLLATOR_LOCALES.get(locale) || DEFAULT_COLLATOR_LOCALES.get('zh')
  try {
    return new Intl.Collator(collatorLocale)
  } catch {
    return new Intl.Collator('en')
  }
}

function sortByLocale(items, locale) {
  if (!Array.isArray(items)) return []
  const targetLocale = locale === 'en' ? 'en' : 'zh-CN'
  return items.slice().sort((a, b) => String(a).localeCompare(String(b), targetLocale))
}

export function legacyNavFromMeta(meta, options) {
  const { locale, translations, routeRoot } = options || {}
  const t = translations || {}
  const prefix = typeof routeRoot === 'string' ? routeRoot : ''
  const byYear = meta?.byYear || {}
  const byCategory = meta?.byCategory || {}
  const bySeries = meta?.bySeries || {}
  const byTag = meta?.byTag || {}

  const years = sortByLocale(Object.keys(byYear || {}), 'en').reverse()
  const firstYear = years[0] || ''

  const categoryItems = sortByLocale(Object.keys(byCategory || {}), locale).map(name => ({
    text: name,
    link: `${prefix}/_generated/categories/${slug(name)}/`
  }))

  const seriesItems = sortByLocale(Object.keys(bySeries || {}), locale).map(key => ({
    text: key,
    link: `${prefix}/_generated/series/${key}/`
  }))

  const tagKeys = Object.keys(byTag || {})
  const firstTag = tagKeys.length ? tagKeys[0] : 'all'

  return [
    { text: t.latest, link: `${prefix}/_generated/archive/${firstYear}/` },
    categoryItems.length ? { text: t.categories, items: categoryItems } : null,
    seriesItems.length ? { text: t.series, items: seriesItems } : null,
    { text: t.tags, link: `${prefix}/_generated/tags/${slug(firstTag)}/` },
    {
      text: t.about,
      items: [
        { text: t.metrics, link: `${prefix}/about/metrics.html` },
        { text: t.qa, link: `${prefix}/about/qa.html` }
      ]
    },
    {
      text: t.guides,
      items: [
        { text: t.deploy, link: `${prefix}/DEPLOYMENT.html` },
        { text: t.migration, link: `${prefix}/MIGRATION.html` }
      ]
    }
  ].filter(Boolean)
}

export function navFromMeta(meta, manifest, options) {
  const { locale, translations, routeRoot, collator } = options || {}
  if (!manifest) return legacyNavFromMeta(meta, options)

  const t = translations || {}
  const routePrefix = typeof routeRoot === 'string' ? routeRoot : ''
  const collatorInstance = getCollator(locale, collator)
  const byCategory = meta?.byCategory || {}
  const bySeries = meta?.bySeries || {}
  const byTag = meta?.byTag || {}
  const byYear = meta?.byYear || {}

  const archiveYears = sortByLocale(Object.keys(byYear || {}), 'en').reverse()
  const availableArchive = archiveYears.find(year => manifest?.archive?.[year])
  const archiveFallback = Object.values(manifest?.archive || {})[0]

  const categories = sortByLocale(Object.keys(byCategory || {}), locale)
    .map(name => {
      const slugValue = slug(name)
      const link = manifest?.categories?.[slugValue]
      if (!link) return null
      return { text: name, link }
    })
    .filter(Boolean)

  const series = Object.entries(bySeries || {})
    .map(([slugValue, entries]) => {
      const link = manifest?.series?.[slugValue]
      if (!link) return null
      const firstEntry = toArray(entries)[0]
      const label = firstEntry && typeof firstEntry === 'object' && 'series' in firstEntry && firstEntry.series
        ? firstEntry.series
        : slugValue
      return { text: label, link }
    })
    .filter(Boolean)
    .sort((a, b) => a.text.localeCompare(b.text, locale === 'en' ? 'en' : 'zh-CN'))

  const tags = Object.keys(byTag || {})
    .map(tag => {
      const slugValue = slug(tag)
      const link = manifest?.tags?.[slugValue]
      if (!link) return null
      return { tag, slugValue, link }
    })
    .filter(Boolean)
    .sort((a, b) => collatorInstance.compare(a.tag, b.tag))

  const nav = []

  if (availableArchive && manifest?.archive?.[availableArchive]) {
    nav.push({ text: t.latest, link: manifest.archive[availableArchive] })
  } else if (archiveFallback) {
    nav.push({ text: t.latest, link: archiveFallback })
  }

  if (categories.length) {
    nav.push({ text: t.categories, items: categories })
  }

  if (series.length) {
    nav.push({ text: t.series, items: series })
  }

  if (tags.length) {
    nav.push({ text: t.tags, link: tags[0].link })
  }

  nav.push({
    text: t.about,
    items: [
      { text: t.metrics, link: `${routePrefix}/about/metrics.html` },
      { text: t.qa, link: `${routePrefix}/about/qa.html` }
    ]
  })

  nav.push({
    text: t.guides,
    items: [
      { text: t.deploy, link: `${routePrefix}/DEPLOYMENT.html` },
      { text: t.migration, link: `${routePrefix}/MIGRATION.html` }
    ]
  })

  return nav
}
