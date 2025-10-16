import fs from 'node:fs'
import path from 'node:path'
import { LANGUAGES } from './pagegen.locales.mjs'

const distDir = path.resolve('docs/.vitepress/dist')

const aliasPairs = LANGUAGES.map(locale => ({
  code: locale.code,
  source: path.join(distDir, `content.${locale.code}`),
  target: path.join(distDir, locale.code, 'content')
}))

function ensureDirAlias(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) {
    return { status: 'missing-source', source: sourceDir, target: targetDir }
  }
  const stat = fs.statSync(sourceDir)
  if (!stat.isDirectory()) {
    return { status: 'non-directory', source: sourceDir, target: targetDir }
  }

  fs.rmSync(targetDir, { recursive: true, force: true })
  fs.mkdirSync(path.dirname(targetDir), { recursive: true })
  fs.cpSync(sourceDir, targetDir, { recursive: true })
  return { status: 'copied', source: sourceDir, target: targetDir }
}

const results = aliasPairs.map(({ source, target }) => ensureDirAlias(source, target))

const copied = results.filter(entry => entry.status === 'copied')
const skippedMissing = results.filter(entry => entry.status === 'missing-source')
const skippedType = results.filter(entry => entry.status === 'non-directory')

if (copied.length) {
  console.info(
    `[postbuild-aliases] mirrored directories: ${copied
      .map(entry => `${path.relative(distDir, entry.source)} -> ${path.relative(distDir, entry.target)}`)
      .join(', ')}`
  )
}

for (const skipped of skippedMissing) {
  console.info(`[postbuild-aliases] skipped: source not found (${path.relative(distDir, skipped.source)})`)
}

for (const skipped of skippedType) {
  console.warn(`[postbuild-aliases] skipped: source is not a directory (${path.relative(distDir, skipped.source)})`)
}
