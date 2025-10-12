
import fs from 'node:fs'
import path from 'node:path'
import { envFromDotEnv } from './_common.mjs'

envFromDotEnv()

function scanDeadlinks() {
  const dir = 'docs/_generated'
  const md = []
  function walk(p){
    for(const f of fs.readdirSync(p)) {
      const fp = path.join(p,f)
      const st = fs.statSync(fp)
      if(st.isDirectory()) walk(fp)
      else if(f.endsWith('.md')) md.push(fp)
    }
  }
  if (fs.existsSync(dir)) walk(dir)
  const bad = []
  for(const file of md){
    const t = fs.readFileSync(file,'utf8')
    const matches = t.matchAll(/\]\((\/[^\)]+)\)/g)
    for(const m of matches){
      if(m[1].endsWith('/index') || m[1].endsWith('/index/')) bad.push({file, link:m[1]})
    }
  }
  return bad
}
const bad = scanDeadlinks()
if(bad.length){
  console.warn('⚠ 潜在死链：')
  for(const b of bad.slice(0,20)) console.warn('-', b.file, '→', b.link)
} else {
  console.log('✅ 未发现明显死链模式')
}
