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
- PR-L 多语/i18n：`docs/zh/content`（默认中文）与 `docs/en/content`（英文）独立演进，构建出 `/zh/` 与 `/en/` 路由、按语言裁剪的聚合页 / RSS / Sitemap，并输出 `nav.manifest.<locale>.json` 供前端加载
- PR-M 供应链加固 2.0：npm ci + Audit/License 审计、CycloneDX SBOM、SRI 哈希变更守门
- PR-M（规划中）：SEO / OpenGraph 优化，使知识库更易被搜索引擎收录与展示
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
│  ├─ zh/                # 中文站点（首页、聚合页、内容源）
│  │  ├─ content/        # 中文内容源（每篇文章一个文件夹）
│  │  └─ _generated/     # pagegen 输出（分类/系列/标签/归档）
│  ├─ en/                # 英文站点（入口、聚合页、内容源）
│  │  ├─ content/        # 英文内容源
│  │  └─ _generated/     # 英文聚合页
│  ├─ public/            # 静态文件（rss.xml、sitemap.xml 由脚本生成）
│  └─ .vitepress/        # VitePress 配置与主题
├─ security/             # CSP/SRI 模板配置
├─ schema/               # Frontmatter schema 与 tag 别名
├─ scripts/              # 生成器与校验脚本
│  └─ pagegen/           # Pagegen 模块化实现（collect/sync/feeds/i18n 等）
└─ .github/workflows/    # CI
```

## 命令
- `npm run gen`：生成分类/系列/标签/归档 + RSS/Sitemap
- `npm run gen -- --full-sync`：强制全量同步内容目录（默认增量），也可通过设置环境变量 `PAGEGEN_FULL_SYNC=1` 达到同样效果
- `npm run gen -- --no-cache`：禁用内容缓存重新解析 Markdown，亦可设置 `PAGEGEN_DISABLE_CACHE=1`
- `npm run gen -- --no-batch`：回退到串行写入（禁用批量写入与哈希跳过），或设置 `PAGEGEN_DISABLE_BATCH=1`
- `PAGEGEN_CONCURRENCY=<num>`：控制内容解析并发度（默认 8），可在 `npm run gen` 前临时指定
- `npm run test:pagegen`：运行 Pagegen 模块单元测试（采集、聚合、i18n 注册）
- `npm run precheck`：Frontmatter Schema 校验（阻断）
- `npm run build`：构建站点（前置 `gen` + `knowledge:build`），自动生成中英双语 RSS/Sitemap
- `npm run pwa:build`：独立构建 PWA 产物（`sw.js`、`manifest.webmanifest`、`icons/`）
- `npm run dev`：本地开发（前置 `gen`）
- `npm run knowledge:build`：单独更新 `/api/knowledge.json`（段落级知识数据）
- `npm run eval:offline`：基于 `data/gold.jsonl` 运行离线检索评测（nDCG/MRR/Recall），确保不低于 `scripts/eval/baseline.json`
- `npm run ai:all`：执行 AI 自演进管线（文本嵌入 / 摘要 / 问答，占位实现）
- `npm run audit`：运行 `npm audit --omit=dev`（不阻断，输出依赖安全告警）
- `npm run license`：汇总第三方许可证（`license-checker --summary`）
- `npm run sbom`：生成 CycloneDX SBOM（输出到 `docs/public/.well-known/sbom.json` 并同步 dist）
- 离线验证：`npm run build` → `npx vitepress preview docs --host 127.0.0.1 --port 4173`，在浏览器中访问站点、打开 DevTools → Application → Service Workers，勾选 “Offline” 后刷新确认最近访问页和搜索仍能使用缓存；同时观察底部“检测到新版本/已缓存”提示条触发刷新

## 协作约束速查

> 以下清单同步自仓库根部的 `AGENTS.md`，便于贡献者在不离开 README 的情况下快速了解约束与常用命令。

- **角色与脚本管线**：通过 `codex run <task>` 调用 `.codex/*.mjs` 中的脚本，涵盖 `plan`、`precheck`、`gen`、`build`、`deploy`、`audit` 等角色；`publish` 会串联 tags 规范化 → precheck → gen → build → git 推送。
- **环境要求**：Node ≥ 22、npm ≥ 10、git ≥ 2.45，`.env` 需包含 `BASE=/ling-atlas/`、`SITE_ORIGIN=https://<user>.github.io/ling-atlas`、`GIT_REMOTE=origin`、`GIT_BRANCH=main`。
- **首次初始化**：建议执行 `codex run setup --base "/ling-atlas/" --site "https://<user>.github.io/ling-atlas"`，完成依赖安装、预检、聚合页生成与首次构建。
- **CI 守门**：默认 `npm ci` 安装依赖，持续运行 Pagegen 单测、前置校验、生成聚合页；体积预算与 Lighthouse 可按需开启（参考 `node .codex/budget.mjs` 与 `npx lhci autorun`）。
- **内容生产力工具**：通过 `npm run md:lint`、`node scripts/check-links.mjs`、`node scripts/img-opt.mjs` 守门 Markdown、链接与图片质量；其中 `check-links` 会额外校验 `nav.manifest.<locale>.json` 与 `i18n-map.json` 内的目标路径，必要时可在 CI 中暂时调高阈值或跳过。
- **Landing 入口 BASE 兜底**：`docs/index.md` 的内联重定向脚本会写入 `__LING_ATLAS_ACTIVE_BASE__` 并由 `<script setup>` 在 hydration 期间复用，确保 `/` 与 `/ling-atlas/` 等不同 BASE 下的首屏重定向一致；前端通过 `docs/.vitepress/theme/base.mjs` 统一读取、缓存与复用该 BASE，Locale Toggle、导航 manifest 以及 Telemetry 资产加载都会依赖此模块。如需修改入口，请同步维护内联脚本、`base.mjs` 与相关调用。

## 即将开展的审查路线

本阶段聚焦于梳理工程协作约束与 Pagegen 重构进度，按照以下顺序逐步审查：

1. **协作规约复核**（`AGENTS.md`、`README.md`、`.codex/`）——确认命令入口、环境变量与发布节奏，形成可执行清单。
2. **目录与模块盘点**（`schema/`、`docs/zh/plans/`、`scripts/`、`tests/fixtures/`）——锁定需要重点巡检的脚本、配置与文档，更新路线图与计划文档。
3. **Pagegen 模块深入检查**（`scripts/pagegen/*.mjs`、`tests/pagegen.test.mjs`）——核对模块化拆分、增量同步、批量写入与 i18n 逻辑，结合 `npm run test:pagegen` 覆盖范围制定补测方案。
4. **配套守门脚本回顾**（`scripts/validate-frontmatter.mjs`、`scripts/check-links.mjs`、`node scripts/embed-build.mjs`）——确保与 Pagegen 输出一致且具备回滚/降级策略。

每个步骤的审查结果会同步到 `docs/zh/plans/pagegen-refactor-roadmap.md` 与 `AGENTS.md` 的路线图章节，方便后续代理或贡献者继续推进。

## 部署（GitHub Pages）
1. 打开 **Settings → Pages**，选择 **GitHub Actions**。
2. 工作流文件在 `.github/workflows/deploy.yml`；首次 push 后会自动部署。
3. 自定义域名建议使用子域（如 `kb.example.com`），并开启 HTTPS。
4. 更多细节参考 [docs/zh/DEPLOYMENT.md](docs/zh/DEPLOYMENT.md)，迁移路径与重写策略见 [docs/zh/MIGRATION.md](docs/zh/MIGRATION.md)。

## 安全与索引
- `.well-known/security-headers.txt`：`npm run build:search` 会自动更新并同步到发布目录，同时在静态页面注入 CSP `<meta>`。
- CSP `<meta>` 会跳过 `frame-ancestors` 指令（浏览器限制），构建时会输出警告，部署到生产环境时请通过服务器响应头追加该指令。
- `.well-known/sri-manifest.json`：记录外部资源的 SRI；若 CDN 内容变更但未更新 `security/sri-allowlist.json`，CI 会直接失败。
  - 离线或无法访问 CDN 时，`node scripts/sri.mjs` 会沿用 allowlist 中的哈希写入 manifest，同时打印跳过校验的警告；请在网络恢复后重新运行以确认哈希未漂移。
- `docs/public/robots.txt`：默认禁止抓取 `/data/`、`/admin/`，并指向站点 `sitemap.xml`。
- `docs/public/sitemap.xml`：由 PageGen 生成，保持与 robots 中链接一致。
- AI 自演进产物：`docs/public/data/embeddings.json`、`summaries.json`、`qa.json`，CI/构建阶段自动刷新，失败不阻断主流程。
- 搜索评测：`data/gold.jsonl` 维护标注，`node scripts/eval/offline.mjs` 运行离线指标；线上调试可通过 `?variant=lex|rrf|rrf-mmr` 切换，与默认 `rrf-mmr` 做 Team Draft 交替曝光，点击偏好会记录匿名 hash 与位次。
- 多语言：`npm run gen` 会同步各语言内容到 `docs/<locale>/content`，并产出 `/<locale>/_generated/**`、按语言划分的 RSS/Sitemap 与 `docs/<locale>/_generated/nav.manifest.<locale>.json`。导航根据 manifest 裁剪分类/系列/标签/归档，仅展示目标语言真实存在的聚合入口；缺少映射时回退到语言首页或 manifest 中的首个聚合页，避免空链。
  - 导航栏中有两类语言切换：
    1. **VitePress 默认下拉菜单**（`localeLinks`），负责跳转到当前页面的另一语言版本，但只在两侧都有对等文章时才安全；因此配置中默认关闭该下拉，以免聚合页落到缺失的 slug 导致 404。
    2. **自定义按钮**（`LocaleToggleButton.vue`），与亮/暗色主题开关类似，读取 `docs/public/i18n-map.json` 与 `nav.manifest.<locale>.json`；仅当目标语言存在对应 slug 或可用聚合页时展示，缺少映射则直接回退到语言首页。
  - 自定义按钮的下拉选项会结合 `i18n.ui.localeToggleHint` 的提示词附加“已翻译 / 聚合回退 / 首页跳转”等标记，帮助读者预判切换后的落点；新增语言时请同步补充该段翻译，避免出现空白后缀。每个选项的 `title` 与 `aria-label` 会读取 `i18n.ui.localeToggleDetail` 提供的完整说明，缺失时会回退到默认语言的文案，请一并维护。
  - 两者共享同一份语言配置，但逻辑完全独立；保留按钮、关闭下拉即可避免依赖关系导致的 404 问题。
  - `tests/pagegen/i18n-registry.test.mjs` 已补充“仅英文聚合”与“聚合独占单语”等回归场景，确保 nav manifest 只暴露真实存在的聚合入口并避免 i18n-map 输出缺失语言的映射，CI 若失败请优先排查聚合产物。
  - `node scripts/check-links.mjs` 会在链接巡检阶段同步验证 Markdown、`nav.manifest.<locale>.json` 与 `i18n-map.json` 的目标路径，阻止聚合入口与跨语言映射指向不存在的页面。
  - `docs/.vitepress/theme/Layout.vue` 复用 `locale-map-core` 的 `normalizeRoutePath`、`getFallbackPath` 与 `hasLocalePrefix` 维护首页重定向与导航品牌跳转，保持与 Locale Toggle 的定位逻辑一致。
  - Landing 页与主题共享 `docs/.vitepress/theme/composables/preferredLocale.mjs`，统一本地存储键、重定向与 Locale Toggle 的首选语言记忆；调整记忆策略时需同步更新内联重定向脚本与该模块。
  - 搜索面板（`SearchBox.vue`）的结果归类会调用 `localeMap` 的 `detectLocaleFromPath` 判断条目语言，并继承聚合页的兜底策略；调整搜索排序或新建入口时请复用该模块，避免重新实现 BASE/语言判定。
- `npm run test:theme` 会执行 `tests/locale-map/core.test.mjs`、`tests/theme/nav-core.test.mjs` 与 `tests/theme/preferred-locale.test.mjs`，既覆盖 Locale Toggle 的降级逻辑，也校验导航裁剪与首选语言记忆仅依赖真实存在的聚合与存储键。
- `scripts/postbuild-pwa.mjs` 会在 `npm run build` 结束后补全 Workbox 预缓存的 HTML 列表，确保 Service Worker 导航回退不会再触发 `non-precached-url` 错误。
- 供应链：CI 默认 `npm ci` 安装，审计输出（`npm run audit`、`npm run license`）可追踪依赖风险；`npm run sbom` 及构建流程会生成 `docs/public/.well-known/sbom.json`，SRI 哈希变化需先更新 allowlist，否则脚本将阻断。

## 约定
- 所有文章文件置于 `docs/<locale>/content/**/index.md`（例如 `docs/zh/content/**/index.md`）；Frontmatter 字段遵循 `schema/frontmatter.schema.json`。
- `status: draft` 的文章不会进入聚合页与 RSS/Sitemap。

## FAQ
- **可以放在根仓库吗？** 可以，但推荐独立仓库，后续可用 subtree 回挂到旧仓 `docs/`。
- **中文标题如何转 slug？** `scripts/slug.ts` 提供简版实现，优先手写 `slug` 字段。
- **如何自定义默认语言？** 生成器默认以 `docs/zh/content` 作为首选语言，输出 `/zh/` 路由；如需调整，可在 `scripts/pagegen.locales.mjs` 中修改 `preferred`、`basePath` 与内容目录配置，并为新的默认语言补齐 `docs/<locale>/` 站点结构。

---

> 名称约定：仓库名 **ling-atlas**，站点标题“Ling Atlas · 小凌的个人知识库”。
