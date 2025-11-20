// Telemetry / build contracts shared across frontend & backend.
// Current code still imports from legacy paths; this module is a staging point for the split.

export const AI_TELEMETRY_SCHEMA_VERSION = '2024-11-01'

// Graphrag warning thresholds (telemetry aggregation)
export const DEFAULT_GRAPHRAG_WARN_LLM_FAILURE_ERROR = 3
export const DEFAULT_GRAPHRAG_WARN_FALLBACK_WARNING = 10

// Graphrag guard thresholds (ingest pipeline fail/warn)
export const DEFAULT_GRAPHRAG_GUARD_LLM_FAILURES = 50
export const DEFAULT_GRAPHRAG_GUARD_FALLBACKS = 100

export const DEFAULT_GRAPHRAG_GUARD_MODE = 'warn' // warn | fail | off

export function resolveNumberEnv(key, fallback) {
  const raw = process.env[key]
  const num = Number(raw)
  return Number.isFinite(num) ? num : fallback
}

export function resolveStringEnv(key, fallback) {
  const raw = process.env[key]
  return typeof raw === 'string' && raw.trim() ? raw.trim() : fallback
}
