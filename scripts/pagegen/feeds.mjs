import fs from 'node:fs/promises'
import path from 'node:path'

export async function generateRss(lang, items = [], { publicDir, siteOrigin, preferredLocale, writer, dryRun = false }) {
  const totalItems = Array.isArray(items) ? items.length : 0
  if (!totalItems) return { count: 0, limited: false }

  const homePath = lang.code === preferredLocale ? '/' : lang.localeRoot
  const limited = totalItems > 50
  const sliceCount = Math.min(totalItems, 50)
  const feed = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0"><channel>`,
    `<title>${escapeXml(lang.labels.rssTitle)}</title>`,
    `<link>${siteOrigin}${homePath}</link>`,
    `<description>${escapeXml(lang.labels.rssDesc)}</description>`
  ]

  for (const post of items.slice(0, sliceCount)) {
    feed.push(
      `<item><title>${escapeXml(post.title)}</title>` +
        `<link>${siteOrigin}${post.path}</link>` +
        `<pubDate>${new Date(post.updated || post.date).toUTCString()}</pubDate>` +
        `<description>${escapeXml(post.excerpt || '')}</description></item>`
    )
  }
  feed.push(`</channel></rss>`)

  if (dryRun) {
    return { count: sliceCount, limited }
  }

  if (writer) {
    writer.addFileTask({
      stage: 'rss',
      locale: lang.manifestLocale,
      target: path.join(publicDir, lang.rssFile),
      content: feed.join('')
    })
  } else {
    await fs.writeFile(path.join(publicDir, lang.rssFile), feed.join(''))
  }

  return { count: sliceCount, limited }
}

export async function generateSitemap(lang, items = [], { publicDir, siteOrigin, writer, dryRun = false }) {
  const totalItems = Array.isArray(items) ? items.length : 0
  if (!totalItems) return { count: 0 }

  const urls = items
    .map(post => `<url><loc>${siteOrigin}${post.path}</loc><lastmod>${post.updated || post.date}</lastmod></url>`)
    .join('')
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`
  if (dryRun) {
    return { count: totalItems }
  }
  if (writer) {
    writer.addFileTask({
      stage: 'sitemap',
      locale: lang.manifestLocale,
      target: path.join(publicDir, lang.sitemapFile),
      content: xml
    })
  } else {
    await fs.writeFile(path.join(publicDir, lang.sitemapFile), xml)
  }

  return { count: totalItems }
}

function escapeXml(s) {
  return String(s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]))
}
