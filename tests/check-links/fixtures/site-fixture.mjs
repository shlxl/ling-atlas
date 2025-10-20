import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '../../..')

export async function createCheckLinksFixture(options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'check-links-fixture-'))
  const docsDir = path.join(root, 'docs')
  const zhRoot = path.join(docsDir, 'zh')
  const zhContentDir = path.join(zhRoot, 'content', 'post-a')
  await fs.mkdir(zhContentDir, { recursive: true })

  const distDir = path.join(docsDir, '.vitepress', 'dist')
  await fs.mkdir(distDir, { recursive: true })
  await fs.writeFile(path.join(distDir, 'index.html'), '<!doctype html><title>Fixture</title>')

  const zhPost = `---\n` +
    `title: 测试文章\n` +
    `category_zh: 工程\n` +
    `updated: 2024-01-01\n` +
    `---\n\n正文。`

  await fs.writeFile(path.join(zhContentDir, 'index.md'), zhPost)

  const categorySlug = '工程'
  const zhIndexLinks = [
    '[Post A](/zh/content/post-a/)',
    `[Category Listing](/zh/_generated/categories/${categorySlug}/)`
  ]

  if (options.includeMissingMarkdownLink) {
    zhIndexLinks.push('[Missing Post](/zh/content/missing-post/)')
  }

  const zhIndex = '# 主页\n\n' + zhIndexLinks.join('\n\n') + '\n'
  await fs.mkdir(zhRoot, { recursive: true })
  await fs.writeFile(path.join(zhRoot, 'index.md'), zhIndex)

  const categoryDir = path.join(zhRoot, '_generated', 'categories', categorySlug)
  if (!options.omitCategoryPage) {
    await fs.mkdir(categoryDir, { recursive: true })
    await fs.writeFile(path.join(categoryDir, 'index.md'), '# 工程\n\n占位内容\n')
  }

  const navManifestCategories =
    options.navManifestCategories ?? { [categorySlug]: `/zh/_generated/categories/${categorySlug}/` }

  const navManifest = {
    locale: 'zh',
    categories: navManifestCategories,
    series: {},
    tags: {},
    archive: {}
  }

  const zhGeneratedDir = path.join(zhRoot, '_generated')
  await fs.mkdir(zhGeneratedDir, { recursive: true })
  await fs.writeFile(
    path.join(zhGeneratedDir, 'nav.manifest.zh.json'),
    JSON.stringify(navManifest, null, 2)
  )

  const rootGeneratedDir = path.join(docsDir, '_generated')
  await fs.mkdir(rootGeneratedDir, { recursive: true })
  await fs.writeFile(
    path.join(rootGeneratedDir, 'nav.manifest.zh.json'),
    JSON.stringify(navManifest, null, 2)
  )

  const publicDir = path.join(docsDir, 'public')
  await fs.mkdir(publicDir, { recursive: true })
  const i18nMap = {
    'post-a': {
      zh: '/zh/content/post-a/'
    }
  }

  if (options.includeBrokenI18nEntry) {
    i18nMap['post-b'] = { zh: '/zh/content/missing-post/' }
  }

  await fs.writeFile(path.join(publicDir, 'i18n-map.json'), JSON.stringify(i18nMap, null, 2))

  return {
    root,
    async cleanup() {
      await fs.rm(root, { recursive: true, force: true })
    }
  }
}

export function runCheckLinksCLI(root, args = [], env = {}) {
  return new Promise(resolve => {
    execFile(
      process.execPath,
      [path.join(PROJECT_ROOT, 'scripts', 'check-links.mjs'), ...args],
      {
        cwd: root,
        env: { ...process.env, ...env },
        encoding: 'utf8',
        maxBuffer: 5 * 1024 * 1024
      },
      (error, stdout, stderr) => {
        resolve({ code: error?.code ?? 0, stdout, stderr })
      }
    )
  })
}
