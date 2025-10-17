---
title: Pagegen 模块拆分草案（阶段 1）
---

## 目标

在保持 `npm run gen` 行为兼容的前提下，将现有单体脚本拆分为若干可测试、可替换的模块，并规划目录结构与测试策略，为后续增量同步与缓存优化打基础。

## 拟定模块

| 模块 | 说明 | 输出 |
| --- | --- | --- |
| `collectPosts` | 负责读取指定语言的内容目录，解析 frontmatter 与正文，生成标准化 `Post` 列表与分类索引 | `{ list: Post[], meta: TaxonomyIndex }` |
| `syncContent` | 处理跨语言内容镜像，未来扩展增量复制或 `--full-sync` | `void` |
| `buildCollections` | 依据 `meta` 写入分类/系列/标签/归档的 Markdown 聚合页 | Promise |
| `emitFeeds` | 输出 RSS/Sitemap，拆分成 `generateRss`、`generateSitemap` | Promise |
| `i18nRegistry` | 维护 i18n 对应关系、taxonomy 映射、标签归一，最终输出 `i18n-map` 与导航 manifest JSON | API |
| `telemetry` | 统一阶段耗时与统计信息，后续可输出 JSON | `recordStage(name, metrics)` |

建议在 `scripts/pagegen/` 下按照功能拆分文件，如：

- `scripts/pagegen/index.mjs`（orchestrator）
- `scripts/pagegen/collect.mjs`
- `scripts/pagegen/sync.mjs`
- `scripts/pagegen/collections.mjs`
- `scripts/pagegen/feeds.mjs`
- `scripts/pagegen/i18n.mjs`
- `scripts/pagegen/telemetry.mjs`

## 测试策略

- 引入 `vitest` 或 Node 18+ 原生 `node:test`，完成以下单元测试（✅ 当前使用 `node:test` 已覆盖）：
  - `collectPosts`：模拟 Markdown 输入，验证过滤 draft、slug 归一化、日期解析等逻辑。
  - `buildCollections`：基于 mock 文件系统（或 `memfs`）检查生成的 Markdown 内容。
  - `i18nRegistry`：验证多语言映射合并、标签别名处理、导航 manifest 的输出。
  - `syncLocaleContent` / `generateRss` / `generateSitemap`：补充同步与 Feed 产出守门，支持后续增量与幂等验证。
- 使用 fixture 目录（`tests/fixtures/pagegen/*`）存放最小化内容样本，保证测试可重复。
- 在 CI `npm run check` 中加入 `npm run test:pagegen`（新脚本），确保模块化后仍受测试管控。

## 增量同步设计（阶段 2 筹划）

- 采用 “源文件 mtime + size” 作为轻量特征，将每轮同步时的快照写入 `data/pagegen-sync.<locale>.json`。
- 新增 `--full-sync` CLI 选项（或 `PAGEGEN_FULL_SYNC=1` 环境变量）覆盖缓存，确保回退路径。
- 同步流程：枚举源目录 → 读取记录文件 → 比较特征，针对新增/变更文件执行 `fs.cp`，对已删除文件执行 `fs.rm`。
- 执行结果写入 metrics（沿用 `data/pagegen-metrics.json`），记录 `copied`/`skipped`/`removed` 数量，便于后续观察增量效果。
- 测试覆盖：构建临时目录，模拟新增/更新/删除场景，校验仅触发必要的复制与删除操作。

## 内容解析缓存与并发（阶段 2 筹划）

- 缓存键：`<locale>:<relativePath>`，值包含 `mtimeMs`、`size`、可选 `checksum` 与解析结果（meta、excerpt）。
- 缓存文件：`data/pagegen-cache.<locale>.json`，保留最近 N 条，命中率与 miss 次数写入 `data/pagegen-metrics.json`。
- 并发解析：使用受控并发池（默认 8，可通过 `PAGEGEN_CONCURRENCY` 覆盖）读取并解析 Markdown，避免单线程 I/O 阻塞。
- CLI 控制：提供 `--no-cache` 或 `PAGEGEN_DISABLE_CACHE=1` 关闭缓存；`--full-sync` 下仍可选择保留缓存。
- 删除/失效策略：当源文件缺失或 `mtime/size` 变更时触发重新解析，旧缓存条目标记为过期并在写回时清理。
- 测试覆盖：构造最小 fixture，验证缓存命中、失效与并发顺序不会影响产物排序或 meta 字段稳定性。

## 批量写入与失败隔离（阶段 3 筹划）

- 写入目标：聚合页 Markdown、RSS、Sitemap、导航 manifest、i18n-map 等，统一收集为任务队列。
- 内容哈希：对写入前后的内容计算 SHA-1（或更轻量的 murmur/hash），无变化则跳过落盘，记录 `skipped` 统计。
- 执行策略：使用 `Promise.allSettled` 并发执行写入，失败时收集 `{ stage, locale, target, error }`，汇总输出并在 metrics 中记录。
- 回退选项：保持 CLI 开关 `--no-batch` 或 `PAGEGEN_DISABLE_BATCH=1`，在出错时回退到串行写入。
- 指标记录：每次运行将 `writeTasks`、`written`、`skipped`、`failed` 写入 `data/pagegen-metrics.json`，便于观测命中率。
- 测试覆盖：模拟写入失败（例如 mock `fs.writeFile` 抛错），验证错误收集与回退逻辑；对哈希跳过进行快照测试。

## 操作步骤

1. 创建 `scripts/pagegen/` 子目录，实施 orchestrator 与模块拆分（保留旧脚本备份）。
2. 重新导出公共 API（如 `getPreferredLocale` 等），保证外部调用不受影响。
3. 更新 `npm run gen` 指向新的入口（或过渡期在旧脚本中转调用）。
4. 添加测试依赖与脚本（若采用 `vitest` 可只引入轻量配置）。
5. 将阶段 1 结果同步至 `AGENTS.md` 的路线图部分，说明模块化完成情况与测试覆盖面。

## 风险提示

- 拆分过程中注意处理路径常量复用，避免多个模块各自计算路径造成偏差。
- 文件系统操作需考虑后续增量同步的可扩展性，在接口中预留 `options` 参数。
- 新增测试框架可能影响构建时间，需评估在 CI 中的执行策略（可只在增量脚本触发）。
