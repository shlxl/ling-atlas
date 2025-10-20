import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export async function generateRss(
  lang,
  items = [],
  { publicDir, siteOrigin, preferredLocale, writer, dryRun = false, target }
) {
  const totalItems = Array.isArray(items) ? items.length : 0
  if (!totalItems) return { count: 0, limited: false }

  const homePath = lang?.code && preferredLocale && lang.code === preferredLocale ? '/' : lang?.localeRoot || '/'
  const template = await resolveTemplate(lang?.feedsTemplate, templates)

  if (template?.rss) {
    try {
      const rendered = renderRssWithTemplate(template.rss, {
        lang,
        items,
        siteOrigin,
        homePath,
        totalItems
      })

      if (!dryRun) {
        await scheduleWrite('rss', lang, publicDir, lang?.rssFile, rendered.content, { writer, dryRun })
      }

      return { count: rendered.count, limited: rendered.limited }
    } catch (error) {
      console.warn(
        `[pagegen.feeds] RSS 模板渲染失败 (${lang?.feedsTemplate || 'unknown'}): ${error?.message || error}`
      )
    }
  }

  return fallbackGenerateRss(lang, items, { publicDir, siteOrigin, preferredLocale, writer, dryRun })
}

export async function generateSitemap(
  lang,
  items = [],
  { publicDir, siteOrigin = '', writer, dryRun = false, templates } = {}
) {
  const totalItems = Array.isArray(items) ? items.length : 0
  if (!totalItems) return { count: 0 }

  const template = await resolveTemplate(lang?.feedsTemplate, templates)

  if (template?.sitemap) {
    try {
      const rendered = renderSitemapWithTemplate(template.sitemap, {
        lang,
        items,
        siteOrigin,
        totalItems
      })

      if (!dryRun) {
        await scheduleWrite('sitemap', lang, publicDir, lang?.sitemapFile, rendered.content, { writer, dryRun })
      }

      return { count: rendered.count }
    } catch (error) {
      console.warn(
        `[pagegen.feeds] Sitemap 模板渲染失败 (${lang?.feedsTemplate || 'unknown'}): ${error?.message || error}`
      )
    }
  }

  return fallbackGenerateSitemap(lang, items, { publicDir, siteOrigin, writer, dryRun })
}

async function resolveTemplate(templateKey, override) {
  if (!templateKey) return null

  const overrideTemplate = extractTemplate(override, templateKey)
  if (overrideTemplate) return overrideTemplate

  try {
    const config = await loadTemplateConfig()
    return extractTemplate(config, templateKey)
  } catch (error) {
    console.warn(`[pagegen.feeds] 无法读取 feeds 模板: ${error?.message || error}`)
    return null
  }
}

function extractTemplate(source, key) {
  if (!source || typeof source !== 'object') return null
  const templates =
    typeof source.templates === 'object' && source.templates
      ? source.templates
      : source
  const candidate = templates?.[key]
  if (!candidate || typeof candidate !== 'object') return null
  return candidate
}

async function loadTemplateConfig() {
  if (!templateConfigPromise) {
    templateConfigPromise = fs
      .readFile(FEEDS_TEMPLATE_PATH, 'utf8')
      .then(raw => JSON.parse(raw))
      .catch(error => {
        templateConfigPromise = null
        throw error
      })
  }
  return templateConfigPromise
}

function renderRssWithTemplate(template, { lang, items, siteOrigin, homePath, totalItems }) {
  const limit = Number.isInteger(template.limit) && template.limit > 0 ? template.limit : 50
  const sliceCount = Math.min(totalItems, limit)
  const limited = totalItems > limit

  const baseContext = createRssBaseContext(lang, {
    siteOrigin,
    homePath,
    limit,
    totalItems,
    sliceCount
  })

  const fragments = []
  fragments.push(renderTemplateParts(template.header, baseContext, 'rss.header'))

  for (let index = 0; index < sliceCount; index += 1) {
    const post = items[index]
    const itemContext = createRssItemContext(post, index, baseContext)
    fragments.push(renderTemplateParts(template.item, itemContext, 'rss.item'))
  }

  fragments.push(renderTemplateParts(template.footer, baseContext, 'rss.footer'))

  return {
    content: fragments.join(''),
    count: sliceCount,
    limited
  }
}

function renderSitemapWithTemplate(template, { lang, items, siteOrigin, totalItems }) {
  const baseContext = createSitemapBaseContext(lang, {
    siteOrigin,
    totalItems
  })
  const fragments = []
  fragments.push(renderTemplateParts(template.header, baseContext, 'sitemap.header'))

  for (let index = 0; index < items.length; index += 1) {
    const post = items[index]
    const itemContext = createSitemapItemContext(post, index, baseContext)
    fragments.push(renderTemplateParts(template.item, itemContext, 'sitemap.item'))
  }

  fragments.push(renderTemplateParts(template.footer, baseContext, 'sitemap.footer'))

  return {
    content: fragments.join(''),
    count: totalItems
  }
}

function createRssBaseContext(lang, { siteOrigin, homePath, limit, totalItems, sliceCount }) {
  return {
    rssTitle: escapeXml(lang?.labels?.rssTitle ?? ''),
    rssDesc: escapeXml(lang?.labels?.rssDesc ?? ''),
    siteOrigin: siteOrigin || '',
    homePath: homePath || '/',
    localeCode: lang?.code ?? '',
    manifestLocale: lang?.manifestLocale ?? lang?.code ?? '',
    rssFile: lang?.rssFile ?? '',
    rssLimit: limit,
    totalItems,
    renderedItems: sliceCount
  }
}

function createRssItemContext(post, index, baseContext) {
  const pathValue = post?.path ?? ''
  const updatedOrDate = post?.updated || post?.date || ''
  const pubDate = updatedOrDate ? new Date(updatedOrDate).toUTCString() : ''
  const isoDate = toIsoString(updatedOrDate)

  return {
    ...baseContext,
    postIndex: index + 1,
    postTitle: escapeXml(post?.title ?? ''),
    postDescription: escapeXml(post?.excerpt ?? ''),
    postPath: pathValue,
    postLink: `${baseContext.siteOrigin}${pathValue}`,
    postGuid: `${baseContext.siteOrigin}${pathValue}`,
    postPubDate: pubDate,
    postDate: post?.date ?? '',
    postUpdated: post?.updated ?? '',
    postLastMod: updatedOrDate,
    postLastModIso: isoDate
  }
}

function createSitemapBaseContext(lang, { siteOrigin, totalItems }) {
  return {
    siteOrigin: siteOrigin || '',
    localeCode: lang?.code ?? '',
    manifestLocale: lang?.manifestLocale ?? lang?.code ?? '',
    sitemapFile: lang?.sitemapFile ?? '',
    totalItems
  }
}

function createSitemapItemContext(post, index, baseContext) {
  const pathValue = post?.path ?? ''
  const updatedOrDate = post?.updated || post?.date || ''

  return {
    ...baseContext,
    postIndex: index + 1,
    postTitle: escapeXml(post?.title ?? ''),
    postPath: pathValue,
    postLink: `${baseContext.siteOrigin}${pathValue}`,
    postLastMod: updatedOrDate,
    postLastModIso: toIsoString(updatedOrDate)
  }
}

function renderTemplateParts(parts, context, section) {
  const fragments = normalizeTemplateFragments(parts, section)
  return fragments.map(fragment => replacePlaceholders(fragment, context)).join('')
}

function normalizeTemplateFragments(value, section) {
  if (Array.isArray(value) && value.every(item => typeof item === 'string')) {
    return value
  }
  throw new Error(`Invalid template fragments for ${section}`)
}

function replacePlaceholders(template, context) {
  if (typeof template !== 'string' || !template.length) return ''
  return template.replace(/\{([a-zA-Z0-9_.-]+)\}/g, (_, key) => {
    if (Object.prototype.hasOwnProperty.call(context, key)) {
      const value = context[key]
      return value == null ? '' : String(value)
    }
    return ''
  })
}

async function scheduleWrite(stage, lang, publicDir, fileName, content, { writer, dryRun }) {
  if (dryRun) return
  const target = resolveTargetPath(publicDir, fileName, stage, lang)
  const locale = lang?.manifestLocale ?? lang?.code
  if (writer) {
    writer.addFileTask({ stage, locale, target, content })
  } else {
    await fs.writeFile(target, content)
  }
}

function resolveTargetPath(publicDir, fileName, stage, lang) {
  const locale = lang?.manifestLocale ?? lang?.code ?? 'default'
  const fallbackName = stage === 'rss' ? `rss.${locale}.xml` : `sitemap.${locale}.xml`
  return path.join(publicDir, fileName || fallbackName)
}

async function fallbackGenerateRss(lang, items, { publicDir, siteOrigin, preferredLocale, writer, dryRun }) {
  const totalItems = Array.isArray(items) ? items.length : 0
  if (!totalItems) return { count: 0, limited: false }

  const homePath = lang?.code && preferredLocale && lang.code === preferredLocale ? '/' : lang?.localeRoot || '/'
  const limited = totalItems > 50
  const sliceCount = Math.min(totalItems, 50)
  const rssFile = lang.rssFile || `rss.${lang.manifestLocale}.xml`
  if (!lang.rssFile) {
    lang.rssFile = rssFile
  }
  const outputTarget = target || path.join(publicDir, rssFile)
  const feed = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0"><channel>`,
    `<title>${escapeXml(lang?.labels?.rssTitle ?? '')}</title>`,
    `<link>${siteOrigin}${homePath}</link>`,
    `<description>${escapeXml(lang?.labels?.rssDesc ?? '')}</description>`
  ]

  for (const post of items.slice(0, sliceCount)) {
    feed.push(
      `<item><title>${escapeXml(post?.title ?? '')}</title>` +
        `<link>${siteOrigin}${post?.path ?? ''}</link>` +
        `<pubDate>${new Date(post?.updated || post?.date).toUTCString()}</pubDate>` +
        `<description>${escapeXml(post?.excerpt || '')}</description></item>`
    )
  }
  feed.push(`</channel></rss>`)

  const content = feed.join('')

  if (writer) {
    writer.addFileTask({
      stage: 'rss',
      locale: lang.manifestLocale,
      target: outputTarget,
      content: feed.join('')
    })
  } else {
    await fs.writeFile(outputTarget, feed.join(''))
  }

  return { count: sliceCount, limited }
}

export async function generateSitemap(
  lang,
  items = [],
  { publicDir, siteOrigin, writer, dryRun = false, target }
) {
  const totalItems = Array.isArray(items) ? items.length : 0
  if (!totalItems) return { count: 0 }

  const urls = items
    .map(post => `<url><loc>${siteOrigin}${post?.path ?? ''}</loc><lastmod>${post?.updated || post?.date}</lastmod></url>`)
    .join('')
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`
  const sitemapFile = lang.sitemapFile || `sitemap.${lang.manifestLocale}.xml`
  if (!lang.sitemapFile) {
    lang.sitemapFile = sitemapFile
  }
  const outputTarget = target || path.join(publicDir, sitemapFile)
  if (dryRun) {
    return { count: totalItems }
  }
  if (writer) {
    writer.addFileTask({
      stage: 'sitemap',
      locale: lang.manifestLocale,
      target: outputTarget,
      content: xml
    })
  } else {
    await fs.writeFile(outputTarget, xml)
  }

  return { count: totalItems }
}

function escapeXml(input) {
  return String(input ?? '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]))
}

function toIsoString(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString()
}
