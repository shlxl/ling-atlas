import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'

test('ai prepare copies models and smoke validates checksum', async () => {
  const workspace = await fs.mkdtemp(path.join(tmpdir(), 'ai-lifecycle-'))
  const sourcePath = path.join(workspace, 'source.bin')
  await fs.writeFile(sourcePath, 'sample-model')
  const checksum = crypto.createHash('sha256').update('sample-model').digest('hex')
  const targetPath = path.join(workspace, 'models', 'test-model.bin')
  const configPath = path.join(workspace, 'models.json')
  const config = {
    models: [
      {
        id: 'test-model',
        adapter: 'dummy',
        source: sourcePath,
        target: targetPath,
        checksum: `sha256:${checksum}`
      }
    ]
  }
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8')

  const prepare = spawnSync('node', ['scripts/ai/prepare.mjs', '--config', configPath], {
    cwd: process.cwd(),
    encoding: 'utf8'
  })
  assert.equal(prepare.status, 0, prepare.stderr)
  const prepared = await fs.readFile(targetPath, 'utf8')
  assert.equal(prepared, 'sample-model')

  const smoke = spawnSync('node', ['scripts/ai/smoke.mjs', '--config', configPath], {
    cwd: process.cwd(),
    encoding: 'utf8'
  })
  assert.equal(smoke.status, 0, smoke.stderr)

  await fs.unlink(targetPath)
  const smokeFail = spawnSync('node', ['scripts/ai/smoke.mjs', '--config', configPath], {
    cwd: process.cwd(),
    encoding: 'utf8'
  })
  assert.notEqual(smokeFail.status, 0)
})
