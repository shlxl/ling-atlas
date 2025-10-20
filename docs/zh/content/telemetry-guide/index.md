---
title: 观测指标导览
date: '2025-10-20'
status: published
category_zh: 管理与协作
tags_zh:
  - 遥测
  - 指标治理
  - 运维看板
series: 项目起航手记
series_slug: project-kickoff
slug: telemetry-guide
excerpt: 解读 Ling Atlas 观测指标页的各类数据来源、告警含义与排障流程，帮助维护者快速判断个人向量化知识库的运行健康度。
---

## 页面结构速览

观测指标页由以下四个板块组成：

1. **告警面板**：根据指标阈值动态生成。任何黄色（warning）或红色（danger）条目都意味着需要关注。
2. **PV / 搜索统计**：来源于 `telemetry.tmp.json` 与站点生成时的聚合数据，主要服务于趋势观察。
3. **Pagegen 构建指标**：由 `data/pagegen-metrics.json` 与 CLI 日志写入，记录各阶段耗时、缓存命中率、写入摘要。
4. **AI 构建指标**：由 `data/ai-events/` 的事件与 `data/models.json` 冒烟结果合并而成，展示 embeddings/summary/QA 模块及模型冒烟情况。

> 提示：观测指标组件位于 `docs/.vitepress/theme/components/TelemetryOverview.vue`，如需调整显示逻辑或阈值，可直接修改该组件。

## 告警来源与排障建议

| 告警文案 | 触发条件 | 常见原因 | 排障建议 |
| --- | --- | --- | --- |
| Pagegen 缓存命中率偏低 | `collect.cacheHitRate < 0.6` | 首次运行、内容大规模调整、缓存被清理 | 连续运行两次 `npm run gen`；若仍过低，检查 `data/pagegen-cache.*.json` 是否被覆盖 |
| Pagegen 解析/写入失败 | `parseErrors > 0` / `write.failed > 0` | Frontmatter 无效、target 目录无写权限 | 执行 `npm run precheck` 查看错误详情；确认 `_generated/` 是否有残留锁定文件 |
| AI 构建状态异常 | `overview.status` 为 `degraded`/`missing` | 未运行真实模型、模型冒烟失败 | 若仅占位运行可忽略；若使用真实模型，检查 `data/models.json` 中的失败条目 |
| AI 冒烟测试被跳过 | `smoke.summary.status === 'skipped'` | `AI_RUNTIME=placeholder` 或显式禁用 | 准备接入真实模型时需先清理环境变量，再运行 `npm run ai:prepare && npm run ai:smoke` |

## 常用排障命令一览

```bash
# 重新生成聚合并刷新缓存
npm run gen -- --full-sync

# 快速检查 Frontmatter/Schema
npm run precheck

# 清理 Pagegen 缓存后重跑
rm -f data/pagegen-cache.*.json && npm run gen

# 在 placeholder 与真实模型之间切换
AI_RUNTIME=node AI_EMBED_MODEL="transformers-node:..." npm run ai:prepare
AI_RUNTIME=node npm run ai:smoke
```

## 指标字段详解

### Pagegen 指标

`build.pagegen` 汇总内容如下：

- `collect.summary`：包含 `cacheHitRate`、`parsedFiles`、`errorEntries` 等字段，是判断采集阶段是否工作正常的第一手数据。
- `write.summary`：观察 `hashMatches`（内容无变更时的跳过数）与 `failed`（写入失败数），配合 CLI 日志可以快速定位问题文件。
- `scheduler` / `plugins`：记录并发开关、阶段覆写（`--parallel-stage`）以及插件加载结果，是调度治理的重要依据。

### AI 指标

`build.ai` 由事件日志与模型 manifest 拼装：

- 每个域（`embed`、`summary`、`qa`）包含适配器名称、批次数量、输出条数、成功率、错误列表。
- `overview` 聚合整体状态与 `smoke` 摘要，当冒烟失败时会自动把整体状态降级为 `degraded`。
- `smoke.models` 暴露每个模型的执行结果，方便精准定位失败原因。

## 从告警恢复为“正常”状态的路线

1. **补齐正式内容 → 生成聚合**  
   - 在 `docs/zh/content/**` 写入文章，设置 `status: published`。  
   - 运行 `npm run gen`，验证 `_generated/` 中的导航/标签页无死链。

2. **接入真实模型 → 通过冒烟**  
   - 配置 `AI_RUNTIME`、`AI_EMBED_MODEL`、`AI_SUMMARY_MODEL` 等环境变量。  
   - 执行 `npm run ai:prepare && npm run ai:smoke`，确保 `data/models.json` 的 `smoke.status` 为 `passed`。

3. **复查 Telemetry 页面**  
   - 确认告警数量下降，状态由 `missing`/`skipped` 转为 `ok`/`passed`。  
   - 如需进一步可视化，可把 `telemetry.json` 导出到外部 BI 或生成历史曲线。

## 常见疑问

- **为什么 Pagegen 缓存命中率仍旧是 0%？**  
  首次运行后缓存就位，第二次执行 `npm run gen`，命中率应该明显提升；若仍为 0%，检查是否每次都使用了 `--full-sync` 或缓存文件被持续清理。

- **占位模式下的告警需要忽略吗？**  
  可以。告警主要用于提醒“当前缺少真实向量构建”。当准备上线真实模型时，再关注错误即可。

- **能否自定义告警阈值？**  
  可以直接在 `TelemetryOverview.vue` 中修改 `evaluateAlerts` 函数，或新增 `Alert` 配置 JSON，后续让脚本读取动态阈值。

通过本文档，你可以快速理解每条告警背后的逻辑，并定位到相应脚本或配置。随着更多内容与模型接入，建议定期更新此导览，确保新的指标或阈值被完整记录。
