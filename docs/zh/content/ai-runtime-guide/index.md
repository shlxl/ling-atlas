---
title: AI 管线占位与切换指南
date: '2025-10-20'
status: published
category_zh: 管理与协作
tags_zh:
  - AI管线
  - 冒烟测试
  - 运行时切换
series: 项目起航手记
series_slug: project-kickoff
slug: ai-runtime-guide
excerpt: >-
  详细说明 Ling Atlas 在 placeholder
  与真实模型之间切换的步骤、环境变量配置、冒烟守门与回滚策略，确保个人向量化知识库的构建过程安全可控。
---

## 占位运行的意义

默认情况下，Ling Atlas 采用 `AI_RUNTIME=placeholder`：

- 构建阶段仍会生成 `embeddings.json`、`summaries.json`、`qa.json` 等产物，但内容仅为占位文本，适合无 GPU/无网络环境。
- `npm run ai:prepare`、`npm run ai:smoke` 也会正常执行，只是最后会输出 “skipped” 并保持 manifest 中的占位状态。
- Telemetry 会提示 “AI 构建状态缺失” 与 “冒烟测试被跳过”，旨在提醒尚未启用真实模型。

当需要获得真实的向量与摘要时，就必须切换到真实运行时。

## 切换到真实模型的步骤

1. **准备运行时依赖**
   - 选择合适的适配器：目前内置 `transformers-node`、`onnxruntime` 与 `placeholder`。
   - 安装对应依赖：  

     ```bash
     npm install @xenova/transformers     # 对应 transformers-node 适配器
     npm install onnxruntime-node         # 对应 onnxruntime 适配器
     ```

2. **设置环境变量或 CLI 参数**
   - 基本参数：

     ```bash
     export AI_RUNTIME=node
     export AI_EMBED_MODEL="transformers-node:sentence-transformers/all-MiniLM-L6-v2"
     export AI_SUMMARY_MODEL="transformers-node:philschmid/bart-large-cnn-samsum"
     export AI_QA_MODEL="transformers-node:deepset/roberta-base-squad2"
     ```

   - 临时使用 CLI 覆盖：

     ```bash
     node scripts/embed-build.mjs --adapter transformers-node:all-MiniLM-L6-v2
     ```

   - 若仅想验证单一适配器，可设定 `AI_EMBED_DISABLE=1` 等环境变量跳过某些阶段。

3. **运行准备与冒烟**

   ```bash
   npm run ai:prepare   # 下载/校验模型、写入 data/models.json
   npm run ai:smoke     # 使用 manifest 中定义的 smokeTest 执行最小推理
   ```

   - `ai:prepare` 失败：检查网络、checksum、磁盘权限；必要时重试或启用 `AI_MODELS_SCOPE=global` 使用全局缓存。
   - `ai:smoke` 失败：日志会写入 `data/models.json` 的 `smoke.failures` 字段，并自动把 `runtime` 回退为 `placeholder`。

4. **更新 Telemetry / 观测指标**
   - `npm run gen` 或 `npm run build` 后，Telemetry 会显示 `build.ai.overview.status = ok`，并在“观测指标”页同步展示真实输出条数与成功率。

## 回滚与排障

如果真实模型不可用或出现大规模失败，可按照以下步骤回滚：

1. **显式切换回占位**

   ```bash
   export AI_RUNTIME=placeholder
   npm run ai:prepare
   npm run ai:smoke   # 此时会输出“占位模式”并自动通过
   ```

2. **删除或归档生成产物**
   - 如需彻底回退向量化结果，可以删除 `docs/public/data/embeddings.json` 等产物后再次运行 `npm run ai:all`。

3. **清理缓存**

   ```bash
   AI_MODELS_CLEAN=1 npm run ai:prepare   # 仅保留 manifest 中列出的模型
   ```

## 常见问题解答

- **如何新增模型？**  
  更新 `data/models.json`，为每个模型配置 `artifact`、`checksum`、`smokeTest` 等字段。建议执行 `npm run ai:prepare -- --clean` 确保旧模型被清理。

- **冒烟测试需要多严格？**  
  Manifest 中的 `smokeTest` 仅是最小验证。可以根据需求加严，例如对嵌入结果计算余弦相似度或对摘要长度设置范围。

- **能否只运行部分阶段？**  
  可以依赖环境变量：`AI_EMBED_DISABLE=1`、`AI_SUMMARY_DISABLE=1`、`AI_QA_DISABLE=1`；Telemetry 仍会记录禁用状态。

- **如何与 Pagegen 联动？**  
  在调度插件中读取 `build.ai` 摘要即可，例如扩展 `example` 插件在构建后写入 AI 运行报告。

掌握上述流程，即可在占位模式与真实模型之间快速切换，确保个人向量化知识库在任何环境下都能安全构建、可控回滚。
