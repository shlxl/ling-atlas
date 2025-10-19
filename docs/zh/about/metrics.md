---
title: 观测指标
layout: doc
---

> 📚 想了解文章要点？请访问 [常见问答索引](/zh/about/qa.html)。

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
  加载失败：{{ error }}
</div>

<div v-else-if="!telemetry" class="telemetry-loading">
  正在载入指标…
</div>

<div v-else class="telemetry-report">
  <p><strong>更新于：</strong> {{ new Date(telemetry.updatedAt).toLocaleString() }}</p>
  <section>
    <h2>页面访问</h2>
    <p><strong>累计 PV：</strong> {{ telemetry.pv.total }}</p>
    <table v-if="telemetry.pv.pathsTop.length">
      <thead><tr><th>路径</th><th>次数</th></tr></thead>
      <tbody>
        <tr v-for="item in telemetry.pv.pathsTop" :key="item.path">
          <td><code>{{ item.path }}</code></td>
          <td>{{ item.count }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else>暂无数据。</p>
  </section>

  <section>
    <h2>搜索查询 Top</h2>
    <table v-if="telemetry.search.queriesTop.length">
      <thead><tr><th>Hash</th><th>次数</th><th>平均长度</th></tr></thead>
      <tbody>
        <tr v-for="item in telemetry.search.queriesTop" :key="item.hash">
          <td><code>{{ item.hash }}</code></td>
          <td>{{ item.count }}</td>
          <td>{{ item.avgLen ?? '-' }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else>暂无数据。</p>
  </section>

  <section>
    <h2>搜索点击 Top</h2>
    <table v-if="telemetry.search.clicksTop.length">
      <thead><tr><th>查询 Hash</th><th>链接</th><th>次数</th><th>平均 Rank</th></tr></thead>
      <tbody>
        <tr v-for="item in telemetry.search.clicksTop" :key="item.hash + item.url">
          <td><code>{{ item.hash }}</code></td>
          <td><code>{{ item.url }}</code></td>
          <td>{{ item.count }}</td>
          <td>{{ item.avgRank ?? '-' }}</td>
        </tr>
      </tbody>
    </table>
    <p v-else>暂无数据。</p>
  </section>

  <section>
    <h2>Pagegen 构建指标</h2>
    <p v-if="!pagegen">暂无构建遥测。</p>
    <template v-else>
      <p><strong>最近运行：</strong> {{ new Date(pagegen.timestamp).toLocaleString() }}</p>
      <p>
        <strong>采集阶段：</strong>
        {{ pagegen.collect.locales ?? 0 }} 个语言，
        缓存命中率 {{
          pagegen.collect.cacheHitRate == null
            ? 'n/a'
            : (pagegen.collect.cacheHitRate * 100).toFixed(1) + '%'
        }}，
        已解析 {{ pagegen.collect.parsedFiles ?? 0 }}/{{ pagegen.collect.totalFiles ?? 0 }} 篇，
        禁用缓存 {{ pagegen.collect.cacheDisabledLocales ?? 0 }} 个语言
      </p>
      <p>
        <strong>写入阶段：</strong>
        实际写入 {{ pagegen.write.written ?? 0 }} / {{ pagegen.write.total ?? 0 }}，
        跳过 {{ pagegen.write.skipped ?? 0 }}（内容哈希命中 {{ pagegen.write.hashMatches ?? 0 }}），
        失败 {{ pagegen.write.failed ?? 0 }}
        <span v-if="pagegen.write.disabled">— 批量写入未启用</span>
      </p>
      <div v-if="Object.keys(pagegen.write.skippedByReason || {}).length">
        <details>
          <summary>跳过原因明细</summary>
          <ul>
            <li v-for="(count, reason) in pagegen.write.skippedByReason" :key="reason">
              <code>{{ reason }}</code>：{{ count }}
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
