
import { sh, envFromDotEnv } from './_common.mjs'
import fs from 'node:fs'

const argv = process.argv.slice(2)
const i = argv.indexOf('--message')
const msg = i>=0 ? argv[i+1] : 'chore: content update'

envFromDotEnv()
await sh('npm', ['run', 'tags:normalize']).catch(()=>0)
await sh('npm', ['run', 'precheck'])
await sh('npm', ['run', 'gen'])
await sh('npm', ['run', 'build'], { env: { ...process.env, BASE: process.env.BASE || '/', SITE_ORIGIN: process.env.SITE_ORIGIN || '' } })

await sh('git', ['add','-A'])
await sh('git', ['commit','-m', msg]).catch(()=>0)
await sh('git', ['push', process.env.GIT_REMOTE || 'origin', process.env.GIT_BRANCH || 'main'])

console.log('✅ publish 完成：', msg)
