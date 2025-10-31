---
title: Observability Metrics
titleTemplate: :title
layout: doc
---

> 📚 Want the distilled highlights? See the [FAQ index](/en/about/qa.html).

<script setup lang="ts">
import TelemetryOverview from '../../.vitepress/theme/components/TelemetryOverview.vue'
</script>

<TelemetryOverview locale="en" />

:::info Metrics at a glance

- The **Pagegen** section highlights the latest run’s scheduler settings, concurrency overrides, and plugin execution results.
- The **GraphRAG** section captures ingestion statistics (processed docs, written batches, skip reasons) so you can monitor the graph pipeline.
- The **AI** section surfaces embedding/summary/QA build timings, adapter metadata, and smoke-test verdicts; alerts show up at the top when anomalies occur.
- All numbers come from `docs/public/telemetry.json`, which is refreshed by `npm run build` or the CI telemetry merge script.
:::
