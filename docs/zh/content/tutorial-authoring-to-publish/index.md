---
title: 写作到发布的完整流程
date: '2025-10-20'
status: published
category_zh: 管理与协作
tags_zh:
  - 写作流程
  - 发布管线
  - 质量守门
series: 项目起航手记
series_slug: project-kickoff
slug: tutorial-authoring-to-publish
excerpt: 手把手演示从新建文章、预检聚合、观测指标复核到发布与回滚的全流程，配套常用命令与问题排查清单。
---

## 1. 写作前准备

- 目录约定：`docs/<locale>/content/<slug>/index.md`
- Frontmatter 最小集：

  ```yaml
  ---
  title: <标题>
  date: 'YYYY-MM-DD'
  status: published
  category_zh: 管理与协作 # 或工程笔记/架构设计等
  tags_zh: [<标签1>, <标签2>]
  series: 项目起航手记
  series_slug: project-kickoff
  slug: <kebab-case>
  excerpt: <一句话摘要>
  ---
  ```

- 预检命令：`npm run precheck`（Frontmatter/Schema/配置校验）。

## 2. 本地生成与预览

```bash
npm run gen                 # 生成聚合页/RSS/Sitemap
npm run dev                 # 启动预览服务器
```

必要时使用：

- `npm run gen -- --full-sync` 强制全量同步；
- `npm run gen -- --no-cache` 观察 collect 真实解析；
- `PAGEGEN_CONCURRENCY=8 npm run gen` 调整解析并发。

## 3. 质量守门与观测

- 观测指标页检查：缓存命中率、写入失败、AI 概览（可在占位阶段忽略 `missing`/`skipped`）。
- 死链/构建体检：`npm run build`（阻断）或 `npm run check`（precheck+build）。
- 常见问题：
  - 聚合引用旧 slug → 运行 `--full-sync` 并更新 `schema/nav.json`；
  - 写入失败 → 查看 CLI 错误与 `_generated/` 目标路径权限；
  - 告警含义 → 参考《观测指标导览》。

## 4. 发布与回滚

```bash
codex run publish --message "content: 新增 <标题>"
```

流程拆解：`tags:normalize → precheck → ai:prepare → ai:smoke → gen → build → push`。

回滚建议：

- 发布后发现死链 → 修正文档或导航，重新 `publish`；
- AI 冒烟不通过 → 切回 `AI_RUNTIME=placeholder`，再 `ai:prepare && ai:smoke`；
- 构建异常 → 直接回退上一个 commit，再离线修复后重试。

## 5. FAQ

- 只写中文，英文聚合也会生成吗？
  > 英文目录没有内容时，英文导航/聚合会为空但不阻断构建。建议初期仅维护中文，英文后续补齐。
- 草稿如何处理？
  > Frontmatter 设 `status: draft` 即可避免进入聚合/RSS/Sitemap。
- 如何批量改 slug？
  > 先修改内容目录与 Frontmatter，再 `--full-sync`，最后检查 `_generated` 与 `nav.manifest.*.json`。
