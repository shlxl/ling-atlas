# Ling Atlas · 小凌的个人知识库

> 现代化、可演进、可检索的知识库工程。以 **协议优先**、**内容为王**、**混合检索**、**渐进增强** 为设计原则。

## 一句话特性
- 从 **统一 JSON** → Markdown → PageGen → **VitePress** → Pages/CDN
- **taxonomy 守门**：中文分类 ↔ 英文路径、标签 Canonical、Slug 规则
- **元数据驱动导航** + 自动 **分类/系列/标签/归档** + **RSS/Sitemap**
- CI 守门（Schema 校验、构建），后续可加 Lighthouse/体积预算
- 预留 **L1 语义检索（Transformers.js）** 与 **USearch/WASM** 接口
- PR-I AI 自演进（占位版）：构建阶段自动生成 embeddings/summaries/Q&A JSON，前端可按需消费
- PR-J 知识 API + Chat：导出段落级只读数据，前端提供带引用的轻量问答
- PR-L 多语/i18n：`docs/content`（中文）与 `docs/content.en`（英文）双目录，构建出 `/` 与 `/en/` 路由及多语言聚合页 / RSS / Sitemap
- PR-K 搜索评测：离线 nDCG/MRR/Recall 守门 + 线上查询参数 variant（lex / rrf / rrf-mmr）交替曝光

## 快速开始
```bash
# 1) 安装依赖
npm i

# 2) 生成聚合页
npm run gen

# 3) 本地预览
npm run dev
```

## 目录结构
```
.
├─ docs/                 # 站点根
│  ├─ content/           # 中文内容源（每篇文章一个文件夹）
│  ├─ content.en/        # 英文内容源（结构镜像中文，最终映射到 /en/...）
│  │  └─ hello-world/
│  │     └─ index.md
│  ├─ _generated/        # pagegen 输出（分类/系列/标签/归档）
│  ├─ public/            # 静态文件（rss.xml、sitemap.xml 由脚本生成）
│  └─ .vitepress/        # VitePress 配置与主题
├─ security/             # CSP/SRI 模板配置
├─ schema/               # Frontmatter schema 与 tag 别名
├─ scripts/              # 生成器与校验脚本
└─ .github/workflows/    # CI
```

## 命令
- `npm run gen`：生成分类/系列/标签/归档 + RSS/Sitemap
- `npm run precheck`：Frontmatter Schema 校验（阻断）
- `npm run build`：构建站点（前置 `gen` + `knowledge:build`），自动生成中英双语 RSS/Sitemap
- `npm run dev`：本地开发（前置 `gen`）
- `npm run knowledge:build`：单独更新 `/api/knowledge.json`（段落级知识数据）
- `npm run eval:offline`：基于 `data/gold.jsonl` 运行离线检索评测（nDCG/MRR/Recall），确保不低于 `scripts/eval/baseline.json`
- `npm run ai:all`：执行 AI 自演进管线（文本嵌入 / 摘要 / 问答，占位实现）
- `npm run build`（或 `npm run pwa:build`）：内置 `vite-plugin-pwa`，生成 `sw.js`、`manifest.webmanifest`、`icons/` 等离线缓存工件
- 离线验证：`npm run build` → `npx vitepress preview docs --host 127.0.0.1 --port 4173`，在浏览器中访问站点、打开 DevTools → Application → Service Workers，勾选 “Offline” 后刷新确认最近访问页和搜索仍能使用缓存；同时观察底部“检测到新版本/已缓存”提示条触发刷新

## 部署（GitHub Pages）
1. 打开 **Settings → Pages**，选择 **GitHub Actions**。
2. 工作流文件在 `.github/workflows/deploy.yml`；首次 push 后会自动部署。
3. 自定义域名建议使用子域（如 `kb.example.com`），并开启 HTTPS。
4. 更多细节参考 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)，迁移路径与重写策略见 [docs/MIGRATION.md](docs/MIGRATION.md)。

## 安全与索引
- `.well-known/security-headers.txt`：`npm run build:search` 会自动更新并同步到发布目录，同时在静态页面注入 CSP `<meta>`。
- `.well-known/sri-manifest.json`：记录外部资源的 SRI；若 CDN 内容变更但未更新 `security/sri-allowlist.json`，CI 会直接失败。
- `docs/public/robots.txt`：默认禁止抓取 `/data/`、`/admin/`，并指向站点 `sitemap.xml`。
- `docs/public/sitemap.xml`：由 PageGen 生成，保持与 robots 中链接一致。
- AI 自演进产物：`docs/public/data/embeddings.json`、`summaries.json`、`qa.json`，CI/构建阶段自动刷新，失败不阻断主流程。
- 搜索评测：`data/gold.jsonl` 维护标注，`node scripts/eval/offline.mjs` 运行离线指标；线上调试可通过 `?variant=lex|rrf|rrf-mmr` 切换，与默认 `rrf-mmr` 做 Team Draft 交替曝光，点击偏好会记录匿名 hash 与位次。
- 多语言：`docs/content` 与 `docs/content.en` 互为镜像，`npm run gen` 会复制英文章到 `docs/en/` 并产出 `/en/_generated/**`、`rss-en.xml`、`sitemap-en.xml`。导航与搜索根据路径自动切换语言，缺少对应页面时跳转到 `/en/`/`/` 首页。

## 约定
- 所有文章文件置于 `docs/content/**/index.md`；Frontmatter 字段遵循 `schema/frontmatter.schema.json`。
- `status: draft` 的文章不会进入聚合页与 RSS/Sitemap。

## FAQ
- **可以放在根仓库吗？** 可以，但推荐独立仓库，后续可用 subtree 回挂到旧仓 `docs/`。
- **中文标题如何转 slug？** `scripts/slug.ts` 提供简版实现，优先手写 `slug` 字段。

---

> 名称约定：仓库名 **ling-atlas**，站点标题“Ling Atlas · 小凌的个人知识库”。
