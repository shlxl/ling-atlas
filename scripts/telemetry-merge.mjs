import { AI_TELEMETRY_SCHEMA_VERSION, mergeTelemetry } from '@ling-atlas/backend/telemetry/merge'

export { AI_TELEMETRY_SCHEMA_VERSION, mergeTelemetry } from '@ling-atlas/backend/telemetry/merge'

if (import.meta.main) {
  mergeTelemetry().catch(err => {
    console.error('[telemetry] merge failed:', err)
    process.exit(1)
  })
}
