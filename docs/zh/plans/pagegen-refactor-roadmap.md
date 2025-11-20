---
title: Pagegen 优化实施路线图
---

## 概述

Pagegen 当前为串行的单体脚本，承担同步内容、解析元数据、生成聚合页、产出 RSS/Sitemap 以及多语言映射等职责。本路线图围绕“拆分职责、引入增量、并发与配置外置”三大目标，逐步交付可验证的里程碑，确保在重构过程中随时可回退。

## 里程碑与交付物

### 阶段 0 · 基线与守门

- 建立性能基线：记录 `codex run gen` 的执行时间、生成文件数、错误日志。
- 增补脚本监控：在现版 `pagegen` 中加入阶段耗时与处理统计（临时日志即可），为后续对比提供数据。
- 输出验证清单：列出重构过程中需要保持不变的产物（meta、nav manifest、i18n-map、RSS、Sitemap 等）以及关键字段。

### 阶段 1 · 模块拆分与契约定义

- ✅ 拆分目录：按照内容采集、导航聚合、RSS/Sitemap、i18n 映射四个职能拆分为独立模块，并导出明确的输入/输出接口。
- ✅ 新增单元测试：为内容解析、标签归一化、导航 manifest 生成等核心模块补充测试。
- ✅ 保持行为兼容：临时 orchestrator 调用拆分后的模块，产物校验需通过阶段 0 的验证清单。
- ✅ 契约说明：在规划文档中补写 orchestrator 各阶段的输入/输出、依赖与产物描述，并同步至端到端测试的断言项。

### 阶段 2 · 差异化同步与缓存

- ✅ 为 `syncLocaleContent` 增加增量策略（mtime/size 对比），默认仅复制有变更的文件；提供 `--full-sync`/`PAGEGEN_FULL_SYNC=1` 回退全量覆盖。
- ✅ 在内容解析模块中引入缓存层（基于 `mtime` 与文件尺寸），并通过并发池加速 Markdown 读取与 frontmatter 解析；命中率、解析失败会写入 metrics。
- 📊 验证增量效果：对比执行时间、I/O 次数，确保重复运行 `pagegen` 时耗时显著下降。

### 阶段 3 · 批量写入与失败隔离

- ✅ 聚合页、RSS/Sitemap、导航 manifest 的写入改为收集任务后批量执行，统一通过写入队列调度，失败时输出结构化日志。
- ✅ 引入内容哈希：若产物内容未变化，则跳过写入并标记为 `skipped`，并在 metrics 中记录命中情况。
- ✅ 错误守门：针对失败路径输出结构化错误汇总（模块、阶段、语言、目标路径），并在 orchestrator 中落地最小回滚策略。
- ✅ 日志契约：`logStageWarning`/`logStageError` 统一填充 `stage`/`locale`/`target`，`tests/pagegen/integration.test.mjs` 以解析异常、空导航与写入失败场景回归验证 stderr 格式。

### 阶段 4 · 配置外置与 Schema 化

- ✅ 语言配置已迁移至 `schema/locales.json` 并由 `schema/locales.schema.json` 守门；提交后会缓存解析结果到 `.codex/cache/pagegen-locales.cache.json`。
- ✅ 标签别名配置已迁移到 `schema/tag-alias.json` 并提供 `schema/tag-alias.schema.json` + `scripts/validate-tag-alias.mjs` 守门；导航配置已完成迁移。
- ✅ `scripts/pagegen.locales.mjs` 改为读取外置 JSON，运行时自动校验 Schema 并输出详细错误，避免手动维护常量。
- ✅ 运维指南：`README.md` FAQ 与 `AGENTS.md` 第 9 节已说明如何通过配置文件新增语言、切换默认语言与触发校验。
- ✅ 导航配置 Schema (`schema/nav.schema.json`) 与默认配置 (`schema/nav.json`) 已落地，Pagegen nav manifest 与 VitePress 主题均从同一文件加载聚合/固定链接定义；导航结构更新无需改动源码，仅需调整 JSON 并重跑 `npm run gen`。
- ✅ 前端主题（`docs/.vitepress/theme/locales.mjs`、`docs/index.md`、`docs/.vitepress/config.ts`）共享同一份 JSON，Landing 语言卡片与模式切换提示可通过配置直接更新。

### 阶段 5 · Telemetry 与后续拓展

- ✅ 将 `pagegen` 各阶段耗时、处理文件量、命中缓存率写入 telemetry（JSON 输出），并在 CLI 摘要/metrics JSON 中展示缓存命中与写入跳过统计，供 `codex run audit` 或 CI 使用。
- ✅ 预留 Hook：在 orchestrator 中暴露基础事件，并整理 Transformers.js/onnxruntime 的接入评估、回滚策略与脚本清单；AI 构建脚本现具备适配层与占位回退。
- ✅ 统计快照：`npm run stats:diff` 已接入 PR/夜间流程，CI 自动对比 `data/stats.snapshot.json` 并输出 Step Summary + 工件，支持 `--json` 结构化分析。
- ✅ 遥测扩展：`scripts/telemetry-merge.mjs` 现输出带 `schemaVersion` 的 `build.ai` 节点，并将调度/插件概览同步到 metrics（`scheduler`、`plugins`）。
- ✅ 插件化与并行：调度器支持 `--parallel-stage` / `PAGEGEN_PARALLEL_STAGES` 覆盖并发度，`--plugin` / `PAGEGEN_PLUGINS` 动态加载阶段，并提供 `--no-plugins`、`--ignore-plugin-errors` 回退。
- ✅ 模型生命周期：`npm run ai:prepare`、`npm run ai:smoke` 已纳入 `codex run publish` 与 `npm run build`，失败时会写入 manifest 降级信息并回退占位实现。
- ✅ Telemetry 可视化：在站点“观测指标”页落地 scheduler / AI 指标图表，并补齐阈值告警脚本（`docs/.vitepress/theme/components/TelemetryOverview.vue` 支持多语言展示、告警提示与调度/插件摘要）。
- ✅ GraphRAG 遥测基础：`scripts/graphrag/ingest.pipeline.mjs` 将入图统计写入 `data/graphrag-metrics.json`，`scripts/telemetry-merge.mjs` 与前端面板同步渲染 ingest 结果与跳过原因。
- ✅ 插件示例：产出官方 Pagegen 插件与端到端用例，执行 `node --test tests/pagegen/plugin-example.integration.test.mjs` / `tests/pagegen/plugin-cli.integration.test.mjs`，覆盖调度摘要写入、CLI 失败退出与 `--ignore-plugin-errors` 回退链路。
- ✅ 冒烟遥测：将 `ai:smoke` 结果写回 telemetry，生成结构化失败清单并与 `build.ai` 概览打通（telemetry-merge 合并 smoke 事件与 models manifest）。
- ✅ 文档同步：更新 README / AGENTS / 规划文档，汇总并发覆盖、插件加载与 AI 守门的运维回滚案例；新增 GraphRAG 归一化告警在 telemetry 与前端显示。

### 执行顺序建议

1. 已完成 `ai:smoke` 遥测回写与降级联动。
2. 已补齐插件示例的 CLI 覆盖与回退用例。
3. 已上线 GraphRAG 归一化告警（LLM 失败、全量回退、别名缺失）并在 telemetry/前端展示。
4. 后续可进一步细化三元组评测阈值与回滚案例，收敛更多插件场景。

## 风险与应对

- **行为回归**：拆分模块后可能遗漏聚合逻辑；通过阶段 0 验证清单及单元测试守门，必要时保留原脚本作为备份分支。
- **增量同步不一致**：mtime 或哈希比较错误可能导致文件未更新；在引入增量时同时保留全量选项，并在 CI 中增加完整同步轮次。
- **并发解析导致内存峰值**：控制并发池大小，根据文件规模调优，必要时在 `.env` 中加入配置项。
- **配置外置带来破坏性更改**：提供 JSON Schema、预校验脚本以及 lint 流程，避免错误配置进入主分支。

## 回滚策略

- 每个阶段完成后都留存 Git 标签及 `codex run gen` 输出对照；若发现回归，可快速回退至上一稳定版本。
- 增量同步与批量写入均提供显式 CLI flag（如 `--no-cache`、`--full-sync`）以关闭新特性，确保在 CI 或生产环境出现异常时可即时切换回传统行为。

## 当前审查行动（2024-XX）

- **协作约束梳理**：完成 `AGENTS.md`、README 与 `.codex/` 指南的交叉检查，产出 README《协作约束速查》以便快速上手。
- **模块盘点回顾**：`schema/`、`scripts/`、`docs/zh/plans/` 与 `tests/` 的资产现已补写 orchestrator 契约说明与依赖矩阵，确保变更有据可查。
- **Pagegen 深入检查跟进**：端到端测试现覆盖导航/i18n 故障、缓存命中指标与失败回滚路径；`npm run test:pagegen` 已模拟完整生成流程并对 metrics 导出做断言。
- **反馈同步机制**：本节会随巡检推进持续更新，关键结论亦会同步至 `AGENTS.md` 第 10 节，确保多代理协作信息一致。当前迭代聚焦于 `ai:smoke` 遥测回写与插件运维文档的拓展，并在完成后补齐跨文档指引。
