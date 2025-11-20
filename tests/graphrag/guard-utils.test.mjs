import assert from 'node:assert/strict'
import { test } from 'node:test'

import { evaluateNormalizationGuards } from '../../scripts/graphrag/guard-utils.mjs'

test('evaluateNormalizationGuards respects thresholds and mode', () => {
  const summaries = [
    {
      domain: 'entities',
      summary: {
        totals: { total: 10, updated: 0 },
        sources: { fallback: 120 },
        llm: { failures: 60 }
      }
    },
    {
      domain: 'relationships',
      summary: {
        totals: { total: 5, updated: 5 },
        sources: { fallback: 2 },
        llm: { failures: 0 }
      }
    }
  ]

  const { alerts, shouldFail } = evaluateNormalizationGuards(summaries, {
    mode: 'fail',
    llmFailureThreshold: 50,
    fallbackThreshold: 100
  })

  assert.ok(alerts.some(a => a.scope === 'guard.entities' && a.severity === 'error'), 'LLM failure alert missing')
  assert.ok(alerts.some(a => a.scope === 'guard.entities' && a.severity === 'warning' && a.message.includes('fallback')), 'fallback alert missing')
  assert.ok(alerts.some(a => a.message.includes('updated 0 / 10')), 'updated=0 alert missing')
  assert.equal(shouldFail, true, 'should fail when error-level alerts present in fail mode')

  const warnOnly = evaluateNormalizationGuards(summaries, {
    mode: 'warn',
    llmFailureThreshold: 1000,
    fallbackThreshold: 200
  })
  assert.equal(warnOnly.shouldFail, false, 'warn mode should not fail')
})
