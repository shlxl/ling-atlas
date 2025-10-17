
# AGENTS.md · Ling Atlas 自动化部署与协作代理指南

> 让 **Codex CLI / 任意 Agent 工具** 托管从规划到实施的全流程；你只管写内容与做决策。  
> 本文默认仓库名为 `ling-atlas`，站点路径为 `/ling-atlas/`。

---

## 0. 前置假设
- Node ≥ 22、npm ≥ 10、git ≥ 2.45
- 已存在以下目录与文件（来自脚手架）：
  - `scripts/pagegen.mjs`、`scripts/validate-frontmatter.mjs`
  - `docs/.vitepress/config.ts`
  - `.github/workflows/ci.yml`、`.github/workflows/deploy.yml`

---

## 1. 角色分工（Agents）
| 角色 | 职能 | 入口命令 |
|---|---|---|
| `architect` | 读取 schema/taxonomy，规划内容结构与变更 | `codex run plan` |
| `validator` | Frontmatter 校验、日期规范化、标签归一化 | `codex run precheck` |
| `pagegen` | 生成分类/系列/标签/归档、RSS/Sitemap | `codex run gen` |
| `builder` | 注入 BASE/SITE_ORIGIN 后构建 VitePress | `codex run build` |
| `deployer` | 触发/追踪 GitHub Pages 发布 | `codex run deploy` |
| `inspector` | 死链/Lighthouse 体检与报表 | `codex run audit` |

> 本仓已提供 `.codex/*.mjs` 脚本作为这些角色的实现参考。Codex CLI 会调用这些脚本。

---

## 2. 环境变量
在本地创建 `.env`（或在 Actions 的 `env:` 注入）：
```
BASE=/ling-atlas/
SITE_ORIGIN=https://<你的用户名>.github.io/ling-atlas
GIT_REMOTE=origin
GIT_BRANCH=main
```

---

## 3. 首次初始化（Setup）
```bash
codex run setup --base "/ling-atlas/" --site "https://<user>.github.io/ling-atlas"
```
该命令将：
1) 写入/更新 `.env` 的 `BASE` 与 `SITE_ORIGIN`；  
2) 安装依赖（若缺失 `package-lock.json` 则使用 `npm install`）；  
3) 运行 `precheck` → `gen` → `build`；  
4) 推送到远端，触发 Pages。

---

## 4. 日常开发（Dev）
```bash
codex run dev
```
行为：读取 `.env` 注入 `BASE`，先 `gen` 再启动 `vitepress dev docs`。

---

## 5. 发布（Publish）
```bash
codex run publish --message "update: 新增文章 <title>"
```
行为：`tags:normalize` → `precheck` → `gen` → `build` → `git commit & push`。

---

## 6. 常见故障的自动修复策略
- **锁文件缺失**：Agent 自动降级为 `npm install`，并提示提交 `package-lock.json`。  
- **Ajv 严格模式**：已在脚本中设置 `strict:false`，允许 `x-*` 元键。  
- **Windows 路径**：`pagegen` 强制 POSIX 化路径，避免 `/content/index` 死链。  
- **项目站点 404**：构建时注入 `BASE=/ling-atlas/` 与 `SITE_ORIGIN`。

---

## 7. 命令一览（由 Codex CLI 调用）
```bash
codex run setup   --base "/ling-atlas/" --site "https://<user>.github.io/ling-atlas"
codex run precheck
codex run gen
codex run build
codex run publish --message "chore: content update"
codex run dev
codex run audit   # 可选
```

---

## 8. 未来扩展（由 Agents 继续推进）
- 接入 Transformers.js 的 L1 语义检索（浏览器端）
- USearch WASM + Pagefind 的混合检索与 RRF/MMR 融合
- Lighthouse 与资源体积预算的自动化体检与报表

> 原则：所有新功能都通过 `codex run <task>` 接入，保证“可脚本、可回滚、可观测”。

## 性能预算与体检

- 体积预算：默认总大小 ≤ 5 MB，单 JS ≤ 150 KB，单 CSS ≤ 110 KB，可通过环境变量 `BUDGET_TOTAL_MB`、`BUDGET_MAX_JS_KB`、`BUDGET_MAX_CSS_KB` 调整。
- 运行命令：`node .codex/budget.mjs`（CI 自动执行，超限会 fail，并打印 Top 10 最大文件）。
- Lighthouse CI：`npx lhci autorun --collect.staticDistDir=docs/.vitepress/dist --upload.target=temporary-public-storage`。
  - 阈值：performance ≥ 90，accessibility ≥ 90，best-practices ≥ 90。
  - 输出：CI 会显示得分与关键建议；如需调参，可修改 `.lighthouserc.json`。
- CI 环境需预装 `libnss3`, `libnspr4`, `fonts-liberation` 等依赖，以确保 headless Chrome 可正常启动。
- 本地调试遥测：页面控制台执行 `window.__telemetry.export()` 可导出 JSON（写入 `data/telemetry.tmp.json` 后，CI 会在构建阶段自动合并）。

### CI/部署节奏备忘

- 当前流水线默认跳过 Lighthouse（`ci.yml` 中步骤留空），以缩短 `CI + Deploy` 耗时；待新功能稳定后再补回 `npx lhci autorun`。
- PWA 离线缓存（`vite-plugin-pwa` / Workbox）与 AI 自演进能力（自动嵌入、摘要、Q&A 导出）与 Lighthouse 解耦，可先开发并上线，再用 Lighthouse 回归验证性能与体验。
- 若恢复 Lighthouse，请关注运行时长与所需的 Chrome 依赖，必要时只在夜间任务或发布前手动触发。

### AI 自演进（PR-I）

- 构建阶段新增脚本：`node scripts/embed-build.mjs`（必跑，占位文本）、`node scripts/summary.mjs || true`、`node scripts/qa-build.mjs || true`，产物输出到 `docs/public/data/`。
- 如本地尚未接入模型，脚本会退化为文本/元信息导出，不会阻塞构建；后续可替换为 Transformers.js / onnxruntime-node 编码器。
- 前端可按需读取 `embeddings.json`、`summaries.json`、`qa.json`（例如搜索框或专门的问答页）；缺失时不影响正常渲染。
- 导航栏已包含 `About`（观测指标、常见问答）与 `指南`（部署指南、迁移与重写）入口，确保这些文档始终可见。
- PR-J 知识 API + Chat：`node scripts/chunk-build.mjs` 生成 `/api/knowledge.json`，前端懒加载聊天组件并在知识不可用时回退到 Pagefind 结果。
- PR-K 搜索评测：`node scripts/eval/offline.mjs` 守门 nDCG/MRR/Recall，`?variant=lex|rrf|rrf-mmr` 触发 Team Draft 交替曝光并写入匿名遥测。
- PR-L 多语/i18n：`docs/zh/content`（默认中文）与 `docs/en/content`（英文）双目录，`pagegen` 自动生成 `/zh/` 与 `/en/` 聚合页、RSS、Sitemap，并同步路径映射到 `docs/public/i18n-map.json`；Layout 注入语言切换按钮，搜索与 Chat 依据当前语言优先返回同语结果。
- PR-M（待推进）：SEO / OpenGraph 优化与站点地图扩展，让知识库在搜索引擎中拥有更高可见度。
- PR-M 供应链加固 2.0：CI 强制 `npm ci`；新增 `npm run audit`、`npm run license`、`npm run sbom`；`scripts/sri.mjs` 对外链哈希差异直接报错，`docs/public/.well-known/sbom.json` 输出 CycloneDX SBOM。

## 9. 下一阶段任务：Pagegen 优化重构

- ✅ 阶段 0：已在 `docs/zh/plans/pagegen-baseline.md` 记录基线耗时与 `_generated` 文件数，并在脚本中加入阶段耗时日志。
- ✅ 阶段 1（进行中）：完成内容采集与同步/聚合/RSS/Sitemap/i18n 的模块拆分（`scripts/pagegen/*.mjs`），并新增 `npm run test:pagegen` 覆盖采集、同步、聚合、Feed 与 i18n 注册逻辑。
- ✅ CI 已在 `生成聚合页` 后新增 “Pagegen 单元测试” 步骤，确保模块化后的行为在流水线中持续受测。
- ✅ 阶段 2（进行中）：`syncLocaleContent` 支持基于 mtime/size 的增量同步与缓存快照（`data/pagegen-sync.<locale>.json`）；`collectPosts` 增加缓存与并发解析（`data/pagegen-cache.<locale>.json`），可使用 `--no-cache`/`PAGEGEN_DISABLE_CACHE=1` 退回纯解析；相关指标写入 `data/pagegen-metrics.json`。
- ✅ 阶段 3（推进中）：写入任务批处理 + 内容哈希已上线，可通过 `--no-batch`/`PAGEGEN_DISABLE_BATCH=1` 回退串行写入；`data/pagegen-metrics.json` 输出写入命中与失败统计。
- ▶️ 阶段 1 后续：依据 `docs/zh/plans/pagegen-module-architecture.md` 补齐其余模块测试，整理 API 契约后更新 orchestrator。
- 📌 规划文档：`docs/zh/plans/refactor-optimization.md`（提案）、`docs/zh/plans/pagegen-refactor-roadmap.md`（路线图）、`docs/zh/plans/pagegen-validation-checklist.md`（产物守门）。

## 10. 当前协作与审查计划（2024-XX）

- ✅ **协作约束清单**：已将 `AGENTS.md` 与 README 中的关键命令、环境与守门策略汇总到 README《协作约束速查》章节，方便快速查阅。
- ⏳ **模块与目录盘点**：计划逐步梳理 `schema/`、`scripts/`、`docs/zh/plans/` 与 `tests/` 中的核心资源，确认审查顺序并在相关文档中更新路线。
- ⏳ **Pagegen 深入检查**：后续会针对 `scripts/pagegen/*.mjs`、`tests/pagegen.test.mjs` 与缓存/批量写入策略开展专项审查，输出补测与风险清单。
- 🔁 **结果同步机制**：所有阶段性结论将同步回本文件与 `docs/zh/plans/pagegen-refactor-roadmap.md`，保持多代理协同一致性。

## 内容生产力守门

- Markdown Lint：`npm run md:lint`（使用 markdownlint-cli2，可提前发现标题序号、行长等问题）。
- 链接检查：`node scripts/check-links.mjs`（默认校验站内路径是否存在；如需校验外链，可自行扩展）。
- 图片优化：`node scripts/img-opt.mjs`（扫描 `docs/public/images/`，生成 WebP 与缩放版本，后续可据此替换引用）。
- CI 已在 `precheck` 之后自动执行以上步骤，失败会阻断构建；若需临时跳过，可在工作流中注释对应命令。
- 回滚策略：若短期无法达标，可临时提高环境变量阈值或注释相关步骤，但应尽快修复体积/性能问题。
