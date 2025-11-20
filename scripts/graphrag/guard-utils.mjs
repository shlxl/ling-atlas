const DEFAULT_LLM_FAILURE_THRESHOLD = 50
const DEFAULT_FALLBACK_THRESHOLD = 100

function toNumber(value, fallback) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function normalizeSummaries(summaries = []) {
  return (Array.isArray(summaries) ? summaries : [])
    .map(entry => {
      if (!entry?.summary) return null
      return {
        domain: entry.domain || 'entities',
        totals: entry.summary.totals || entry.summary.records || {},
        sources: entry.summary.sources || {},
        llm: entry.summary.llm || {},
        timestamp: entry.summary.timestamp
      }
    })
    .filter(Boolean)
}

export function evaluateNormalizationGuards(
  summaries,
  {
    mode = process.env.GRAPHRAG_GUARD_MODE || 'warn',
    llmFailureThreshold = toNumber(process.env.GRAPHRAG_GUARD_LLM_FAILURES, DEFAULT_LLM_FAILURE_THRESHOLD),
    fallbackThreshold = toNumber(process.env.GRAPHRAG_GUARD_FALLBACKS, DEFAULT_FALLBACK_THRESHOLD)
  } = {}
) {
  const normalized = normalizeSummaries(summaries)
  if (mode === 'off') {
    return { alerts: [], shouldFail: false }
  }

  const alerts = []

  for (const entry of normalized) {
    const domain = entry.domain
    const failures = Number(entry.llm?.failures ?? 0)
    if (failures >= llmFailureThreshold && llmFailureThreshold > 0) {
      alerts.push({
        scope: `guard.${domain}`,
        message: `${domain} LLM failures ${failures} exceed threshold ${llmFailureThreshold}`,
        severity: 'error'
      })
    }

    const fallbackCount = Number(entry.sources?.fallback ?? 0)
    if (fallbackCount >= fallbackThreshold && fallbackThreshold > 0) {
      alerts.push({
        scope: `guard.${domain}`,
        message: `${domain} fallback count ${fallbackCount} exceeds threshold ${fallbackThreshold}`,
        severity: 'warning'
      })
    }

    const total = Number(entry.totals?.total ?? 0)
    const updated = Number(entry.totals?.updated ?? 0)
    if (total > 0 && updated === 0) {
      alerts.push({
        scope: `guard.${domain}`,
        message: `${domain} normalization updated 0 / ${total}, please inspect logs.`,
        severity: 'warning'
      })
    }
  }

  const shouldFail = mode === 'fail' && alerts.some(alert => alert.severity === 'error')
  return { alerts, shouldFail }
}
