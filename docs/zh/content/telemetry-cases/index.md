---
title: 观测指标场景案例与排障实录
date: '2025-10-20'
status: published
category_zh: 工程笔记
tags_zh:
  - 案例分析
  - 告警处理
  - 故障排查
series: 项目起航手记
series_slug: project-kickoff
slug: telemetry-cases
excerpt: 以真实场景为线索，逐步演示如何通过 Telemetry + CLI 日志定位 Pagegen 与 AI 管线告警，并给出可复现的修复步骤。
---

## 案例一：死链与空导航

**现象**：构建时报 `dead link`，导航 manifest 空。  
**定位**：
- Telemetry 中 `nav` 的条目数为 0；
- `_generated/` 中仅有 `nav.manifest.<locale>.json`；
- 内容目录缺少对应 slug。

**修复**：
1. 补齐文章或修改导航 slug；
2. 运行 `npm run gen -- --full-sync`；
3. `npm run build` 确认死链消失。

## 案例二：缓存命中率过低

**现象**：告警提示 “缓存命中率偏低”。  
**定位**：
- `collect.cacheHitRate < 0.6`；
- 刚清理过缓存或首次运行。

**修复**：
1. 连续运行两次 `npm run gen`；
2. 仍低则检查 `data/pagegen-cache.*.json` 是否被频繁覆盖；
3. 确认没有持续使用 `--full-sync`。

## 案例三：AI 冒烟失败

**现象**：Telemetry 显示 `smoke.status=failed`，overview 降级为 `degraded`。  
**定位**：
- `data/models.json` 的 `smoke.failures` 列出失败模型；
- CLI 日志包含具体错误。

**修复**：
1. 修正模型 checksum/路径/适配器配置；
2. 重新执行 `npm run ai:prepare && npm run ai:smoke`；
3. 如短期无法修复，回退 `AI_RUNTIME=placeholder` 并重新冒烟通过；
4. 观察 Telemetry 报警是否清除。

## 案例四：插件加载失败

**现象**：`plugins.results` 中存在 `failed`。  
**定位**：
- 路径不正确或导出方法不满足 `register`/`default` 约定。  

**修复**：
1. 使用绝对路径或 `file://` 确保解析正确；
2. 在本地先加 `--ignore-plugin-errors` 验证主流程；
3. 参考示例插件结构改造实现；
4. Telemetry 确认加载状态变为 `loaded`。

