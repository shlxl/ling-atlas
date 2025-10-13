---
title: 从0到1：Ling Atlas 的诞生记
date: '2025-10-13'
updated: '2025-10-13'
status: published
category_zh: 工程笔记
tags_zh:
  - github-actions
  - 自动化
  - 知识库
series: Ling Atlas 起步
series_slug: ling-atlas-kickoff
slug: from-zero-to-one
excerpt: 记录 Ling Atlas 从脚手架到全自动部署的首篇实践，总结决策脉络与经验。
---

## 为什么再造一座知识库

我一直在琢磨，信息爆炸时代的个人笔记该如何兼顾“长期演化”与“即时可用”。传统笔记软件给了存取，但缺少可编排的演化路径。于是 Ling Atlas 项目从一个简单的念头开始：用工程化方法打造一座“可自动构建的个人知识库”。

- **可复现**：任何内容变更都能被 Agent 脚本捕获、校验并产出增量结果。
- **可协作**：将写作、归档、构建、部署拆解成可编排的角色（architect、pagegen、builder 等）。
- **可观察**：每次构建都会产出 RSS、Sitemap 和统计信息，方便追踪知识脉络。

## 工程起步的三个阶段

### 1. 脚手架与基础设施

- 初始化 Node 22 + npm 10 环境，固定 `.nvmrc`，确保 CI/CD 与本地对齐。
- 写下 `AGENTS.md`，明确从规划到部署的自动化流程，并约定 `codex run <task>` 作统一入口。
- 在 VitePress 配置中注入 `BASE`、`SITE_ORIGIN` 环境变量，为 GitHub Pages 子路径部署提前铺平道路。

### 2. 内容规约与校验

- 定义 `frontmatter.schema.json`，让每篇文章在提交前都要通过 `codex run precheck` 的 Ajv 校验。
- 列出常用标签别名（如 GHA → github-actions），借助 `tags:normalize` 自动规整中文/英文混写问题。
- 保留 `docs/content/hello-world` 作为示例，随后在此文档中记录真正的首篇项目故事。

### 3. 打通构建与部署链路

- `codex run setup` 打包 `precheck → gen → build`，一次命令即可跑通本地校验与站点产出。
- GitHub Actions workflow 显式传入 `BASE=/ling-atlas/` 与 `SITE_ORIGIN`，构建成果直接上传至 Pages。
- `codex run publish` 将内容变更、构建产物与推送打通，保留人工决定的 commit message。

## 实战收获：效率、信心与节奏

把 Ling Atlas 从 0 搭到 1，让我重新思考了“自动化写作”的价值：

1. **写作节奏更轻盈**：内容作者只需要关心 Markdown，Agent 负责其他所有琐事。
2. **上线信心更强**：每次 publish 自动跑校验与构建，能放心地把知识库公开出去。
3. **迭代路径更清晰**：AGENTS 手册变成持续扩展的 Roadmap，未来的检索、审计功能都有位置。

## 下一步

- 补齐更多真实文章，逐步替换脚手架示例。
- 结合 Pagefind + USearch 的混合检索实验，让静态站也具备语义检索能力。
- 引入 Lighthouse + 资源体积预算的自动巡检，持续监控站点体感。

这种从 0 到 1 的搭建过程不是终点，而是把内容创作纳入工程体系的起点。希望 Ling Atlas 的经验，也能帮助到同样渴望“写作即部署”的你。
