# T6｜站点集成最小改动

## 1. 集成目标
- 站点保留现有导航结构；GraphRAG 区块以新增分组呈现，可随时隐藏/移除。
- 所有 GraphRAG 产物限定在 `docs/graph/`，不影响其他文档。
- 支持 BASE `/ling-atlas/` 与多语言路由。

## 2. 必要改动
| 文件 | 用途 | 可逆性 |
| --- | --- | --- |
| `docs/.vitepress/config.ts` | 在 `themeConfig.nav` 或自定义导航 manifest 中追加 GraphRAG 聚合入口 | 通过注释/删除条目即可回滚 |
| `schema/nav.json` | 若使用导航 schema，新增 GraphRAG 节点（仅在预检通过后合并） | 删除新增节点可回滚 |
| `docs/graph/README.md` | GraphRAG 区域说明，列出可用主题 | 删除文件即可 |
| `docs/graph/index.md` | 总览页，列出现有子图及语言跳转 | 删除文件即可 |
| `docs/graph/<topic>/` | 各主题产物（index/context/subgraph.mmd/metadata） | 删除目录即可 |
| `package.json` | 新增脚本（如 `npm run graphrag:ingest`、`npm run graphrag:export`） | 移除 script 即回滚 |

## 3. 集成步骤
1. 确认 `schema/nav.json` 中已有 GraphRAG 分组，无则新增：
```json
{
  "key": "graph",
  "title": "GraphRAG",
  "links": [
    {"text": "概览", "href": "/graph/"},
    {"text": "GraphRAG 入门", "href": "/graph/zh-graphrag/"}
  ]
}
```
2. 更新 `docs/.vitepress/config.ts` 读取 nav manifest 后自动带出 GraphRAG。
3. 在 `docs/graph/index.md` 引用所有 `docs/graph/<topic>/metadata.json` 生成列表。
4. 将 `node scripts/graphrag/export.mjs` 纳入 `codex run gen` 或单独命令。

## 4. BASE 与多语言处理
- 在导出的 `index.md` 中使用相对路径（以 `/graph/` 开头），`vitepress` 会自动结合 BASE。
- 多语言主题命名 `docs/graph/<locale>-<slug>/`，在 `docs/graph/index.md` 中按语言分组。
- 若 Locale 缺失，主题页需声明“该语言暂无 GraphRAG 产物”。

## 5. 验证
1. 运行 `npm run gen`（确保 nav manifest 与 i18n map 更新）。
2. `npm run build` → `npm run test:theme`：保证导航与 Locale 切换正常。
3. 手动访问 `http://localhost:5173/ling-atlas/graph/`（dev 模式）或 `dist/graph/`（build 模式）验证渲染。

## 6. 回滚流程
1. 删除 `docs/graph/` 下新增的目录与文件。
2. 撤销 `schema/nav.json`、`docs/.vitepress/config.ts`、`package.json` 中的修改。
3. 运行 `npm run gen` 与 `npm run build`，确认站点恢复。

## 7. 备用策略
- 若导航 manifest 出现冲突，可临时通过 `docs/graph/README.md` 在现有导航中嵌入 `<AutoLink />` 列表，不改 schema。
- 若 GraphRAG 产物过多，可通过 `pagegen` 生成二级目录/分页，以便后续扩展。

> 以上策略保证站点改动最小、可逆。一旦 GraphRAG 功能需下线，按回滚流程操作即可恢复原状。
