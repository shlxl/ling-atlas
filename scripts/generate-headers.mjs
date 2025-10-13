import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { globby } from 'globby'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const DOCS = path.join(ROOT, 'docs')
const DIST = path.join(DOCS, '.vitepress', 'dist')
const PUBLIC = path.join(DOCS, 'public')
const WELL_KNOWN = path.join(PUBLIC, '.well-known')
const HEADERS_PATH = path.join(WELL_KNOWN, 'security-headers.txt')
const CSP_TEMPLATE_PATH = path.join(ROOT, 'security', 'csp-base.json')

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8')
  return JSON.parse(raw)
}

function serializeCsp(directives) {
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ')
}

function escapeHtmlAttr(value) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

async function collectInlineScriptHashes() {
  try {
    const htmlFiles = await globby('**/*.html', { cwd: DIST })
    const hashes = new Set()
    const scriptRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi

    for (const file of htmlFiles) {
      const html = await fs.readFile(path.join(DIST, file), 'utf8')
      let match
      while ((match = scriptRegex.exec(html)) !== null) {
        const attrs = match[1] || ''
        if (/\ssrc\s*=/.test(attrs)) continue
        const typeMatch = attrs.match(/\stype\s*=\s*["']([^"']+)["']/i)
        if (typeMatch && /json|ld\+json/i.test(typeMatch[1])) continue
        const content = match[2] ?? ''
        if (!content.trim()) continue
        const hash = crypto.createHash('sha256').update(content, 'utf8').digest('base64')
        hashes.add(`'sha256-${hash}'`)
      }
    }
    return Array.from(hashes).sort()
  } catch (error) {
    throw new Error(`Failed to compute inline script hashes: ${error?.message || error}`)
  }
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true })
}

async function writeSecurityHeadersFile(csp, inlineHashes) {
  const directives = await readJson(CSP_TEMPLATE_PATH)
  const scriptSources = directives['script-src'] || []
  const omitUnsafeInline = inlineHashes.length > 0
  const filteredSources = scriptSources.filter((item) => {
    if (item === "'sha256-__INLINE__'") return false
    if (omitUnsafeInline && item === "'unsafe-inline'") return false
    return true
  })
  const mergedScripts = [...new Set([...filteredSources, ...inlineHashes])]
  directives['script-src'] = mergedScripts.length ? mergedScripts : filteredSources

  const cspHeader = csp ?? serializeCsp(directives)
  const lines = [
    `Content-Security-Policy: ${cspHeader}`,
    'Referrer-Policy: no-referrer',
    'Permissions-Policy: geolocation=(), camera=(), microphone=()',
    'X-Content-Type-Options: nosniff',
    'Strict-Transport-Security: max-age=31536000; includeSubDomains'
  ]
  await fs.writeFile(HEADERS_PATH, `${lines.join('\n')}\n`, 'utf8')
  return { header: cspHeader, directives }
}

async function mirrorWellKnown() {
  const distWellKnown = path.join(DIST, '.well-known')
  await ensureDir(distWellKnown)
  const files = await globby('*', { cwd: WELL_KNOWN })
  for (const file of files) {
    const src = path.join(WELL_KNOWN, file)
    const dest = path.join(distWellKnown, file)
    await fs.copyFile(src, dest)
  }
}

async function updateHtmlMeta(cspHeader) {
  const htmlFiles = await globby('**/*.html', { cwd: DIST })
  if (!htmlFiles.length) {
    console.warn('[security] no HTML files found under dist; skipped meta update')
    return
  }
  const metaRegex = /<meta\s+http-equiv=["']Content-Security-Policy["'][^>]*>/i
  for (const file of htmlFiles) {
    const fullPath = path.join(DIST, file)
    const html = await fs.readFile(fullPath, 'utf8')
    if (!metaRegex.test(html)) continue
    const replacement = `<meta http-equiv="Content-Security-Policy" content="${escapeHtmlAttr(cspHeader)}">`
    const updated = html.replace(metaRegex, replacement)
    await fs.writeFile(fullPath, updated, 'utf8')
  }
}

async function main() {
  await ensureDir(WELL_KNOWN)
  const inlineHashes = await collectInlineScriptHashes()
  const { header } = await writeSecurityHeadersFile(null, inlineHashes)
  await mirrorWellKnown()
  await updateHtmlMeta(header)

  console.log('[security] CSP header ready:')
  console.log(`  ${header}`)
  if (inlineHashes.length) {
    console.log('[security] inline script hashes:')
    for (const hash of inlineHashes) console.log(`  - ${hash}`)
  } else {
    console.log('[security] no inline script hashes detected')
  }
}

main().catch((error) => {
  console.error('[security] generate-headers failed:', error)
  process.exitCode = 1
})
