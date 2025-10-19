
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

### 导航 / 标签 / SEO Playbook

- 在修改 `schema/nav.json`、`schema/tag-alias.json` 或 `schema/seo.json` 前，请先阅读 `docs/zh/plans/nav-config-playbook.md` 与 `docs/zh/plans/seo-config-playbook.md`。
- Playbook 提供配置步骤、守门命令、dry run 验证与常见故障排查；执行完文档中的“最小验证”后再运行 `codex run publish`。

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
npm run stats:lint
npm run ai:prepare
npm run ai:smoke
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

- CI 现已在主干推送时执行 `node scripts/stats-diff.mjs --baseline origin/main:data/stats.snapshot.json --current data/stats.snapshot.json --quiet --json`，并将结果写入 Step Summary 与工件；fork PR 会自动跳过并给出提示。
- 主干推送同时会安装 `libnspr4` 并运行 `npx lhci autorun --collect.chromeFlags="--no-sandbox"`，PR 流水线则保持跳过以控制耗时。
- PWA 离线缓存（`vite-plugin-pwa` / Workbox）与 AI 自演进能力（自动嵌入、摘要、Q&A 导出）与 Lighthouse 解耦，可先开发并上线，再用 Lighthouse 回归验证性能与体验。

### AI 自演进（PR-I）

- 构建阶段新增脚本：`node scripts/embed-build.mjs`（必跑，占位文本）、`node scripts/summary.mjs || true`、`node scripts/qa-build.mjs || true`，产物输出到 `docs/public/data/`。
- 如本地尚未接入模型，脚本会退化为文本/元信息导出，不会阻塞构建；后续可替换为 Transformers.js / onnxruntime-node 编码器。
- 前端可按需读取 `embeddings.json`、`summaries.json`、`qa.json`（例如搜索框或专门的问答页）；缺失时不影响正常渲染。
- 脚本会在 `data/ai-events/` 写入 `ai.embed.*`、`ai.summary.*`、`ai.qa.*` 遥测事件，记录批次数量、推理/写入耗时、成功率与产物路径等信息；`node scripts/telemetry-merge.mjs` 会清理已消费的事件文件，并将结果聚合为与 `build.pagegen` 对齐的 `build.ai` 节点同步到 `docs/public/telemetry.json`。可通过 `AI_TELEMETRY_DISABLE=1` 临时停写事件，或设置 `AI_TELEMETRY_PATH=<dir>` 将事件重定向至指定目录（测试/沙箱场景）。
- 适配器配置：通过环境变量 `AI_EMBED_MODEL`、`AI_SUMMARY_MODEL`（问答可用 `AI_QA_MODEL` 覆盖）或命令行参数 `--adapter <adapter>:<model>` 选择实现；默认或显式设置 `placeholder` 时沿用占位逻辑。
- 依赖提示：`transformers-node` 适配器需要 `npm install @xenova/transformers` 并提前准备模型（默认缓存到 `~/.cache/huggingface/`，离线部署可设置 `TRANSFORMERS_CACHE`）；`onnxruntime` 适配器需要 `npm install onnxruntime-node`，并手动下载 `.onnx` 模型至本地可读目录。
- 降级与缓存：脚本会输出 `ai.*.adapter.*` 结构化日志，记录解析、失败与成功事件；若适配器执行失败或产出为空，会自动回退到 placeholder 并复用上一版 JSON 产物，保障前端体验。
- 模型准备：`npm run ai:prepare` 读取 `data/models.json`，将所需模型写入默认缓存 `data/models/`（或通过 `AI_MODELS_SCOPE=global`、`AI_MODELS_DIR=<dir>` 指定位置），同时校验 SHA256 与缓存状态；传入 `--clean` 或设置 `AI_MODELS_CLEAN=1` 会清理清单外的旧缓存。
- 最小验证：`npm run ai:smoke` 基于 manifest 中的 `smokeTest` 定义执行最小推理；当 `AI_RUNTIME=placeholder` 或显式设置 `AI_*_DISABLE=1` 时自动跳过，日志会写入 `ai.models.smoke.*` 事件。
- 快速回滚：清空相关环境变量或改为 `placeholder`，依次运行 `npm run ai:prepare` 与 `npm run ai:all` 即可恢复占位产物；必要时可删除 `docs/public/data/embeddings.json`、`summaries.json`、`qa.json` 后再执行脚本。
- 测试：`node --test tests/ai/*.test.mjs` 覆盖占位逻辑、CLI 解析与 mock 适配器注入，确保扩展实现可被安全替换。
- 导航栏已包含 `About`（观测指标、常见问答）与 `指南`（部署指南、迁移与重写）入口，确保这些文档始终可见。
- PR-J 知识 API + Chat：`node scripts/chunk-build.mjs` 生成 `/api/knowledge.json`，前端懒加载聊天组件并在知识不可用时回退到 Pagefind 结果。
- PR-K 搜索评测：`node scripts/eval/offline.mjs` 守门 nDCG/MRR/Recall，`?variant=lex|rrf|rrf-mmr` 触发 Team Draft 交替曝光并写入匿名遥测。
- PR-L 多语/i18n：`schema/locales.json` 驱动多语言目录与文案，`pagegen` 会按配置遍历每个语言目录生成聚合页、RSS、Sitemap，并同步路径映射到 `docs/public/i18n-map.json`；`npm run gen` 与 `npm run test:pagegen` 会自动依据最新配置执行。
- PR-M SEO/OpenGraph 配置：`schema/seo.json` 驱动站点级元数据，主题已注入 `<meta>`/`<link rel="canonical">` 并提供回滚策略。
- PR-M 供应链加固 2.0：CI 强制 `npm ci`；新增 `npm run audit`、`npm run license`、`npm run sbom`；`scripts/sri.mjs` 对外链哈希差异直接报错，`docs/public/.well-known/sbom.json` 输出 CycloneDX SBOM。离线或 CDN 无法访问时脚本会沿用 allowlist 的哈希并打印警告，不会阻断构建；联网后请重新执行确认哈希仍然匹配。

## 9. 下一阶段任务：Pagegen 优化重构

- ✅ 阶段 0：已在 `docs/zh/plans/pagegen-baseline.md` 记录基线耗时与 `_generated` 文件数，并在脚本中加入阶段耗时日志。
- ✅ 阶段 1：完成内容采集与同步/聚合/RSS/Sitemap/i18n 的模块拆分（`scripts/pagegen/*.mjs`），并新增 `npm run test:pagegen` 覆盖采集、同步、聚合、Feed 与 i18n 注册逻辑。
- ✅ CI 已在 `生成聚合页` 后新增 “Pagegen 单元测试” 步骤，确保模块化后的行为在流水线中持续受测。
- ✅ 阶段 2：`syncLocaleContent` 支持基于 mtime/size 的增量同步与缓存快照（`data/pagegen-sync.<locale>.json`）；`collectPosts` 增加缓存与并发解析（`data/pagegen-cache.<locale>.json`），可使用 `--no-cache`/`PAGEGEN_DISABLE_CACHE=1` 退回纯解析；相关指标写入 `data/pagegen-metrics.json`。
- ✅ 阶段 3：写入任务批处理 + 内容哈希已上线，可通过 `--no-batch`/`PAGEGEN_DISABLE_BATCH=1` 回退串行写入；`data/pagegen-metrics.json` 输出写入命中与失败统计。
- ✅ 阶段 4（进行中）：`schema/locales.json` + `schema/locales.schema.json` 已接管语言配置，`scripts/pagegen.locales.mjs` 运行时会读取并校验 JSON Schema，计算结果缓存到 `.codex/cache/pagegen-locales.cache.json`。前端主题的 Locale 列表、主题切换文案与 Landing 语言卡片同样复用该 JSON，确保 Pagegen / 主题保持一致；README/AGENTS 已补充运维指引。后续若新增语言，请编辑 JSON 配置并运行 `npm run gen` 验证。
- ✅ 导航配置初稿上线：`schema/nav.json` + `schema/nav.schema.json` 描述聚合/固定链接/分组结构，Pagegen 在生成 nav manifest 时读取配置，VitePress 主题也会同步解析；如需增减导航入口，请先修改 JSON 再运行 `npm run gen` + `npm run test:theme` 校验。
- ✅ 阶段 1 后续：已补齐 orchestrator 输入/输出契约说明，扩展 `npm run test:pagegen` 端到端用例并统一阶段/语言/目标路径错误日志格式。
- 📌 规划文档：`docs/zh/plans/refactor-optimization.md`（提案）、`docs/zh/plans/pagegen-refactor-roadmap.md`（路线图）、`docs/zh/plans/pagegen-validation-checklist.md`（产物守门）。

## 10. 当前协作与审查计划（2024-XX）

- ✅ **协作约束清单**：已将 `AGENTS.md` 与 README 中的关键命令、环境与守门策略汇总到 README《协作约束速查》章节，方便快速查阅。
- ✅ **模块与目录盘点**：已在 `docs/zh/plans/module-inventory.md` 汇总 `schema/`、`scripts/`、`docs/zh/plans/`、`tests/` 的现状与后续动作，后续如有更新请同步维护该文档。
- ✅ **Pagegen 深入检查**：`docs/zh/plans/pagegen-deep-dive.md` 与 orchestrator 契约说明已对齐，metrics/日志/集成测试缺口完成收敛，并补强导航与 i18n 预检用例。
- ✅ **多语言内容统计**：`npm run stats:lint` 现按语言聚合分类/标签，CI 已提交 `data/stats.snapshot.json` 工件，可长期观察内容演进；README/协作清单已同步新增命令说明。
- ✅ **局部重建实验完成**：`scripts/pagegen/sync.mjs`、`scripts/pagegen/collect.mjs` 与 orchestrator 串联 Git 快照与缓存命中信息，默认增量流程已在多语言目录验证通过，并补齐运行指引。
- ✅ **指标时间序列基线已建立**：`node scripts/telemetry-merge.mjs` 会把最新阶段指标写入 `data/telemetry.json` 并带时间戳，README/路线图同步记录导出步骤，形成可追溯快照。
- ✅ **AI 产出质量评测蓝本到位**：基准集整理于 `data/gold.jsonl`，`npm run ai:smoke` 在 placeholder 运行时会读取并输出跳过日志，评测指标方案写入规划文档供后续接入。
- 📌 **下一阶段重点**：
  1. 🧪 在 CI 与 `codex run gen` 中默认启用局部重建，并提供结构化 Step Summary 与 `--full-build` 回退指令，确保增量失败时可自动切换全量模式。
  2. 📊 将 `data/telemetry.json` 的时间序列搬运到站点“观测指标”页面，补充可视化与阈值告警脚本，并定义历史快照的保留与滚动策略。
  3. 🤖 将 `data/gold.jsonl` 评测基线接入 `npm run ai:smoke`，输出分数与阈值判定，失败时触发占位实现回退并记录结构化日志。

- ✅ **Feeds 模板配置化**：`schema/feeds.templates.json` 与 `scripts/validate-feeds-template.mjs` 已落地，Pagegen 按语言加载模板并在 `tests/pagegen/feeds.test.mjs` 覆盖自定义/限流场景。
- ✅ **链接巡检守门补测**：`tests/pagegen/check-links.integration.test.mjs`（含临时目录）补齐 `node scripts/check-links.mjs` 的失败路径断言，CI 现可直接阻断缺失链接。
- ✅ **SEO/OpenGraph Schema**：`schema/seo.json` + 主题 `<meta>` 注入已上线，运维流程同步收录在 README 与 `docs/zh/plans/seo-config-playbook.md`。
- ✅ **AI 适配层**：`scripts/ai/adapters/*` 已支持 Transformers.js 与 onnxruntime-node，占位实现仍可回退；`node scripts/qa-build.mjs`/`summary.mjs` 输出结构化遥测供后续分析。
- ✅ **导航与 i18n 预检显式化**：i18n registry 与导航配置加载过程会在 manifestKey/slug 缺失时即时抛错，`normalizeAggregates` 等关键路径同步补强定位信息，对应单测已覆盖误删/拼写错误场景。
- ✅ **Pagegen 指标可观测性**：collect 阶段输出缓存命中率、解析错误摘要；feeds 阶段记录各语言 RSS/Sitemap 数量并写入 metrics JSON，CLI/Telemetry 同步展示缓存命中与写入跳过统计，dry-run/CI 可直接观察。
- ✅ **失败场景补测**：新增 `tests/pagegen/collections.failures.test.mjs` 与 feeds 写入失败用例，确保文件系统异常会被抛出并纳入守门。
- 🔁 **结果同步机制**：所有阶段性结论将同步回本文件与 `docs/zh/plans/pagegen-refactor-roadmap.md`，保持多代理协同一致性。
- ✅ **Landing 入口 root 兼容**：`docs/index.md` 的预渲染脚本会写入 `__LING_ATLAS_ACTIVE_BASE__` 并在 Vue hydration 期间复用，确保 Lighthouse/本地 root 服务下的 locale 重定向保持一致；前端会通过 `docs/.vitepress/theme/base.mjs` 统一读取与缓存该 BASE，Locale Toggle、导航 manifest 与 Telemetry 资产加载均复用同一逻辑。如需调整入口，请同步更新内联脚本、`base.mjs` 与 `<script setup>` 内的调用。
  Layout.vue 已改用 `locale-map-core` 暴露的 `normalizeRoutePath`、`getFallbackPath` 与 `hasLocalePrefix` 判断首页跳转与导航品牌链接，避免与 Locale Toggle 的检测分叉。
  Landing 页的 `usePreferredLocale` 现直接复用 `docs/.vitepress/theme/composables/preferredLocale.mjs`，保持与 Layout/Locale Toggle 共用的存储键与回忆逻辑；修改存储策略时需同步内联重定向脚本与该模块。
  Locale Toggle 的选项文本会读取 `i18n.ui.localeToggleHint` 追加“已翻译 / 聚合回退 / 首页跳转”等标记，帮助读者理解切换结果；新语言若缺少对应翻译会出现空白后缀，提交前请补齐。选项的 `title` 与 `aria-label` 会使用 `i18n.ui.localeToggleDetail` 的文案提示最终跳转落点，如缺失会回退到默认语言，请同步维护。
  搜索框的结果排序现在依赖 `docs/.vitepress/theme/composables/localeMap.ts` 输出的 `detectLocaleFromPath` 来判断条目语言，并沿用聚合兜底策略；结果列表会依据 `i18n.ui.searchLocaleBadge` 的文案展示“本语言/跨语言回退”徽标，帮助读者预判落点。调整搜索逻辑时请确保仍复用该模块并同步维护该段翻译，避免重新实现语言判定或遗漏 BASE 兼容处理。
- ✅ **Nav manifest 回归测试**：`npm run test:pagegen` 现包含单元 + 集成测试，`tests/pagegen/nav-manifest.integration.test.mjs` 会实际运行 `pagegen.mjs` 构建最小多语言站点，核对 `_generated`/`nav.manifest.<locale>.json`、i18n map 与指标摘要；`tests/pagegen/i18n-registry.test.mjs` 仍覆盖 manifest 引用与 canonical 注册的边界场景，CI 失败时请优先检查聚合目录或 locales 配置。
- ✅ **Nav manifest / i18n map 链接守门**：`node scripts/check-links.mjs` 会同时校验 Markdown 内部链接与 `nav.manifest.<locale>.json`、`i18n-map.json` 的目标路径，确保聚合入口与跨语言映射不会指向缺失页面。
- ✅ **Locale 切换兜底测试**：`npm run test:theme` 会执行 `tests/locale-map/core.test.mjs` 与 `tests/theme/preferred-locale.test.mjs`，验证当目标语言缺失聚合页时的跳转降级，以及首选语言记忆是否与主题共享存储键，确保不会出现空链或偏离记忆的跳转。
- ✅ **导航裁剪回归测试**：同一个命令也会跑 `tests/theme/nav-core.test.mjs`，覆盖 manifest 裁剪、归档兜底与缺失 manifest 时的遗留导航逻辑，确保导航栏仅呈现真实存在的聚合入口。

## 内容生产力守门

- Markdown Lint：`npm run md:lint`（使用 markdownlint-cli2，可提前发现标题序号、行长等问题）。
- 链接检查：`node scripts/check-links.mjs`（默认校验站内路径是否存在，并额外回归 nav manifest 与 `i18n-map.json` 的链接；如需校验外链，可自行扩展）。`npm run test:links` 会基于临时站点夹具验证成功与失败场景，守门脚本行为未漂移。
- 图片优化：`node scripts/img-opt.mjs`（扫描 `docs/public/images/`，生成 WebP 与缩放版本，后续可据此替换引用）。
- 内容统计：`npm run stats:lint`（按语言聚合分类/标签，输出 TopN 并写入 `data/stats.snapshot.json`，CI 会上传快照工件以便持续对比）。
- 本地守门钩子：项目安装依赖后会自动执行 `husky install`，`pre-commit` 钩子会通过 `lint-staged` 对暂存的 Markdown 执行 `npm run md:lint`；若需临时跳过，可使用 `HUSKY=0 git commit ...`。
- CI 已在 `precheck` 之后自动执行以上步骤，失败会阻断构建；若需临时跳过，可在工作流中注释对应命令。
- 回滚策略：若短期无法达标，可临时提高环境变量阈值或注释相关步骤，但应尽快修复体积/性能问题。
