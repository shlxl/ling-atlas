---
title: Pagegen 运行手册
date: '2025-10-20'
status: published
category_zh: 工程笔记
tags_zh:
  - 生成管线
  - 调度插件
  - 缓存优化
series: 项目起航手记
series_slug: project-kickoff
slug: pagegen-handbook
excerpt: 总结 Pagegen orchestrator 的阶段划分、CLI 参数、缓存策略与插件机制，帮助维护者快速定位生成问题并扩展新的自动化能力。
---

## 架构概览

Pagegen 的 orchestrator 位于 `scripts/pagegen.mjs`，在执行 `npm run gen`（或 `npm run build`）时按顺序触发以下阶段：

| 阶段 | 关键模块 | 说明 |
| --- | --- | --- |
| `sync` | `scripts/pagegen/sync.mjs` | 将源内容同步到目标语言目录，默认使用增量策略 |
| `collect` | `scripts/pagegen/collect.mjs` | 解析 Frontmatter、生成中间结构，支持缓存与并发解析 |
| `meta` | 内联逻辑 | 写入 `meta.<locale>.json`，用于后续聚合与导航 |
| `collections` | `scripts/pagegen/collections.mjs` | 根据分类/标签/系列输出 `_generated` 聚合页 |
| `feeds` | `scripts/pagegen/feeds.mjs` | 生成 RSS/Sitemap，支持模板配置与限流 |
| `i18n-map` | `scripts/pagegen/i18n-registry.mjs` | 生成跨语言映射表（`i18n-map.json`） |
| `nav-manifest` | 同上 | 依据 `schema/nav.json` 生成导航 manifest |
| `write` | `scripts/pagegen/writer.mjs` | 批量写入产物，支持哈希比对与错误聚合 |

调度器支持并发与插件化扩展，后文将详细介绍。

## 常用命令与参数

```bash
npm run gen                    # 标准生成流程
npm run gen -- --full-sync     # 强制全量同步内容目录
npm run gen -- --no-cache      # 禁用 collect 阶段缓存
npm run gen -- --no-batch      # 回退串行写入，禁用哈希跳过
npm run gen -- --parallel-stage feeds=2  # 为 feeds 阶段单独设置并发上限
npm run gen -- --plugin ./scripts/pagegen/plugins/example.mjs
```

环境变量与 CLI 参数含义：

- `PAGEGEN_FULL_SYNC=1`：等同于 `--full-sync`。
- `PAGEGEN_DISABLE_CACHE=1`：等同于 `--no-cache`。
- `PAGEGEN_DISABLE_BATCH=1`：禁用批量写入。
- `PAGEGEN_PARALLEL_STAGES=collect=4,feeds=2`：批量配置阶段并发。
- `PAGEGEN_PLUGINS=./plugin-a.mjs,./plugin-b.mjs`：一次加载多个插件。
- `PAGEGEN_DISABLE_PLUGINS=1` / `--no-plugins`：完全禁用插件。
- `PAGEGEN_IGNORE_PLUGIN_ERRORS=1` / `--ignore-plugin-errors`：插件失败时忽略报错，仅记录告警。

## 缓存与性能策略

1. **内容缓存** (`data/pagegen-cache.<locale>.json`)  
   - 根据文件 `mtime` 和大小判断是否需要重新解析。  
   - 第一次运行必然 miss；第二次运行命中率应显著提升。  
   - 若缓存损坏，可删除对应 JSON 后重跑。

2. **同步增量快照** (`data/pagegen-sync.<locale>.json`)  
   - 记录上次同步的文件信息，避免频繁复制大文件。  
   - 使用 `--full-sync` 强制覆盖可解决源目录异常或缓存错配问题。

3. **写入哈希与批量**  
   - `writer` 会对内容进行哈希比对，未变化的文件直接跳过，减少磁盘写入。  
   - 当需要观察真实写入过程或复现历史行为时，可加 `--no-batch` 回退到串行写入。

4. **调度并行度**  
   - 默认只针对阶段本身配置 `parallel: true` 才会并行执行。  
   - 通过 `--parallel-stage feeds=4`、`PAGEGEN_PARALLEL_STAGES` 等命令覆盖，可对特定阶段加速或禁用并行。

## 插件机制

调度插件通过以下流程挂载：

1. **加载**  
   - 指定 `--plugin ./scripts/pagegen/plugins/example.mjs` 或设置环境变量。
   - 插件文件需导出 `register` 方法。

2. **注册阶段 / 监听生命周期**  
   - 在 `register` 中可以调用 `registry.registerStage` 新增阶段，也可以通过 `registry.on(lifecycleEvents.BEFORE_STAGE, ...)` 监听调度事件。
   - 示例插件 `example.mjs` 会记录阶段信息并在构建末尾输出 `data/pagegen-plugin.example.json`。

3. **错误处理**  
   - 默认情况下，插件抛错会中断整个生成流程。可通过 `--ignore-plugin-errors` 改为记录告警。
   - Telemetry 的 `build.pagegen.plugins` 节点会列出每个插件的状态（`loaded` / `ignored` / `failed`）。

## 常见问题与排障

### 1. 聚合页仍引用已删除的内容

- 运行 `npm run gen -- --full-sync`，确保缓存与同步快照被刷新。
- 检查导航配置 `schema/nav.json` 是否仍保留旧 slug，如是请同步更新。
- 若 `_generated/` 中还存在过时文件，可直接删除整个目录后再次运行生成命令。

### 2. `nav.manifest.<locale>.json` 为空

- 说明目标语言目录尚无正式内容。补齐文章并重新运行 `npm run gen` 即可填充。
- Telemetry 仍会记录 `nav` 摘要，为后续内容上线提供基线。

### 3. 插件加载不到位

- 确认插件路径是否使用了相对路径或 `file://`，若在子目录建议使用绝对路径或 `pathToFileURL`。
- 查看 `telemetry.json` 中 `build.pagegen.plugins.results` 获取详细错误信息。

### 4. 生成耗时过长

- 可增加 `PAGEGEN_CONCURRENCY`（collect 阶段并发度），或通过 `PAGEGEN_PARALLEL_STAGES` 调整各阶段并发。
- 若是 I/O 瓶颈，检查是否大量写入未变化的文件；适当启用哈希跳过可以显著提速。

## 最佳实践

- 写作前先运行 `npm run precheck`，确保 Frontmatter 符合 schema，避免中途报错。
- 内容较多时建议分批运行 `npm run gen`，确认 `_generated/` 结构与导航 manifest 符合预期。
- 如果需要自定义调度行为（例如构建完成后上传指标），建议基于 `example` 插件复制并拓展。
- 每次大版本迭代后，把 `data/pagegen-metrics.json` 提交到仓库，以便后续比较性能趋势。

掌握以上要点，就能对 Pagegen 的运行状态做到“知其然、也知其所以然”，并在出现异常时快速定位到具体阶段和责任脚本。
