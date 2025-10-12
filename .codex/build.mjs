
import { sh, envFromDotEnv } from './_common.mjs'
envFromDotEnv()
await sh('npm', ['run', 'build'], { env: { ...process.env, BASE: process.env.BASE || '/', SITE_ORIGIN: process.env.SITE_ORIGIN || '' } })
console.log('✅ build 完成')
