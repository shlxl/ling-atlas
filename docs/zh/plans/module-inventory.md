---
title: 核心目录盘点（schema / scripts / plans / tests）
---

> 目的：梳理当前仓库关键目录的资产、维护状态与后续动作，便于多代理协同推进后续迭代。

## 1. `schema/`（配置源）

| 文件 | 作用 | 现状 | 后续动作 |
| --- | --- | --- | --- |
| `locales.json` + `locales.schema.json` | 语言配置、主题文案、内容目录映射 | ✅ Pagegen 与主题均已接入；`npm run precheck` 守门 | 如新增语言，先更新 JSON，再跑 `npm run gen`；考虑补充文档示例 |
| `nav.json` + `nav.schema.json` | 导航聚合/固定链接配置 | ✅ Pagegen/nav-core 共用；`npm run config:nav` 校验 | 待补运维说明（参考本文件）、如恢复 Chat 页面可在此增项 |
| `seo.json` + `seo.schema.json` | 站点级 meta/OG/Twitter/canonical | ✅ `npm run config:seo` 校验 + 主题注入 `<meta>`/canonical | 结合 `seo-config-playbook.md` 扩展字段示例 |
| `frontmatter.schema.json` | 内容 Frontmatter 校验 | ✅ `npm run precheck` 引用 | 持续对齐内容字段；视情况扩展可选字段 |
| `tag-alias.json` + `tag-alias.schema.json` | 标签归一化 | ✅ Schema 与校验脚本 (`npm run config:tags`) 已接入 precheck | 继续完善文档示例与失败用例测试 |

> Schema 行为均已整理到运维手册，请在修改前阅读对应 Playbook。

## 2. `scripts/`（自动化脚本）

- **pagegen 系列**：`pagegen.mjs` orchestrator、`pagegen/*.mjs` 拆分模块、`pagegen.locales.mjs` / `validate-nav-config.mjs` / `validate-tag-alias.mjs` 等配置加载脚本。
  - ✅ 模块化、缓存、批量写入、导航配置接入已完成，并新增阶段/语言/目标路径的结构化错误日志。
  - ✅ 深入检查：已按照 `docs/zh/plans/pagegen-module-architecture.md` / `pagegen-refactor-roadmap.md` 补齐 orchestrator 契约说明、导航/i18n 故障显式化与端到端测试。
- **校验脚本**：`validate-frontmatter.mjs`、`validate-nav-config.mjs`、`validate-tag-alias.mjs`、`check-links.mjs`。
  - ✅ 均已通过 `npm run precheck` 执行，`check-links` 仍缺少集成测试守门。
- **构建/运维脚本**：`build-embeddings.mjs`、`generate-headers.mjs`、`postbuild-*`、`sbom.mjs` 等。
  - ✅ 可正常使用，建议在 README/AGENTS 中补充触发方式（部分命令仅在 CI 使用）。
- **评测与统计**：`eval/`、`stats-lint.mjs` 已接入 CI 并上传快照；夜间流程可复用 `npm run stats:diff`。
  - CI 会在上传快照后执行 `node scripts/stats-diff.mjs --baseline origin/main:data/stats.snapshot.json --current data/stats.snapshot.json --quiet --json`，Step Summary 与工件会输出结构化对比结果，fork PR 自动跳过并给出提示。
  - 主干推送额外安装 Chrome 依赖并运行 `npx lhci autorun --collect.chromeFlags="--no-sandbox"`，确保 Lighthouse 分数持续可见；PR 仍可跳过以控制时长。

## 3. `docs/zh/plans/`（规划文档）

| 文档 | 内容 | 状态 | 后续 |
| --- | --- | --- | --- |
| `pagegen-baseline.md` | Pagegen 基线指标 | ✅ 已记录 | 需要定期更新最新数据 |
| `pagegen-module-architecture.md` | 模块拆分方案 | ✅ 已补写 orchestrator 契约说明与阶段依赖矩阵 | 继续回归测试覆盖与指标对齐 |
| `pagegen-refactor-roadmap.md` | 路线图 | ✅ 更新至阶段 4 并同步阶段 1/3/5 完成项 | 按阶段推进后续事项 |
| `pagegen-validation-checklist.md` | 产物守门清单 | ✅ | 结合新配置/脚本持续更新 |
| `aggregation-empty-link-plan.md` | 聚合空链修复方案 | ✅ 已落地 | 若导航策略有大改需回顾 |
| `nav-config-schema.md` | 导航配置 Schema 草案 | ✅ | 持续补充最佳实践 |
| `seo-config-playbook.md` | SEO/OpenGraph 配置运维手册 | ✅ 新增 | 根据新增字段及时更新示例与回滚策略 |
| `refactor-optimization.md` | Pagegen 重构提案 | ✅ | 继续在此追踪风险与收益 |
| `module-inventory.md` | （本文）核心目录盘点 | ✅ 最新 | 定期复盘补充 |

运维手册：`nav-config-playbook.md`、`seo-config-playbook.md` 已记录常见修改流程与回滚步骤，修改配置前请先对照执行。

## 4. `tests/`（守门测试）

- `tests/pagegen/*.test.mjs`：覆盖采集/同步/聚合/Feeds/写入逻辑，并新增导航/i18n 缺失、缓存指标与回滚路径用例，✅。
- `tests/theme/nav-core.test.mjs`：导航裁剪与回退，✅。
- `tests/locale-map/*`：Locale toggle 与路径映射守门，✅。
- 建议补充：
  - 针对 `scripts/check-links.mjs` 的集成测试（可使用临时输出目录）。
  - 当新增 Schema 校验脚本（如 tag alias）时，同步补充失败用例测试。

## 5. 后续行动建议

1. **Feeds 模板配置化**：将 RSS/Sitemap 模板迁移到 `schema/`，并补充校验脚本与示例（SEO 已完成 schema 化）。
2. **运维文档**：根据 `nav-config-schema.md` 草案继续完善操作指南，覆盖 feeds/SEO 模板的修改流程与回滚策略。
3. **Pagegen 守门**：维持缓存命中率与 stats diff 的回归观察，同时准备 `check-links` 集成测试以阻断配置缺失。
4. **测试覆盖加固**：在现有导航/i18n 用例基础上，补充 feeds 模板、自定义配置与链接巡检的失败场景，避免 silent failure。

> 更新日志：2024-XX-XX 由自动化代理首次盘点，后续更新请在本文顶部追加日期。
