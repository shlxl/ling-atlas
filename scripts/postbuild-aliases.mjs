import fs from 'node:fs'
import path from 'node:path'

const distDir = path.resolve('docs/.vitepress/dist')

const aliasPairs = [
  ['content.zh', 'content']
]

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

const results = []

for (const [source, target] of aliasPairs) {
  const sourcePath = path.join(distDir, source)
  const targetPath = path.join(distDir, target)
  results.push(ensureDirAlias(sourcePath, targetPath))
}

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
  console.warn(`[postbuild-aliases] skipped: source not found (${path.relative(distDir, skipped.source)})`)
}

for (const skipped of skippedType) {
  console.warn(`[postbuild-aliases] skipped: source is not a directory (${path.relative(distDir, skipped.source)})`)
}
