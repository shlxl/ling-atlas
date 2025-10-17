---
title: Pagegen 输出验证清单
---

## 核心产物

- `docs/_generated/meta.json`、`docs/en/_generated/meta.json`、`docs/zh/_generated/meta.json`
- `docs/public/nav.manifest.root.json`、`docs/public/nav.manifest.en.json`、`docs/public/nav.manifest.zh.json`
- `docs/public/i18n-map.json`
- `docs/public/rss*.xml`
- `docs/public/sitemap*.xml`
- `docs/*/_generated/{categories,series,tags,archive}/**/index.md`

## 必须保持的字段

- Meta JSON：`all[].{title,date,updated,status,category,category_slug,series,series_slug,tags[],slug,path,excerpt,relative,year}` 以及 `byCategory`、`bySeries`、`byTag`、`byYear` 索引结构。
- 导航 manifest：`locale`、`categories`、`series`、`tags`、`archive` 四类映射，路径需与 `_generated` 目录同步。
- i18n 映射：键值需保持多语言对应关系，至少包含两种语言才写入。
- RSS：频道信息（`title`、`link`、`description`）与 item 字段（`title`、`link`、`pubDate`、`description`）。
- Sitemap：每条 `<url>` 的 `loc` 与 `lastmod`。

## 验证方式

- 运行 `npm run gen` 后对比 Git diff，应只在内容变更时产生差异。
- 针对 JSON 产物执行 `jq type` 或自定义校验脚本，确认结构完整。
- 随机抽取聚合页 Markdown，确认链接与元数据与 Meta JSON 保持一致。
- CI 阶段增加快照或哈希对比，确保重构过程中产物不意外缺失。 
