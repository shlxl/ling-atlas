// 用法：node .codex/mark-task.mjs PR-B DONE
import fs from 'node:fs'
const [ , , id, status ] = process.argv
const map = { 'DONE':'[DONE]', 'REVIEW':'[IN REVIEW]' }
if (!map[status]) { console.error('状态只能是 DONE 或 REVIEW'); process.exit(1) }
let s = fs.readFileSync('AGENTS.md', 'utf8')
const re = new RegExp(`(^|\\n)([-*]\\s*)(?:\\[.*?\\]\\s*)?(${id}[^\\n]*)`, 'i')
s = s.replace(re, (m, a, b, c) => `${a}${b}${map[status]} ${c}`)
fs.writeFileSync('AGENTS.md', s)
console.log(`AGENTS.md: ${id} → ${map[status]}`)