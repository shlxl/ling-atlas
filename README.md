# Ling Atlas · 小凌的个人知识库

> 现代化、可演进、可检索的知识库工程。以 **协议优先**、**内容为王**、**混合检索**、**渐进增强** 为设计原则。

## 一句话特性
- 从 **统一 JSON** → Markdown → PageGen → **VitePress** → Pages/CDN
- **taxonomy 守门**：中文分类 ↔ 英文路径、标签 Canonical、Slug 规则
- **元数据驱动导航** + 自动 **分类/系列/标签/归档** + **RSS/Sitemap**
- CI 守门（Schema 校验、构建），后续可加 Lighthouse/体积预算
- 预留 **L1 语义检索（Transformers.js）** 与 **USearch/WASM** 接口

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
│  ├─ content/           # 唯一内容源（每篇文章一个文件夹）
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
- `npm run build`：构建站点（前置 `gen`）
- `npm run dev`：本地开发（前置 `gen`）

## 部署（GitHub Pages）
1. 打开 **Settings → Pages**，选择 **GitHub Actions**。
2. 工作流文件在 `.github/workflows/deploy.yml`；首次 push 后会自动部署。
3. 自定义域名建议使用子域（如 `kb.example.com`），并开启 HTTPS。

## 安全与索引
- `.well-known/security-headers.txt`：`npm run build:search` 会自动更新并同步到发布目录，同时在静态页面注入 CSP `<meta>`。
- `.well-known/sri-manifest.json`：记录外部资源的 SRI；若 CDN 内容变更但未更新 `security/sri-allowlist.json`，CI 会直接失败。
- `docs/public/robots.txt`：默认禁止抓取 `/data/`、`/admin/`，并指向站点 `sitemap.xml`。
- `docs/public/sitemap.xml`：由 PageGen 生成，保持与 robots 中链接一致。

## 约定
- 所有文章文件置于 `docs/content/**/index.md`；Frontmatter 字段遵循 `schema/frontmatter.schema.json`。
- `status: draft` 的文章不会进入聚合页与 RSS/Sitemap。

## FAQ
- **可以放在根仓库吗？** 可以，但推荐独立仓库，后续可用 subtree 回挂到旧仓 `docs/`。
- **中文标题如何转 slug？** `scripts/slug.ts` 提供简版实现，优先手写 `slug` 字段。

---

> 名称约定：仓库名 **ling-atlas**，站点标题“Ling Atlas · 小凌的个人知识库”。
