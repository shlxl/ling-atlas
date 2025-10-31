# T4｜可视化导出与站内集成

## 1. 产物目录结构
```
docs/graph/
├── README.md                    # GraphRAG 专区介绍与使用说明
├── index.md                     # 可选：入口页/聚合导航
└── <topic>/
    ├── index.md                 # 主题描述、Top-N 列表、上下游链接
    ├── subgraph.mmd             # Mermaid 子图源文件
    ├── context.md               # 证据页（复用 T3 模板）
    └── metadata.json            # 主题摘要（entities、docs、更新时间）
```
- `<topic>` 命名建议：`<lang>-<slug>`，例如 `zh-graphrag`.

## 2. 导出流程
1. 检索阶段生成 `subgraph.mmd` 与 `context.md`，先写入 `.tmp/graph/<topic>/`。
2. `scripts/graphrag/export.mjs` 负责将 `.tmp` 目录产物复制/归档至 `docs/graph/`。
3. 落盘前调用 `pagegen` 的 `normalizeRoutePath`，确保 BASE 与多语言兼容。
4. 支持 `--dry-run`（仅打印目标路径）与 `--clean`（清理目标目录再写入）。

## 3. `index.md` 模板（主题页）
```markdown
---
title: GraphRAG 入门主题子图
description: GraphRAG 相关文档、实体与关系的可视化索引。
---

# GraphRAG 入门主题子图

<Badge type="tip" text="最近更新：{{ updated_at }}" />

## 子图概览

```mermaid
{{ include("./subgraph.mmd") }}
```

## 证据详解
<VPDoc :src="'./context.md'" />

## Top-N 推荐文档
| 标题 | 更新时间 | 理由 |
| --- | --- | --- |
{% for doc in top_docs %}
| [{{ doc.title }}]({{ doc.href }}) | {{ doc.updated_at }} | {{ doc.reasons | join("；") }} |
{% endfor %}

## 相关实体
| 实体 | 类型 | Salience |
| --- | --- | --- |
{% for entity in entities %}
| {{ entity.name }} | {{ entity.type }} | {{ entity.salience }} |
{% endfor %}
```

> `VPDoc` 为站点已有组件，必要时在主题入口中懒加载。

## 4. 导航与站点集成步骤
1. `docs/graph/README.md` 在导航 manifest 中注册（使用现有 nav schema）。
2. 主题页按语言加入 `docs/graph/index.md` 的列表（使用 Table/Link 列表）。
3. 不改动现有侧栏顺序：通过 `docs/.vitepress/config.ts` 的额外 group 添加 GraphRAG 区块。
4. 若启用多语言：使用 `schema/locales.json` 中的 slug，确保 `docs/graph/<locale>/` 结构一致。

## 5. 回滚策略
- 删除对应 `docs/graph/<topic>/` 目录与 `docs/graph/index.md` 中的引用。
- 运行 `npm run gen` 重新生成导航与 i18n map，确认站点无残留链接。

## 6. 验证流程
1. `codex run build` 或 `npm run build` 确认 Mermaid 渲染无误。
2. 执行 `node scripts/check-links.mjs` 验证 `docs/graph/` 新增文件的站内链接。
3. 运行 `npm run test:theme`，确保 nav/i18n 更新未破坏现有逻辑。

## 7. 可观测性
- `data/telemetry.json` 增加 `graphrag` 节点，记录导出批次、mermaid 节点/边数量。
- 产物写入日志：`data/graphrag/export-log.jsonl`。

> 本节仅定义流程与模板，实际实现应遵循幂等与回滚要求。
