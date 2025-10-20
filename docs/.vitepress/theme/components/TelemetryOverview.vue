<template>
  <div v-if="error" class="telemetry-error">
    加载失败：{{ error }}
  </div>
  <div v-else-if="!telemetry" class="telemetry-loading">
    正在载入指标…
  </div>
  <div v-else class="telemetry-report">
    <p><strong>更新于：</strong> {{ formatDate(telemetry.updatedAt) }}</p>

    <section v-if="alerts.length" class="telemetry-alerts">
      <h2>告警</h2>
      <ul>
        <li v-for="(item, index) in alerts" :key="index" :class="['alert-item', `alert-${item.level}`]">
          <strong>{{ item.message }}</strong>
          <span v-if="item.detail"> — {{ item.detail }}</span>
        </li>
      </ul>
    </section>

    <section>
      <h2>页面访问</h2>
      <p><strong>累计 PV：</strong> {{ telemetry.pv.total }}</p>
      <table v-if="telemetry.pv.pathsTop.length">
        <thead>
          <tr><th>路径</th><th>次数</th></tr>
        </thead>
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
        <thead>
          <tr><th>Hash</th><th>次数</th><th>平均长度</th></tr>
        </thead>
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
        <thead>
          <tr><th>查询 Hash</th><th>链接</th><th>次数</th><th>平均 Rank</th></tr>
        </thead>
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
      <div v-else class="pagegen-details">
        <p><strong>最近运行：</strong> {{ formatDate(pagegen.timestamp) }}</p>
        <p>
          <strong>采集阶段：</strong>
          {{ pagegen.collect.locales ?? 0 }} 个语言，
          缓存命中率 {{
            pagegen.collect.cacheHitRate == null
              ? 'n/a'
              : formatPercent(pagegen.collect.cacheHitRate)
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
        <div v-if="scheduler" class="scheduler-summary">
          <h3>调度配置</h3>
          <p>
            并行：<span :class="statusClass(scheduler.parallelEnabled ? 'ok' : 'missing')">
              {{ scheduler.parallelEnabled ? '启用' : '禁用' }}
            </span>
            ，默认并发 {{ scheduler.effectiveParallelLimit }}（请求 {{ scheduler.requestedParallelLimit }}）
          </p>
          <table v-if="schedulerOverrides.length">
            <thead>
              <tr><th>阶段</th><th>启用</th><th>并发上限</th></tr>
            </thead>
            <tbody>
              <tr v-for="item in schedulerOverrides" :key="item.stage">
                <td><code>{{ item.stage }}</code></td>
                <td>{{ item.cfg.enabled ? '是' : '否' }}</td>
                <td>{{ item.cfg.limit == null ? '默认' : item.cfg.limit }}</td>
              </tr>
            </tbody>
          </table>
          <p v-else>未覆写阶段并发设置。</p>
        </div>
        <div v-if="plugins" class="plugin-summary">
          <h3>插件执行</h3>
          <p>
            请求插件：
            <span v-if="plugins.requested.length">{{ plugins.requested.join(', ') }}</span>
            <span v-else>无</span>
            ，忽略错误：{{ plugins.ignoreErrors ? '是' : '否' }}，已禁用：{{ plugins.disabled ? '是' : '否' }}
          </p>
          <table v-if="pluginResults.length">
            <thead>
              <tr><th>插件</th><th>状态</th><th>详情</th></tr>
            </thead>
            <tbody>
              <tr v-for="(result, index) in pluginResults" :key="result.specifier || index">
                <td><code>{{ result.specifier ?? 'unknown' }}</code></td>
                <td><span :class="pluginStatusClass(result.status)">{{ result.status ?? 'n/a' }}</span></td>
                <td>{{ result.error ?? result.reason ?? '-' }}</td>
              </tr>
            </tbody>
          </table>
          <p v-else>暂无插件运行记录。</p>
        </div>
      </div>
    </section>

    <section>
      <h2>AI 构建指标</h2>
      <p v-if="!ai">尚未采集 AI 构建遥测数据。</p>
      <div v-else class="ai-details">
        <p>
          <strong>整体状态：</strong>
          <span :class="statusClass(aiOverview?.status)">{{ formatStatus(aiOverview?.status) }}</span>
          <span v-if="aiOverview?.schemaVersion" class="schema-tag">schema {{ aiOverview.schemaVersion }}</span>
          <span v-if="aiOverview?.updatedAt">，最近更新 {{ formatDate(aiOverview.updatedAt) }}</span>
        </p>
        <p v-if="aiSmokeSummary">
          <strong>冒烟结果：</strong>
          <span :class="statusClass(aiSmokeSummary.status)">{{ formatStatus(aiSmokeSummary.status) }}</span>
          <span v-if="aiSmokeSummary.runtime">（运行时：{{ aiSmokeSummary.runtime }}）</span>
          ，执行 {{ aiSmokeSummary.executed ?? 0 }} · 跳过 {{ aiSmokeSummary.skipped ?? 0 }} · 失败 {{ aiSmokeSummary.failed ?? 0 }}
          <span v-if="aiSmokeSummary.verifiedAt">，记录时间 {{ formatDate(aiSmokeSummary.verifiedAt) }}</span>
          <span v-if="aiSmokeSummary.reason"> — {{ aiSmokeSummary.reason }}</span>
        </p>
        <table v-if="aiDomains.length">
          <thead>
            <tr><th>模块</th><th>状态</th><th>适配器</th><th>输出条目</th><th>成功率</th><th>最近运行</th><th>缓存复用</th></tr>
          </thead>
          <tbody>
            <tr v-for="domain in aiDomains" :key="domain.name">
              <td><code>{{ domain.name }}</code></td>
              <td><span :class="statusClass(domain.info.status)">{{ formatStatus(domain.info.status) }}</span></td>
              <td>
                <code v-if="domain.info.adapter?.name">
                  {{ domain.info.adapter.name }}<span v-if="domain.info.adapter?.model"> ({{ domain.info.adapter.model }})</span>
                </code>
                <span v-else>未知</span>
              </td>
              <td>{{ formatNumber(domain.info.outputCount) }}</td>
              <td>{{ formatPercent(domain.info.successRate ?? null) }}</td>
              <td>{{ formatDate(domain.info.lastRunAt) }}</td>
              <td>{{ boolLabel(domain.info.cacheReuse ?? null) }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else>未找到模块级遥测数据。</p>

        <details v-if="aiErrors.length">
          <summary>适配器错误明细</summary>
          <ul>
            <li v-for="(err, index) in aiErrors" :key="index">
              <code>{{ err.domain }}</code>：{{ err.message || 'unknown error' }}
            </li>
          </ul>
        </details>
        <div v-if="aiSmokeModels.length" class="smoke-summary">
          <h3>模型冒烟状态</h3>
          <table>
            <thead>
              <tr><th>模型</th><th>任务</th><th>状态</th><th>原因</th><th>验证时间</th></tr>
            </thead>
            <tbody>
              <tr v-for="(model, index) in aiSmokeModels" :key="model.id ?? model.name ?? index">
                <td><code>{{ model.id ?? model.name ?? 'unknown' }}</code></td>
                <td>{{ model.tasks && model.tasks.length ? model.tasks.join(', ') : '-' }}</td>
                <td>
                  <span :class="statusClass(model.smoke?.status)">{{ formatStatus(model.smoke?.status) }}</span>
                </td>
                <td>{{ model.smoke?.reason ?? '-' }}</td>
                <td>{{ formatDate(model.smoke?.verifiedAt) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { withBase } from 'vitepress'

interface TelemetryData {
  updatedAt: string
  pv: { total: number; pathsTop: Array<{ path: string; count: number }> }
  search: {
    queriesTop: Array<{ hash: string; count: number; avgLen?: number | null }>
    clicksTop: Array<{ hash: string; url: string; count: number; avgRank?: number | null }>
  }
  build?: {
    pagegen?: PagegenSummary | null
    ai?: AIBuildSummary | null
  }
}

interface PagegenSummary {
  timestamp: string
  totalMs?: number
  collect: {
    locales?: number
    cacheHitRate?: number | null
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
  scheduler?: SchedulerSummary | null
  plugins?: PluginSummary | null
}

interface SchedulerSummary {
  parallelEnabled: boolean
  requestedParallelLimit: number
  effectiveParallelLimit: number
  stageOverrides: Record<string, { enabled: boolean; limit: number | null }>
}

interface PluginSummary {
  requested: string[]
  disabled: boolean
  ignoreErrors: boolean
  results: Array<{ specifier?: string; status?: string; error?: string | null; reason?: string | null }>
}

interface AIDomainSummary {
  schemaVersion?: string
  timestamp?: string
  totalMs?: number | null
  adapter?: { name: string | null; model: string | null; fallback?: boolean | null }
  inference?: {
    batches?: number | null
    totalMs?: number | null
    avgMs?: number | null
    inputCount?: number | null
    outputCount?: number | null
    successRate?: number | null
    retries?: number | null
    errors?: Array<{ adapter?: string | null; model?: string | null; message?: string | null }>
  }
  write?: {
    target?: string | null
    bytes?: number | null
    durationMs?: number | null
    items?: number | null
    cacheReuse?: boolean | null
  }
  cache?: { reused?: boolean | null }
}

interface AISmokeFailure {
  id?: string | null
  reason?: string | null
}

interface AISmokeRunSummary {
  status?: string | null
  runtime?: string | null
  executed?: number | null
  skipped?: number | null
  failed?: number | null
  verifiedAt?: string | null
  reason?: string | null
  failures?: AISmokeFailure[]
}

interface AISmokeModel {
  id?: string | null
  name?: string | null
  tasks?: string[]
  smoke?: {
    status?: string | null
    reason?: string | null
    verifiedAt?: string | null
  }
  cache?: {
    status?: string | null
    scope?: string | null
  }
}

interface AISmokeInfo {
  summary?: AISmokeRunSummary | null
  models?: AISmokeModel[]
  runtime?: string | null
  fallback?: unknown
  generatedAt?: string | null
}

interface AIBuildSummary {
  schemaVersion?: string
  embed?: AIDomainSummary | null
  summary?: AIDomainSummary | null
  qa?: AIDomainSummary | null
  overview?: AIOverview | null
  smoke?: AISmokeInfo | null
}

interface AIOverviewDomain {
  status: string
  lastRunAt: string | null
  adapter?: { name: string | null; model: string | null; fallback?: boolean | null }
  outputCount?: number | null
  successRate?: number | null
  cacheReuse?: boolean | null
  totalMs?: number | null
  inputCount?: number | null
  retries?: number | null
  batches?: number | null
}

interface AIOverview {
  schemaVersion?: string
  updatedAt: string | null
  status: string
  summary: { ok: number; fallback: number; empty: number; missing: number; overall: string }
  domains: Record<string, AIOverviewDomain>
}

interface AlertItem {
  level: 'warning' | 'danger'
  message: string
  detail?: string
}

interface AIDomainError {
  domain: string
  message?: string | null
}

const telemetry = ref<TelemetryData | null>(null)
const error = ref<string | null>(null)
const alerts = ref<AlertItem[]>([])

const pagegen = computed<PagegenSummary | null>(() => telemetry.value?.build?.pagegen ?? null)
const scheduler = computed<SchedulerSummary | null>(() => pagegen.value?.scheduler ?? null)
const plugins = computed<PluginSummary | null>(() => pagegen.value?.plugins ?? null)
const ai = computed<AIBuildSummary | null>(() => telemetry.value?.build?.ai ?? null)
const aiOverview = computed<AIOverview | null>(() => ai.value?.overview ?? null)

const schedulerOverrides = computed(() => {
  const summary = scheduler.value
  if (!summary) return [] as Array<{ stage: string; cfg: { enabled: boolean; limit: number | null } }>
  return Object.entries(summary.stageOverrides || {}).map(([stage, cfg]) => ({ stage, cfg }))
})

const pluginResults = computed(() => plugins.value?.results ?? [])

const aiDomains = computed(() => {
  const overview = aiOverview.value
  if (!overview) return [] as Array<{ name: string; info: AIOverviewDomain }>
  return Object.entries(overview.domains || {}).map(([name, info]) => ({ name, info }))
})

const aiSmoke = computed(() => ai.value?.smoke ?? null)
const aiSmokeSummary = computed(() => aiSmoke.value?.summary ?? null)
const aiSmokeModels = computed(() => aiSmoke.value?.models ?? [])

const aiErrors = computed<AIDomainError[]>(() => {
  const entries: AIDomainError[] = []
  if (ai.value?.embed?.inference?.errors) {
    entries.push(...ai.value.embed.inference.errors.map(err => ({ domain: 'embed', message: err.message })))
  }
  if (ai.value?.summary?.inference?.errors) {
    entries.push(...ai.value.summary.inference.errors.map(err => ({ domain: 'summary', message: err.message })))
  }
  if (ai.value?.qa?.inference?.errors) {
    entries.push(...ai.value.qa.inference.errors.map(err => ({ domain: 'qa', message: err.message })))
  }
  if (aiSmokeSummary.value?.failures?.length) {
    entries.push(
      ...aiSmokeSummary.value.failures.map((failure, index) => ({
        domain: failure.id ? `smoke:${failure.id}` : `smoke-${index + 1}`,
        message: failure.reason || '冒烟失败'
      }))
    )
  }
  return entries
})

onMounted(async () => {
  try {
    const requestUrl = withBase('/telemetry.json')
    const res = await fetch(requestUrl, { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    telemetry.value = (await res.json()) as TelemetryData
  } catch (err: any) {
    error.value = err?.message || String(err)
  }
})

watch(telemetry, snapshot => {
  if (!snapshot) {
    alerts.value = []
    return
  }
  alerts.value = evaluateAlerts(snapshot)
  for (const alert of alerts.value) {
    const detail = alert.detail ? ` - ${alert.detail}` : ''
    if (alert.level === 'danger') {
      console.error(`[telemetry alert] ${alert.message}${detail}`)
    } else {
      console.warn(`[telemetry warning] ${alert.message}${detail}`)
    }
  }
}, { immediate: true })

function evaluateAlerts(snapshot: TelemetryData): AlertItem[] {
  const list: AlertItem[] = []
  const pg = snapshot.build?.pagegen
  if (pg?.collect?.cacheHitRate != null && pg.collect.cacheHitRate < 0.6) {
    list.push({
      level: 'warning',
      message: 'Pagegen 缓存命中率偏低',
      detail: `缓存命中率 ${formatPercent(pg.collect.cacheHitRate)}`
    })
  }
  if ((pg?.collect?.parseErrors ?? 0) > 0 || (pg?.collect?.errorEntries ?? 0) > 0) {
    list.push({
      level: 'danger',
      message: 'Pagegen 解析出现错误',
      detail: `parseErrors=${pg?.collect?.parseErrors ?? 0}, errorEntries=${pg?.collect?.errorEntries ?? 0}`
    })
  }
  if ((pg?.write?.failed ?? 0) > 0) {
    list.push({
      level: 'danger',
      message: 'Pagegen 写入失败',
      detail: `失败条目：${pg?.write?.failed ?? 0}`
    })
  }

  const overview = snapshot.build?.ai?.overview
  if (overview) {
    if (overview.status !== 'ok') {
      list.push({
        level: overview.status === 'degraded' ? 'warning' : 'danger',
        message: 'AI 构建状态异常',
        detail: `整体状态：${formatStatus(overview.status)}`
      })
    }
    for (const [domain, info] of Object.entries(overview.domains || {})) {
      if (['fallback', 'empty', 'missing'].includes(info.status)) {
        list.push({
          level: info.status === 'fallback' ? 'warning' : 'danger',
          message: `AI 模块 ${domain} 状态 ${formatStatus(info.status)}`,
          detail: info.adapter?.name ? `adapter=${info.adapter.name}` : undefined
        })
      }
    }
  }

  const smokeSummary = snapshot.build?.ai?.smoke?.summary
  if (smokeSummary) {
    const status = (smokeSummary.status || '').toLowerCase()
    if (status === 'failed') {
      list.push({
        level: 'danger',
        message: 'AI 冒烟测试失败',
        detail: `失败模型 ${smokeSummary.failures?.length ?? 0} 个`
      })
    } else if (status === 'skipped') {
      list.push({
        level: 'warning',
        message: 'AI 冒烟测试被跳过',
        detail: smokeSummary.reason ?? '请检查运行配置'
      })
    }
    for (const failure of smokeSummary.failures || []) {
      list.push({
        level: 'danger',
        message: `模型 ${failure.id ?? 'unknown'} 冒烟失败`,
        detail: failure.reason ?? 'unknown reason'
      })
    }
  }

  const pluginSummary = snapshot.build?.pagegen?.plugins
  if (pluginSummary) {
    for (const result of pluginSummary.results || []) {
      if (result.status === 'failed') {
        list.push({
          level: 'danger',
          message: `插件 ${result.specifier ?? 'unknown'} 加载失败`,
          detail: result.error ?? 'unknown error'
        })
      } else if (result.status === 'ignored') {
        list.push({
          level: 'warning',
          message: `插件 ${result.specifier ?? 'unknown'} 被忽略`,
          detail: result.reason ?? '未提供原因'
        })
      }
    }
  }

  return list
}

function formatPercent(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return 'n/a'
  return `${(value * 100).toFixed(digits)}%`
}

function formatStatus(status?: string | null) {
  if (!status) return '未知'
  switch (status) {
    case 'ok':
      return '正常'
    case 'degraded':
      return '降级'
    case 'fallback':
      return '回退'
    case 'empty':
      return '为空'
    case 'missing':
      return '缺失'
    case 'passed':
      return '通过'
    case 'failed':
      return '失败'
    case 'skipped':
      return '跳过'
    default:
      return status
  }
}

function statusClass(status?: string | null) {
  if (!status) return 'status-chip'
  const normalized = status.toLowerCase()
  if (['ok', 'passed'].includes(normalized)) return 'status-chip status-ok'
  if (['degraded', 'fallback', 'skipped'].includes(normalized)) return 'status-chip status-warn'
  return 'status-chip status-danger'
}

function boolLabel(value?: boolean | null) {
  if (value == null) return '未知'
  return value ? '是' : '否'
}

function formatDate(value?: string | null) {
  if (!value) return '未知'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

function formatNumber(value?: number | null) {
  if (value == null) return 'n/a'
  if (!Number.isFinite(value)) return String(value)
  return value.toLocaleString()
}
</script>

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
.telemetry-alerts {
  background: rgba(255, 193, 7, 0.12);
  border: 1px solid rgba(255, 193, 7, 0.4);
  padding: 1rem;
  border-radius: 6px;
  margin: 1rem 0 1.5rem;
}
.telemetry-alerts ul {
  margin: 0;
  padding-left: 1.2rem;
}
.alert-item {
  margin: 0.4rem 0;
}
.alert-warning {
  color: #ad5f00;
}
.alert-danger {
  color: #c1121f;
  font-weight: 600;
}
.status-chip {
  display: inline-block;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  background: rgba(60, 60, 67, 0.08);
  font-size: 0.85rem;
}
.status-ok {
  background: rgba(10, 207, 151, 0.18);
  color: #0a9471;
}
.status-warn {
  background: rgba(255, 193, 7, 0.24);
  color: #ad5f00;
}
.status-danger {
  background: rgba(220, 53, 69, 0.2);
  color: #b02a37;
}
.schema-tag {
  display: inline-block;
  margin-left: 0.5rem;
  color: rgba(60, 60, 67, 0.65);
  font-size: 0.85rem;
}
.scheduler-summary,
.plugin-summary {
  margin-top: 1rem;
}
.plugin-summary table,
.scheduler-summary table {
  margin-top: 0.5rem;
}
.smoke-summary {
  margin-top: 1rem;
}
.smoke-summary table {
  margin-top: 0.5rem;
}
</style>
