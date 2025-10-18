---
title: Pagegen 深入检查清单
---

目标：基于 `pagegen` 模块化后的现状，梳理各模块的契约、现有守门、遗留风险与后续行动，使后续迭代有明确抓手。

## 汇总表

| 模块 | 主要职责 | 现有守门 | 遗留风险 / TODO | 建议动作 |
| --- | --- | --- | --- | --- |
| `collect.mjs` | 采集内容、解析 frontmatter、生成 meta 索引、缓存 | `tests/pagegen/collect.test.mjs`（缓存命中/解析） | ✅ 解析失败会记录到 metrics，并在 `pagegen.mjs` 运行结束时输出警告；仍可考虑将缓存命中率纳入 CLI 输出 |  |
| `sync.mjs` | 多语言内容增量同步、快照对比 | `tests/pagegen/sync.test.mjs` | ✅ metrics 已包含失败统计和错误列表；`pagegen.mjs` 会在存在失败时输出警告 |  |
| `collections.mjs` | 生成分类/系列/标签/归档聚合 Markdown | `tests/pagegen/collections.test.mjs` | - Markdown 模板固定，无法配置化<br>- 未校验 slug 与 nav manifest 的一致性（依赖后续脚本发现） | 1) 考虑引入配置模板或 allowlist<br>2) 在函数中校验 nav entries 是否命中（可借助 `i18n-registry`） |
| `feeds.mjs` | RSS/Sitemap 输出 | `tests/pagegen/feeds.test.mjs` | - 未记录 feed 输出量在 telemetry 中<br>- RSS/Sitemap 模板未配置化 | 1) 在 `pagegen.mjs` 中汇总 feed 数量<br>2) 视需求将信息抽象到配置（低优先级） |
| `i18n-registry.mjs` | i18n 映射、导航 manifest、标签 canonical | `tests/pagegen/i18n-registry.test.mjs` | - 依赖 nav 配置；缺少配置缺陷的提示（例如 manifestKey 缺失）<br>- 仅记录成功写入，失败原因日志不够详细 | 1) 在加载 nav 配置时验证 manifestKey 是否存在并给出日志<br>2) 增强错误输出（携带聚合类型、slug） |
| `writer.mjs` | 批量写入、内容哈希跳过、错误收集 | `tests/pagegen/writer.test.mjs` | ✅ 结果中已包含 `skippedByReason`，错误对象带 stack；仍可考虑暴露更多指标 | 1) 评估是否需要将 hash 命中率暴露到 CLI 输出 |
| `pagegen.mjs` | orchestrator、metrics 汇总、命令行参数 | - `tests/pagegen/*` 间接覆盖<br>- Metrics JSON（手工检查） | ✅ `collect`/`sync`/`write` summary 已写入 metrics；`tests/pagegen/integration.test.mjs` 覆盖 `--dry-run --metrics-output` 行为 |  |
| `pagegen.locales.mjs` | 读取语言、导航配置并校验 | 现有脚本校验 + `npm run precheck` + `tests/pagegen/locales-config.test.mjs` | ✅ 已覆盖缺字段/Schema 失败场景 | 后续可补缓存命中路径的快照测试 |
| `scripts/validate-*.mjs` | 前置校验 | `npm run precheck` | - 没有单独测试 | 暂视为低优先；可在 CI 中新增“校验脚本必须成功” step |

## 模块细节

### collect.mjs
- **契约**：输入语言配置（含 `contentDir`、`contentFields`），输出 `{ list, meta, stats }`。
- **现状**：具备缓存（mtime/size）与并发解析。
- **缺口**：
  1. 缓存命中率仅通过日志输出，缺少脚本读取的方式。
  2. `gray-matter` 解析失败时未统一捕获（可能直接抛错）。
- **建议**：
  - 在 `collectPosts` catch 块中捕获解析错误并输出 `{ file, error.message }`，同时继续聚合 statistics。
  - 将 stats 写入 `pagegen-metrics.json` 的 `collect` 字段，便于观察。

### sync.mjs
- ✅ metrics 已包含 `failedCopies`、`failedRemovals`、`errors[]`，且 `pagegen.mjs` 会聚合统计；当出现错误时不写入快照，确保下次重试。
- TODO：若需要更友好的日志，可在错误记录中加入提示，例如建议检查权限/磁盘空间。

### collections.mjs / feeds.mjs
- 已有基本守门，但缺少失败场景（例如目录不可写、模板缺字段）的测试。
- 可考虑在 writer 层统一处理失败并写 telemetry。

### i18n-registry.mjs
- 与 nav 配置结合后，需要确保 manifestKey 缺失时能够即时报错。
- Action：在 normalizeAggregates 时，如未找到某 `aggregateKey` 对应的 manifestKey，抛出异常并提示配置文件；测试中模拟不匹配配置。

### writer.mjs
- ✅ 结果已写入 metrics summary，并包含 `skippedByReason` 与错误 stack；后续可考虑暴露更多 CLI 级别的统计。

### pagegen.mjs
- ✅ 已在 metrics 记录 `collect`、`sync`、`write` 的 summary；支持 `--metrics-output`/`PAGEGEN_METRICS_OUTPUT`、`--dry-run`/`PAGEGEN_DRY_RUN=1` 以及 `--metrics-only`（stdout JSON）。
- TODO：提供 `--metrics-only` 或 `--output <file>` 选项，直接输出 JSON 到 stdout。

### 配置加载（pagegen.locales.mjs）
- 虽在运行时使用 Ajv 校验，但缺少单测确保错误信息准确。
- Action：新增 `tests/pagegen/locales-config.test.mjs`，模拟：
  - 缺少 `$schema` 或必填字段；
  - nav 配置缺 manifestKey；
  - 缓存命中/失效逻辑。

## 下一步执行建议

1. **优先处理错误可见性**：对 collect/sync 中的错误增加结构化日志，并将更多 stats 写入 metrics JSON（writer 部分已完成）。
2. **补充配置与集成测试**：`pagegen.locales.mjs` 单测已完成；Pagegen 集成测试已覆盖 dry-run + metrics 输出。
3. **Telemetry 对齐**：扩展 metrics JSON，确保 `gen` 输出可被后续脚本（如监控、CI）消费。

> 完成以上步骤后，请同步更新 `pagegen-refactor-roadmap.md`、`module-inventory.md` 与 AGENTS.md 的进度栏。
