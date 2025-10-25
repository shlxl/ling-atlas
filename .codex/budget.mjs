import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const CONFIG_PATH = path.resolve('scripts/budget.config.json')
const DIST_DIR = path.resolve('docs/.vitepress/dist')

const defaults = {
  totalMB: 5,
  maxJsKB: 150,
  maxCssKB: 100,
  topN: 10,
  exclude: ['.well-known/sbom.json']
}

function loadConfig(){
  if (fs.existsSync(CONFIG_PATH)){
    try {
      const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
      return { ...defaults, ...parsed }
    } catch (err) {
      console.warn('[budget] Failed to parse config, using defaults:', err)
    }
  }
  return { ...defaults }
}

function overrideWithEnv(config){
  const envTotal = process.env.BUDGET_TOTAL_MB
  const envJs = process.env.BUDGET_MAX_JS_KB
  const envCss = process.env.BUDGET_MAX_CSS_KB
  if (envTotal && !Number.isNaN(Number(envTotal))) config.totalMB = Number(envTotal)
  if (envJs && !Number.isNaN(Number(envJs))) config.maxJsKB = Number(envJs)
  if (envCss && !Number.isNaN(Number(envCss))) config.maxCssKB = Number(envCss)
  return config
}

function shouldExclude(relativePath, patterns = []){
  if (!Array.isArray(patterns) || patterns.length === 0) return false
  return patterns.some(pattern => {
    if (!pattern) return false
    if (pattern.endsWith('/**')) {
      const prefix = pattern.slice(0, -3)
      return relativePath.startsWith(prefix)
    }
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1)
      return relativePath.startsWith(prefix)
    }
    return relativePath === pattern
  })
}

function walk(dir){
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries){
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()){
      files.push(...walk(abs))
    } else if (entry.isFile()){
      files.push(abs)
    }
  }
  return files
}

function formatBytes(bytes){
  if (bytes >= 1024*1024) return `${(bytes/1024/1024).toFixed(2)} MB`
  if (bytes >= 1024) return `${(bytes/1024).toFixed(2)} KB`
  return `${bytes} B`
}

function reportAndExit(context){
  const { totalBytes, maxJs, maxCss, jsFiles, cssFiles, config } = context
  const totalMB = totalBytes / 1024 / 1024
  const maxJsKB = maxJs / 1024
  const maxCssKB = maxCss / 1024
  let ok = true
  const lines = []
  lines.push('=== Bundle Budget Report ===')
  lines.push(`Total size: ${totalMB.toFixed(2)} MB (limit ${config.totalMB} MB)`) 
  if (totalMB > config.totalMB) ok = false
  lines.push(`Max JS chunk: ${maxJsKB.toFixed(2)} KB (limit ${config.maxJsKB} KB) => ${maxJs > 0 ? jsFiles[maxJs]?.relative : 'N/A'}`)
  if (maxJsKB > config.maxJsKB) ok = false
  lines.push(`Max CSS file: ${maxCssKB.toFixed(2)} KB (limit ${config.maxCssKB} KB) => ${maxCss > 0 ? cssFiles[maxCss]?.relative : 'N/A'}`)
  if (maxCssKB > config.maxCssKB) ok = false
  lines.push('--- Top files by size ---')
  const topFiles = [...context.files].sort((a,b)=>b.size-a.size).slice(0, config.topN)
  topFiles.forEach((file, idx)=>{
    lines.push(`${String(idx+1).padStart(2,'0')}. ${file.relative} - ${formatBytes(file.size)}`)
  })
  console.log(lines.join('\n'))
  if (!ok) {
    console.error('\nBudget exceeded. Set BUDGET_TOTAL_MB / BUDGET_MAX_JS_KB / BUDGET_MAX_CSS_KB env vars to adjust.')
    process.exit(1)
  }
}

function main(){
  const config = overrideWithEnv(loadConfig())
  if (!fs.existsSync(DIST_DIR)){
    console.error('[budget] dist directory not found:', DIST_DIR)
    process.exit(1)
  }
  const files = walk(DIST_DIR)
    .map(abs => {
      const stat = fs.statSync(abs)
      const relative = path.relative(DIST_DIR, abs).split(path.sep).join('/')
      return { abs, size: stat.size, relative }
    })
    .filter(file => !shouldExclude(file.relative, config.exclude))
  const jsFiles = {}
  const cssFiles = {}
  let maxJs = 0
  let maxCss = 0
  let totalBytes = 0
  for (const file of files){
    totalBytes += file.size
    if (file.abs.endsWith('.js')){
      if (file.size > maxJs) maxJs = file.size
      jsFiles[file.size] = file
    }
    if (file.abs.endsWith('.css')){
      if (file.size > maxCss) maxCss = file.size
      cssFiles[file.size] = file
    }
  }
  reportAndExit({ files, totalBytes, maxJs, maxCss, jsFiles, cssFiles, config })
}

main()
