import { slug } from './collect.mjs'

export function createI18nRegistry(locales, { tagAlias = {}, navConfig } = {}) {
  const localeList = Array.isArray(locales) ? locales : Object.values(locales || {})
  const manifestAlias = new Map(localeList.map(lang => [lang.manifestLocale, lang.aliasLocaleIds || []]))

  const aggregates = normalizeAggregates(navConfig?.aggregates)
  const taxonomyTypes = aggregates.taxonomyKeys
  const tagManifestKey = aggregates.tagKey
  const manifestKeys = aggregates.manifestKeys
  const manifestKeyList = Array.from(manifestKeys)

  const i18nPairs = new Map()
  const taxonomyGroups = Object.fromEntries(
    taxonomyTypes.map(type => [type, { groups: new Set(), slugIndex: new Map(), postIndex: new Map() }])
  )
  const tagGroups = new Map()
  const navManifest = new Map()

  let flushed = false

  function manifestLocaleKeys(lang) {
    const keys = new Set([lang.manifestLocale, ...(lang.aliasLocaleIds || [])])
    return Array.from(keys)
  }

  function canonicalTag(tag) {
    if (!tag) return ''
    const direct = tagAlias[tag]
    if (direct) return slug(direct)
    const lowered = tag.toLowerCase?.()
    if (lowered && tagAlias[lowered]) return slug(tagAlias[lowered])
    return slug(tag)
  }

  function registerI18nEntry(key, localeId, pathValue) {
    if (!key || !localeId || !pathValue) return
    const entry = i18nPairs.get(key) || {}
    entry[localeId] = pathValue
    i18nPairs.set(key, entry)
  }

  function taxonomyPath(type, slugValue, lang) {
    if (!slugValue) return ''
    const base = lang.localeRoot === '/' ? '' : lang.localeRoot.replace(/\/$/, '')
    return `${base}/_generated/${type}/${slugValue}/`
  }

  function registerSingleTaxonomy(type, lang, slugValue, relative) {
    if (!slugValue) return
    const info = taxonomyGroups[type]
    if (!info) return

    const slugKey = `${lang.manifestLocale}|${slugValue}`
    let group = info.slugIndex.get(slugKey)
    if (!group) {
      group = { entries: new Map() }
      info.groups.add(group)
      info.slugIndex.set(slugKey, group)
    }

    group.entries.set(lang.manifestLocale, {
      slug: slugValue,
      path: taxonomyPath(type, slugValue, lang)
    })

    if (relative != null) {
      const postKey = `${relative}|${type}`
      const existing = info.postIndex.get(postKey)
      if (existing && existing !== group) {
        mergeTaxonomyGroups(info, existing, group)
      } else {
        info.postIndex.set(postKey, group)
      }
    }
  }

  function mergeTaxonomyGroups(info, target, source) {
    if (target === source) return target

    for (const [localeId, value] of source.entries) {
      if (!target.entries.has(localeId)) target.entries.set(localeId, value)
      info.slugIndex.set(`${localeId}|${value.slug}`, target)
    }

    for (const [key, group] of info.postIndex.entries()) {
      if (group === source) info.postIndex.set(key, target)
    }

    info.groups.delete(source)
    return target
  }

  function registerTagGroup(canonicalId, { localeId, slug: slugValue, path }) {
    if (!canonicalId || !localeId || !slugValue || !path) return
    let group = tagGroups.get(canonicalId)
    if (!group) {
      group = { entries: new Map() }
      tagGroups.set(canonicalId, group)
    }
    group.entries.set(localeId, { slug: slugValue, path })
  }

  function expandLocalePaths(localePaths) {
    const next = { ...(localePaths || {}) }
    for (const [locale, targetPath] of Object.entries(localePaths || {})) {
      const aliases = manifestAlias.get(locale) || []
      for (const alias of aliases) {
        if (!alias) continue
        if (!(alias in next) && targetPath) {
          next[alias] = targetPath
        }
      }
    }
    return next
  }

  function registerI18nGroupEntry(key, localePaths) {
    if (!key) return
    const expanded = expandLocalePaths(localePaths)
    const existing = i18nPairs.get(key) || {}
    for (const [loc, pathValue] of Object.entries(expanded)) {
      if (pathValue) existing[loc] = pathValue
    }
    i18nPairs.set(key, existing)
  }

  function ensureNavManifest(localeId) {
    if (navManifest.has(localeId)) return navManifest.get(localeId)
    const manifest = { locale: localeId }
    for (const key of manifestKeyList) {
      manifest[key] = new Map()
    }
    navManifest.set(localeId, manifest)
    return manifest
  }

  function flushTaxonomyGroups() {
    for (const [type, info] of Object.entries(taxonomyGroups)) {
      if (!info) continue
      for (const group of info.groups) {
        const localePaths = Object.fromEntries([...group.entries].map(([loc, value]) => [loc, value.path]))
        for (const [, value] of group.entries) {
          registerI18nGroupEntry(`${type}/${value.slug}`, localePaths)
        }
      }
    }
  }

  function flushTagGroups() {
    for (const group of tagGroups.values()) {
      const localePaths = Object.fromEntries([...group.entries].map(([loc, value]) => [loc, value.path]))
      for (const [, value] of group.entries) {
        registerI18nGroupEntry(`${tagManifestKey}/${value.slug}`, localePaths)
      }
    }
  }

  function registerPost(post, lang) {
    if (!post.relative) return

    for (const localeKey of manifestLocaleKeys(lang)) {
      registerI18nEntry(post.relative, localeKey, post.path)
    }

    const categoryKey = aggregates.typeToManifestKey.get('category')
    const seriesKey = aggregates.typeToManifestKey.get('series')
    const archiveKey = aggregates.typeToManifestKey.get('archive')

    if (post.category_slug && categoryKey) registerSingleTaxonomy(categoryKey, lang, post.category_slug, post.relative)
    if (post.series_slug && seriesKey) registerSingleTaxonomy(seriesKey, lang, post.series_slug, post.relative)
    if (post.year && archiveKey) registerSingleTaxonomy(archiveKey, lang, post.year, post.relative)

    for (const tag of post.tags || []) {
      const tagSlug = slug(tag)
      if (!tagSlug) continue
      const canonical = canonicalTag(tag)
      registerTagGroup(canonical, {
        localeId: lang.manifestLocale,
        slug: tagSlug,
        path: taxonomyPath(tagManifestKey, tagSlug, lang)
      })
    }
  }

  function addNavEntries(lang, navEntries = {}) {
    const manifest = ensureNavManifest(lang.manifestLocale)
    for (const type of Object.keys(navEntries)) {
      if (!manifestKeys.has(type)) continue
      const entries = navEntries[type]
      if (!entries || !(entries instanceof Map)) continue
      const bucket = manifest[type]
      if (!bucket || !(bucket instanceof Map)) continue
      for (const [slugValue, target] of entries.entries()) {
        if (slugValue && target) bucket.set(slugValue, target)
      }
    }
  }

  function flush() {
    if (flushed) return
    flushTaxonomyGroups()
    flushTagGroups()
    flushed = true
  }

  function getI18nMap() {
    flush()
    const out = {}
    for (const [key, value] of i18nPairs.entries()) {
      const locales = Object.keys(value || {})
      if (locales.length < 2) continue
      out[key] = value
    }
    return out
  }

  function getNavManifestPayloads() {
    flush()
    const results = []
    for (const lang of localeList) {
      const manifest = ensureNavManifest(lang.manifestLocale)
      const serialize = map => Object.fromEntries(map.entries())
      results.push({
        lang,
        payload: {
          locale: lang.manifestLocale,
          ...Object.fromEntries(manifestKeyList.map(key => [key, serialize(manifest[key] || new Map())]))
        }
      })
    }
    return results
  }

  return {
    registerPost,
    addNavEntries,
    getI18nMap,
    getNavManifestPayloads
  }
}

function normalizeAggregates(rawAggregates) {
  const defaultMap = new Map([
    ['category', 'categories'],
    ['series', 'series'],
    ['archive', 'archive'],
    ['tag', 'tags']
  ])

  const manifestKeys = new Set()
  const typeToManifestKey = new Map(defaultMap)

  if (rawAggregates && typeof rawAggregates === 'object') {
    for (const value of Object.values(rawAggregates)) {
      if (!value || typeof value !== 'object') continue
      const type = value.type
      const manifestKey = value.manifestKey || defaultMap.get(type)
      if (!manifestKey) continue
      manifestKeys.add(manifestKey)
      if (type) typeToManifestKey.set(type, manifestKey)
    }
  }

  for (const manifestKey of defaultMap.values()) {
    manifestKeys.add(manifestKey)
  }

  const taxonomyKeys = ['category', 'series', 'archive']
    .map(type => typeToManifestKey.get(type))
    .filter(Boolean)

  if (!taxonomyKeys.length) {
    taxonomyKeys.push('categories', 'series', 'archive')
  }

  const tagKey = typeToManifestKey.get('tag') || 'tags'
  manifestKeys.add(tagKey)

  return {
    taxonomyKeys: Array.from(new Set(taxonomyKeys)),
    tagKey,
    manifestKeys,
    typeToManifestKey
  }
}
