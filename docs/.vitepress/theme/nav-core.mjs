import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const navConfig = loadNavConfig()

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

const NAV_AGGREGATES = normalizeAggregates(navConfig?.aggregates)
const NAV_SECTIONS = Array.isArray(navConfig?.sections) ? navConfig.sections : []
const NAV_LINKS = normalizeLinks(navConfig?.links)

export function navFromMeta(meta, manifest, options) {
  const { locale, translations, routeRoot, collator } = options || {}
  const t = translations || {}
  const routePrefix = typeof routeRoot === 'string' ? routeRoot : ''
  const collatorInstance = getCollator(locale, collator)

  if (!manifest) {
    return legacyNav(meta, { locale, translations: t, routeRoot: routePrefix })
  }

  const manifestProvided = manifest != null

  const context = {
    locale,
    routePrefix,
    translations: t,
    manifest: manifestProvided ? manifest : {},
    meta: meta || {},
    collator: collatorInstance
  }

  const nav = []
  let hasAggregate = false

  for (const section of NAV_SECTIONS) {
    const rendered = renderSection(section, context)
    if (!rendered) continue
    if (rendered.__aggregate) {
      hasAggregate = true
      delete rendered.__aggregate
    }
    nav.push(rendered)
  }

  if (!hasAggregate && !manifestProvided) {
    return legacyNav(meta, { locale, translations: t, routeRoot: routePrefix })
  }

  return nav
}

function renderSection(section, context) {
  if (!section || typeof section !== 'object') return null
  const kind = section.kind || 'link'
  if (kind === 'aggregate') {
    return renderAggregateSection(section, context)
  }
  if (kind === 'group') {
    return renderGroupSection(section, context)
  }
  if (kind === 'link') {
    return renderLinkSection(section, context)
  }
  return null
}

function renderAggregateSection(section, context) {
  const aggregateKey = section.aggregateKey
  if (!aggregateKey) return null
  const aggregate = NAV_AGGREGATES.get(aggregateKey)
  if (!aggregate) return null

  const translationKey = section.titleKey || aggregate.labelKey
  const text = resolveTranslation(context.translations, translationKey)

  const entries = buildAggregateEntries(aggregate, context)
  if (!entries?.length) return null

  if (aggregate.type === 'tag' || aggregate.type === 'archive') {
    return markAggregate({ text, link: entries[0].link })
  }

  return markAggregate({ text, items: entries })
}

function renderGroupSection(section, context) {
  const items = Array.isArray(section.items)
    ? section.items.map(item => renderLinkItem(item, context)).filter(Boolean)
    : []
  if (!items.length) return null
  const text = resolveTranslation(context.translations, section.titleKey)
  return { text, items }
}

function renderLinkSection(section, context) {
  const item = renderLinkItem(section, context)
  if (!item) return null
  return item
}

function markAggregate(entry) {
  if (entry && typeof entry === 'object') {
    Object.defineProperty(entry, '__aggregate', {
      value: true,
      enumerable: false,
      configurable: true
    })
  }
  return entry
}

function renderLinkItem(item, context) {
  if (!item || typeof item !== 'object') return null
  const href = resolveLink(item.link, context)
  if (!href) return null
  const text = resolveTranslation(context.translations, item.labelKey)
  return { text, link: href }
}

function buildAggregateEntries(aggregate, context) {
  const { manifest, meta, routePrefix, translations, collator, locale } = context
  const manifestKey = aggregate.manifestKey
  const manifestEntries = manifest?.[manifestKey]

  if (!manifestEntries || typeof manifestEntries !== 'object') {
    return []
  }

  if (aggregate.type === 'archive') {
    const years = sortByLocale(Object.keys(meta?.byYear || {}), 'en').reverse()
    const available = years.find(year => manifestEntries?.[year])
    const fallback = Object.values(manifestEntries)[0]
    if (available && manifestEntries[available]) {
      return [{ text: resolveTranslation(translations, aggregate.labelKey), link: manifestEntries[available] }]
    }
    if (fallback) {
      return [{ text: resolveTranslation(translations, aggregate.labelKey), link: fallback }]
    }
    return []
  }

  if (aggregate.type === 'category') {
    const categories = sortByLocale(Object.keys(meta?.byCategory || {}), locale)
    return categories
      .map(name => {
        const slugValue = slug(name)
        const link = manifestEntries[slugValue]
        if (!link) return null
        return { text: name, link }
      })
      .filter(Boolean)
  }

  if (aggregate.type === 'series') {
    return Object.entries(meta?.bySeries || {})
      .map(([slugValue, entries]) => {
        const link = manifestEntries[slugValue]
        if (!link) return null
        const firstEntry = toArray(entries)[0]
        const label = firstEntry && typeof firstEntry === 'object' && 'series' in firstEntry && firstEntry.series
          ? firstEntry.series
          : slugValue
        return { text: label, link }
      })
      .filter(Boolean)
      .sort((a, b) => a.text.localeCompare(b.text, locale === 'en' ? 'en' : 'zh-CN'))
  }

  if (aggregate.type === 'tag') {
    return Object.keys(meta?.byTag || {})
      .map(tag => {
        const slugValue = slug(tag)
        const link = manifestEntries[slugValue]
        if (!link) return null
        return { text: tag, link }
      })
      .filter(Boolean)
      .sort((a, b) => collator.compare(a.text, b.text))
  }

  return []
}

function resolveTranslation(translations, key) {
  if (!key) return ''
  if (!translations || typeof translations !== 'object') return key
  const parts = String(key).split('.')
  let ref = translations
  for (const part of parts) {
    if (!ref || typeof ref !== 'object') {
      ref = undefined
      break
    }
    ref = ref[part]
  }
  if (typeof ref === 'string') return ref

  const last = parts[parts.length - 1]
  if (typeof translations[last] === 'string') return translations[last]
  if (typeof translations[key] === 'string') return translations[key]
  return key
}

function resolveLink(template, context) {
  if (!template) return ''
  if (typeof template === 'string' && template.startsWith('{links.')) {
    const linkKey = template.replace(/^\{links\./, '').replace(/\}$/, '')
    const definition = NAV_LINKS.get(linkKey)
    if (!definition) {
      return ''
    }
    return interpolate(definition.href, context)
  }
  if (typeof template === 'string') {
    return interpolate(template, context)
  }
  return ''
}

function interpolate(template, context) {
  if (!template) return ''
  return template
    .replace(/\{routeRoot\}/g, context.routePrefix || '')
    .replace(/\{locale\}/g, context.locale || '')
}

function legacyNav(meta, options) {
  return legacyNavFromMeta(meta, options)
}

function legacyNavFromMeta(meta, options) {
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

function normalizeAggregates(rawAggregates) {
  const result = new Map()
  if (rawAggregates && typeof rawAggregates === 'object') {
    for (const [key, value] of Object.entries(rawAggregates)) {
      if (!value || typeof value !== 'object') continue
      result.set(key, value)
    }
  }
  return result
}

function normalizeLinks(rawLinks) {
  const result = new Map()
  if (rawLinks && typeof rawLinks === 'object') {
    for (const [key, value] of Object.entries(rawLinks)) {
      if (!value || typeof value !== 'object') continue
      if (typeof value.href !== 'string') continue
      result.set(key, value)
    }
  }
  return result
}

function loadNavConfig() {
  try {
    const configPath = path.resolve(__dirname, '../../../schema/nav.json')
    return JSON.parse(fs.readFileSync(configPath, 'utf8'))
  } catch (error) {
    console.warn('[nav-core] failed to load navigation config:', error)
    return {}
  }
}
