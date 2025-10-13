PR 类型
- [ ] 功能
- [ ] 修复
- [ ] CI/文档/杂项

变更摘要
- [ ] 已在本地通过构建：`npm run build:search`（或：`npm run build && npm run search:index`）
- [ ] 若改动了 SearchBox / 主题，已验证 Ctrl/⌘K 弹窗与搜索结果

Dev 提示
1) `npm run build && npm run search:index`
2) `npm run dev:search`（或 `npm run preview:search`）
3) 访问 `http://localhost:5173/<BASE>`（示例 `/ling-atlas/`）

注意
- Pagefind 针对静态 HTML 建索引，纯 `vitepress dev` 无索引；请使用 `dev:search/preview:search`。
- GitHub Pages 部署会在 VitePress build 后执行 `npm run build:search`，Artifact 包含 `pagefind/`。
