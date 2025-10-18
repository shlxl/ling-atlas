---
title: Pagegen · 导航配置 Schema 草案
---

## 背景

当前 `nav-core` 与 VitePress 配置仍在代码中硬编码“最新 / 分类 / 系列 / 标签 / About / Guides”等结构，路径模板（`/about/metrics.html`、`/DEPLOYMENT.html` 等）也未配置化。随着多语言差异化需求增大，需要将导航结构迁移到统一的 JSON 配置中，供 Pagegen 与前端共同消费，避免多处维护导致的不一致或遗漏。

## 新配置文件

- `schema/nav.schema.json`：Schema 定义，约束导航配置的结构与字段类型。
- `schema/nav.json`：实际配置文件，描述聚合类型、导航分区、固定链接等。

同一配置将用于：
1. Pagegen：决定 nav manifest 的结构（聚合类型、排序、兜底策略）。
2. VitePress：构建顶部导航与侧边入口，并在缺失聚合时自动裁剪。

## Schema 要点

### `aggregates`
- 每个键对应一种聚合入口（如 `latest`、`categories`、`series`）。
- 需要声明：
  - `type`: `archive | category | series | tag`
  - `labelKey`: 对应到 `docs/.vitepress/i18n.json` 中的翻译键。
  - `manifestKey`: Pagegen nav manifest 中对应的字段名。
  - 可选：`sort`, `fallback`（是否可作为缺失时的兜底入口）。

### `sections`
- 按显示顺序声明导航分区。
- 字段：
  - `kind`: `aggregate | link | group`
  - `titleKey`: 文案翻译键。
  - `aggregateKey`: 当 kind 为 `aggregate` 时，指向 `aggregates` 中的键。
  - `items`: kind 为 `group` 时的子项列表。

### `links`
- 约定固定链接路径（如 `/about/metrics.html`），并提供可选的 `labelKey`。

## 约束
- Schema 使用 JSON Schema Draft 7。
- `sections` 中的 `kind` 决定必填字段，通过 Schema 的 `if/then` 实现。
- 后续可扩展 `aggregates` 的 `type` 支持更多聚合（作者、来源等）。

## 迁移步骤（草案）

1. **配置填充**：创建 `schema/nav.json`，按照 Schema 描述现有导航结构（最新 → 分类 → 系列 → 标签 → About → Guides），并为固定链接补齐 `links` 入口。
2. **Pagegen 接入**：
   - `scripts/pagegen.locales.mjs` 负责加载导航配置并附着到语言对象上。
   - `scripts/pagegen/i18n-registry.mjs` 在写出 nav manifest 时读取 `aggregates` 配置，仅输出允许的聚合类型，并根据 `fallback` 字段记录兜底入口。
   - 新增 `scripts/validate-nav-config.mjs`，在 `codex run precheck` 中校验导航配置与 Schema。
3. **主题更新**：
   - `docs/.vitepress/config.ts` 读取 `schema/nav.json` 并传递给 `nav-core.mjs`。
   - `nav-core.mjs` 根据 `sections` 渲染导航，使用 `manifestKey` 对聚合链接进行裁剪，并通过 `links` 模板渲染固定入口（支持 `{routeRoot}` 等占位符）。
   - Locale Toggle 可根据配置中的 `fallback` 聚合决定跳转顺序，缺失时退回语言首页。
4. **文案迁移**：
   - 将 `docs/.vitepress/i18n.json` 中的 `nav` 文案改为由导航配置引用的 `labelKey` 管理，保留旧文件用于兼容 Locale Toggle 等功能。
   - README / AGENTS 更新“导航配置维护”章节，明确新增语言或入口时需要同步修改 JSON。
5. **测试与守卫**：
   - Pagegen 单测为不同配置场景（仅单语聚合、全部缺失等）生成快照，确保 manifest 输出稳定。
   - `tests/theme/nav-core.test.mjs` 基于配置快照验证 `aggregate`、`link`、`group` 三种分区的渲染效果。
   - CI 新增 `node scripts/validate-nav-config.mjs` 步骤，报错时提示缺漏字段或格式问题。

## 评估与风险
- Schema 更新若与现有配置不一致，会在 Pagegen 加载阶段报错；建议在 CI 中加入独立 lint 步骤（`node scripts/validate-nav-config.mjs`）。
- 需要确保在缺失配置时仍能使用合理的默认值，以免外部贡献者误删配置导致站点无法构建。
- 未来可考虑把 `docs/.vitepress/i18n.json` 迁移到统一的 Schema，以减少重复。
