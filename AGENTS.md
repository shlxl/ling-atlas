
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
