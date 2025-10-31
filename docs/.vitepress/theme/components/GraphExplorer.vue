<template>
  <div class="graph-explorer">
    <div v-if="error" class="graph-explorer__error">
      加载失败：{{ error }}
    </div>
    <div v-else-if="loading" class="graph-explorer__loading">
      正在载入 GraphRAG 探索数据…
    </div>
    <div v-else-if="!results.length" class="graph-explorer__empty">
      尚未生成 Graph Explorer 数据。请运行
      <code>npm run graphrag:explore</code>
      并写入 <code>docs/public/data/graphrag-explorer.json</code> 后刷新页面。
    </div>
    <div v-else class="graph-explorer__content">
      <header class="graph-explorer__header">
        <div class="graph-explorer__header-main">
          <h1>Graph Explorer</h1>
          <p v-if="generatedAt" class="graph-explorer__timestamp">
            数据生成时间：{{ formatDate(generatedAt) }}
          </p>
        </div>
        <label class="graph-explorer__selector">
          <span>选择结果：</span>
          <select v-model.number="selectedIndex">
            <option v-for="(item, index) in results" :key="index" :value="index">
              {{ formatQueryLabel(item.query, index) }}
            </option>
          </select>
        </label>
      </header>

      <section class="graph-explorer__section graph-explorer__section--summary">
        <h2>最新运行概览</h2>
        <div v-if="telemetryLoading" class="graph-explorer__muted">正在载入遥测…</div>
        <div v-else-if="telemetryError" class="graph-explorer__error">
          遥测加载失败：{{ telemetryError }}
        </div>
        <div
          v-else-if="!graphragTelemetry"
          class="graph-explorer__empty graph-explorer__empty--inline"
        >
          暂无 GraphRAG 遥测，请执行 <code>npm run telemetry-merge</code> 后刷新。
        </div>
        <div v-else class="graph-explorer__summary">
          <article v-if="ingestSummary" class="graph-explorer__summary-card">
            <h3>Ingest</h3>
            <p class="graph-explorer__summary-title">
              {{ ingestSummary.locale ?? 'all' }} · 写入 {{ formatNumber(ingestSummary.write?.written) }}/{{ formatNumber(ingestSummary.totals?.readyForWrite) }}
            </p>
            <p class="graph-explorer__muted">
              {{ formatDate(ingestSummary.timestamp) }} · 耗时 {{ formatDuration(ingestSummary.durationMs) }}
            </p>
          </article>

          <article v-if="retrieveSummary" class="graph-explorer__summary-card">
            <h3>Retrieve</h3>
            <p class="graph-explorer__summary-title">
              模式：{{ retrieveSummary.mode ?? '—' }} · 返回 {{ formatNumber(retrieveSummary.totals?.items) }}
            </p>
            <p class="graph-explorer__muted">
              来源：{{ formatSources(retrieveSummary.totals?.sources) }}
              · {{ formatDate(retrieveSummary.timestamp) }}
            </p>
          </article>

          <article v-if="exportSummary" class="graph-explorer__summary-card">
            <h3>Export</h3>
            <p class="graph-explorer__summary-title">
              {{ exportSummary.docTitle ?? exportSummary.docId ?? '—' }}
            </p>
            <p class="graph-explorer__muted">
              主题：{{ exportSummary.topic ?? '—' }} · {{ formatDate(exportSummary.timestamp) }}
            </p>
          </article>

          <article v-if="exploreSummary" class="graph-explorer__summary-card">
            <h3>Explorer</h3>
            <p class="graph-explorer__summary-title">
              节点 {{ formatNumber(exploreSummary.nodes) }} / 边 {{ formatNumber(exploreSummary.edges) }}
            </p>
            <p class="graph-explorer__muted">
              {{ exploreSummary.mode === 'question' ? '问答' : '文档' }} · {{ formatDuration(exploreSummary.durationMs) }}
            </p>
          </article>
        </div>
        <div v-if="telemetryWarnings.length" class="graph-explorer__warnings">
          <strong>提醒：</strong>
          <ul>
            <li
              v-for="warning in telemetryWarnings"
              :key="warning.message + warning.scope + warning.timestamp"
            >
              <span :class="['graph-explorer__severity', `graph-explorer__severity--${warning.severity ?? 'warning'}`]">
                {{ formatSeverity(warning.severity) }}
              </span>
              {{ warning.message }}
              <span class="graph-explorer__muted">
                （{{ formatScope(warning.scope) }} · {{ formatDate(warning.timestamp) }}）
              </span>
            </li>
          </ul>
        </div>
        <div v-if="warningHistory.length" class="graph-explorer__history">
          <details>
            <summary>查看历史 {{ warningHistory.length }} 条</summary>
            <ul>
              <li v-for="entry in warningHistory" :key="entry.timestamp">
                <strong>{{ formatDate(entry.timestamp) }}</strong>
                <template v-if="entry.warnings?.length">
                  <ul>
                    <li
                      v-for="item in entry.warnings"
                      :key="item.message + item.scope + item.timestamp"
                    >
                      <span
                        :class="['graph-explorer__severity', `graph-explorer__severity--${item.severity ?? 'warning'}`]"
                      >
                        {{ formatSeverity(item.severity) }}
                      </span>
                      {{ item.message }}
                      <span class="graph-explorer__muted">
                        （{{ formatScope(item.scope) }} · {{ formatDate(item.timestamp) }}）
                      </span>
                    </li>
                  </ul>
                </template>
                <template v-else>
                  <span class="graph-explorer__muted">无异常</span>
                </template>
              </li>
            </ul>
          </details>
        </div>
      </section>

      <section v-if="activeQuery" class="graph-explorer__section">
        <h2>查询</h2>
        <dl class="graph-explorer__meta">
          <div>
            <dt>类型</dt>
            <dd>{{ activeQuery.kind }}</dd>
          </div>
          <div>
            <dt>内容</dt>
            <dd>{{ activeQuery.value || '（空）' }}</dd>
          </div>
          <div v-if="activeQuery.docId">
            <dt>主文档</dt>
            <dd><code>{{ activeQuery.docId }}</code></dd>
          </div>
          <div>
            <dt>参数</dt>
            <dd>
              <code>{{ JSON.stringify(activeQuery.params ?? {}, null, 0) }}</code>
            </dd>
          </div>
          <div>
            <dt>时间</dt>
            <dd>{{ formatDate(activeQuery.timestamp) }}</dd>
          </div>
        </dl>
      </section>

      <section v-if="activeDocs.length" class="graph-explorer__section">
        <h2>推荐文档</h2>
        <table class="graph-explorer__table">
          <thead>
            <tr>
              <th>标题</th>
              <th>得分</th>
              <th>来源</th>
              <th>理由</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="doc in activeDocs" :key="doc.id">
              <td>
                <a v-if="doc.url" :href="withBase(doc.url)" target="_blank">{{ doc.title }}</a>
                <template v-else>{{ doc.title }}</template>
                <p class="graph-explorer__muted">
                  <code>{{ doc.id }}</code>
                  <span v-if="doc.updatedAt"> · 更新：{{ doc.updatedAt }}</span>
                </p>
              </td>
              <td>
                <div>
                  <span v-if="doc.score != null">综合：{{ doc.score }}</span>
                </div>
                <div v-if="doc.scoreComponents" class="graph-explorer__muted">
                  ⟨语义 {{ doc.scoreComponents.vector }} / 结构 {{ doc.scoreComponents.structure }}⟩
                </div>
              </td>
              <td>{{ doc.source || 'unknown' }}</td>
              <td>
                <ul class="graph-explorer__list">
                  <li v-for="(reason, index) in doc.reasons" :key="index">{{ reason }}</li>
                </ul>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section v-if="activeGraph" class="graph-explorer__section">
        <h2>图结构</h2>
        <div class="graph-explorer__grid">
          <div>
            <h3>统计</h3>
            <ul class="graph-explorer__list">
              <li>
                节点：{{ activeGraph.stats?.nodes?.returned ?? activeGraph.nodes.length }}
                <span v-if="activeGraph.stats?.nodes?.truncated" class="graph-explorer__badge">已截断</span>
              </li>
              <li>
                边：{{ activeGraph.stats?.edges?.returned ?? activeGraph.edges.length }}
                <span v-if="activeGraph.stats?.edges?.truncated" class="graph-explorer__badge">已截断</span>
              </li>
              <li v-if="activeGraph.stats?.nodes?.maxHop != null">
                最大跳数：{{ activeGraph.stats.nodes.maxHop }}
              </li>
            </ul>
          </div>
          <div v-if="hasHopBreakdown">
            <h3>跳数分布</h3>
            <ul class="graph-explorer__list">
              <li v-for="(count, hop) in activeGraph.stats.nodes.hops" :key="hop">
                Hop {{ hop }}：{{ count }}
              </li>
            </ul>
          </div>
          <div v-if="hasLabelBreakdown">
            <h3>节点标签</h3>
            <ul class="graph-explorer__list graph-explorer__list--columns">
              <li v-for="(count, label) in activeGraph.stats.nodes.byLabel" :key="label">
                {{ label }}：{{ count }}
              </li>
            </ul>
          </div>
          <div v-if="hasEdgeBreakdown">
            <h3>边类型</h3>
            <ul class="graph-explorer__list graph-explorer__list--columns">
              <li v-for="(count, type) in activeGraph.stats.edges.byType" :key="type">
                {{ type }}：{{ count }}
              </li>
            </ul>
          </div>
        </div>

        <details class="graph-explorer__details">
          <summary>查看节点列表</summary>
          <table class="graph-explorer__table">
            <thead>
              <tr>
                <th>ID</th>
                <th>标签</th>
                <th>名称</th>
                <th>Hop</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="node in limitedNodes" :key="node.id">
                <td><code>{{ node.id }}</code></td>
                <td>{{ node.labels?.join(', ') }}</td>
                <td>{{ node.title || node.name || node.properties?.name || node.properties?.title || '—' }}</td>
                <td>{{ node.hop }}</td>
              </tr>
            </tbody>
          </table>
        </details>

        <details class="graph-explorer__details">
          <summary>查看边列表</summary>
          <table class="graph-explorer__table">
            <thead>
              <tr>
                <th>ID</th>
                <th>类型</th>
                <th>源</th>
                <th>目标</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="edge in limitedEdges" :key="edge.id">
                <td><code>{{ edge.id }}</code></td>
                <td>{{ edge.type }}</td>
                <td><code>{{ edge.source }}</code></td>
                <td><code>{{ edge.target }}</code></td>
              </tr>
            </tbody>
          </table>
        </details>
      </section>

      <section v-if="activeEvidence.length" class="graph-explorer__section">
        <h2>证据</h2>
        <ul class="graph-explorer__list graph-explorer__list--bullet">
          <li v-for="item in activeEvidence" :key="item.docId + item.reason">
            <strong>{{ item.title }}</strong>
            <span v-if="item.reason">：{{ item.reason }}</span>
            <span class="graph-explorer__muted">（来源：{{ item.source ?? 'unknown' }}）</span>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { withBase } from 'vitepress'

const props = defineProps({
  src: {
    type: String,
    default: '/data/graphrag-explorer.json'
  },
  telemetrySrc: {
    type: String,
    default: '/telemetry.json'
  }
})

const loading = ref(true)
const error = ref(null)
const raw = ref(null)
const selectedIndex = ref(0)
const telemetryLoading = ref(true)
const telemetryError = ref(null)
const telemetryRaw = ref(null)

const results = computed(() => {
  const data = raw.value
  if (!data) return []
  if (Array.isArray(data)) return data
  if (Array.isArray(data.results)) return data.results
  if (typeof data === 'object' && data !== null && data.query) return [data]
  return []
})

const generatedAt = computed(() => raw.value?.generatedAt ?? null)
const active = computed(() => results.value[selectedIndex.value] ?? null)
const activeQuery = computed(() => active.value?.query ?? null)
const activeDocs = computed(() => active.value?.docs ?? [])
const activeGraph = computed(() => active.value?.graph ?? null)
const activeEvidence = computed(() => active.value?.evidence ?? [])
const graphragTelemetry = computed(() => telemetryRaw.value?.build?.graphrag ?? null)
const ingestSummary = computed(() => graphragTelemetry.value?.ingest ?? null)
const retrieveSummary = computed(() => graphragTelemetry.value?.retrieve ?? null)
const exportSummary = computed(() => graphragTelemetry.value?.export ?? null)
const exploreSummary = computed(() => graphragTelemetry.value?.explore ?? null)
const telemetryWarnings = computed(() => {
  const summary = graphragTelemetry.value
  if (!summary) return []

  const normalize = (item, fallbackScope) => {
    if (!item) return null
    if (typeof item === 'string') {
      return {
        message: item,
        severity: 'warning',
        scope: fallbackScope ?? 'general',
        timestamp: new Date().toISOString()
      }
    }
    return {
      message: item.message ?? '检测到异常',
      severity: item.severity ?? 'warning',
      scope: item.scope ?? fallbackScope ?? 'general',
      timestamp: item.timestamp ?? new Date().toISOString()
    }
  }

  if (Array.isArray(summary.warnings) && summary.warnings.length) {
    return summary.warnings
      .map((item) => normalize(item))
      .filter(Boolean)
  }

  const warnings = []

  if (summary.ingest && Number(summary.ingest.write?.written ?? 0) === 0) {
    warnings.push(
      normalize(
        {
          message: '最新 ingest 未写入任何文档，请检查质量守门与缓存设置。',
          severity: 'error',
          timestamp: summary.ingest.timestamp
        },
        'ingest'
      )
    )
  }

  if (
    summary.retrieve &&
    summary.retrieve.mode === 'hybrid' &&
    Array.isArray(summary.retrieve.totals?.sources) &&
    !summary.retrieve.totals.sources.includes('structure')
  ) {
    warnings.push(
      normalize(
        {
          message: 'Hybrid 检索未启用结构权重，请确认是否已运行 graphrag:gnn。',
          severity: 'warning',
          timestamp: summary.retrieve.timestamp
        },
        'retrieve'
      )
    )
  }

  if (summary.export && summary.export.files && summary.export.files.page === false) {
    warnings.push(
      normalize(
        {
          message: '最近一次导出未生成主题页，/graph 下可能缺少可视化入口。',
          severity: 'warning',
          timestamp: summary.export.timestamp
        },
        'export'
      )
    )
  }

  if (summary.explore && (summary.explore.truncatedNodes || summary.explore.truncatedEdges)) {
    warnings.push(
      normalize(
        {
          message: 'Graph Explorer 子图存在截断，请检查 --node-limit / --edge-limit 配置。',
          severity: 'info',
          timestamp: summary.explore.timestamp
        },
        'explore'
      )
    )
  }

  return warnings.filter(Boolean)
})

const warningHistory = computed(() => {
  const history = telemetryRaw.value?.build?.graphragHistory
  return Array.isArray(history) ? history : []
})

const hasHopBreakdown = computed(() => {
  const hops = activeGraph.value?.stats?.nodes?.hops
  return hops && Object.keys(hops).length > 0
})

const hasLabelBreakdown = computed(() => {
  const labels = activeGraph.value?.stats?.nodes?.byLabel
  return labels && Object.keys(labels).length > 0
})

const hasEdgeBreakdown = computed(() => {
  const types = activeGraph.value?.stats?.edges?.byType
  return types && Object.keys(types).length > 0
})

const limitedNodes = computed(() => {
  const list = activeGraph.value?.nodes ?? []
  return list.slice(0, 30)
})

const limitedEdges = computed(() => {
  const list = activeGraph.value?.edges ?? []
  return list.slice(0, 50)
})

async function loadData() {
  loading.value = true
  error.value = null
  raw.value = null
  selectedIndex.value = 0
  try {
    const response = await fetch(withBase(props.src), { cache: 'no-store' })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    const json = await response.json()
    raw.value = json
  } catch (err) {
    error.value = err?.message || String(err)
  } finally {
    loading.value = false
  }
}

async function loadTelemetry() {
  telemetryLoading.value = true
  telemetryError.value = null
  telemetryRaw.value = null
  try {
    const response = await fetch(withBase(props.telemetrySrc), { cache: 'no-store' })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    telemetryRaw.value = await response.json()
  } catch (err) {
    telemetryError.value = err?.message || String(err)
  } finally {
    telemetryLoading.value = false
  }
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function formatDuration(value) {
  if (!Number.isFinite(Number(value))) return '—'
  const ms = Number(value)
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

function formatNumber(value) {
  if (value == null) return '—'
  const num = Number(value)
  if (!Number.isFinite(num)) return value
  return num.toLocaleString()
}

function formatSources(sources) {
  if (!Array.isArray(sources) || sources.length === 0) return '—'
  return sources.join(' / ')
}

function formatSeverity(severity) {
  switch ((severity || '').toLowerCase()) {
    case 'error':
      return '严重'
    case 'warning':
      return '告警'
    case 'info':
    default:
      return '提示'
  }
}

function formatScope(scope) {
  switch (scope) {
    case 'ingest':
      return 'Ingest'
    case 'retrieve':
      return 'Retrieve'
    case 'export':
      return 'Export'
    case 'explore':
      return 'Explore'
    default:
      return scope ?? 'General'
  }
}

function formatQueryLabel(query, index) {
  if (!query) return `结果 ${index + 1}`
  if (query.kind === 'question' && query.value) {
    return `问答：${query.value}`
  }
  if (query.kind === 'doc' && query.docId) {
    return `文档：${query.docId}`
  }
  return `结果 ${index + 1}`
}

watch(
  () => props.src,
  () => {
    loadData()
  }
)

watch(
  () => props.telemetrySrc,
  () => {
    loadTelemetry()
  }
)

onMounted(() => {
  loadData()
  loadTelemetry()
})
</script>

<style scoped>
.graph-explorer {
  border: 1px solid rgba(60, 60, 67, 0.1);
  border-radius: 8px;
  padding: 1.5rem;
  background: rgba(60, 60, 67, 0.02);
}
.graph-explorer__error,
.graph-explorer__loading,
.graph-explorer__empty {
  padding: 1rem;
  border-radius: 6px;
  background: rgba(60, 60, 67, 0.06);
  color: rgba(60, 60, 67, 0.85);
}
.graph-explorer__content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}
.graph-explorer__header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
}
.graph-explorer__header-main h1 {
  margin: 0;
  font-size: 1.5rem;
}
.graph-explorer__timestamp {
  margin: 0.25rem 0 0;
  color: rgba(60, 60, 67, 0.7);
}
.graph-explorer__section--summary > *:first-child {
  margin-top: 0;
}
.graph-explorer__summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
}
.graph-explorer__summary-card {
  border: 1px solid rgba(60, 60, 67, 0.12);
  border-radius: 8px;
  padding: 1rem;
  background: rgba(60, 60, 67, 0.03);
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.graph-explorer__summary-card h3 {
  margin: 0;
  font-size: 1rem;
  color: rgba(60, 60, 67, 0.85);
}
.graph-explorer__summary-title {
  margin: 0;
  font-weight: 600;
}
.graph-explorer__warnings {
  margin-top: 1rem;
  padding: 0.75rem 1rem;
  border-left: 4px solid #d97706;
  background: rgba(217, 119, 6, 0.1);
  border-radius: 6px;
}
.graph-explorer__warnings ul {
  margin: 0.5rem 0 0;
  padding-left: 1.2rem;
}
.graph-explorer__severity {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 3.5rem;
  padding: 0.1rem 0.5rem;
  margin-right: 0.5rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: rgba(217, 119, 6, 0.16);
  color: #92400e;
}
.graph-explorer__severity--error {
  background: rgba(239, 68, 68, 0.18);
  color: #b91c1c;
}
.graph-explorer__severity--info {
  background: rgba(37, 99, 235, 0.16);
  color: #1d4ed8;
}
.graph-explorer__history {
  margin-top: 0.75rem;
}
.graph-explorer__history details {
  padding: 0.5rem 0.75rem;
  border: 1px solid rgba(60, 60, 67, 0.12);
  border-radius: 6px;
  background: rgba(60, 60, 67, 0.03);
}
.graph-explorer__history ul {
  margin: 0.5rem 0 0;
  padding-left: 1.2rem;
}
.graph-explorer__empty--inline {
  background: transparent;
  padding-left: 0;
}
.graph-explorer__selector {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.graph-explorer__section h2 {
  margin-bottom: 0.5rem;
}
.graph-explorer__meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.8rem;
}
.graph-explorer__meta dt {
  font-weight: 600;
  color: rgba(60, 60, 67, 0.8);
}
.graph-explorer__meta dd {
  margin: 0.25rem 0 0;
  word-break: break-word;
}
.graph-explorer__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.95rem;
}
.graph-explorer__table th,
.graph-explorer__table td {
  border: 1px solid rgba(60, 60, 67, 0.12);
  padding: 0.5rem 0.75rem;
  text-align: left;
  vertical-align: top;
}
.graph-explorer__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
}
.graph-explorer__list {
  margin: 0;
  padding-left: 1.2rem;
}
.graph-explorer__list--bullet {
  list-style: disc;
}
.graph-explorer__list--columns {
  column-count: 2;
  column-gap: 1.4rem;
}
.graph-explorer__muted {
  color: rgba(60, 60, 67, 0.65);
  font-size: 0.85rem;
}
.graph-explorer__badge {
  display: inline-block;
  margin-left: 0.4rem;
  padding: 0.1rem 0.5rem;
  border-radius: 999px;
  background: rgba(246, 173, 85, 0.25);
  color: #b65b00;
  font-size: 0.75rem;
}
.graph-explorer__details {
  margin-top: 1rem;
}
.graph-explorer__details summary {
  cursor: pointer;
  font-weight: 600;
  margin-bottom: 0.5rem;
}
@media (max-width: 768px) {
  .graph-explorer {
    padding: 1rem;
  }
  .graph-explorer__list--columns {
    column-count: 1;
  }
}
</style>
