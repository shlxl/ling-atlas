
import { sh, envFromDotEnv } from './_common.mjs'
envFromDotEnv()
await sh('npm', ['run', 'gen'])
await sh('npx', ['vitepress','dev','docs'], { env: { ...process.env, BASE: process.env.BASE || '/' } })
