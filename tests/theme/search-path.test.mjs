import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeSearchResultHref } from '../../docs/.vitepress/theme/search-path.mjs'
import { ACTIVE_BASE_GLOBAL } from '../../docs/.vitepress/theme/base.mjs'

const originalWindow = global.window

function setupWindow(base = '/ling-atlas/', origin = 'https://shlxl.github.io') {
  global.window = {
    location: {
      origin,
      pathname: base
    }
  }
  window[ACTIVE_BASE_GLOBAL] = base
}

beforeEach(() => {
  setupWindow()
})

afterEach(() => {
  if (originalWindow === undefined) {
    delete global.window
  } else {
    global.window = originalWindow
  }
})

test('normalizes relative paths with active base', () => {
  const href = normalizeSearchResultHref('en/content/automation/')
  assert.equal(href, '/ling-atlas/en/content/automation/')
})

test('avoids duplicating active base when path already includes it', () => {
  const href = normalizeSearchResultHref('/ling-atlas/en/content/automation/')
  assert.equal(href, '/ling-atlas/en/content/automation/')
})

test('preserves search and hash segments', () => {
  const href = normalizeSearchResultHref('/ling-atlas/en/content/automation/?q=1#demo')
  assert.equal(href, '/ling-atlas/en/content/automation/?q=1#demo')
})

test('returns external URLs unchanged', () => {
  const href = normalizeSearchResultHref('https://example.com/path?q=1#frag')
  assert.equal(href, 'https://example.com/path?q=1#frag')
})

test('falls back to root when active base is root', () => {
  setupWindow('/')
  const href = normalizeSearchResultHref('en/content/automation/')
  assert.equal(href, '/en/content/automation/')
})

