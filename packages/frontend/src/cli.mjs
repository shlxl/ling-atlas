import { spawn } from 'node:child_process'
import { ROOT_DIR } from '@ling-atlas/shared/paths'

const scripts = {
  build: [['npx', ['vitepress', 'build', 'docs']]],
  dev: [['npx', ['vitepress', 'dev', 'docs']]],
  preview: [['npx', ['vitepress', 'preview', 'docs']]]
}

const orderedTasks = Object.keys(scripts)

async function runStep([command, args]) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: ROOT_DIR,
      stdio: 'inherit',
      env: process.env
    })

    child.on('exit', code => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`Command failed: ${command} ${args.join(' ')}`))
      }
    })
  })
}

async function run(task) {
  const sequence = scripts[task]

  if (!sequence) {
    const suggestion = orderedTasks.map(name => `  - ${name}`).join('\n')
    throw new Error(`Unknown task: ${task}\nAvailable tasks:\n${suggestion}`)
  }

  for (const step of sequence) {
    await runStep(step)
  }
}

if (import.meta.url === process.argv[1] || import.meta.main) {
  const [, , task, ...extra] = process.argv

  if (!task || task === '--help' || task === '-h') {
    console.log('Usage: node packages/frontend/src/cli.mjs <task>')
    console.log('Available tasks:')
    for (const name of orderedTasks) {
      console.log(`  - ${name}`)
    }
    process.exit(0)
  }

  if (extra.length) {
    console.warn(`Ignoring extra arguments: ${extra.join(' ')}`)
  }

  run(task).catch(error => {
    console.error(error.message)
    process.exit(1)
  })
}

export { run }
