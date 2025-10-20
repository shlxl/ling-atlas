import { test } from 'node:test'
import assert from 'node:assert/strict'

import { createCheckLinksFixture, runCheckLinksCLI } from './fixtures/site-fixture.mjs'

test(
  'check-links passes on healthy fixture',
  { concurrency: false },
  async t => {
    const fixture = await createCheckLinksFixture()
    t.after(fixture.cleanup)

    const result = await runCheckLinksCLI(fixture.root)
    assert.equal(result.code, 0, `expected exit code 0, got ${result.code}`)
    assert.match(result.stdout, /Link check passed/)
    assert.equal(result.stderr.trim(), '')
  }
)

test(
  'check-links fails when markdown link target is missing',
  { concurrency: false },
  async t => {
    const fixture = await createCheckLinksFixture({ includeMissingMarkdownLink: true })
    t.after(fixture.cleanup)

    const result = await runCheckLinksCLI(fixture.root)
    assert.notEqual(result.code, 0, 'expected non-zero exit code for missing link')
    assert.match(result.stderr, /Link check failed:/)
    assert.match(result.stderr, /\/zh\/content\/missing-post\//)
  }
)

test(
  'check-links fails when nav manifest points to missing generated file',
  { concurrency: false },
  async t => {
    const fixture = await createCheckLinksFixture({
      navManifestCategories: { 缺失: '/zh/_generated/categories/缺失/' }
    })
    t.after(fixture.cleanup)

    const result = await runCheckLinksCLI(fixture.root)
    assert.notEqual(result.code, 0, 'expected non-zero exit code for missing generated file')
    assert.match(result.stderr, /Link check failed:/)
    assert.match(result.stderr, /nav\.manifest\.zh\.json \[categories:缺失\]/)
  }
)
