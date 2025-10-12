
import fs from 'node:fs'
import { envFromDotEnv, sh } from './_common.mjs'

const argv = process.argv.slice(2)
function arg(name, def){ const i = argv.indexOf('--'+name); return i>=0 ? argv[i+1] : def }

const BASE = arg('base', process.env.BASE || '/')
const SITE = arg('site', process.env.SITE_ORIGIN || '')
const NVMRC = '22.19.0'

if(!fs.existsSync('.nvmrc')) fs.writeFileSync('.nvmrc', NVMRC+'\n')

let env = ''
if(fs.existsSync('.env')) env = fs.readFileSync('.env','utf8')
const lines = env.split(/\r?\n/).filter(Boolean).filter(l=>!/^BASE=|^SITE_ORIGIN=/.test(l))
lines.push(`BASE=${BASE}`)
if(SITE) lines.push(`SITE_ORIGIN=${SITE}`)
fs.writeFileSync('.env', lines.join('\n')+'\n')

envFromDotEnv()

try {
  if(fs.existsSync('package-lock.json')){
    await sh('npm', ['ci'])
  } else {
    await sh('npm', ['install'])
  }
} catch(e){
  console.error('依赖安装失败：', e.message); process.exit(1)
}

await sh('npm', ['run', 'precheck'])
await sh('npm', ['run', 'gen'])
await sh('npm', ['run', 'build'], { env: { ...process.env, BASE, SITE_ORIGIN: SITE||process.env.SITE_ORIGIN||'' } })

console.log('✅ setup 完成')
