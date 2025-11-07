---
title: GraphRAG 实体抽取自适应迭代计划
---

## 背景

Gemini 版实体提取脚本已经完成从 Python 向 JS/TS 的迁移，并与 Pagegen/GraphRAG 的流水线对齐。然而在实际运行中，仍会出现模型漏判或类型退化（例如参考文献被归为通用概念）的情况。为了长期保持知识图谱质量，需要构建一个“反馈 → 评估 → 自适应调优”的闭环，让实体抽取逻辑能够随数据和需求演进而持续改进。

## 目标

- 建立可追踪的误差反馈与评估机制，量化实体与关系的抽取质量。
- 在不影响现有流水线稳定性的前提下，实现 Prompt/模型/后处理的自适应调优。
- 为多模型策略（Gemini / OpenAI / DeepSeek 等）与专业领域拓展预留空间。

## 里程碑与交付物

### 阶段 0 · 基线与回归

- 整理现有 GraphRAG 产物（`docs/graph/**/metadata.json`、Neo4j 快照等）形成“金标准”样本集合。
- 输出最小反馈清单 `data/graphrag-feedback.jsonl`，记录典型偏差：文献类实体、跨语言名称、关系缺失等。
- 在 `scripts/graphrag/ingest.pipeline.mjs` 运行后保留原始输出，方便与基线对比验证迁移后行为。
- 记录 VitePress Taxonomy（`TAXONOMY.md`）当前定义，标记人工维护的分类映射，便于未来用抽取结果自动建议分类。

### 阶段 1 · 反馈采集与遥测落盘

- 新增 `scripts/graphrag/feedback.mjs`：
  - 解析最新产物与 `data/graphrag-feedback.jsonl`，输出命中/遗漏列表。
  - 支持命令行追加反馈、自动去重与时间戳标记。
- 扩展 `data/graphrag-metrics.json` / `data/telemetry.json`，记录：
  - 实体/关系 Precision、Recall、F1；
  - 主要类型命中率（例如参考文献、机构、作者等）；
  - 当前使用的 Prompt 版本、模型提供方与参数（温度、输出模式等）。
- 在 Telemetry 页面新增 GraphRAG 模块，展示最新评估结果与告警。

### 阶段 2 · 评测守门与回归测试

- 编写 `scripts/graphrag/eval-entities.mjs`：
  - 输入：当前抽取结果 + 金标准；输出：结构化指标 JSON。
  - 支持 `--report human` 转换为 CLI 摘要，或 `--report json` 写入文件。
- 在 `npm run ai:smoke` 或 `codex run publish` 中插入评测步骤，设置守门阈值（如 F1 ≥ 0.7）。
- 补充测试：`node --test tests/graphrag/*.test.mjs` 中加入评测脚本的单元测试与最小集成测试。
- 输出评测失败时的自动诊断：列出 Top N 漏抽实体、类型变化、关系断裂。

### 阶段 3 · Prompt 与策略自适应

- 在 `scripts/llm/graph-extractor.mjs` 中增加 Prompt 版本与策略选择：
  - 基于 `data/graphrag-feedback.jsonl` 生成 few-shot 片段，动态拼入模板。
  - 支持 `PROMPT_VARIANT=baseline|golden` 环境变量，方便灰度测试。
- 新增策略模块 `scripts/llm/prompt-strategies.mjs`：
  - 根据最近 N 次评测结果选择 Prompt/模型组合。
  - 当某类实体命中率下降到阈值时，自动启用带示例的 Prompt 或切换模型。
- 将当前策略写入 Telemetry，保证调优过程可追踪、可回滚。
- 输出规范化后的实体类型，可作为 VitePress 分类/标签的候选源，逐步替代 `TAXONOMY.md` 的硬编码管理。

### 阶段 4 · 多模型对比与合并

- 在图谱抽取入口中支持多 Provider：Gemini（默认）、OpenAI、DeepSeek 等。
- 引入对比脚本 `scripts/graphrag/compare-providers.mjs`：
  - 运行多个模型的输出，对比实体集合差异。
  - 提供合并策略（交集、并集、基于置信度的加权），并记录策略效果。
- 将 Provider 选择与结果差异写入 metrics，可视化在 Telemetry 面板上。
- 允许在 `.env` / CLI 中指定备选模型，以便针对专门领域快速切换。

### 阶段 5 · 人机共建与自动回滚

- 提供审阅工具（CLI 或简易前端页），便于人工快速标注：
  - 选中实体/关系 → 标记为“正确/错误/缺失”。
  - 生成符合 `data/graphrag-feedback.jsonl` 约定的记录。
- 当评测失败或模型出现异常时：
  - 自动回退到上一版本 Prompt/策略；
  - 输出待人工确认的差异报告（保存于 `data/graphrag-diff/**`）。
- 将全部策略调整、回退操作纳入 `scripts/telemetry-merge.mjs`，维持审计链路。

## 风险与应对

- **评测基线不足**：初期反馈样本可能有限，建议先由维护者手动整理几批典型文档，伴随上线逐步扩充。
- **多模型成本上升**：对比/合并策略会增加 API 调用；通过可配置开关（如 `GRAPHRAG_ENABLE_COMPARISON`）在 CI 与生产之间做区分，必要时提供批量缓存。
- **策略失误导致指标波动**：在策略选择前记录历史评测结果，提供回滚按钮；守门失败时立即恢复上一版 Prompt/模型组合。

## 下一步

短期先聚焦阶段 0–2：完成反馈清单、评测脚本与守门整合。确认闭环可用后，再依次实现 Prompt 自适应、多模型对比和人机协作工具。

## 最新进展

- ✅ `npm run graphrag:ingest` 已内置“别名表 → LLM → 缓存”类型归一化链路：配置位于 `data/graphrag-entity-alias.json`，
  回写缓存为 `data/graphrag-entity-type-cache.json`，并可通过 `GRAPHRAG_TYPE_NORMALIZER_PROVIDERS` /
  `GRAPHRAG_TYPE_NORMALIZER_MODEL` / `GRAPHRAG_TYPE_NORMALIZER_DISABLE` 调整策略。
- ✅ `data/graphrag-metrics.json` 与 Telemetry 页面新增 `normalize` 记录，实时展示处理条目、命中来源、LLM 成功/失败、缓存写入与示例，
  相关告警同步写入 `build.graphragHistory`，为后续评测与回滚提供可观测性基线。
- ✅ 关系（Predicate）归一化上线：`scripts/graphrag/relationship-type-normalizer.mjs` + `data/graphrag-relationship-alias.json`
  负责判定 `relationships[].type`，缓存写入 `data/graphrag-relationship-type-cache.json`，Telemetry 增加
  `normalize_relationships` 记录及警报，确保实体/关系可同时观测。
- ✅ 属性/对象归一化落地：`scripts/graphrag/object-normalizer.mjs` 统一 `relationships[].properties` 与实体属性值，
  别名配置位于 `data/graphrag-object-alias.json`，缓存写入 `data/graphrag-object-cache.json`，Telemetry/告警新增
  `normalize_objects` 视图，Subject/Predicate/Object 三段归一能力打通。
