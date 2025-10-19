---
title: Observability Metrics
titleTemplate: :title
layout: doc
---

> 📚 Want the distilled highlights? See the [FAQ index](/en/about/qa.html).

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { withBase } from 'vitepress'

interface TelemetryData {
  updatedAt: string
  pv: { total: number; pathsTop: Array<{ path: string; count: number }> }
  search: {
    queriesTop: Array<{ hash: string; count: number; avgLen?: number }>
    clicksTop: Array<{ hash: string; url: string; count: number; avgRank?: number }>
  }
  build?: {
    pagegen?: PagegenSummary | null
  }
}

interface PagegenSummary {
  timestamp: string
  totalMs: number
  collect: {
    locales?: number
    cacheHitRate?: number
    cacheHits?: number
    cacheMisses?: number
    cacheDisabledLocales?: number
    parsedFiles?: number
    totalFiles?: number
    parseErrors?: number
    errorEntries?: number
  }
  write: {
    total?: number
    written?: number
    skipped?: number
    failed?: number
    hashMatches?: number
    disabled?: boolean
    skippedByReason: Record<string, number>
  }
}

const telemetry = ref<TelemetryData | null>(null)
const error = ref<string | null>(null)
const pagegen = computed<PagegenSummary | null>(() => telemetry.value?.build?.pagegen ?? null)

onMounted(async () => {
  try {
    const requestUrl = withBase('/telemetry.json')
    const res = await fetch(requestUrl, { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    telemetry.value = await res.json()
  } catch (err: any) {
    error.value = err?.message || String(err)
  }
})
</script>

<div v-if="error" class="telemetry-error">
  Failed to load telemetry: {{ error }}
</div>

<div v-else-if="!telemetry" class="telemetry-loading">
  Loading metrics…
</div>

<div v-else class="telemetry-report">
  <p><strong>Updated:</strong> {{ new Date(telemetry.updatedAt).toLocaleString() }}</p>
  <section>
    <h2>Page Views</h2>
    <p><strong>Total PV:</strong> {{ telemetry.pv.total }}</p>
    <table v-if="telemetry.pv.pathsTop.length">
      <thead><tr><th>Path</th><th>Hits</th></tr></thead>
      <tbody>
        <tr v-for="item in telemetry.pv.pathsTop" :key="item.path">
          <td><code>{{ item.path }}</code></td>
          <td>{{ item.count }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else>No data yet.</p>
  </section>

  <section>
    <h2>Search Queries</h2>
    <table v-if="telemetry.search.queriesTop.length">
      <thead><tr><th>Hash</th><th>Count</th><th>Avg Length</th></tr></thead>
      <tbody>
        <tr v-for="item in telemetry.search.queriesTop" :key="item.hash">
          <td><code>{{ item.hash }}</code></td>
          <td>{{ item.count }}</td>
          <td>{{ item.avgLen ?? '-' }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else>No data yet.</p>
  </section>

  <section>
    <h2>Search Clicks</h2>
    <table v-if="telemetry.search.clicksTop.length">
      <thead><tr><th>Query Hash</th><th>URL</th><th>Count</th><th>Avg Rank</th></tr></thead>
      <tbody>
        <tr v-for="item in telemetry.search.clicksTop" :key="item.hash + item.url">
          <td><code>{{ item.hash }}</code></td>
          <td><code>{{ item.url }}</code></td>
          <td>{{ item.count }}</td>
          <td>{{ item.avgRank ?? '-' }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else>No data yet.</p>
  </section>

  <section>
    <h2>Pagegen Build</h2>
    <p v-if="!pagegen">No build telemetry yet.</p>
    <template v-else>
      <p><strong>Last Run:</strong> {{ new Date(pagegen.timestamp).toLocaleString() }}</p>
      <p>
        <strong>Collect:</strong>
        {{ pagegen.collect.locales ?? 0 }} locales,
        cache hit rate {{
          pagegen.collect.cacheHitRate == null
            ? 'n/a'
            : (pagegen.collect.cacheHitRate * 100).toFixed(1) + '%'
        }},
        parsed {{ pagegen.collect.parsedFiles ?? 0 }}/{{ pagegen.collect.totalFiles ?? 0 }} files,
        disabled caches {{ pagegen.collect.cacheDisabledLocales ?? 0 }}
      </p>
      <p>
        <strong>Write:</strong>
        written {{ pagegen.write.written ?? 0 }} / {{ pagegen.write.total ?? 0 }},
        skipped {{ pagegen.write.skipped ?? 0 }} (hash matches {{ pagegen.write.hashMatches ?? 0 }}),
        failed {{ pagegen.write.failed ?? 0 }}
        <span v-if="pagegen.write.disabled">— batching disabled</span>
      </p>
      <div v-if="Object.keys(pagegen.write.skippedByReason || {}).length">
        <details>
          <summary>Skip reasons</summary>
          <ul>
            <li v-for="(count, reason) in pagegen.write.skippedByReason" :key="reason">
              <code>{{ reason }}</code>: {{ count }}
            </li>
          </ul>
        </details>
      </div>
    </template>
  </section>
</div>

<style scoped>
.telemetry-report table {
  width: 100%;
  border-collapse: collapse;
  margin: 1rem 0;
  font-size: 0.95rem;
}
.telemetry-report th,
.telemetry-report td {
  border: 1px solid rgba(60, 60, 67, 0.12);
  padding: 0.6rem 0.8rem;
  text-align: left;
}
.telemetry-loading,
.telemetry-error {
  padding: 1rem;
}
</style>
