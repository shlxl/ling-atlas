import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { slug } from './collect.mjs'

const require = createRequire(import.meta.url)
const templatesSpec = require('../../schema/collections.templates.json')

const templateRegistry = new Map(Object.entries(templatesSpec?.templates ?? {}))

const DEFAULT_ITEM_SEPARATOR = '\n\n'
const AGGREGATE_TYPES = {
  categories: 'category',
  series: 'series',
  tags: 'tag',
  archive: 'archive'
}

export async function writeCollections(lang, meta, writer, options = {}) {
  const dryRun = Boolean(options.dryRun)
  const navEntries = {
    categories: new Map(),
    series: new Map(),
    tags: new Map(),
    archive: new Map()
  }

  const stage = 'collections'
  const templateInfo = getTemplateForLocale(lang)

  const write = async (subdir, name, title, items, aggregateType) => {
    const outDir = path.join(lang.generatedDir, subdir, name)
    const templated = renderCollectionWithTemplate(templateInfo, aggregateType, title, items, lang)
    const md = templated ?? renderFallbackMarkdown(title, items, lang)

    if (writer && !dryRun) {
      writer.addFileTask({
        stage,
        locale: lang.manifestLocale,
        target: path.join(outDir, 'index.md'),
        content: md
      })
    }
    if (!writer && !dryRun) {
      await fs.mkdir(outDir, { recursive: true })
      await fs.writeFile(path.join(outDir, 'index.md'), md)
    }
    return outDir
  }

  for (const [category, items] of Object.entries(meta.byCategory || {})) {
    const categorySlug = slug(category)
    await write('categories', categorySlug, lang.labels.category(category), items, AGGREGATE_TYPES.categories)
    navEntries.categories.set(categorySlug, taxonomyPath('categories', categorySlug, lang))
  }

  for (const [seriesSlug, items] of Object.entries(meta.bySeries || {})) {
    const firstEntry = Array.isArray(items) ? items[0] : null
    const seriesLabel = firstEntry?.series || seriesSlug
    await write('series', seriesSlug, lang.labels.series(seriesLabel), items, AGGREGATE_TYPES.series)
    navEntries.series.set(seriesSlug, taxonomyPath('series', seriesSlug, lang))
  }

  for (const [tag, items] of Object.entries(meta.byTag || {})) {
    const tagSlug = slug(tag)
    await write('tags', tagSlug, lang.labels.tag(tag), items, AGGREGATE_TYPES.tags)
    navEntries.tags.set(tagSlug, taxonomyPath('tags', tagSlug, lang))
  }

  for (const [year, items] of Object.entries(meta.byYear || {})) {
    await write('archive', year, lang.labels.archive(year), items, AGGREGATE_TYPES.archive)
    navEntries.archive.set(year, taxonomyPath('archive', year, lang))
  }

  // Generate a top-level index for all tags
  const allTags = Object.keys(meta.byTag || {}).sort((a, b) => a.localeCompare(b, lang.code === 'en' ? 'en' : 'zh-CN'));
  if (allTags.length > 0) {
    const indexTitle = lang.labels.tagsIndex ? lang.labels.tagsIndex() : 'All Tags';
    const indexFileContent = `---\ntitle: ${indexTitle}\n---\n\n${allTags.map(tag => `- [${tag}](/${lang.code}/_generated/tags/${slug(tag)}/)`).join('\n')}\n`;
    const indexOutPath = path.join(lang.generatedDir, 'tags', 'index.md');
    if (writer && !dryRun) {
        writer.addFileTask({
            stage,
            locale: lang.manifestLocale,
            target: indexOutPath,
            content: indexFileContent
        });
    } else if (!dryRun) {
        await fs.mkdir(path.dirname(indexOutPath), { recursive: true });
        await fs.writeFile(indexOutPath, indexFileContent);
    }
    // Manually construct the path for the index page, as taxonomyPath() requires a slug.
    const indexLink = `${lang.localeRoot === '/' ? '' : lang.localeRoot.replace(/\/$/, '')}/_generated/tags/`;
    navEntries.tags.set('__index__', indexLink);
  }

  return navEntries
}

function renderCollectionWithTemplate(templateInfo, aggregateType, title, items, lang) {
  if (!templateInfo) return null
  const resolved = resolveAggregateTemplate(templateInfo.config, aggregateType, templateInfo.key)
  if (!resolved) return null

  const sortedItems = applySort(items, resolved.sort)
  const shared = {
    locale: lang?.manifestLocale,
    language: lang?.code,
    localeRoot: lang?.localeRoot,
    templateKey: templateInfo.key
  }

  const renderedItems = sortedItems.map((post, index) => {
    const data = {
      index: index + 1,
      ...shared,
      ...post,
      title: post?.title ?? '',
      path: post?.path ?? ''
    }
    return applyTemplate(resolved.item, data, resolved.placeholders)
  })

  const itemsBlock = renderedItems.join(resolved.itemSeparator ?? DEFAULT_ITEM_SEPARATOR)
  const aggregateData = {
    ...shared,
    title,
    count: renderedItems.length,
    items: itemsBlock
  }
  const markdown = applyTemplate(resolved.markdown, aggregateData, resolved.placeholders)
  return ensureTrailingNewline(markdown)
}

function renderFallbackMarkdown(title, items, lang) {
  return `---\ntitle: ${title}\n---\n\n${mdList(items, lang)}\n`
}

function resolveAggregateTemplate(templateEntry, aggregateType, templateKey) {
  if (!templateEntry || typeof templateEntry !== 'object') {
    return null
  }
  const defaults = templateEntry.defaults || {}
  if (typeof defaults.markdown !== 'string' || typeof defaults.item !== 'string') {
    throw new Error(`Invalid collections template "${templateKey}": defaults.markdown and defaults.item must be strings`)
  }

  const overrides = getAggregateOverrides(templateEntry, aggregateType)
  const markdown = typeof overrides.markdown === 'string' ? overrides.markdown : defaults.markdown
  const item = typeof overrides.item === 'string' ? overrides.item : defaults.item
  if (typeof markdown !== 'string' || typeof item !== 'string') {
    throw new Error(`Invalid collections template "${templateKey}" for ${aggregateType}: markdown and item must be strings`)
  }

  const itemSeparator = typeof overrides.itemSeparator === 'string'
    ? overrides.itemSeparator
    : (typeof defaults.itemSeparator === 'string' ? defaults.itemSeparator : DEFAULT_ITEM_SEPARATOR)

  const placeholders = mergePlaceholderConfig(defaults.placeholders, overrides.placeholders)
  const sortRules = normalizeSortRules(overrides.sort ?? defaults.sort)

  return {
    markdown,
    item,
    itemSeparator,
    placeholders,
    sort: sortRules
  }
}

function getAggregateOverrides(templateEntry, aggregateType) {
  const aggregates = templateEntry.aggregates
  if (!aggregates || typeof aggregates !== 'object') return {}
  const override = aggregates[aggregateType]
  if (override && typeof override === 'object') return override
  return {}
}

function mergePlaceholderConfig(base, override) {
  const merged = {}
  if (base && typeof base === 'object') {
    for (const [key, value] of Object.entries(base)) {
      if (value && typeof value === 'object') {
        merged[key] = { ...value }
      }
    }
  }
  if (override && typeof override === 'object') {
    for (const [key, value] of Object.entries(override)) {
      if (value && typeof value === 'object') {
        merged[key] = { ...value }
      } else {
        delete merged[key]
      }
    }
  }
  return merged
}

function normalizeSortRules(rawRules) {
  if (!Array.isArray(rawRules)) return []
  const normalized = []
  for (const rule of rawRules) {
    if (!rule || typeof rule !== 'object') continue
    const fields = Array.isArray(rule.fields)
      ? rule.fields.map(field => String(field)).filter(Boolean)
      : rule.field
        ? [String(rule.field)]
        : []
    if (!fields.length) continue
    const order = rule.order === 'asc' ? 'asc' : 'desc'
    normalized.push({ fields, order })
  }
  return normalized
}

function applySort(items, sortRules) {
  if (!Array.isArray(items)) return []
  if (!Array.isArray(sortRules) || !sortRules.length) {
    return [...items]
  }
  const sorted = [...items]
  sorted.sort((a, b) => compareWithRules(a, b, sortRules))
  return sorted
}

function compareWithRules(a, b, rules) {
  for (const rule of rules) {
    const aValue = selectFieldValue(a, rule.fields)
    const bValue = selectFieldValue(b, rule.fields)

    const aEmpty = isEmptyValue(aValue)
    const bEmpty = isEmptyValue(bValue)

    if (aEmpty && bEmpty) {
      continue
    }
    if (aEmpty) {
      return rule.order === 'desc' ? 1 : -1
    }
    if (bEmpty) {
      return rule.order === 'desc' ? -1 : 1
    }

    const result = compareValues(aValue, bValue)
    if (result !== 0) {
      return rule.order === 'desc' ? -result : result
    }
  }
  return 0
}

function compareValues(a, b) {
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b
  }
  const aString = Array.isArray(a) ? a.join(', ') : String(a)
  const bString = Array.isArray(b) ? b.join(', ') : String(b)
  return aString.localeCompare(bString, undefined, { numeric: true, sensitivity: 'base' })
}

function selectFieldValue(source, fields) {
  if (!Array.isArray(fields)) return undefined
  for (const field of fields) {
    const value = getDeepValue(source, field)
    if (!isEmptyValue(value)) {
      return value
    }
  }
  return undefined
}

function getDeepValue(source, field) {
  if (!field) return undefined
  const segments = String(field).split('.')
  let current = source
  for (const segment of segments) {
    if (current == null) return undefined
    current = current[segment]
  }
  return current
}

function isEmptyValue(value) {
  return value == null || value === '' || (Array.isArray(value) && value.length === 0)
}

function applyTemplate(template, data, placeholderConfig) {
  if (typeof template !== 'string') return ''
  let output = template
  const replacements = {}

  if (data && typeof data === 'object') {
    for (const [key, value] of Object.entries(data)) {
      replacements[key] = formatValue(value)
    }
  }

  for (const [key, value] of Object.entries(replacements)) {
    output = replaceAllToken(output, key, value)
  }

  if (placeholderConfig && typeof placeholderConfig === 'object') {
    for (const [key, config] of Object.entries(placeholderConfig)) {
      const rendered = renderPlaceholder(config, data)
      output = replaceAllToken(output, key, rendered)
    }
  }

  return output
}

function renderPlaceholder(config, data) {
  if (!config || typeof config !== 'object') return ''
  const fields = Array.isArray(config.fields)
    ? config.fields.map(field => String(field)).filter(Boolean)
    : config.field
      ? [String(config.field)]
      : []
  const value = selectFieldValue(data, fields)
  if (isEmptyValue(value)) {
    return typeof config.whenEmpty === 'string' ? config.whenEmpty : ''
  }
  const normalized = Array.isArray(value) ? value.join(', ') : value
  const format = typeof config.format === 'string' ? config.format : '{value}'
  return format.replaceAll('{value}', String(normalized))
}

function replaceAllToken(template, key, value) {
  const token = `{${key}}`
  return template.split(token).join(value ?? '')
}

function formatValue(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (Array.isArray(value)) return value.join(', ')
  return String(value)
}

function ensureTrailingNewline(content) {
  if (!content) return ''
  return content.endsWith('\n') ? content : `${content}\n`
}

function getTemplateForLocale(lang) {
  if (!lang) return null
  const candidates = []
  if (lang.collectionsTemplate) candidates.push(lang.collectionsTemplate)
  if (lang.code) candidates.push(lang.code)
  for (const key of candidates) {
    if (!key) continue
    const template = templateRegistry.get(key)
    if (template) {
      return { key, config: template }
    }
  }
  return null
}

function taxonomyPath(type, slugValue, lang) {
  if (!slugValue) return ''
  const base = lang.localeRoot === '/' ? '' : lang.localeRoot.replace(/\/$/, '')
  return `${base}/_generated/${type}/${slugValue}/`
}

function mdList(items = [], lang) {
  return items
    .map(post => {
      const updated = post.updated ? (lang.code === 'en' ? ` (updated: ${post.updated})` : `（更:${post.updated}）`) : ''
      const excerptLine = post.excerpt ? `> ${post.excerpt}` : ''
      const baseDate = post.date || post.updated
      const dateText = baseDate ? ` · ${baseDate}` : ''
      return `- [${post.title}](${post.path})${dateText}${updated}\n  ${excerptLine}`
    })
    .join('\n\n')
}

export const __test__ = {
  registerTemplate(key, config) {
    templateRegistry.set(key, config)
  },
  unregisterTemplate(key) {
    templateRegistry.delete(key)
  },
  getTemplate(key) {
    return templateRegistry.get(key)
  },
  resolveAggregateTemplate,
  applySort,
  renderCollectionWithTemplate
}
