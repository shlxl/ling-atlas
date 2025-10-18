---
title: 导航与标签配置运维手册
---

> 本手册帮助你在无需修改源码的前提下，安全地调整站点导航结构、标签别名或其他 Pagegen 相关配置，并确保 CI 守门顺利通过。

## 1. 适用场景

- 新增或调整导航分区、固定链接、聚合入口。
- 更新标签别名 (`schema/tag-alias.json`) 以统一 Frontmatter 标签。
- 在本地或 CI 验证配置变更是否生效、指标是否正常。

## 2. 调整前的快速检查

1. 确认涉及的配置文件：
   - 导航结构：`schema/nav.json` + `schema/nav.schema.json`。
   - 标签别名：`schema/tag-alias.json` + `schema/tag-alias.schema.json`。
   - 若涉及语言/文案，查看 `schema/locales.json`。
2. 确保环境准备：Node ≥ 22，依赖已安装（`npm i`）。
3. 建议 `git status` 确认工作区干净，以便后续 diff 清晰。

## 3. 标准操作流程

1. **编辑配置文件**
   - 导航：按 Schema 更新 `aggregates`、`sections`、`links`。
   - 标签：在 `aliases` 中新增或调整映射，确保键值都是字符串。
2. **运行基础校验**
   ```bash
   npm run config:nav   # 导航变更时执行
   npm run config:tags  # 标签变更时执行
   ```
   这两个命令会在 `npm run precheck` 中自动执行，先本地校验可提前发现 Schema 问题。
3. **Dry Run 采集指标**
   ```bash
   node scripts/pagegen.mjs --dry-run --metrics-output /tmp/pagegen-metrics.json
   ```
   - 不写入产物，输出含 `collect`/`sync`/`write` summary 的 JSON。
   - 若只需 stdout 输出，可使用 `--metrics-only`（或 `PAGEGEN_METRICS_ONLY=1`）。
4. **运行核心测试**
   ```bash
   npm run test:pagegen
   npm run test:theme
   ```
   `tests/pagegen/integration.test.mjs` 会验证 dry run 指标文件结构；`tests/theme/nav-core.test.mjs` 保证导航渲染正常。
5. **必要时查看生成产物**（可选）
   - 执行 `npm run gen` 以生成 `_generated/` 与 `docs/public/` 产物，确认导航 manifest、RSS/Sitemap 内容。

## 4. 常见问题排查

| 问题 | 可能原因 | 排查方法 |
| --- | --- | --- |
| `Invalid navigation configuration` | JSON 字段缺失或类型不符 | 查看 `npm run config:nav` 输出的 `instancePath`，对照 Schema 修复 |
| 导航入口 404 或空白 | 聚合目录未生成，manifest 缺少条目 | 运行 `npm run gen` 检查 `_generated/`；确认 `sections[*].aggregateKey` 是否匹配真实聚合 |
| 标签归一化无效 | Frontmatter 标签与别名不一致 | 核实原始标签拼写，确认 `aliases` 是否覆盖 |
| Pagegen dry run 提示 `collect warnings`/`sync warnings` | Frontmatter 解析失败或文件复制失败 | 按日志中的路径修复内容或权限，再次运行 dry run |

## 5. 提交与 CI 注意事项

- `npm run precheck` 会自动执行导航、标签与 Frontmatter 校验。
- CI 中 `npm run test:pagegen` 与 `npm run test:theme` 必须通过；提交前建议本地跑一遍。
- 若新增导航入口，请同步更新 README 或 AGENTS 相关说明，保持协作一致性。

## 6. 参考资料

- `docs/zh/plans/nav-config-schema.md`：导航配置 Schema 说明。
- `docs/zh/plans/module-inventory.md`：核心目录盘点与守门状态。
- `docs/zh/plans/pagegen-deep-dive.md`：Pagegen 模块 TODO 与现状。
- README “FAQ”：常用命令（dry run、metrics 输出等）。

> 如需将其它常量（如 SEO/OpenGraph 配置）纳入 Schema，可参考以上流程：定义 Schema + 校验脚本 → dry run 验证 → 补充测试。
