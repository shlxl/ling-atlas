<template>
  <div v-if="error" class="telemetry-error">
    {{ copy.loadFailed }}{{ error }}
  </div>
  <div v-else-if="!telemetry" class="telemetry-loading">
    {{ copy.loading }}
  </div>
  <div v-else class="telemetry-report">
    <p><strong>{{ copy.updatedLabel }}</strong> {{ formatDate(telemetry.updatedAt) }}</p>

    <section v-if="alerts.length" class="telemetry-alerts">
      <h2>{{ copy.sections.alerts }}</h2>
      <ul>
        <li v-for="(item, index) in alerts" :key="index" :class="['alert-item', `alert-${item.level}`]">
          <strong>{{ item.message }}</strong>
          <span v-if="item.detail">{{ copy.common.reasonSeparator }}{{ item.detail }}</span>
        </li>
      </ul>
    </section>

    <section>
      <h2>{{ copy.sections.pageViews }}</h2>
      <p><strong>{{ copy.pageViews.totalLabel }}</strong> {{ formatNumber(telemetry.pv.total) }}</p>
      <table v-if="telemetry.pv.pathsTop.length">
        <thead>
          <tr>
            <th>{{ copy.pageViews.tableHeaders.path }}</th>
            <th>{{ copy.pageViews.tableHeaders.count }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in telemetry.pv.pathsTop" :key="item.path">
            <td><code>{{ item.path }}</code></td>
            <td>{{ formatNumber(item.count) }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else>{{ copy.common.noData }}</p>
    </section>

    <section>
      <h2>{{ copy.sections.searchQueries }}</h2>
      <table v-if="telemetry.search.queriesTop.length">
        <thead>
          <tr>
            <th>{{ copy.search.queriesHeaders.hash }}</th>
            <th>{{ copy.search.queriesHeaders.count }}</th>
            <th>{{ copy.search.queriesHeaders.avgLen }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in telemetry.search.queriesTop" :key="item.hash">
            <td><code>{{ item.hash }}</code></td>
            <td>{{ formatNumber(item.count) }}</td>
            <td>{{ item.avgLen == null ? copy.common.notAvailable : formatNumber(item.avgLen) }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else>{{ copy.common.noData }}</p>
    </section>

    <section>
      <h2>{{ copy.sections.searchClicks }}</h2>
      <table v-if="telemetry.search.clicksTop.length">
        <thead>
          <tr>
            <th>{{ copy.search.clicksHeaders.hash }}</th>
            <th>{{ copy.search.clicksHeaders.url }}</th>
            <th>{{ copy.search.clicksHeaders.count }}</th>
            <th>{{ copy.search.clicksHeaders.avgRank }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in telemetry.search.clicksTop" :key="item.hash + item.url">
            <td><code>{{ item.hash }}</code></td>
            <td><code>{{ item.url }}</code></td>
            <td>{{ formatNumber(item.count) }}</td>
            <td>{{ item.avgRank == null ? copy.common.notAvailable : formatNumber(item.avgRank) }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else>{{ copy.common.noData }}</p>
    </section>

    <section>
      <h2>{{ copy.sections.pagegen }}</h2>
      <p v-if="!pagegen">{{ copy.pagegen.noTelemetry }}</p>
      <div v-else class="pagegen-details">
        <p><strong>{{ copy.pagegen.lastRun }}</strong> {{ formatDate(pagegen.timestamp) }}</p>
        <p>
          <strong>{{ copy.pagegen.collectTitle }}</strong>
          {{ pagegenCollectSummary }}
        </p>
        <p>
          <strong>{{ copy.pagegen.writeTitle }}</strong>
          {{ pagegenWriteSummary }}
          <span v-if="pagegen.write.disabled">{{ copy.pagegen.batchDisabledNote }}</span>
        </p>
        <div v-if="Object.keys(pagegen.write.skippedByReason || {}).length">
          <details>
            <summary>{{ copy.pagegen.skipReasonsTitle }}</summary>
            <ul>
              <li v-for="(count, reason) in pagegen.write.skippedByReason" :key="reason">
                <code>{{ reason }}</code>{{ copy.common.reasonSeparator }}{{ formatNumber(count) }}
              </li>
            </ul>
          </details>
        </div>
        <div v-if="scheduler" class="scheduler-summary">
          <h3>{{ copy.pagegen.schedulerTitle }}</h3>
          <p>{{ schedulerSummaryText }}</p>
          <table v-if="schedulerOverrides.length">
            <thead>
              <tr>
                <th>{{ copy.pagegen.schedulerHeaders.stage }}</th>
                <th>{{ copy.pagegen.schedulerHeaders.enabled }}</th>
                <th>{{ copy.pagegen.schedulerHeaders.limit }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in schedulerOverrides" :key="item.stage">
                <td><code>{{ item.stage }}</code></td>
                <td>{{ boolLabel(item.cfg.enabled) }}</td>
                <td>{{ item.cfg.limit == null ? copy.pagegen.defaultLabel : formatNumber(item.cfg.limit) }}</td>
              </tr>
            </tbody>
          </table>
          <p v-else>{{ copy.pagegen.schedulerNoOverrides }}</p>
        </div>
        <div v-if="plugins" class="plugin-summary">
          <h3>{{ copy.pagegen.pluginTitle }}</h3>
          <p>
            {{ pluginSummary.requested }}{{ copy.common.segmentSeparator }}{{ pluginSummary.ignoreErrors }}{{ copy.common.segmentSeparator }}{{ pluginSummary.disabled }}
          </p>
          <table v-if="pluginResults.length">
            <thead>
              <tr>
                <th>{{ copy.pagegen.pluginHeaders.plugin }}</th>
                <th>{{ copy.pagegen.pluginHeaders.status }}</th>
                <th>{{ copy.pagegen.pluginHeaders.detail }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(result, index) in pluginResults" :key="result.specifier || index">
                <td><code>{{ result.specifier ?? copy.common.unknownModel }}</code></td>
                <td><span :class="pluginStatusClass(result.status)">{{ result.status ?? copy.common.notAvailable }}</span></td>
                <td>{{ result.error ?? result.reason ?? copy.common.notAvailable }}</td>
              </tr>
            </tbody>
          </table>
          <p v-else>{{ copy.pagegen.pluginNoRuns }}</p>
        </div>
      </div>
    </section>

    <section>
      <h2>{{ copy.sections.graphrag }}</h2>
      <p class="graphrag-index-link">
        <a :href="graphIndexLink" target="_blank" rel="noreferrer">{{ copy.graphrag.viewIndex }}</a>
      </p>
      <p v-if="!graphragIngest && !graphragExport && !graphragRetrieve && !graphragExplore">{{ copy.graphrag.noTelemetry }}</p>
      <div v-else class="graphrag-cards">
        <div v-if="graphragIngest" class="graphrag-card">
          <h3>{{ copy.graphrag.ingestTitle }}</h3>
          <p>
            <strong>{{ copy.graphrag.lastRun }}</strong>
            {{ formatDate(graphragIngest.timestamp) }}
            — {{ copy.graphrag.localeLabel }} <code>{{ graphragIngest.locale ?? 'all' }}</code>
            <span v-if="graphragIngest.adapter">
              {{ copy.graphrag.adapterLabel }} <code>{{ graphragIngest.adapter }}</code>
              <span v-if="graphragIngest.adapterModel"> ({{ graphragIngest.adapterModel }})</span>
            </span>
          </p>
          <p>
            <strong>{{ copy.graphrag.durationLabel }}</strong>
            {{ graphragIngest.durationMs == null ? copy.common.notAvailable : formatNumber(graphragIngest.durationMs) + ' ms' }}
          </p>
          <table>
            <thead>
              <tr>
                <th>{{ copy.graphrag.summaryHeaders.metric }}</th>
                <th>{{ copy.graphrag.summaryHeaders.value }}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{{ copy.graphrag.summaryMetrics.collected }}</td>
                <td>{{ formatNumber(graphragIngest.totals?.collected) }}</td>
              </tr>
              <tr>
                <td>{{ copy.graphrag.summaryMetrics.normalized }}</td>
                <td>{{ formatNumber(graphragIngest.totals?.normalized) }}</td>
              </tr>
              <tr>
                <td>{{ copy.graphrag.summaryMetrics.readyForWrite }}</td>
                <td>{{ formatNumber(graphragIngest.totals?.readyForWrite) }}</td>
              </tr>
              <tr>
                <td>{{ copy.graphrag.summaryMetrics.processed }}</td>
                <td>{{ formatNumber(graphragIngest.totals?.processed) }}</td>
              </tr>
              <tr>
                <td>{{ copy.graphrag.summaryMetrics.written }}</td>
                <td>{{ formatNumber(graphragIngest.write?.written) }}</td>
              </tr>
            </tbody>
          </table>
          <div class="graphrag-reasons" v-if="graphragReasons.length">
            <h4>{{ copy.graphrag.reasonsTitle }}</h4>
            <ul>
              <li v-for="item in graphragReasons" :key="item.reason">
                <code>{{ item.reason }}</code>{{ copy.common.reasonSeparator }}{{ formatNumber(item.count) }}
                <span v-if="item.sampleDocId">
                  — {{ copy.graphrag.sampleLabel }}
                  <template v-if="docLinkFromId(item.sampleDocId)">
                    <a :href="docLinkFromId(item.sampleDocId)" target="_blank" rel="noreferrer"><code>{{ item.sampleDocId }}</code></a>
                  </template>
                  <template v-else>
                    <code>{{ item.sampleDocId }}</code>
                  </template>
                </span>
              </li>
            </ul>
          </div>
          <p v-else class="graphrag-reasons-empty">{{ copy.graphrag.noSkipped }}</p>
        </div>

        <div v-if="graphragNormalize" class="graphrag-card">
          <h3>{{ copy.graphrag.normalizeTitle }}</h3>
          <p>
            <strong>{{ copy.graphrag.lastRun }}</strong>
            {{ formatDate(graphragNormalize.timestamp) }}
            — {{ copy.graphrag.normalizeStatusLabel }}
            <span :class="statusClass(graphragNormalize.enabled ? 'ok' : 'degraded')">
              {{ boolLabel(graphragNormalize.enabled) }}
            </span>
          </p>
          <p>
            <strong>{{ copy.graphrag.durationLabel }}</strong>
            {{ graphragNormalize.durationMs == null ? copy.common.notAvailable : formatNumber(graphragNormalize.durationMs) + ' ms' }}
            <span v-if="graphragNormalize.documents != null" class="graphrag-topic-link">
              · {{ copy.graphrag.normalizeDocsLabel }} {{ formatNumber(graphragNormalize.documents) }}
            </span>
          </p>
          <table>
            <thead>
              <tr>
                <th>{{ copy.graphrag.summaryHeaders.metric }}</th>
                <th>{{ copy.graphrag.summaryHeaders.value }}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{{ copy.graphrag.normalizeMetrics.total }}</td>
                <td>{{ formatNumber(graphragNormalize.totals?.total) }}</td>
              </tr>
              <tr>
                <td>{{ copy.graphrag.normalizeMetrics.updated }}</td>
                <td>{{ formatNumber(graphragNormalize.totals?.updated) }}</td>
              </tr>
              <tr>
                <td>{{ copy.graphrag.normalizeMetrics.entities }}</td>
                <td>{{ formatNumber(graphragNormalize.totals?.entities) }}</td>
              </tr>
              <tr>
                <td>{{ copy.graphrag.normalizeMetrics.docRoots }}</td>
                <td>{{ formatNumber(graphragNormalize.totals?.docRoots) }}</td>
              </tr>
              <tr>
                <td>{{ copy.graphrag.normalizeMetrics.alias }}</td>
                <td>{{ formatNumber(graphragNormalize.sources?.alias) }}</td>
              </tr>
              <tr>
                <td>{{ copy.graphrag.normalizeMetrics.cache }}</td>
                <td>{{ formatNumber(graphragNormalize.sources?.cache) }}</td>
              </tr>
              <tr>
                <td>{{ copy.graphrag.normalizeMetrics.llm }}</td>
                <td>{{ formatNumber(graphragNormalize.sources?.llm) }}</td>
              </tr>
              <tr>
                <td>{{ copy.graphrag.normalizeMetrics.fallback }}</td>
                <td>{{ formatNumber(graphragNormalize.sources?.fallback) }}</td>
              </tr>
            </tbody>
          </table>
          <p>
            {{ copy.graphrag.normalizeAliasCount }} {{ formatNumber(graphragNormalize.aliasEntries) }}
            · {{ copy.graphrag.normalizeCacheSize }} {{ formatNumber(graphragNormalize.cache?.size) }}
            · {{ copy.graphrag.normalizeCacheWrites }} {{ formatNumber(graphragNormalize.cache?.writes) }}
          </p>
          <p>
            {{ copy.graphrag.normalizeCachePath }}
            <code>{{ graphragNormalize.cache?.path ?? copy.common.notAvailable }}</code>
          </p>
          <p>
            {{ copy.graphrag.normalizeLLMProvider }}
            <code>{{ graphragNormalize.llm?.provider ?? copy.common.notAvailable }}</code>
            <span v-if="graphragNormalize.llm?.model">
              · {{ copy.graphrag.normalizeLLMModel }}
              <code>{{ graphragNormalize.llm?.model }}</code>
            </span>
          </p>
          <p>
            {{ copy.graphrag.normalizeLLMAttempts }} {{ formatNumber(graphragNormalize.llm?.attempts) }}
            · {{ copy.graphrag.normalizeLLMSuccess }} {{ formatNumber(graphragNormalize.llm?.success) }}
            · {{ copy.graphrag.normalizeLLMFailures }} {{ formatNumber(graphragNormalize.llm?.failures) }}
            <span v-if="graphragNormalize.llm?.disabledReason">
              — {{ copy.graphrag.normalizeLLMDisabled }} {{ graphragNormalize.llm?.disabledReason }}
            </span>
          </p>
          <div
            v-if="graphragNormalizeSamples.updates.length || graphragNormalizeSamples.fallback.length || graphragNormalizeSamples.failures.length"
            class="graphrag-samples"
          >
            <details>
              <summary>{{ copy.graphrag.normalizeSamplesTitle }}</summary>
              <div v-if="graphragNormalizeSamples.updates.length">
                <h4>{{ copy.graphrag.normalizeSamplesUpdated }}</h4>
                <ul>
                  <li v-for="(item, index) in graphragNormalizeSamples.updates" :key="`norm-update-${index}`">
                    <code>{{ item.name ?? copy.common.unknown }}</code>
                    <span>
                      {{ copy.graphrag.normalizeSampleFrom }}
                      <code>{{ item.previous ?? copy.common.notAvailable }}</code>
                      → <code>{{ item.next ?? copy.common.notAvailable }}</code>
                      <span v-if="item.source">（{{ item.source }}）</span>
                    </span>
                  </li>
                </ul>
              </div>
              <div v-if="graphragNormalizeSamples.fallback.length">
                <h4>{{ copy.graphrag.normalizeSamplesFallback }}</h4>
                <ul>
                  <li v-for="(item, index) in graphragNormalizeSamples.fallback" :key="`norm-fallback-${index}`">
                    <code>{{ item.name ?? copy.common.unknown }}</code>
                    <span>
                      {{ copy.graphrag.normalizeSampleReason }} {{ item.reason ?? copy.common.unknownReason }}
                    </span>
                  </li>
                </ul>
              </div>
              <div v-if="graphragNormalizeSamples.failures.length">
                <h4>{{ copy.graphrag.normalizeSamplesFailures }}</h4>
                <ul>
                  <li v-for="(item, index) in graphragNormalizeSamples.failures" :key="`norm-failure-${index}`">
                    <code>{{ item.name ?? copy.common.unknown }}</code>
                    <span>
                      {{ copy.graphrag.normalizeSampleReason }} {{ item.message ?? copy.common.unknownReason }}
                    </span>
                  </li>
                </ul>
              </div>
            </details>
          </div>
        </div>

        <div v-if="graphragNormalizeRelationships" class="graphrag-card">
          <h3>{{ copy.graphrag.normalizeRelTitle }}</h3>
          <p>
            <strong>{{ copy.graphrag.lastRun }}</strong>
            {{ formatDate(graphragNormalizeRelationships.timestamp) }}
            — {{ copy.graphrag.normalizeStatusLabel }}
            <span :class="statusClass(graphragNormalizeRelationships.enabled ? 'ok' : 'degraded')">
              {{ boolLabel(graphragNormalizeRelationships.enabled) }}
            </span>
          </p>
          <p>
            <strong>{{ copy.graphrag.durationLabel }}</strong>
            {{ graphragNormalizeRelationships.durationMs == null ? copy.common.notAvailable : formatNumber(graphragNormalizeRelationships.durationMs) + ' ms' }}
            <span v-if="graphragNormalizeRelationships.documents != null" class="graphrag-topic-link">
              · {{ copy.graphrag.normalizeDocsLabel }} {{ formatNumber(graphragNormalizeRelationships.documents) }}
            </span>
          </p>
          <table>
            <thead>
              <tr>
                <th>{{ copy.graphrag.summaryHeaders.metric }}</th>
                <th>{{ copy.graphrag.summaryHeaders.value }}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{{ copy.graphrag.normalizeRelMetrics.total }}</td>
                <td>{{ formatNumber(graphragNormalizeRelationships.totals?.total) }}</td>
              </tr>
              <tr>
                <td>{{ copy.graphrag.normalizeRelMetrics.updated }}</td>
                <td>{{ formatNumber(graphragNormalizeRelationships.totals?.updated) }}</td>
              </tr>
              <tr>
                <td>{{ copy.graphrag.normalizeRelMetrics.relationships }}</td>
                <td>{{ formatNumber(graphragNormalizeRelationships.totals?.relationships) }}</td>
              </tr>
              <tr>
                <td>{{ copy.graphrag.normalizeRelMetrics.alias }}</td>
                <td>{{ formatNumber(graphragNormalizeRelationships.sources?.alias) }}</td>
              </tr>
              <tr>
                <td>{{ copy.graphrag.normalizeRelMetrics.cache }}</td>
                <td>{{ formatNumber(graphragNormalizeRelationships.sources?.cache) }}</td>
              </tr>
              <tr>
                <td>{{ copy.graphrag.normalizeRelMetrics.llm }}</td>
                <td>{{ formatNumber(graphragNormalizeRelationships.sources?.llm) }}</td>
              </tr>
              <tr>
                <td>{{ copy.graphrag.normalizeRelMetrics.fallback }}</td>
                <td>{{ formatNumber(graphragNormalizeRelationships.sources?.fallback) }}</td>
              </tr>
            </tbody>
          </table>
          <p>
            {{ copy.graphrag.normalizeAliasCount }} {{ formatNumber(graphragNormalizeRelationships.aliasEntries) }}
            · {{ copy.graphrag.normalizeCacheSize }} {{ formatNumber(graphragNormalizeRelationships.cache?.size) }}
            · {{ copy.graphrag.normalizeCacheWrites }} {{ formatNumber(graphragNormalizeRelationships.cache?.writes) }}
          </p>
          <p>
            {{ copy.graphrag.normalizeCachePath }}
            <code>{{ graphragNormalizeRelationships.cache?.path ?? copy.common.notAvailable }}</code>
          </p>
          <p>
            {{ copy.graphrag.normalizeLLMProvider }}
            <code>{{ graphragNormalizeRelationships.llm?.provider ?? copy.common.notAvailable }}</code>
            <span v-if="graphragNormalizeRelationships.llm?.model">
              · {{ copy.graphrag.normalizeLLMModel }}
              <code>{{ graphragNormalizeRelationships.llm?.model }}</code>
            </span>
          </p>
          <p>
            {{ copy.graphrag.normalizeLLMAttempts }} {{ formatNumber(graphragNormalizeRelationships.llm?.attempts) }}
            · {{ copy.graphrag.normalizeLLMSuccess }} {{ formatNumber(graphragNormalizeRelationships.llm?.success) }}
            · {{ copy.graphrag.normalizeLLMFailures }} {{ formatNumber(graphragNormalizeRelationships.llm?.failures) }}
            <span v-if="graphragNormalizeRelationships.llm?.disabledReason">
              — {{ copy.graphrag.normalizeLLMDisabled }} {{ graphragNormalizeRelationships.llm?.disabledReason }}
            </span>
          </p>
          <div
            v-if="graphragRelationshipSamples.updates.length || graphragRelationshipSamples.fallback.length || graphragRelationshipSamples.failures.length"
            class="graphrag-samples"
          >
            <details>
              <summary>{{ copy.graphrag.normalizeRelSamplesTitle }}</summary>
              <div v-if="graphragRelationshipSamples.updates.length">
                <h4>{{ copy.graphrag.normalizeRelSamplesUpdated }}</h4>
                <ul>
                  <li v-for="(item, index) in graphragRelationshipSamples.updates" :key="`rel-update-${index}`">
                    <code>{{ item.source ?? copy.common.unknown }}</code>
                    →
                    <code>{{ item.target ?? copy.common.unknown }}</code>
                    <span>
                      {{ copy.graphrag.normalizeSampleFrom }}
                      <code>{{ item.previous ?? copy.common.notAvailable }}</code>
                      → <code>{{ item.next ?? copy.common.notAvailable }}</code>
                      <span v-if="item.via">（{{ item.via }}）</span>
                    </span>
                  </li>
                </ul>
              </div>
              <div v-if="graphragRelationshipSamples.fallback.length">
                <h4>{{ copy.graphrag.normalizeRelSamplesFallback }}</h4>
                <ul>
                  <li v-for="(item, index) in graphragRelationshipSamples.fallback" :key="`rel-fallback-${index}`">
                    <code>{{ item.source ?? copy.common.unknown }}</code>
                    →
                    <code>{{ item.target ?? copy.common.unknown }}</code>
                    <span>
                      {{ copy.graphrag.normalizeSampleReason }} {{ item.reason ?? copy.common.unknownReason }}
                    </span>
                  </li>
                </ul>
              </div>
              <div v-if="graphragRelationshipSamples.failures.length">
                <h4>{{ copy.graphrag.normalizeRelSamplesFailures }}</h4>
                <ul>
                  <li v-for="(item, index) in graphragRelationshipSamples.failures" :key="`rel-failure-${index}`">
                    <code>{{ item.source ?? copy.common.unknown }}</code>
                    →
                    <code>{{ item.target ?? copy.common.unknown }}</code>
                    <span>
                      {{ copy.graphrag.normalizeSampleReason }} {{ item.message ?? copy.common.unknownReason }}
                    </span>
                  </li>
                </ul>
              </div>
            </details>
          </div>
        </div>

        <div v-if="graphragNormalizeObjects" class="graphrag-card">
          <h3>{{ copy.graphrag.normalizeObjTitle }}</h3>
          <p>
            <strong>{{ copy.graphrag.lastRun }}</strong>
            {{ formatDate(graphragNormalizeObjects.timestamp) }}
            — {{ copy.graphrag.normalizeStatusLabel }}
            <span :class="statusClass(graphragNormalizeObjects.enabled ? 'ok' : 'degraded')">
              {{ boolLabel(graphragNormalizeObjects.enabled) }}
            </span>
          </p>
          <p>
            <strong>{{ copy.graphrag.durationLabel }}</strong>
            {{ graphragNormalizeObjects.durationMs == null ? copy.common.notAvailable : formatNumber(graphragNormalizeObjects.durationMs) + ' ms' }}
            <span v-if="graphragNormalizeObjects.documents != null" class="graphrag-topic-link">
              · {{ copy.graphrag.normalizeDocsLabel }} {{ formatNumber(graphragNormalizeObjects.documents) }}
            </span>
          </p>
          <table>
            <thead>
              <tr>
                <th>{{ copy.graphrag.summaryHeaders.metric }}</th>
                <th>{{ copy.graphrag.summaryHeaders.value }}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{{ copy.graphrag.normalizeObjMetrics.total }}</td>
                <td>{{ formatNumber(graphragNormalizeObjects.totals?.total) }}</td>
              </tr>
              <tr>
                <td>{{ copy.graphrag.normalizeObjMetrics.updated }}</td>
                <td>{{ formatNumber(graphragNormalizeObjects.totals?.updated) }}</td>
              </tr>
              <tr>
                <td>{{ copy.graphrag.normalizeObjMetrics.relationships }}</td>
                <td>{{ formatNumber(graphragNormalizeObjects.totals?.relationships) }}</td>
              </tr>
              <tr>
                <td>{{ copy.graphrag.normalizeObjMetrics.entities }}</td>
                <td>{{ formatNumber(graphragNormalizeObjects.totals?.entities) }}</td>
              </tr>
              <tr>
                <td>{{ copy.graphrag.normalizeObjMetrics.alias }}</td>
                <td>{{ formatNumber(graphragNormalizeObjects.sources?.alias) }}</td>
              </tr>
              <tr>
                <td>{{ copy.graphrag.normalizeObjMetrics.cache }}</td>
                <td>{{ formatNumber(graphragNormalizeObjects.sources?.cache) }}</td>
              </tr>
              <tr>
                <td>{{ copy.graphrag.normalizeObjMetrics.llm }}</td>
                <td>{{ formatNumber(graphragNormalizeObjects.sources?.llm) }}</td>
              </tr>
              <tr>
                <td>{{ copy.graphrag.normalizeObjMetrics.fallback }}</td>
                <td>{{ formatNumber(graphragNormalizeObjects.sources?.fallback) }}</td>
              </tr>
            </tbody>
          </table>
          <p>
            {{ copy.graphrag.normalizeAliasCount }} {{ formatNumber(graphragNormalizeObjects.aliasEntries) }}
            · {{ copy.graphrag.normalizeCacheSize }} {{ formatNumber(graphragNormalizeObjects.cache?.size) }}
            · {{ copy.graphrag.normalizeCacheWrites }} {{ formatNumber(graphragNormalizeObjects.cache?.writes) }}
          </p>
          <p>
            {{ copy.graphrag.normalizeCachePath }}
            <code>{{ graphragNormalizeObjects.cache?.path ?? copy.common.notAvailable }}</code>
          </p>
          <p>
            {{ copy.graphrag.normalizeLLMProvider }}
            <code>{{ graphragNormalizeObjects.llm?.provider ?? copy.common.notAvailable }}</code>
            <span v-if="graphragNormalizeObjects.llm?.model">
              · {{ copy.graphrag.normalizeLLMModel }}
              <code>{{ graphragNormalizeObjects.llm?.model }}</code>
            </span>
          </p>
          <p>
            {{ copy.graphrag.normalizeLLMAttempts }} {{ formatNumber(graphragNormalizeObjects.llm?.attempts) }}
            · {{ copy.graphrag.normalizeLLMSuccess }} {{ formatNumber(graphragNormalizeObjects.llm?.success) }}
            · {{ copy.graphrag.normalizeLLMFailures }} {{ formatNumber(graphragNormalizeObjects.llm?.failures) }}
            <span v-if="graphragNormalizeObjects.llm?.disabledReason">
              — {{ copy.graphrag.normalizeLLMDisabled }} {{ graphragNormalizeObjects.llm?.disabledReason }}
            </span>
          </p>
          <div
            v-if="graphragObjectSamples.updates.length || graphragObjectSamples.fallback.length || graphragObjectSamples.failures.length"
            class="graphrag-samples"
          >
            <details>
              <summary>{{ copy.graphrag.normalizeObjSamplesTitle }}</summary>
              <div v-if="graphragObjectSamples.updates.length">
                <h4>{{ copy.graphrag.normalizeObjSamplesUpdated }}</h4>
                <ul>
                  <li v-for="(item, index) in graphragObjectSamples.updates" :key="`obj-update-${index}`">
                    <code>{{ item.key ?? copy.common.unknown }}</code>
                    <span>
                      {{ copy.graphrag.normalizeSampleFrom }}
                      <code>{{ item.previousKey ?? copy.common.notAvailable }}</code>
                      → <code>{{ item.key ?? copy.common.notAvailable }}</code>
                      <span v-if="item.location">（{{ item.location }}）</span>
                    </span>
                  </li>
                </ul>
              </div>
              <div v-if="graphragObjectSamples.fallback.length">
                <h4>{{ copy.graphrag.normalizeObjSamplesFallback }}</h4>
                <ul>
                  <li v-for="(item, index) in graphragObjectSamples.fallback" :key="`obj-fallback-${index}`">
                    <code>{{ item.key ?? copy.common.unknown }}</code>
                    <span>
                      {{ copy.graphrag.normalizeSampleReason }} {{ item.reason ?? copy.common.unknownReason }}
                    </span>
                  </li>
                </ul>
              </div>
              <div v-if="graphragObjectSamples.failures.length">
                <h4>{{ copy.graphrag.normalizeObjSamplesFailures }}</h4>
                <ul>
                  <li v-for="(item, index) in graphragObjectSamples.failures" :key="`obj-failure-${index}`">
                    <code>{{ item.key ?? copy.common.unknown }}</code>
                    <span>
                      {{ copy.graphrag.normalizeSampleReason }} {{ item.message ?? copy.common.unknownReason }}
                    </span>
                  </li>
                </ul>
              </div>
            </details>
          </div>
        </div>

        <div v-if="graphragExport" class="graphrag-card">
          <h3>{{ copy.graphrag.exportTitle }}</h3>
          <p>
            <strong>{{ copy.graphrag.lastRun }}</strong>
            {{ formatDate(graphragExport.timestamp) }}
            — {{ copy.graphrag.docLabel }}
            <template v-if="graphragExportDocLink">
              <a :href="graphragExportDocLink" target="_blank" rel="noreferrer"><code>{{ graphragExport.docId }}</code></a>
            </template>
            <template v-else>
              <code>{{ graphragExport.docId ?? copy.common.notAvailable }}</code>
            </template>
            <span v-if="graphragExport.topic">
              {{ copy.graphrag.topicLabel }}
              <template v-if="graphragExportTopicLink">
                <a :href="graphragExportTopicLink" target="_blank" rel="noreferrer"><code>{{ graphragExport.topic }}</code></a>
              </template>
              <template v-else>
                <code>{{ graphragExport.topic }}</code>
              </template>
              <span v-if="graphragExportTopicLink" class="graphrag-topic-link">
                · <a :href="graphragExportTopicLink" target="_blank" rel="noreferrer">{{ copy.graphrag.topicLinkText }}</a>
              </span>
            </span>
          </p>
          <p>
            <strong>{{ copy.graphrag.durationLabel }}</strong>
            {{ graphragExport.durationMs == null ? copy.common.notAvailable : formatNumber(graphragExport.durationMs) + ' ms' }}
          </p>
          <table>
            <thead>
              <tr>
                <th>{{ copy.graphrag.summaryHeaders.metric }}</th>
                <th>{{ copy.graphrag.summaryHeaders.value }}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{{ copy.graphrag.exportMetrics.nodes }}</td>
                <td>{{ formatNumber(graphragExport.totals?.nodes) }}</td>
              </tr>
              <tr>
                <td>{{ copy.graphrag.exportMetrics.edges }}</td>
                <td>{{ formatNumber(graphragExport.totals?.edges) }}</td>
              </tr>
              <tr>
                <td>{{ copy.graphrag.exportMetrics.entities }}</td>
                <td>{{ formatNumber(graphragExport.totals?.entities) }}</td>
              </tr>
              <tr>
                <td>{{ copy.graphrag.exportMetrics.recommendations }}</td>
                <td>{{ formatNumber(graphragExport.totals?.recommendations) }}</td>
              </tr>
            </tbody>
          </table>
          <div class="graphrag-files" v-if="graphragExportFiles.length">
            <h4>{{ copy.graphrag.filesTitle }}</h4>
            <ul>
              <li v-for="(file, index) in graphragExportFiles" :key="index">
                <code>{{ file }}</code>
              </li>
            </ul>
          </div>
        </div>

        <div v-if="graphragRetrieve" class="graphrag-card">
          <h3>{{ copy.graphrag.retrieveTitle }}</h3>
          <p>
            <strong>{{ copy.graphrag.lastRun }}</strong>
            {{ formatDate(graphragRetrieve.timestamp) }}
            — {{ copy.graphrag.modeLabel }} <code>{{ graphragRetrieve.mode }}</code>
          </p>
          <p>
            <strong>{{ copy.graphrag.durationLabel }}</strong>
            {{ graphragRetrieve.durationMs == null ? copy.common.notAvailable : formatNumber(graphragRetrieve.durationMs) + ' ms' }}
          </p>
          <table>
            <thead>
              <tr>
                <th>{{ copy.graphrag.retrieveHeaders.metric }}</th>
                <th>{{ copy.graphrag.retrieveHeaders.value }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="graphragRetrieve.totals?.items != null">
                <td>{{ copy.graphrag.retrieveMetrics.items }}</td>
                <td>{{ formatNumber(graphragRetrieve.totals?.items) }}</td>
              </tr>
              <tr v-if="graphragRetrieve.totals?.nodes != null">
                <td>{{ copy.graphrag.retrieveMetrics.nodes }}</td>
                <td>{{ formatNumber(graphragRetrieve.totals?.nodes) }}</td>
              </tr>
              <tr v-if="graphragRetrieve.totals?.edges != null">
                <td>{{ copy.graphrag.retrieveMetrics.edges }}</td>
                <td>{{ formatNumber(graphragRetrieve.totals?.edges) }}</td>
              </tr>
              <tr v-if="graphragRetrieve.totals?.length != null">
                <td>{{ copy.graphrag.retrieveMetrics.length }}</td>
                <td>{{ formatNumber(graphragRetrieve.totals?.length) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="graphragExplore" class="graphrag-card">
          <h3>{{ copy.graphrag.exploreTitle }}</h3>
          <p>
            <strong>{{ copy.graphrag.lastRun }}</strong>
            {{ formatDate(graphragExplore.timestamp) }}
            <span v-if="graphragExplore.durationMs != null">
              — {{ copy.graphrag.durationLabel }}{{ formatNumber(graphragExplore.durationMs) }} ms
            </span>
          </p>
          <p>
            <strong>{{ copy.graphrag.exploreModeLabel }}</strong>
            {{ graphragExplore.mode }}
            <span v-if="graphragExplore.sources?.length"
              class="graphrag-topic-link">· {{ graphragExplore.sources.join(', ') }}</span>
          </p>
          <ul class="graphrag-list-inline">
            <li>
              {{ copy.graphrag.exploreDocsLabel }}：{{ formatNumber(graphragExplore.docs) }}
            </li>
            <li>
              {{ copy.graphrag.exploreNodesLabel }}：{{ formatNumber(graphragExplore.nodes) }}
              <span v-if="graphragExplore.truncatedNodes" class="graphrag-badge">截断</span>
            </li>
            <li>
              {{ copy.graphrag.exploreEdgesLabel }}：{{ formatNumber(graphragExplore.edges) }}
              <span v-if="graphragExplore.truncatedEdges" class="graphrag-badge">截断</span>
            </li>
          </ul>
          <p v-if="graphragExplore.question" class="graphrag-explore-question">
            Q：{{ graphragExplore.question }}
          </p>
          <p v-if="graphragExplore.docId">
            {{ copy.graphrag.docLabel }}：
            <template v-if="graphragExploreDocLink">
              <a :href="graphragExploreDocLink" target="_blank" rel="noreferrer"><code>{{ graphragExplore.docId }}</code></a>
            </template>
            <template v-else>
              <code>{{ graphragExplore.docId }}</code>
            </template>
          </p>
          <p>
            <a :href="withBase('/graph/explorer/')" target="_blank" rel="noreferrer">{{ copy.graphrag.exploreLinkText }}</a>
          </p>
        </div>
      </div>
    </section>

    <section>
      <h2>{{ copy.sections.ai }}</h2>
      <p v-if="!ai">{{ copy.ai.noTelemetry }}</p>
      <div v-else class="ai-details">
        <p>
          <strong>{{ copy.ai.overallLabel }}</strong>
          <span :class="statusClass(aiOverview?.status)">{{ formatStatus(aiOverview?.status) }}</span>
          <span v-if="aiOverview?.schemaVersion" class="schema-tag">{{ copy.ai.schemaTagPrefix }}{{ aiOverview.schemaVersion }}</span>
          <span v-if="aiOverview?.updatedAt">{{ copy.ai.updatedPrefix }}{{ formatDate(aiOverview.updatedAt) }}</span>
        </p>
        <p v-if="aiSmokeSummary">
          <strong>{{ copy.ai.smokeLabel }}</strong>
          <span :class="statusClass(aiSmokeSummary.status)">{{ formatStatus(aiSmokeSummary.status) }}</span>
          <span v-if="aiSmokeSummary.runtime">{{ copy.ai.runtimePrefix }}{{ aiSmokeSummary.runtime }}{{ copy.ai.runtimeSuffix }}</span>
          {{ aiSmokeStatsText }}
          <span v-if="aiSmokeSummary.verifiedAt">{{ copy.ai.verifiedPrefix }}{{ formatDate(aiSmokeSummary.verifiedAt) }}</span>
          <span v-if="aiSmokeSummary.reason">{{ copy.common.reasonSeparator }}{{ aiSmokeSummary.reason }}</span>
        </p>
        <table v-if="aiDomains.length">
          <thead>
            <tr>
              <th>{{ copy.ai.tableHeaders.module }}</th>
              <th>{{ copy.ai.tableHeaders.status }}</th>
              <th>{{ copy.ai.tableHeaders.adapter }}</th>
              <th>{{ copy.ai.tableHeaders.outputs }}</th>
              <th>{{ copy.ai.tableHeaders.successRate }}</th>
              <th>{{ copy.ai.tableHeaders.lastRun }}</th>
              <th>{{ copy.ai.tableHeaders.cacheReuse }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="domain in aiDomains" :key="domain.name">
              <td><code>{{ domain.name }}</code></td>
              <td><span :class="statusClass(domain.info.status)">{{ formatStatus(domain.info.status) }}</span></td>
              <td>
                <code v-if="domain.info.adapter?.name">
                  {{ domain.info.adapter.name }}<span v-if="domain.info.adapter?.model"> ({{ domain.info.adapter.model }})</span>
                </code>
                <span v-else>{{ copy.common.unknown }}</span>
              </td>
              <td>{{ formatNumber(domain.info.outputCount) }}</td>
              <td>{{ formatPercent(domain.info.successRate ?? null) }}</td>
              <td>{{ formatDate(domain.info.lastRunAt) }}</td>
              <td>{{ boolLabel(domain.info.cacheReuse ?? null) }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else>{{ copy.ai.noModules }}</p>

        <details v-if="aiErrors.length">
          <summary>{{ copy.ai.errorsTitle }}</summary>
          <ul>
            <li v-for="(err, index) in aiErrors" :key="index">
              <code>{{ err.domain }}</code>{{ copy.common.reasonSeparator }}{{ err.message || copy.common.unknownError }}
            </li>
          </ul>
        </details>
        <div v-if="aiSmokeModels.length" class="smoke-summary">
          <h3>{{ copy.ai.smokeTitle }}</h3>
          <table>
            <thead>
              <tr>
                <th>{{ copy.ai.smokeTableHeaders.model }}</th>
                <th>{{ copy.ai.smokeTableHeaders.tasks }}</th>
                <th>{{ copy.ai.smokeTableHeaders.status }}</th>
                <th>{{ copy.ai.smokeTableHeaders.reason }}</th>
                <th>{{ copy.ai.smokeTableHeaders.verifiedAt }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(model, index) in aiSmokeModels" :key="model.id ?? model.name ?? index">
                <td><code>{{ model.id ?? model.name ?? copy.common.unknownModel }}</code></td>
                <td>{{ listToText(model.tasks) }}</td>
                <td>
                  <span :class="statusClass(model.smoke?.status)">{{ formatStatus(model.smoke?.status) }}</span>
                </td>
                <td>{{ model.smoke?.reason ?? copy.common.notAvailable }}</td>
                <td>{{ formatDate(model.smoke?.verifiedAt) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="aiSmokeHistory.length" class="smoke-history">
          <h3>{{ copy.ai.smokeHistoryTitle }}</h3>
          <table>
            <thead>
              <tr>
                <th>{{ copy.ai.smokeHistoryHeaders.status }}</th>
                <th>{{ copy.ai.smokeHistoryHeaders.runtime }}</th>
                <th>{{ copy.ai.smokeHistoryHeaders.executed }}</th>
                <th>{{ copy.ai.smokeHistoryHeaders.skipped }}</th>
                <th>{{ copy.ai.smokeHistoryHeaders.failed }}</th>
                <th>{{ copy.ai.smokeHistoryHeaders.verifiedAt }}</th>
                <th>{{ copy.ai.smokeHistoryHeaders.reason }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, index) in aiSmokeHistory" :key="item.verifiedAt ?? index">
                <td><span :class="statusClass(item.status)">{{ formatStatus(item.status) }}</span></td>
                <td>{{ item.runtime ?? copy.common.notAvailable }}</td>
                <td>{{ formatNumber(item.executed) }}</td>
                <td>{{ formatNumber(item.skipped) }}</td>
                <td>{{ formatNumber(item.failed) }}</td>
                <td>{{ formatDate(item.verifiedAt) }}</td>
                <td>{{ item.reason ?? copy.common.notAvailable }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="smoke-history-empty">{{ copy.ai.smokeHistoryEmpty }}</p>
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

const props = withDefaults(defineProps<{ locale?: 'zh' | 'en' }>(), { locale: 'zh' })
const locale = computed<'zh' | 'en'>(() => (props.locale === 'en' ? 'en' : 'zh'))
const localeTag = computed(() => (locale.value === 'en' ? 'en-US' : 'zh-CN'))

const COPY_MAP = {
  zh: {
    loadFailed: '加载失败：',
    loading: '正在载入指标…',
    updatedLabel: '更新于：',
    sections: {
      alerts: '告警',
      pageViews: '页面访问',
      searchQueries: '搜索查询 Top',
      searchClicks: '搜索点击 Top',
      pagegen: 'Pagegen 构建指标',
      graphrag: 'GraphRAG 管线指标',
      ai: 'AI 构建指标'
    },
    pageViews: {
      totalLabel: '累计 PV：',
      tableHeaders: { path: '路径', count: '次数' }
    },
    search: {
      queriesHeaders: { hash: 'Hash', count: '次数', avgLen: '平均长度' },
      clicksHeaders: { hash: '查询 Hash', url: '链接', count: '次数', avgRank: '平均 Rank' }
    },
    pagegen: {
      title: 'Pagegen 构建指标',
      noTelemetry: '暂无构建遥测。',
      lastRun: '最近运行：',
      collectTitle: '采集阶段：',
      writeTitle: '写入阶段：',
      skipReasonsTitle: '跳过原因明细',
      schedulerTitle: '调度配置',
      schedulerNoOverrides: '未覆写阶段并发设置。',
      pluginTitle: '插件执行',
      pluginRequestedLabel: '请求插件：',
      pluginNone: '无',
      pluginIgnoreErrorsLabel: '忽略错误：',
      pluginDisabledLabel: '已禁用：',
      pluginNoRuns: '暂无插件运行记录。',
      batchDisabledNote: '— 批量写入未启用',
      schedulerHeaders: { stage: '阶段', enabled: '启用', limit: '并发上限' },
      pluginHeaders: { plugin: '插件', status: '状态', detail: '详情' },
      defaultLabel: '默认'
    },
    graphrag: {
      title: 'GraphRAG 管线指标',
      noTelemetry: '尚未采集 GraphRAG 遥测数据。',
      viewIndex: '查看 GraphRAG 全部主题',
      ingestTitle: '入图统计',
      exportTitle: '导出产物统计',
      retrieveTitle: '检索摘要',
      exploreTitle: '问答与可视化',
      lastRun: '最近运行：',
      localeLabel: '语言',
      adapterLabel: '实体抽取适配器',
      docLabel: '文档',
      topicLabel: '主题',
      exploreModeLabel: '模式',
      exploreDocsLabel: '返回文档',
      exploreNodesLabel: '节点',
      exploreEdgesLabel: '边',
      exploreLinkText: '打开 Explorer 页面',
      topicLinkText: '打开可视化',
      modeLabel: '模式',
      durationLabel: '耗时：',
      summaryHeaders: { metric: '指标', value: '数值' },
      summaryMetrics: {
        collected: '收集文档',
        normalized: '归一化条目',
        readyForWrite: '待写入批次',
        processed: '通过质量闸门',
        written: '写入成功'
      },
      exportMetrics: {
        nodes: '子图节点',
        edges: '子图边',
        entities: '实体数量',
        recommendations: '推荐数量'
      },
      filesTitle: '写入文件',
      retrieveHeaders: { metric: '指标', value: '数值' },
      retrieveMetrics: {
        items: '结果条目',
        nodes: '节点数',
        edges: '边数',
        length: '路径长度'
      },
      reasonsTitle: '跳过原因 Top',
      sampleLabel: '示例文档',
      noSkipped: '未记录跳过的文档。',
      normalizeTitle: '实体类型归一化',
      normalizeStatusLabel: '状态',
      normalizeDocsLabel: '处理文档',
      normalizeMetrics: {
        total: '处理条目',
        updated: '更新条目',
        entities: '实体记录',
        docRoots: 'Doc Root 记录',
        alias: '别名命中',
        cache: '缓存命中',
        llm: 'LLM 调用',
        fallback: '回退次数'
      },
      normalizeAliasCount: '别名条目',
      normalizeCacheSize: '缓存条目',
      normalizeCacheWrites: '缓存写入',
      normalizeCachePath: '缓存路径：',
      normalizeLLMProvider: 'LLM 提供方：',
      normalizeLLMModel: '模型',
      normalizeLLMAttempts: '调用次数',
      normalizeLLMSuccess: '成功',
      normalizeLLMFailures: '失败',
      normalizeLLMDisabled: '禁用原因：',
      normalizeSamplesTitle: '查看样例',
      normalizeSamplesUpdated: '类型变更',
      normalizeSamplesFallback: '回退记录',
      normalizeSamplesFailures: '失败记录',
      normalizeSampleFrom: '类型从',
      normalizeSampleReason: '原因',
      normalizeRelTitle: '关系类型归一化',
      normalizeRelMetrics: {
        total: '处理关系',
        updated: '更新关系',
        relationships: '关系记录',
        alias: '别名命中',
        cache: '缓存命中',
        llm: 'LLM 调用',
        fallback: '回退次数'
      },
      normalizeRelSamplesTitle: '查看关系样例',
      normalizeRelSamplesUpdated: '关系类型变更',
      normalizeRelSamplesFallback: '回退关系',
      normalizeRelSamplesFailures: '失败关系',
      normalizeObjTitle: '属性归一化',
      normalizeObjMetrics: {
        total: '处理属性',
        updated: '更新属性',
        relationships: '关系属性条目',
        entities: '实体属性条目',
        alias: '别名命中',
        cache: '缓存命中',
        llm: 'LLM 调用',
        fallback: '回退次数'
      },
      normalizeObjSamplesTitle: '查看属性样例',
      normalizeObjSamplesUpdated: '属性键变更',
      normalizeObjSamplesFallback: '回退属性',
      normalizeObjSamplesFailures: '失败属性'
    },
    ai: {
      title: 'AI 构建指标',
      noTelemetry: '尚未采集 AI 构建遥测数据。',
      overallLabel: '整体状态：',
      schemaTagPrefix: 'schema ',
      updatedPrefix: '，最近更新 ',
      smokeLabel: '冒烟结果：',
      runtimePrefix: '（运行时：',
      runtimeSuffix: '）',
      verifiedPrefix: '，记录时间 ',
      tableHeaders: {
        module: '模块',
        status: '状态',
        adapter: '适配器',
        outputs: '输出条目',
        successRate: '成功率',
        lastRun: '最近运行',
        cacheReuse: '缓存复用'
      },
      noModules: '未找到模块级遥测数据。',
      errorsTitle: '适配器错误明细',
      smokeTitle: '模型冒烟状态',
      smokeTableHeaders: {
        model: '模型',
        tasks: '任务',
        status: '状态',
        reason: '原因',
        verifiedAt: '验证时间'
      },
      smokeHistoryTitle: '冒烟历史',
      smokeHistoryHeaders: {
        status: '状态',
        runtime: '运行时',
        executed: '执行',
        skipped: '跳过',
        failed: '失败',
        verifiedAt: '验证时间',
        reason: '原因'
      },
      smokeHistoryEmpty: '暂无历史记录'
    },
    common: {
      noData: '暂无数据。',
      notAvailable: 'n/a',
      unknown: '未知',
      yes: '是',
      no: '否',
      listSeparator: '、',
      segmentSeparator: '，',
      reasonSeparator: ' — ',
      unknownError: '未知错误',
      unknownReason: '未提供原因',
      unknownModel: 'unknown'
    },
    statuses: {
      ok: '正常',
      degraded: '降级',
      fallback: '回退',
      empty: '为空',
      missing: '缺失',
      passed: '通过',
      failed: '失败',
      skipped: '跳过'
    }
  },
  en: {
    loadFailed: 'Failed to load telemetry: ',
    loading: 'Loading metrics…',
    updatedLabel: 'Updated:',
    sections: {
      alerts: 'Alerts',
      pageViews: 'Page Views',
      searchQueries: 'Search Queries Top',
      searchClicks: 'Search Clicks Top',
      pagegen: 'Pagegen Build Metrics',
      graphrag: 'GraphRAG Pipeline Metrics',
      ai: 'AI Build Metrics'
    },
    pageViews: {
      totalLabel: 'Total PV:',
      tableHeaders: { path: 'Path', count: 'Hits' }
    },
    search: {
      queriesHeaders: { hash: 'Hash', count: 'Count', avgLen: 'Avg Length' },
      clicksHeaders: { hash: 'Query Hash', url: 'Link', count: 'Count', avgRank: 'Avg Rank' }
    },
    pagegen: {
      title: 'Pagegen Build Metrics',
      noTelemetry: 'No build telemetry yet.',
      lastRun: 'Last Run:',
      collectTitle: 'Collect:',
      writeTitle: 'Write:',
      skipReasonsTitle: 'Skip reasons',
      schedulerTitle: 'Scheduler Configuration',
      schedulerNoOverrides: 'No stage-level overrides.',
      pluginTitle: 'Plugin Execution',
      pluginRequestedLabel: 'Requested plugins:',
      pluginNone: 'none',
      pluginIgnoreErrorsLabel: 'Ignore errors:',
      pluginDisabledLabel: 'Disabled:',
      pluginNoRuns: 'No plugin runs recorded.',
      batchDisabledNote: '— batching disabled',
      schedulerHeaders: { stage: 'Stage', enabled: 'Enabled', limit: 'Concurrency Limit' },
      pluginHeaders: { plugin: 'Plugin', status: 'Status', detail: 'Detail' },
      defaultLabel: 'default'
    },
    graphrag: {
      title: 'GraphRAG Pipeline Metrics',
      noTelemetry: 'No GraphRAG telemetry collected yet.',
      viewIndex: 'View all GraphRAG topics',
      ingestTitle: 'Ingest stats',
      exportTitle: 'Export summary',
      retrieveTitle: 'Retrieval summary',
      exploreTitle: 'Q&A & Explorer',
      lastRun: 'Last run:',
      localeLabel: 'Locale',
      adapterLabel: 'Entity adapter',
      docLabel: 'Doc',
      topicLabel: 'Topic',
      exploreModeLabel: 'Mode',
      exploreDocsLabel: 'Returned docs',
      exploreNodesLabel: 'Nodes',
      exploreEdgesLabel: 'Edges',
      exploreLinkText: 'Open Explorer page',
      topicLinkText: 'Open visualization',
      modeLabel: 'Mode',
      durationLabel: 'Duration:',
      summaryHeaders: { metric: 'Metric', value: 'Value' },
      summaryMetrics: {
        collected: 'Collected docs',
        normalized: 'Normalized entries',
        readyForWrite: 'Batches ready',
        processed: 'Passed quality gate',
        written: 'Written'
      },
      exportMetrics: {
        nodes: 'Subgraph nodes',
        edges: 'Subgraph edges',
        entities: 'Entities',
        recommendations: 'Recommendations'
      },
      filesTitle: 'Written files',
      retrieveHeaders: { metric: 'Metric', value: 'Value' },
      retrieveMetrics: {
        items: 'Items',
        nodes: 'Nodes',
        edges: 'Edges',
        length: 'Path length'
      },
      reasonsTitle: 'Top skip reasons',
      sampleLabel: 'Sample doc',
      noSkipped: 'No skipped documents recorded.',
      normalizeTitle: 'Entity Type Normalization',
      normalizeStatusLabel: 'Status',
      normalizeDocsLabel: 'Docs',
      normalizeMetrics: {
        total: 'Processed records',
        updated: 'Updated records',
        entities: 'Entity rows',
        docRoots: 'Doc root rows',
        alias: 'Alias hits',
        cache: 'Cache hits',
        llm: 'LLM calls',
        fallback: 'Fallback count'
      },
      normalizeAliasCount: 'Alias entries',
      normalizeCacheSize: 'Cache entries',
      normalizeCacheWrites: 'Cache writes',
      normalizeCachePath: 'Cache path:',
      normalizeLLMProvider: 'LLM provider:',
      normalizeLLMModel: 'Model',
      normalizeLLMAttempts: 'Attempts',
      normalizeLLMSuccess: 'Success',
      normalizeLLMFailures: 'Failures',
      normalizeLLMDisabled: 'Disabled reason:',
      normalizeSamplesTitle: 'Show samples',
      normalizeSamplesUpdated: 'Type updates',
      normalizeSamplesFallback: 'Fallback records',
      normalizeSamplesFailures: 'Failure records',
      normalizeSampleFrom: 'Type from',
      normalizeSampleReason: 'Reason',
      normalizeRelTitle: 'Relationship Type Normalization',
      normalizeRelMetrics: {
        total: 'Processed relationships',
        updated: 'Updated relationships',
        relationships: 'Relationship rows',
        alias: 'Alias hits',
        cache: 'Cache hits',
        llm: 'LLM calls',
        fallback: 'Fallback count'
      },
      normalizeRelSamplesTitle: 'Show relationship samples',
      normalizeRelSamplesUpdated: 'Relationship type updates',
      normalizeRelSamplesFallback: 'Fallback relationships',
      normalizeRelSamplesFailures: 'Failed relationships',
      normalizeObjTitle: 'Attribute Normalization',
      normalizeObjMetrics: {
        total: 'Processed attributes',
        updated: 'Updated attributes',
        relationships: 'Relationship entries',
        entities: 'Entity entries',
        alias: 'Alias hits',
        cache: 'Cache hits',
        llm: 'LLM calls',
        fallback: 'Fallback count'
      },
      normalizeObjSamplesTitle: 'Show attribute samples',
      normalizeObjSamplesUpdated: 'Attribute key updates',
      normalizeObjSamplesFallback: 'Fallback attributes',
      normalizeObjSamplesFailures: 'Failed attributes'
    },
    ai: {
      title: 'AI Build Metrics',
      noTelemetry: 'No AI build telemetry collected yet.',
      overallLabel: 'Overall status:',
      schemaTagPrefix: 'schema ',
      updatedPrefix: ', updated ',
      smokeLabel: 'Smoke test:',
      runtimePrefix: ' (runtime: ',
      runtimeSuffix: ')',
      verifiedPrefix: ', recorded ',
      tableHeaders: {
        module: 'Module',
        status: 'Status',
        adapter: 'Adapter',
        outputs: 'Outputs',
        successRate: 'Success Rate',
        lastRun: 'Last Run',
        cacheReuse: 'Cache Reuse'
      },
      noModules: 'No module-level telemetry found.',
      errorsTitle: 'Adapter errors',
      smokeTitle: 'Model smoke status',
      smokeTableHeaders: {
        model: 'Model',
        tasks: 'Tasks',
        status: 'Status',
        reason: 'Reason',
        verifiedAt: 'Verified'
      },
      smokeHistoryTitle: 'Smoke history',
      smokeHistoryHeaders: {
        status: 'Status',
        runtime: 'Runtime',
        executed: 'Executed',
        skipped: 'Skipped',
        failed: 'Failed',
        verifiedAt: 'Verified',
        reason: 'Reason'
      },
      smokeHistoryEmpty: 'No smoke history yet.'
    },
    common: {
      noData: 'No data yet.',
      notAvailable: 'n/a',
      unknown: 'Unknown',
      yes: 'Yes',
      no: 'No',
      listSeparator: ', ',
      segmentSeparator: '; ',
      reasonSeparator: ' — ',
      unknownError: 'unknown error',
      unknownReason: 'no reason provided',
      unknownModel: 'unknown'
    },
    statuses: {
      ok: 'OK',
      degraded: 'Degraded',
      fallback: 'Fallback',
      empty: 'Empty',
      missing: 'Missing',
      passed: 'Passed',
      failed: 'Failed',
      skipped: 'Skipped'
    }
  }
} as const

type Copy = typeof COPY_MAP['zh']

const copy = computed(() => COPY_MAP[locale.value])

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
const aiSmokeHistory = computed(() => {
  const history = Array.isArray(aiSmoke.value?.history) ? aiSmoke.value?.history : []
  return history
    .filter(entry => entry)
    .map(entry => ({
      status: entry?.status ?? 'unknown',
      runtime: entry?.runtime ?? null,
      executed: entry?.executed ?? null,
      skipped: entry?.skipped ?? null,
      failed: entry?.failed ?? null,
      verifiedAt: entry?.verifiedAt ?? null,
      reason: entry?.reason ?? null
    }))
})

const graphrag = computed(() => telemetry.value?.build?.graphrag ?? null)
const graphragIngest = computed(() => graphrag.value?.ingest ?? null)
const graphragExport = computed(() => graphrag.value?.export ?? null)
const graphragRetrieve = computed(() => graphrag.value?.retrieve ?? null)
const graphragExplore = computed(() => graphrag.value?.explore ?? null)
const graphragNormalize = computed(() => graphrag.value?.normalize ?? null)
const graphragNormalizeRelationships = computed(() => graphrag.value?.normalize_relationships ?? null)
const graphragNormalizeObjects = computed(() => graphrag.value?.normalize_objects ?? null)
const graphragExportDocLink = computed(() => docLinkFromId(graphragExport.value?.docId))
const graphragExportTopicLink = computed(() => {
  const topic = graphragExport.value?.topic
  if (!topic) return null
  const normalized = topic.replace(/^\/+/, '')
  return withBase(`/graph/${normalized}/`)
})
const graphIndexLink = computed(() => withBase('/graph/'))
const graphragExploreDocLink = computed(() => docLinkFromId(graphragExplore.value?.docId))
const graphragReasons = computed(() => {
  const reasons = graphragIngest.value?.skipped?.reasons
  if (!Array.isArray(reasons)) return [] as Array<{ reason: string; count: number; sampleDocId?: string | null }>
  return reasons.map(entry => ({
    reason: entry?.reason ?? 'unknown',
    count: entry?.count ?? 0,
    sampleDocId: entry?.sampleDocId ?? null
  }))
})
const graphragExportFiles = computed(() => {
  const files = graphragExport.value?.files ?? {}
  return Object.entries(files)
    .filter(([, written]) => Boolean(written))
    .map(([key]) => key)
})
const graphragNormalizeSamples = computed(() => {
  const samples = graphragNormalize.value?.samples ?? {}
  return {
    updates: Array.isArray(samples.updates) ? samples.updates : [],
    fallback: Array.isArray(samples.fallback) ? samples.fallback : [],
    failures: Array.isArray(samples.failures) ? samples.failures : []
  }
})

const graphragRelationshipSamples = computed(() => {
  const samples = graphragNormalizeRelationships.value?.samples ?? {}
  return {
    updates: Array.isArray(samples.updates) ? samples.updates : [],
    fallback: Array.isArray(samples.fallback) ? samples.fallback : [],
    failures: Array.isArray(samples.failures) ? samples.failures : []
  }
})

const graphragObjectSamples = computed(() => {
  const samples = graphragNormalizeObjects.value?.samples ?? {}
  return {
    updates: Array.isArray(samples.updates) ? samples.updates : [],
    fallback: Array.isArray(samples.fallback) ? samples.fallback : [],
    failures: Array.isArray(samples.failures) ? samples.failures : []
  }
})

const aiErrors = computed<AIDomainError[]>(() => {
  const entries: AIDomainError[] = []
  const fallback = copy.value.common.unknownError
  if (ai.value?.embed?.inference?.errors) {
    entries.push(...ai.value.embed.inference.errors.map(err => ({ domain: 'embed', message: err.message || fallback })))
  }
  if (ai.value?.summary?.inference?.errors) {
    entries.push(...ai.value.summary.inference.errors.map(err => ({ domain: 'summary', message: err.message || fallback })))
  }
  if (ai.value?.qa?.inference?.errors) {
    entries.push(...ai.value.qa.inference.errors.map(err => ({ domain: 'qa', message: err.message || fallback })))
  }
  if (aiSmokeSummary.value?.failures?.length) {
    entries.push(
      ...aiSmokeSummary.value.failures.map((failure, index) => ({
        domain: failure.id ? `smoke:${failure.id}` : `smoke-${index + 1}`,
        message: failure.reason || copy.value.common.unknownReason
      }))
    )
  }
  return entries
})

const pagegenCollectSummary = computed(() => {
  const summary = pagegen.value
  if (!summary) return ''
  const collect = summary.collect || {}
  return renderCollectSummary({
    locales: collect.locales ?? 0,
    cacheHitRate: collect.cacheHitRate ?? null,
    parsed: collect.parsedFiles ?? 0,
    total: collect.totalFiles ?? 0,
    disabledLocales: collect.cacheDisabledLocales ?? 0
  })
})

const pagegenWriteSummary = computed(() => {
  const summary = pagegen.value
  if (!summary) return ''
  const write = summary.write || { skippedByReason: {} }
  return renderWriteSummary({
    total: write.total ?? 0,
    written: write.written ?? 0,
    skipped: write.skipped ?? 0,
    failed: write.failed ?? 0,
    hashMatches: write.hashMatches ?? 0
  })
})

const schedulerSummaryText = computed(() => {
  const summary = scheduler.value
  if (!summary) return ''
  return renderSchedulerSummary(summary)
})

const pluginSummary = computed(() => {
  const info = plugins.value
  if (!info) {
    return {
      requested: '',
      ignoreErrors: '',
      disabled: ''
    }
  }
  return renderPluginSummary(info)
})

const aiSmokeStatsText = computed(() => {
  const summary = aiSmokeSummary.value
  if (!summary) return ''
  return renderSmokeStats(summary)
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

watch([telemetry, locale], ([snapshot]) => {
  if (!snapshot) {
    alerts.value = []
    return
  }
  alerts.value = evaluateAlerts(snapshot, locale.value, copy.value)
  for (const alert of alerts.value) {
    const detail = alert.detail ? ` - ${alert.detail}` : ''
    if (alert.level === 'danger') {
      console.error(`[telemetry alert] ${alert.message}${detail}`)
    } else {
      console.warn(`[telemetry warning] ${alert.message}${detail}`)
    }
  }
}, { immediate: true })

function evaluateAlerts(snapshot: TelemetryData, currentLocale: 'zh' | 'en', currentCopy: Copy): AlertItem[] {
  const list: AlertItem[] = []
  const pg = snapshot.build?.pagegen
  const lowCacheMessage = currentLocale === 'en' ? 'Pagegen cache hit rate is low' : 'Pagegen 缓存命中率偏低'
  const parseErrorMessage = currentLocale === 'en' ? 'Pagegen parsing errors detected' : 'Pagegen 解析出现错误'
  const writeFailMessage = currentLocale === 'en' ? 'Pagegen write failures' : 'Pagegen 写入失败'

  if (pg?.collect?.cacheHitRate != null && pg.collect.cacheHitRate < 0.6) {
    list.push({
      level: 'warning',
      message: lowCacheMessage,
      detail: (currentLocale === 'en' ? 'cache hit rate ' : '缓存命中率 ') + formatPercent(pg.collect.cacheHitRate)
    })
  }
  if ((pg?.collect?.parseErrors ?? 0) > 0 || (pg?.collect?.errorEntries ?? 0) > 0) {
    list.push({
      level: 'danger',
      message: parseErrorMessage,
      detail: `parseErrors=${formatNumber(pg?.collect?.parseErrors ?? 0)}, errorEntries=${formatNumber(pg?.collect?.errorEntries ?? 0)}`
    })
  }
  if ((pg?.write?.failed ?? 0) > 0) {
    list.push({
      level: 'danger',
      message: writeFailMessage,
      detail: (currentLocale === 'en' ? 'failed items: ' : '失败条目：') + formatNumber(pg?.write?.failed ?? 0)
    })
  }

  const overview = snapshot.build?.ai?.overview
  if (overview) {
    if ((overview.status || '').toLowerCase() !== 'ok') {
      const severity = overview.status === 'degraded' ? 'warning' : 'danger'
      list.push({
        level: severity,
        message: currentLocale === 'en' ? 'AI build status issue' : 'AI 构建状态异常',
        detail: (currentLocale === 'en' ? 'overall status: ' : '整体状态：') + formatStatus(overview.status)
      })
    }
    for (const [domain, info] of Object.entries(overview.domains || {})) {
      if (!info.status) continue
      const normalized = info.status.toLowerCase()
      if (['fallback', 'empty', 'missing'].includes(normalized)) {
        const severity = normalized === 'fallback' ? 'warning' : 'danger'
        list.push({
          level: severity as 'warning' | 'danger',
          message: currentLocale === 'en'
            ? `AI module ${domain} status ${formatStatus(info.status)}`
            : `AI 模块 ${domain} 状态 ${formatStatus(info.status)}`,
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
        message: currentLocale === 'en' ? 'AI smoke tests failed' : 'AI 冒烟测试失败',
        detail: (currentLocale === 'en' ? 'failed models ' : '失败模型 ') + formatNumber(smokeSummary.failures?.length ?? 0)
      })
    } else if (status === 'skipped') {
      list.push({
        level: 'warning',
        message: currentLocale === 'en' ? 'AI smoke tests skipped' : 'AI 冒烟测试被跳过',
        detail: smokeSummary.reason ?? currentCopy.common.unknownReason
      })
    }
    for (const failure of smokeSummary.failures || []) {
      list.push({
        level: 'danger',
        message: currentLocale === 'en'
          ? `Model ${failure.id ?? currentCopy.common.unknownModel} smoke failed`
          : `模型 ${failure.id ?? currentCopy.common.unknownModel} 冒烟失败`,
        detail: failure.reason ?? currentCopy.common.unknownReason
      })
    }
  }

  const pluginSummary = snapshot.build?.pagegen?.plugins
  if (pluginSummary) {
    for (const result of pluginSummary.results || []) {
      if (result.status === 'failed') {
        list.push({
          level: 'danger',
          message: currentLocale === 'en'
            ? `Plugin ${result.specifier ?? currentCopy.common.unknownModel} failed`
            : `插件 ${result.specifier ?? currentCopy.common.unknownModel} 加载失败`,
          detail: result.error ?? currentCopy.common.unknownError
        })
      } else if (result.status === 'ignored') {
        list.push({
          level: 'warning',
          message: currentLocale === 'en'
            ? `Plugin ${result.specifier ?? currentCopy.common.unknownModel} ignored`
            : `插件 ${result.specifier ?? currentCopy.common.unknownModel} 被忽略`,
          detail: result.reason ?? currentCopy.common.unknownReason
        })
      }
    }
  }

  const graphragIngest = snapshot.build?.graphrag?.ingest
  if (graphragIngest) {
    const skippedTotal = graphragIngest.skipped?.total ?? 0
    if (skippedTotal > 0) {
      list.push({
        level: 'warning',
        message: currentLocale === 'en' ? 'GraphRAG ingest skipped documents' : 'GraphRAG 入图有文档被跳过',
        detail: `${currentLocale === 'en' ? 'skipped' : '跳过'} ${formatNumber(skippedTotal)}`
      })
    }
    const attempted = graphragIngest.write?.attempted ?? 0
    const written = graphragIngest.write?.written ?? 0
    if (!graphragIngest.dryRun && attempted > 0 && written === 0) {
      list.push({
        level: 'danger',
        message: currentLocale === 'en' ? 'GraphRAG ingest produced no writes' : 'GraphRAG 入图未写入任何文档',
        detail: `${currentLocale === 'en' ? 'attempted' : '待写入'} ${formatNumber(attempted)}`
      })
    }
  }

  const graphragExport = snapshot.build?.graphrag?.export
  if (graphragExport && !graphragExport.dryRun) {
    const nodes = graphragExport.totals?.nodes ?? 0
    const recommendations = graphragExport.totals?.recommendations ?? 0
    if (nodes === 0) {
      list.push({
        level: 'warning',
        message: currentLocale === 'en' ? 'GraphRAG export produced empty subgraph' : 'GraphRAG 导出生成空子图',
        detail: `${currentLocale === 'en' ? 'doc' : '文档'} ${graphragExport.docId ?? 'unknown'}`
      })
    }
    if (recommendations === 0) {
      list.push({
        level: 'warning',
        message: currentLocale === 'en' ? 'GraphRAG export returned no recommendations' : 'GraphRAG 导出未生成推荐列表',
        detail: `${currentLocale === 'en' ? 'doc' : '文档'} ${graphragExport.docId ?? 'unknown'}`
      })
    }
  }

  const graphragRetrieve = snapshot.build?.graphrag?.retrieve
  if (graphragRetrieve) {
    const items = graphragRetrieve.totals?.items ?? null
    if (items !== null && items === 0) {
      list.push({
        level: 'warning',
        message: currentLocale === 'en' ? `GraphRAG ${graphragRetrieve.mode ?? 'retrieve'} returned no results` : `GraphRAG ${graphragRetrieve.mode ?? '检索'} 未返回结果`,
        detail: graphragRetrieve.query?.question ?? graphragRetrieve.query?.docId ?? undefined
      })
    }
  }

  return list
}

function renderCollectSummary(ctx: { locales: number; cacheHitRate: number | null; parsed: number; total: number; disabledLocales: number }): string {
  if (locale.value === 'en') {
    const localeWord = ctx.locales === 1 ? 'locale' : 'locales'
    const disabledWord = ctx.disabledLocales === 1 ? 'locale' : 'locales'
    return [
      `${formatNumber(ctx.locales)} ${localeWord}`,
      `cache hit rate ${formatPercent(ctx.cacheHitRate)}`,
      `parsed ${formatNumber(ctx.parsed)}/${formatNumber(ctx.total)} files`,
      `${formatNumber(ctx.disabledLocales)} ${disabledWord} with cache disabled`
    ].join(', ')
  }
  return [
    `${formatNumber(ctx.locales)} 个语言`,
    `缓存命中率 ${formatPercent(ctx.cacheHitRate)}`,
    `已解析 ${formatNumber(ctx.parsed)}/${formatNumber(ctx.total)} 篇`,
    `禁用缓存 ${formatNumber(ctx.disabledLocales)} 个语言`
  ].join('，')
}

function renderWriteSummary(ctx: { total: number; written: number; skipped: number; failed: number; hashMatches: number }): string {
  if (locale.value === 'en') {
    return [
      `written ${formatNumber(ctx.written)} / ${formatNumber(ctx.total)}`,
      `skipped ${formatNumber(ctx.skipped)} (hash matches ${formatNumber(ctx.hashMatches)})`,
      `failed ${formatNumber(ctx.failed)}`
    ].join(', ')
  }
  return [
    `实际写入 ${formatNumber(ctx.written)} / ${formatNumber(ctx.total)}`,
    `跳过 ${formatNumber(ctx.skipped)}（内容哈希命中 ${formatNumber(ctx.hashMatches)}）`,
    `失败 ${formatNumber(ctx.failed)}`
  ].join('，')
}

function renderSchedulerSummary(summary: SchedulerSummary): string {
  if (locale.value === 'en') {
    return `Parallel: ${boolLabel(summary.parallelEnabled)}, default concurrency ${formatNumber(summary.effectiveParallelLimit)} (requested ${formatNumber(summary.requestedParallelLimit)})`
  }
  return `并行：${boolLabel(summary.parallelEnabled)}，默认并发 ${formatNumber(summary.effectiveParallelLimit)}（请求 ${formatNumber(summary.requestedParallelLimit)}）`
}

function renderPluginSummary(info: PluginSummary) {
  const isEnglish = locale.value === 'en'
  const requestedNames = info.requested.length ? joinList(info.requested) : copy.value.pagegen.pluginNone
  const requested = isEnglish
    ? `${copy.value.pagegen.pluginRequestedLabel} ${requestedNames}`
    : `${copy.value.pagegen.pluginRequestedLabel}${requestedNames}`
  const ignoreErrors = isEnglish
    ? `${copy.value.pagegen.pluginIgnoreErrorsLabel} ${boolLabel(info.ignoreErrors)}`
    : `${copy.value.pagegen.pluginIgnoreErrorsLabel}${boolLabel(info.ignoreErrors)}`
  const disabled = isEnglish
    ? `${copy.value.pagegen.pluginDisabledLabel} ${boolLabel(info.disabled)}`
    : `${copy.value.pagegen.pluginDisabledLabel}${boolLabel(info.disabled)}`
  return { requested, ignoreErrors, disabled }
}

function renderSmokeStats(summary: AISmokeRunSummary): string {
  const executed = formatNumber(summary.executed ?? 0)
  const skipped = formatNumber(summary.skipped ?? 0)
  const failed = formatNumber(summary.failed ?? 0)
  if (locale.value === 'en') {
    return `executed ${executed} · skipped ${skipped} · failed ${failed}`
  }
  return `执行 ${executed} · 跳过 ${skipped} · 失败 ${failed}`
}

function formatPercent(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return copy.value.common.notAvailable
  return `${(value * 100).toFixed(digits)}%`
}

function formatStatus(status?: string | null) {
  if (!status) return copy.value.common.unknown
  const normalized = status.toLowerCase()
  return copy.value.statuses[normalized as keyof Copy['statuses']] ?? status
}

function statusClass(status?: string | null) {
  if (!status) return 'status-chip'
  const normalized = status.toLowerCase()
  if (['ok', 'passed', 'success'].includes(normalized)) return 'status-chip status-ok'
  if (['degraded', 'fallback', 'skipped', 'ignored'].includes(normalized)) return 'status-chip status-warn'
  return 'status-chip status-danger'
}

function docLinkFromId(docId?: string | null): string | null {
  if (!docId) return null
  const normalized = docId.replace(/^\/+/, '')
  return withBase(`/${normalized}.html`)
}

function pluginStatusClass(status?: string | null) {
  if (!status) return 'status-chip'
  const normalized = status.toLowerCase()
  if (['ok', 'passed', 'success', 'completed'].includes(normalized)) return 'status-chip status-ok'
  if (['ignored', 'skipped', 'warn', 'warning'].includes(normalized)) return 'status-chip status-warn'
  if (['failed', 'error', 'fatal'].includes(normalized)) return 'status-chip status-danger'
  return 'status-chip'
}

function boolLabel(value?: boolean | null) {
  if (value == null) return copy.value.common.unknown
  return value ? copy.value.common.yes : copy.value.common.no
}

function formatDate(value?: string | null) {
  if (!value) return copy.value.common.unknown
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString(localeTag.value)
}

function formatNumber(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return copy.value.common.notAvailable
  return new Intl.NumberFormat(localeTag.value).format(value)
}

function joinList(values: string[]): string {
  return values.join(copy.value.common.listSeparator)
}

function listToText(values?: string[] | null): string {
  if (!values || !values.length) return copy.value.common.notAvailable
  return joinList(values)
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
.smoke-history {
  margin-top: 1rem;
}
.smoke-history table {
  margin-top: 0.5rem;
}
.smoke-history-empty {
  margin-top: 0.5rem;
  color: rgba(60, 60, 67, 0.6);
}
.graphrag-cards {
  margin-top: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.graphrag-index-link {
  margin: 0.25rem 0 0.75rem;
}
.graphrag-index-link a,
.graphrag-topic-link a {
  font-size: 0.9rem;
  color: var(--vp-c-brand);
}
.graphrag-topic-link {
  margin-left: 0.4rem;
}
.graphrag-card {
  border: 1px solid rgba(60, 60, 67, 0.12);
  border-radius: 8px;
  padding: 1rem;
  background: rgba(60, 60, 67, 0.02);
}
.graphrag-card table {
  margin-top: 0.5rem;
}
.graphrag-list-inline {
  margin: 0.5rem 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}
.graphrag-badge {
  display: inline-block;
  margin-left: 0.35rem;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  background: rgba(255, 193, 7, 0.24);
  color: #ad5f00;
  font-size: 0.75rem;
}
.graphrag-explore-question {
  margin: 0.5rem 0;
  color: rgba(60, 60, 67, 0.85);
  font-style: italic;
}
.graphrag-reasons,
.graphrag-files {
  margin-top: 0.75rem;
}
.graphrag-reasons ul,
.graphrag-files ul {
  padding-left: 1.2rem;
  margin: 0;
}
.graphrag-samples {
  margin-top: 0.75rem;
}
.graphrag-samples h4 {
  margin: 0.5rem 0 0.25rem;
  font-size: 0.95rem;
}
.graphrag-samples ul {
  padding-left: 1.2rem;
  margin: 0;
}
.graphrag-samples code {
  margin-right: 0.25rem;
}
.graphrag-reasons-empty,
.graphrag-empty {
  margin-top: 0.5rem;
  color: rgba(60, 60, 67, 0.6);
}
</style>
