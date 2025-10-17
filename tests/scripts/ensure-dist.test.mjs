import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { hasHtmlFiles } from '../../scripts/ensure-dist.mjs'

test('returns false when directory is missing', () => {
  const temp = path.join(os.tmpdir(), `ensure-dist-missing-${process.pid}-${Date.now()}`)
  if (fs.existsSync(temp)) {
    fs.rmSync(temp, { recursive: true, force: true })
  }
  assert.equal(hasHtmlFiles(temp), false)
})

test('returns false when directory has no html files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ensure-dist-no-html-'))
  try {
    fs.writeFileSync(path.join(dir, 'readme.txt'), 'hello world')
    assert.equal(hasHtmlFiles(dir), false)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('returns true when html file exists at root', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ensure-dist-root-'))
  try {
    fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html>')
    assert.equal(hasHtmlFiles(dir), true)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('returns true when html file exists in nested directory', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ensure-dist-nested-'))
  try {
    const nested = path.join(dir, 'en')
    fs.mkdirSync(nested)
    fs.writeFileSync(path.join(nested, 'index.html'), '<!doctype html>')
    assert.equal(hasHtmlFiles(dir), true)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
