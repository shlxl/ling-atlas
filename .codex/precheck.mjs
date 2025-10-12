
import { sh, envFromDotEnv } from './_common.mjs'
envFromDotEnv()
await sh('npm', ['run', 'precheck'])
console.log('✅ precheck 通过')
