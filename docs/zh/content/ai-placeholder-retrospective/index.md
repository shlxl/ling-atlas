---
title: AI 占位阶段总结与实践
date: '2025-10-20'
status: published
category_zh: 管理与协作
tags_zh:
  - 占位运行
  - 模型冒烟
  - 回滚
series: 项目起航手记
series_slug: project-kickoff
slug: ai-placeholder-retrospective
excerpt: 记录 placeholder 运行时在落地过程中的价值、局限与最佳实践，为后续切换真实模型提供可复用的经验与风险清单。
---

## 为什么先用占位

- 快速启动：不依赖任何模型下载与 GPU 环境；
- 风险可控：冒烟失败自动回退，不污染前端产物；
- 易观测：Telemetry 明确标记 `missing/skipped`，帮助区分“未接入”与“失败”。

## 常见局限

- 无法评估真实 embeddings/summary 质量；
- 指标多为占位值，仅作管线连通与告警测试；
- 需要在接入真实模型后重新校准阈值与回滚策略。

## 最佳实践

1. 明确切换窗口：在内容与聚合稳定后再切到真实模型，避免多因素干扰；
2. 先跑 `ai:prepare` 再跑 `ai:smoke`，把失败集中在冒烟阶段暴露；
3. 失败即回退：保持 `AI_RUNTIME=placeholder` 能一键恢复占位产物；
4. Telemetry 校验：确保 overview 为 `ok`/`passed` 后再扩大覆盖范围；
5. 阶段放量：先启用单模块（如 embeddings），观察成功率与时延，再逐步开启 summaries/QA。

## 切换清单（Checklist）

- [ ] 安装与配置适配器依赖；
- [ ] 补充/校验 `data/models.json`（checksum、smokeTest）；
- [ ] `AI_RUNTIME` 与 `AI_*_MODEL` 环境变量就绪；
- [ ] `npm run ai:prepare && npm run ai:smoke` 通过；
- [ ] Telemetry 观测页显示 `status=ok/passed`；
- [ ] 回滚演练一次，确保 `placeholder` 能快速恢复。

