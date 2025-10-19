---
title: Pagegen 深入检查清单
---

目标：基于 `pagegen` 模块化后的现状，梳理各模块的契约、现有守门、遗留风险与后续行动，使后续迭代有明确抓手。

## 汇总表

<!-- markdownlint-disable MD013 -->
| 模块 | 主要职责 | 现有守门 | 遗留风险 / TODO | 建议动作 |
| --- | --- | --- | --- | --- |
| `collect.mjs` | 采集内容、解析 frontmatter、生成 meta 索引、缓存 | `tests/pagegen/collect.test.mjs`（缓存命中/解析） | ✅ 解析失败与缓存命中率写入 metrics，CLI 亦输出 cache hit/miss 摘要 | 关注长期命中率走势，必要时追加慢查询日志 |
| `sync.mjs` | 多语言内容增量同步、快照对比 | `tests/pagegen/sync.test.mjs` | ✅ metrics 已包含失败统计和错误列表；`pagegen.mjs` 会在存在失败时输出警告 | 如需更多上下文，可在错误日志中加入路径、权限提示（低优先） |
| `collections.mjs` | 生成分类/系列/标签/归档聚合 Markdown | `tests/pagegen/collections.test.mjs`、`tests/pagegen/collections.failures.test.mjs` | ✅ 模板/排序由 `schema/collections.templates.json` 配置，可按语言覆盖；若缺失则回退默认 Markdown | 继续观察自定义模板在多语言场景下的落盘表现，并补充复杂排序/占位符示例 |
| `feeds.mjs` | RSS/Sitemap 输出 | `tests/pagegen/feeds.test.mjs` | ✅ 模板改由 `schema/feeds.templates.json` 驱动，支持语言映射与 fallback；CLI/metrics 记录条目与限流标记 | 继续观察复杂模板与多主题需求，必要时补写示例 |
| `i18n-registry.mjs` | i18n 映射、导航 manifest、标签 canonical | `tests/pagegen/i18n-registry.test.mjs` | ✅ nav manifest/manifestKey 缺失会即时抛错并带 locale/slug；错误日志复用统一上下文 | 继续观察导航配置调整带来的回归，必要时追加快照 |
| `writer.mjs` | 批量写入、内容哈希跳过、错误收集 | `tests/pagegen/writer.test.mjs` | ✅ 结果中已包含 `skippedByReason`，错误对象带 stack；仍可考虑暴露更多指标 | 1) 评估是否需要将 hash 命中率暴露到 CLI 输出 |
| `pagegen.mjs` | orchestrator、metrics 汇总、命令行参数 | - `tests/pagegen/*` 间接覆盖<br>- Metrics JSON（手工检查） | ✅ `collect`/`sync`/`write` summary 已写入 metrics；端到端测试覆盖 `--metrics-only`、写入失败与 warn/error 日志上下文 | 持续观察 metrics stdout/metrics-only 的使用反馈，必要时再扩展导出选项 |
| `pagegen.locales.mjs` | 读取语言、导航配置并校验 | 现有脚本校验 + `npm run precheck` + `tests/pagegen/locales-config.test.mjs` | ✅ 已覆盖缺字段/Schema 失败场景 | 后续可补缓存命中路径的快照测试 |
| `scripts/validate-*.mjs` | 前置校验 | `npm run precheck` | - 没有单独测试 | 暂视为低优先；可在 CI 中新增“校验脚本必须成功” step |
<!-- markdownlint-enable MD013 -->

## 模块细节

### orchestrator 契约概览

Pagegen 主脚本以串行 orchestrator 形式驱动各阶段，并在 `data/pagegen-metrics.json` 追加快照。每个阶段的输入、依赖与产出约定如下：

<!-- markdownlint-disable MD013 -->
| 阶段 | 前置 / 依赖 | 主要输入 | 产物 / 副作用 | Metrics 摘要键 | 失败处理与回滚 |
| --- | --- | --- | --- | --- | --- |
| `syncLocaleContent` | 语言配置、内容快照 | `schema/locales.json`、`docs/<locale>/content` | 增量同步到 `docs/<locale>/content` / `docs/content`，更新 `data/pagegen-sync.<locale>.json` | `sync.summary`（复制/删除统计、失败数） | 捕获失败的文件操作并保留原快照，返回 `errors[]`，CLI 以 `warn` 提示 |
| `collect` | 已同步内容 | `docs/<locale>/content/index.md` | 解析文章列表、`meta` 索引、缓存写入 `data/pagegen-cache.<locale>.json` | `collect.summary`（命中率、解析错误） | 解析失败记录在 `stats.errors[]`，后续阶段可见；命中缓存则跳过 |
| `meta` 写入 | `collect` 结果 | `posts.meta` | 生成 `docs/<locale>/_generated/meta.<locale>.json` | 计入 `write.summary`（写入/跳过数） | 统一通过 writer 计划写入；直写模式失败会抛出带 stage/locale/target 的异常 |
| `collections` | `meta` | `posts.meta`、导航配置 | 生成分类/系列/标签/归档 Markdown，返回导航条目 | `nav.summary` 的基础数据 | 任何生成失败会抛出异常，阻断后续阶段 |
| `feeds` (`rss`/`sitemap`) | `collect` 列表、首选语言 | `posts.list`、`SITE_ORIGIN` | `docs/public/<rss\|sitemap>` 及 locale 下 `_generated` RSS/Sitemap | `feeds.summary`（条目数、限流状态） | 写入失败会携带 locale/target 抛出异常 |
| `i18n-map` / `nav-manifest` | `collections` 产出的导航条目 | `registry.getI18nMap()`、导航 manifest payload | 写入 `docs/public/i18n-map.json`、`docs/<locale>/_generated/nav.manifest.<locale>.json` 与 `docs/public/nav.manifest.<locale>.json` | `nav.summary`（各语言聚合数） | 缺失聚合时在 CLI 发出 `warn`；写入失败同样携带上下文抛出 |
| `flushWrites` | writer 队列 | batched file tasks | 批量落盘 / 跳过 | `write.summary`（written/skipped/failed） | 任何任务失败立即终止流程，错误对象带 stage/locale/target |
| `metrics append` | 前述阶段成功 | 阶段耗时、阶段 metrics | 追加到 `data/pagegen-metrics.json` 或 stdout（`--metrics-only`） | 整体 `totalMs`、`stageSummary` | 写入失败降级为 `warn`，不会终止主流程 |
<!-- markdownlint-enable MD013 -->

> CLI 通过 `--metrics-only` 输出单条 JSON（无文件写入），`--metrics-output` 追加到指定文件；两者均复用上述契约。

#### 错误与警告日志格式

- 失败日志统一输出为：`[pagegen] error stage=<stage> locale=<locale> target=<target>: <message>`，用于 CI 解析与可观测性聚合。
- 非致命告警统一输出为：`[pagegen] warn stage=<stage> locale=<locale> target=<target>: <message>`，例如导航聚合为空或 metrics 汇总出现异常指标。
- writer 产生的错误会带上原任务的 `stage`/`locale`/`target`，便于与 metrics 中的错误条目交叉定位。

### 最终版阶段契约摘要

- orchestrator 全量阶段均通过 `measureStage` 输出统一的 stage 名称，确保 metrics 与日志共享上下文；`resolveLogContext` 会优先读取错误对象中的 `stage`/`locale`/`target`，其次回退到阶段默认值。
- `[pagegen] warn` 与 `[pagegen] error` 均由 `logStageWarning`/`logStageError` 统一发出，默认填充 locale=`manifestLocale`、target=`navManifestPath` 等真实路径，避免出现 `n/a`。
- `tests/pagegen/integration.test.mjs` 新增“空导航 + 解析异常”干预用例，验证 dry-run 模式下的 warn 日志仍带完整阶段上下文；原有写入失败用例也同步断言 error 日志上下文格式。
- Metrics 汇总阶段会在解析或同步失败时回写 `collect`、`sync` 摘要，并透过结构化 warn 日志提示具体指标，确保 CI 可直接解析。

#### 端到端守门补充

- `tests/pagegen/integration.test.mjs` 新增两个场景：
  1. `--metrics-only` 跑完整 orchestrator，解析 stdout JSON 并校验阶段摘要；
  2. 元数据文件被设为只读时，验证 `[pagegen] error stage=meta locale=… target=…` 的日志格式，以及 metrics 文件不会落盘。
- `tests/pagegen/nav-manifest.integration.test.mjs` 复用最小多语言夹具，确保 nav/i18n 产物与 metrics 汇总契合上述契约。

### collect.mjs

- **契约**：输入语言配置（含 `contentDir`、`contentFields`），输出 `{ list, meta, stats }`。
- **现状**：具备缓存（mtime/size）与并发解析，解析失败与缓存命中率写入 metrics/CLI 摘要。
- **后续观察**：可继续在长期运行中记录慢解析文件名单，为后续调优提供数据。

### sync.mjs

- ✅ metrics 已包含 `failedCopies`、`failedRemovals`、`errors[]`，且 `pagegen.mjs` 会聚合统计；当出现错误时不写入快照，确保下次重试。
- 后续可按需在错误记录中加入环境提示（如权限/磁盘空间），目前标记为低优先。

### collections.mjs / feeds.mjs

- ✅ `schema/collections.templates.json` + `schema/collections.templates.schema.json` 描述各聚合类型的 Markdown 模板、排序与占位符：
  - `defaults` 块定义通用 `markdown`、`item`、`itemSeparator`，并允许通过 `placeholders` 映射（`fields`/`format`/`whenEmpty`）重写日期、摘要等片段；
  - `aggregates.<type>` 可以按 `category`/`series`/`tag`/`archive` 覆盖局部配置；
  - `sort` 数组接受 `{ fields: ['date', 'updated'], order: 'desc' }`，写入前会复制并排序，未配置时保持原顺序。
- ✅ `scripts/pagegen/collections.mjs` 会根据语言的 `collectionsTemplate` 键加载模板；找不到模板时自动回退至旧版 `mdList` 行为，避免阻塞生成。
- ✅ 新增 `scripts/validate-collections-template.mjs` 校验模板 Schema，并比对 `schema/locales.json` 的引用是否存在；已通过 `npm run config:collections` 接入 `precheck`。
- ✅ 单测覆盖：
  - `tests/pagegen/collections.test.mjs` 验证模板排序、占位符、fallback 与临时注册的自定义模板；
  - `tests/pagegen/collections.failures.test.mjs` 新增错误模板抛错用例，确保缺少必填字段时能立即反馈。
- `schema/feeds.templates.json` + `schema/feeds.templates.schema.json` 描述 channel/item 模板、条目限制等配置，可按语言通过 `feedsTemplate` 覆盖；缺失模板会回退默认实现。
- 配套校验命令已接入 `npm run precheck`，确保模板引用有效；`tests/pagegen/feeds.test.mjs` 覆盖自定义模板、限流、fallback 与错误场景。

#### collections 模板格式速览

```jsonc
{
  "$schema": "./collections.templates.schema.json",
  "templates": {
    "zh-default": {
      "defaults": {
        "markdown": "---\\ntitle: {title}\\n---\\n\\n{items}\\n",
        "item": "- [{title}]({path}){dateSuffix}{updatedSuffix}\\n  {excerptBlock}",
        "itemSeparator": "\\n\\n",
        "placeholders": {
          "dateSuffix": { "fields": ["date", "updated"], "format": " · {value}" },
          "updatedSuffix": { "fields": ["updated"], "format": "（更:{value}）", "whenEmpty": "" },
          "excerptBlock": { "fields": ["excerpt"], "format": "> {value}", "whenEmpty": "" }
        },
        "sort": [
          { "fields": ["date", "updated"], "order": "desc" },
          { "fields": ["title"], "order": "asc" }
        ]
      }
    }
  }
}
```

- `collectionsTemplate` 会在 `schema/locales.json` 内声明语言到模板键的映射，例如 `zh` → `zh-default`、`en` → `en-default`；也可以通过 `__test__.registerTemplate()` 在单测中注入临时模板。
- `renderCollectionWithTemplate` 会注入 `{count, index, locale}` 等上下文，便于模板追加统计信息或本地化提示；占位符未命中时会使用 `whenEmpty` 回退。
- 自定义模板在缺少 `markdown`/`item` 时会抛出 `Invalid collections template`，确保问题尽早浮现。

### i18n-registry.mjs

- ✅ 已与导航配置联动：manifestKey 缺失或未初始化会即时抛错，并携带 locale/slug/manifestKey 便于定位。
- 后续可继续扩展快照测试，覆盖导航配置变动后的 diff 提示。

### writer.mjs

- ✅ 结果已写入 metrics summary，并包含 `skippedByReason` 与错误 stack；后续可考虑暴露更多 CLI 级别的统计。

### pagegen.mjs

- ✅ 已在 metrics 记录 `collect`、`sync`、`write` 的 summary；支持 `--metrics-output`/`PAGEGEN_METRICS_OUTPUT`、`--dry-run`/`PAGEGEN_DRY_RUN=1`、`--metrics-only` 与 `--metrics-stdout` 直接输出 JSON。
- 后续可考虑为 metrics 追加版本号或 schema 说明，方便外部工具解析。

### 配置加载（pagegen.locales.mjs）

- Ajv 校验与运行时缓存已上线，仍可考虑新增 `tests/pagegen/locales-config.test.mjs` 覆盖缺字段、缓存命中等路径。

## 下一步执行建议

1. **AI 遥测事件落地**：扩展 `scripts/embed-build.mjs`、`scripts/summary.mjs`、`scripts/qa-build.mjs` 输出 `ai.*` 事件，`scripts/telemetry-merge.mjs` 汇总为 `build.ai`，并补充集成测试。
2. **Orchestrator 插件化/并行调度**：实现插件注册与可配置并发，更新本文件与路线图的阶段契约，保留回退 flag。
3. **模型生命周期守门**：实现 `scripts/ai/prepare.mjs`、`scripts/ai/smoke.mjs` 与 `npm run ai:prepare`/`ai:smoke`，确保模型下载、校验与最小推理通过。
4. **协作手册同步**：更新 README、AGENTS、`docs/zh/plans/` 的操作指南，补充 feeds/SEO/AI 配置的回滚范例与常见故障排查。

> 完成以上步骤后，请同步更新 `pagegen-refactor-roadmap.md`、`module-inventory.md` 与 AGENTS.md 的进度栏。
