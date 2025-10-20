---
title: Ling Atlas 项目缘起与系统全貌
date: '2025-10-20'
status: published
category_zh: 管理与协作
tags_zh:
  - 项目治理
  - 知识管理
  - 自动化运维
series: 项目起航手记
series_slug: project-kickoff
slug: project-overview
excerpt: 全面梳理 Ling Atlas 的愿景、演进路线与当前落地能力，帮助后续贡献者快速理解“个人向量化知识库”的系统边界与协作模式。
---

## 为什么要做 Ling Atlas？

Ling Atlas 最初诞生于一次“AI 自驱动知识库”的头脑风暴：  

- **动机**：希望把个人笔记、项目记录、运维指引合并到同一套可回滚、可编排的工作流里，避免再掉进“分散文档 + 无人维护”的老坑。  
- **约束**：仓库必须可由 Agent/脚本全流程托管，人工只需决策内容与验收结果。  
- **目标**：构建一个既适合单人维护、又能逐步演进到团队协作的现代化知识库工程。

这意味着系统在设计之初就围绕三条红线展开：

1. **协议优先**：所有关键能力（内容采集、导航、AI 构建等）都要有明确的 JSON Schema、CLI 入口与回退策略，保证“个人向量化知识库”的核心资产可长期维护。
2. **自动化友好**：从 init 到 publish 必须串联脚本化流程，任何新增能力都要能在 CI/CLI 中一键触发，让个人作者可以专注内容而非维护细节。
3. **可观测**：生成脚本、AI 管线、调度插件都需要留有指标出口，确保向量知识库的构建质量和检索体验可持续优化。

## 系统全貌一览

| 模块 | 关键职责 | 当前状态 |
| --- | --- | --- |
| **内容组织** | `docs/zh\|en/content/**` 按语言/slug 管理文章，Frontmatter 由 `schema/frontmatter.schema.json` 守门，确保向量化前的元数据规范 | ✅ 已启用；示例文档已清理，等待正式内容补齐 |
| **生成管线（Pagegen）** | `scripts/pagegen.mjs` orchestrator + 模块化子阶段（collect/sync/feeds/i18n/writer），为向量化前的静态聚合与检索索引提供基础 | ✅ 模块化完成，支持缓存、并发、批量写入与阶段指标 |
| **调度插件体系** | `pagegen` 通过 `--plugin` / `PAGEGEN_PLUGINS` 加载扩展，可在生成阶段输出向量化摘要或自定义指标；示例位于 `scripts/pagegen/plugins/example.mjs` | ✅ 已上线示例及测试，可写出调度摘要 |
| **AI 构建管线** | `npm run ai:prepare` / `npm run ai:smoke` / `npm run ai:all` 负责模型准备、冒烟、占位产物，为个人向量库生成 embeddings/summaries/QA | ✅ 默认使用 placeholder，可随时替换为真实模型 |
| **遥测与告警** | `scripts/telemetry-merge.mjs` 聚合 PV、搜索、Pagegen 与 AI 指标；“观测指标”页统一展示，帮助监控向量构建质量 | ✅ Telemetry 页面已接入 scheduler / plugin / smoke 摘要，并附最小告警规则 |
| **发布流程** | `codex run publish` 串联 tags → precheck → ai:prepare → ai:smoke → gen → build → push，保证向量资产发布前完成守门 | ✅ 实际运行可复现；若冒烟失败会自动降级并记录原因 |

## 项目迭代时间线（精简版）

1. **脚手架落地（阶段 0）**  
   - 引入 VitePress + 多语言目录结构。  
   - 把内容与聚合产物区分为 `content/` 与 `_generated/`，方便脚本管理。

2. **Pagegen 拆分（阶段 1~3）**  
   - 拆出 `collect.mjs`、`sync.mjs`、`feeds.mjs`、`writer.mjs` 等模块，并补齐单元/集成测试。  
   - 引入缓存、增量同步、批量写入与内容哈希跳过，生成耗时显著降低。

3. **配置与 Schema 化（阶段 4）**  
   - 把语言、导航、标签别名迁移到 `schema/*.json`，执行前强制校验。  
   - README 与 AGENTS 同步记录 Playbook，确保新协作者知道怎么改配置。

4. **Telemetry 与 AI 占位（阶段 5）**  
   - `telemetry-merge.mjs` 输出 `build.pagegen` 与 `build.ai` 摘要；支持缓存命中率、写入哈希命中、AI 成功率等指标。  
   - 默认集成 placeholder 模型，冒烟失败会自动降级并在 manifest/遥测中标记。

5. **调度插件化 + 示例上线（阶段 6）**  
   - 调度器支持阶段并发覆盖 `--parallel-stage stage=limit`。  
   - `scripts/pagegen/plugins/example.mjs` 展示如何订阅调度生命周期并输出报告，配套测试验证回退行为。

## 观测指标页现状解读

初次打开 “观测指标” 时会看到几条看似“告警”的提示：

- **缓存命中率低**：当前仓库尚未写入正式文章，collect 阶段无法复用缓存，命中率自然为 0%。一旦补齐内容并多跑几次生成，这条告警就会消失。
- **AI 构建缺失 / 冒烟跳过**：默认使用 placeholder runtime，冒烟会直接跳过。换成真实模型后，这里会显示 `passed`/`failed`，并列出失败模型清单。
- **模块状态 missing**：同样来自于尚未产出真正的 embeddings/summary/QA。接入真实模型即可恢复。

这些提醒主要是为了提示“仓库还在准备阶段”，并不是故障。建议在补齐正式内容、接入真实模型后再观察 telemetry，确保告警确实回落到期望范围。

## 内容与协作建议

1. **先把基石文章补齐**  
   - 本文即为“项目缘起”基石文档。  
   - 建议继续撰写《观测指标导览》《AI 管线占位与切换指南》《Pagegen 运行手册》等，填充核心导航。

2. **按类别规划标签与系列**  
   - `category_zh` 已限定值，建议使用 `管理与协作` 记录流程类文章，`工程笔记` 或 `架构设计` 记录技术方案。  
   - `series` / `series_slug` 可串联多篇文章（如“项目起航手记”），方便后期聚合。

3. **善用自动化守门**  
   - `npm run precheck`：确保 Frontmatter 和配置符合 Schema。  
   - `npm run gen`：每次撰写或修改内容后运行，随手检查 `_generated` 是否符合预期。  
   - `npm run build`：发布前的完整体检，死链/告警都会即时反馈。

4. **为未来的 AI 自动发布铺路**  
   - 模型 manifest（`data/models.json`）已支持 `status`、`cache`、`smoke` 字段。  
   - 可以先人工编写规范的梳理文档，再让 AI 参考写作风格生成后续文章；脚本会在冒烟失败时自动回退，保证站点不会被“坏内容”污染。

## 下一步

- **补齐正式内容**：围绕本篇提到的主题，继续撰写详细的操作手册、技术方案及复盘文章。  
- **逐步开启真实模型**：当需要上线 AI 构建时，可通过 `AI_RUNTIME`、`AI_*_MODEL` 环境变量切换到真实适配器，`npm run ai:prepare` / `npm run ai:smoke` 会负责守门。  
- **持续迭代插件生态**：可以以示例插件为模板，尝试把生成后的指标上传到外部观测系统，或在构建后自动生成报告。  
- **记录每次迭代**：继续在 `docs/zh/plans/**` 中更新路线图进展，让“系统全貌”章节保持同步。

> 结语：Ling Atlas 从一开始就把“自动化”“可观测”“可回滚”作为硬约束。本篇文档将随着项目推进持续更新，方便后续贡献者无需翻历史提交，就能直接掌握系统的核心脉络与现状。
