import { spawn } from 'node:child_process'
import path from 'node:path'
import { ROOT_DIR } from '@ling-atlas/shared/paths'

const scripts = {
  gen: [
    ['node', [path.join(ROOT_DIR, 'scripts/pagegen.mjs')]],
    ['node', [path.join(ROOT_DIR, 'scripts/telemetry-merge.mjs')]],
    ['node', [path.join(ROOT_DIR, 'scripts/chunk-build.mjs')]],
    ['node', [path.join(ROOT_DIR, 'packages/backend/src/artifacts/sync.mjs')]]
  ],
  'ai:prepare': [['node', [path.join(ROOT_DIR, 'scripts/ai/prepare.mjs')]]],
  'ai:smoke': [['node', [path.join(ROOT_DIR, 'scripts/ai/smoke.mjs')]]],
  ingest: [['node', [path.join(ROOT_DIR, 'scripts/graphrag/ingest.pipeline.mjs')]]],
  'build:data': [
    ['node', [path.join(ROOT_DIR, 'scripts/ai/prepare.mjs')]],
    ['node', [path.join(ROOT_DIR, 'scripts/ai/smoke.mjs')]],
    ['node', [path.join(ROOT_DIR, 'scripts/pagegen.mjs')]],
    ['node', [path.join(ROOT_DIR, 'scripts/telemetry-merge.mjs')]],
    ['node', [path.join(ROOT_DIR, 'scripts/chunk-build.mjs')]],
    ['node', [path.join(ROOT_DIR, 'packages/backend/src/artifacts/sync.mjs')]]
  ],
  'artifacts:sync': [['node', [path.join(ROOT_DIR, 'packages/backend/src/artifacts/sync.mjs')]]]
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
    console.log('Usage: node packages/backend/src/cli.mjs <task>')
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
