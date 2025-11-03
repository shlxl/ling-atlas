import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { globby } from 'globby'

const ROOT = process.cwd()
const ICON_DIR = path.join(ROOT, 'docs/public/icons')
const QUALITY = 80

async function ensureDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
}

async function processIcon(file) {
  const abs = path.join(ICON_DIR, file)
  const ext = path.extname(file).toLowerCase()
  const base = path.basename(file, ext)

  try {
    const img = sharp(abs)
    const metadata = await img.metadata()

    // produce optimized png (via pngquant-like settings) and webp
    const pngBuffer = await img.png({ quality: Math.max(60, QUALITY - 10), compressionLevel: 9 }).toBuffer()
    const webpBuffer = await img.webp({ quality: QUALITY }).toBuffer()

    const outPng = path.join(ICON_DIR, `${base}.opt.png`)
    const outWebp = path.join(ICON_DIR, `${base}.webp`)
    await ensureDir(outPng)
    await fs.writeFile(outPng, pngBuffer)
    await fs.writeFile(outWebp, webpBuffer)

    const before = metadata.size || 0
    const after = pngBuffer.length
    const saved = before - after
    console.log(`${file}: ${before} -> ${after} bytes (saved ${saved} bytes), webp: ${webpBuffer.length} bytes`)
  } catch (err) {
    console.error('failed to optimize', file, err)
  }
}

async function main(){
  const files = await globby(['**/*.png','**/*.jpg','**/*.jpeg'], { cwd: ICON_DIR })
  if (!files.length) {
    console.log('No icons found under', ICON_DIR)
    return
  }
  for (const file of files) {
    await processIcon(file)
  }
  console.log('Icon optimization completed for', files.length, 'files. New files have .opt.png and .webp next to originals.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
