
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

export function sh(cmd, args=[], opts={}){
  return new Promise((resolve, reject)=>{
    const p = spawn(cmd, args, { stdio:'inherit', shell: process.platform === 'win32', ...opts })
    p.on('exit', code => code===0 ? resolve(0) : reject(new Error(cmd+' exit '+code)))
  })
}
export function envFromDotEnv(){
  const dotenv = path.resolve('.env')
  if(fs.existsSync(dotenv)){
    const lines = fs.readFileSync(dotenv,'utf8').split(/\r?\n/)
    for(const line of lines){
      const m = /^([^#=\s]+)\s*=\s*(.+)$/.exec(line)
      if(m){ process.env[m[1]] = m[2] }
    }
  }
}
