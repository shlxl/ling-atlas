
import { sh, envFromDotEnv } from './_common.mjs'
envFromDotEnv()
await sh('npm', ['run', 'gen'])
console.log('✅ pagegen 完成')
