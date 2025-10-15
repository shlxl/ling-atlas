import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

const distDir = path.resolve('docs/.vitepress/dist')
const swPath = path.join(distDir, 'sw.js')
const manifestStartToken = 'precacheAndRoute(['
const manifestEndToken = '],{}),'
const htmlEntries = ['index.html', 'en/index.html', '404.html']

if (!fs.existsSync(swPath)) {
  console.warn(`[pwa] skip precache patch: ${swPath} not found`)
  process.exit(0)
}

const swSource = fs.readFileSync(swPath, 'utf8')
const startIndex = swSource.indexOf(manifestStartToken)
const endIndex = swSource.indexOf(manifestEndToken, startIndex)

if (startIndex === -1 || endIndex === -1) {
  console.warn('[pwa] unable to locate precache manifest in sw.js, skipping patch.')
  process.exit(0)
}

let additions = ''
const addedUrls = []

for (const relativePath of htmlEntries) {
  if (swSource.includes(`url:"${relativePath}"`)) continue
  const absolutePath = path.join(distDir, relativePath)
  if (!fs.existsSync(absolutePath)) continue
  const revision = createHash('md5').update(fs.readFileSync(absolutePath)).digest('hex')
  additions += `,{url:"${relativePath}",revision:"${revision}"}`
  addedUrls.push(relativePath)
}

if (!additions) {
  console.info('[pwa] precache manifest already contains HTML fallbacks.')
  process.exit(0)
}

const patched = swSource.slice(0, endIndex) + additions + swSource.slice(endIndex)
fs.writeFileSync(swPath, patched)
console.info(`[pwa] appended HTML precache entries: ${addedUrls.join(', ')}`)
