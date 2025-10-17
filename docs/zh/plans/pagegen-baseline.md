---
title: Pagegen 基线记录
---

## 执行耗时

- 命令：`time npm run gen`
- real：0.36 s
- user：0.24 s
- sys：0.10 s

> 记录时间：\`npm run gen\` 在无改动状态下直接运行所得，可作为后续优化对比依据。

## 生成文件统计

| 路径 | 文件数 |
| --- | --- |
| `docs/_generated` | 20 |
| `docs/zh/_generated` | 15 |
| `docs/en/_generated` | 10 |

以上统计通过 `find <目录> -type f | wc -l` 获得，用于监控重构过程中的产物数量是否出现异常波动。

## 内容同步统计

基于 `npm run gen` 阶段日志，当前同步情况如下：

| 语言 | 文件数 | 大小 (MB) | 备注 |
| --- | --- | --- | --- |
| zh | 0 | 0.00 | `contentDir` 与 `localizedContentDir` 指向相同路径，暂不触发复制 |
| en | 0 | 0.00 | 同上 |

> 若未来新增语言或启用镜像同步，可对比此处基线，观察 `syncLocaleContent` 在全量复制下的文件规模与耗时。

## 日志记录

- 运行 `npm run gen` 会将阶段耗时与同步指标追加到 `data/pagegen-metrics.json`（保留最近 100 条），可作为增量同步与缓存策略的对照样本。
- 每个语言的快照缓存保存在 `data/pagegen-sync.<locale>.json`，可删除该文件或执行 `npm run gen -- --full-sync` 以触发全量同步。
- 内容解析缓存 `data/pagegen-cache.<locale>.json` 支撑增量解析，可通过 `npm run gen -- --no-cache` 或 `PAGEGEN_DISABLE_CACHE=1` 临时关闭；`pagegen-metrics.json` 中会记录每个语言的 `cacheHits`/`cacheMisses`。
