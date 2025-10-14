
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

## 内容生产力守门

- Markdown Lint：`npm run md:lint`（使用 markdownlint-cli2，可提前发现标题序号、行长等问题）。
- 链接检查：`node scripts/check-links.mjs`（默认校验站内路径是否存在；如需校验外链，可自行扩展）。
- 图片优化：`node scripts/img-opt.mjs`（扫描 `docs/public/images/`，生成 WebP 与缩放版本，后续可据此替换引用）。
- CI 已在 `precheck` 之后自动执行以上步骤，失败会阻断构建；若需临时跳过，可在工作流中注释对应命令。
- 回滚策略：若短期无法达标，可临时提高环境变量阈值或注释相关步骤，但应尽快修复体积/性能问题。
