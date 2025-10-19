---
title: Pagegen 深入检查清单
---

目标：基于 `pagegen` 模块化后的现状，梳理各模块的契约、现有守门、遗留风险与后续行动，使后续迭代有明确抓手。

## 汇总表

<!-- markdownlint-disable MD013 -->
| 模块 | 主要职责 | 现有守门 | 遗留风险 / TODO | 建议动作 |
| --- | --- | --- | --- | --- |
| `collect.mjs` | 采集内容、解析 frontmatter、生成 meta 索引、缓存 | `tests/pagegen/collect.test.mjs`（缓存命中/解析） | ✅ 解析失败与缓存命中率已写入 metrics；仍缺少 CLI 或 telemetry 层面的可读汇总 | 继续评估是否在 `pagegen.mjs` stdout/metrics 中追加命中率摘要 |
| `sync.mjs` | 多语言内容增量同步、快照对比 | `tests/pagegen/sync.test.mjs` | ✅ metrics 已包含失败统计和错误列表；`pagegen.mjs` 会在存在失败时输出警告 | 如需更多上下文，可在错误日志中加入路径、权限提示（低优先） |
| `collections.mjs` | 生成分类/系列/标签/归档聚合 Markdown | `tests/pagegen/collections.test.mjs`、`tests/pagegen/collections.failures.test.mjs` | Markdown 模板仍固定；nav manifest 命中依赖后续脚本发现 | 评估是否允许自定义模板/排序；与 `i18n-registry` 联动进行 slug 命中校验 |
| `feeds.mjs` | RSS/Sitemap 输出 | `tests/pagegen/feeds.test.mjs` | - 未记录 feed 输出量在 telemetry 中<br>- RSS/Sitemap 模板未配置化 | 在 `pagegen.mjs` 中汇总 feed 数量（已纳入 metrics.summary）；模板配置仍列为低优先 |
| `i18n-registry.mjs` | i18n 映射、导航 manifest、标签 canonical | `tests/pagegen/i18n-registry.test.mjs` | - 依赖 nav 配置；缺少 manifestKey 缺失的高亮提示<br>- 错误日志仍偏粗糙 | 在加载 nav 配置时直接抛出 manifestKey 缺失异常；补充包含 locale/slug 的错误详情 |
| `writer.mjs` | 批量写入、内容哈希跳过、错误收集 | `tests/pagegen/writer.test.mjs` | ✅ 结果中已包含 `skippedByReason`，错误对象带 stack；仍可考虑暴露更多指标 | 1) 评估是否需要将 hash 命中率暴露到 CLI 输出 |
| `pagegen.mjs` | orchestrator、metrics 汇总、命令行参数 | - `tests/pagegen/*` 间接覆盖<br>- Metrics JSON（手工检查） | ✅ `collect`/`sync`/`write` summary 已写入 metrics；`tests/pagegen/integration.test.mjs` 覆盖 `--dry-run --metrics-output` 行为 | TODO：整理 orchestrator 契约文档 + 端到端集成测试；补充错误日志（含阶段/locale/target） |
| `pagegen.locales.mjs` | 读取语言、导航配置并校验 | 现有脚本校验 + `npm run precheck` + `tests/pagegen/locales-config.test.mjs` | ✅ 已覆盖缺字段/Schema 失败场景 | 后续可补缓存命中路径的快照测试 |
| `scripts/validate-*.mjs` | 前置校验 | `npm run precheck` | - 没有单独测试 | 暂视为低优先；可在 CI 中新增“校验脚本必须成功” step |
<!-- markdownlint-enable MD013 -->

## 模块细节

### orchestrator 契约概览

Pagegen 主脚本按照以下顺序 orchestrate 各阶段，并在 `data/pagegen-metrics.json` 写入对应摘要：

1. **syncLocaleContent**：按语言同步 `docs/<locale>/content` → `docs/<locale>/content` / `docs/content`，支持快照缓存、全量/增量模式，输出复制/删除统计。
2. **collect**：逐语言解析 Markdown（带缓存与并发），生成文章列表与 `meta` 聚合索引；解析/缓存命中率、错误都会写入 metrics。
3. **meta 写入**：将 `meta.<locale>.json` 写入 `docs/<locale>/_generated/`，并通过 writer 统一管理写入任务。
4. **collections**：基于 `meta` 生成分类 / 系列 / 标签 / 年份聚合 Markdown，返回 nav entries，供后续 i18n registry 使用。
5. **feeds**：输出多语言 RSS 与 Sitemap（受 `SITE_ORIGIN`、首选语言影响），同时记录条目数量。
6. **i18n + nav**：注册跨语言映射，写入 `docs/public/i18n-map.json` 与 `nav.manifest.<locale>.json`（同步输出到 `docs/<locale>/_generated`、`docs/public`）。
   metrics 中新增 `nav.summary` 汇总各语言的 categories / series / tags / archive 数量；若某语言全部为空会在 CLI 发出警告，提醒检视配置或聚合产物。
7. **writer.flush**：集中写盘并收集错误，若存在失败会带 stage/locale/target 详细信息，脚本立即退出。
8. **metrics**：汇总阶段耗时、collect/sync/feed/nav/write 摘要，追加到 `data/pagegen-metrics.json`，并允许通过 `--metrics-output` 或 `--metrics-only` 导出 JSON。

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

1. **Orchestrator 契约与日志**：整理 `pagegen.mjs` 阶段契约文档，补充端到端集成测试，并在错误输出中追加阶段/locale/target 等上下文。
2. **导航/i18n 失败显式化**：在 `i18n-registry` 与 nav 校验阶段直接抛出 manifestKey/slug 命中异常，并为错误日志补足 locale/slug 信息。
3. **统计与监控**：在 CLI 或 telemetry 中暴露 collect/cache 命中率、writer hash 命中等指标；评估 stats snapshot 的对比机制（nightly diff / 报警）。
4. **模板与可配置性**（次优先）：研判 collections/feeds Markdown 模板是否需要抽象化，避免未来多主题场景重新实现。

> 完成以上步骤后，请同步更新 `pagegen-refactor-roadmap.md`、`module-inventory.md` 与 AGENTS.md 的进度栏。
