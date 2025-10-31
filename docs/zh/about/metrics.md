---
title: 观测指标
layout: doc
---

> 📚 想了解文章要点？请访问 [常见问答索引](/zh/about/qa.html)。

<script setup lang="ts">
import TelemetryOverview from '../../.vitepress/theme/components/TelemetryOverview.vue'
</script>

<TelemetryOverview />

:::info 指标说明

- `Pagegen` 模块会展示最近一次生成流程的调度开关、并发配置与插件执行结果。
- `GraphRAG` 模块记录入图流水线的文档统计、写入结果与跳过原因，便于追踪图谱构建健康度。
- `AI` 模块会同步嵌入/摘要/问答构建时长、适配器与冒烟测试结论，异常时会在页面顶部触发告警。
- 所有数据均来源于 `docs/public/telemetry.json`，可通过 `npm run build` 或 CI 产出的遥测合并脚本刷新。
:::
