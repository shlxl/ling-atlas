import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { globby } from 'globby'

const ROOT = process.cwd()
const IMG_DIR = path.join(ROOT, 'docs/public/images')
const MAX_WIDTH = 1600
const QUALITY = 82

async function ensureDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
}

async function processImage(file) {
  const ext = path.extname(file).toLowerCase()
  const base = path.basename(file, ext)
  const dir = path.dirname(file)
  const abs = path.join(IMG_DIR, file)

  const original = sharp(abs)
  const metadata = await original.metadata()

  const outputs = []
  const resized = metadata.width && metadata.width > MAX_WIDTH
    ? original.resize(MAX_WIDTH)
    : original.clone()
  const buffer = await resized.toBuffer()
  outputs.push({ data: buffer, suffix: '', format: metadata.format })

  if (metadata.width && metadata.width > MAX_WIDTH) {
    const halfWidth = Math.round(MAX_WIDTH / 2)
    const resizedHalf = original.resize({ width: halfWidth })
    const bufferHalf = await resizedHalf.toBuffer()
    outputs.push({ data: bufferHalf, suffix: '@1x', format: metadata.format })
  }

  const webpBuffer = await original.clone().webp({ quality: QUALITY }).toBuffer()
  outputs.push({ data: webpBuffer, suffix: '', format: 'webp', isWebp: true })

  for (const output of outputs) {
    const name = `${base}${output.suffix}.${output.isWebp ? 'webp' : ext.replace('.', '')}`
    const outPath = path.join(IMG_DIR, dir, name)
    await ensureDir(outPath)
    await fs.writeFile(outPath, output.data)
  }
}

async function main() {
  const files = await globby(['**/*.png', '**/*.jpg', '**/*.jpeg'], { cwd: IMG_DIR })
  if (!files.length) {
    console.log('No images found under', IMG_DIR)
    return
  }
  for (const file of files) {
    await processImage(file)
  }
  console.log('Image optimization completed for', files.length, 'files')
}

main().catch(err => {
  console.error('Image optimization failed:', err)
  process.exit(1)
})
