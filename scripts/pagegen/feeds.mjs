import fs from 'node:fs/promises'
import path from 'node:path'

export async function generateRss(lang, items, { publicDir, siteOrigin, preferredLocale, writer }) {
  if (!items.length) return
  const homePath = lang.code === preferredLocale ? '/' : lang.localeRoot
  const feed = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0"><channel>`,
    `<title>${escapeXml(lang.labels.rssTitle)}</title>`,
    `<link>${siteOrigin}${homePath}</link>`,
    `<description>${escapeXml(lang.labels.rssDesc)}</description>`
  ]

  for (const post of items.slice(0, 50)) {
    feed.push(
      `<item><title>${escapeXml(post.title)}</title>` +
        `<link>${siteOrigin}${post.path}</link>` +
        `<pubDate>${new Date(post.updated || post.date).toUTCString()}</pubDate>` +
        `<description>${escapeXml(post.excerpt || '')}</description></item>`
    )
  }
  feed.push(`</channel></rss>`)

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
}

export async function generateSitemap(lang, items, { publicDir, siteOrigin, writer }) {
  if (!items.length) return
  const urls = items
    .map(post => `<url><loc>${siteOrigin}${post.path}</loc><lastmod>${post.updated || post.date}</lastmod></url>`)
    .join('')
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`
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
}

function escapeXml(s) {
  return String(s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]))
}
