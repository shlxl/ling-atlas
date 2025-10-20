---
title: SEO 与 OpenGraph 配置运维手册
---

> 站点级 `<meta>`、OpenGraph、Twitter 卡片与 canonical 链接均托管在 `schema/seo.json`。本文提供修改步骤、最小验证与回滚策略，确保在不改动主题源码的情况下安全上线配置。

## 1. 适用场景

- 更新站点默认的 `description`、`keywords`、`robots` 等 meta 字段。
- 调整 OpenGraph/Twitter 卡片（如站点图片、`og:locale`、`twitter:card`）。
- 为特定语言覆盖默认描述或社交分享字段。
- 统一 canonical 域名或处理多语言站点的自定义域。

## 2. 调整前的快速检查

1. 确认目标文件：`schema/seo.json`（Schema 在 `schema/seo.schema.json`）。
2. Node ≥ 22、依赖已安装（`npm i`）。
3. 建议 `git status` 确认工作区干净，方便观察 diff。
4. 若计划覆盖语言，请核对 `schema/locales.json` 中的语言编码保持一致。

## 3. 标准操作流程

1. **编辑配置文件**
   - `defaults.meta`：站点级 `<meta name="...">`，支持字符串或字符串数组（数组会自动拼接为逗号分隔的字符串）。
   - `defaults.openGraph`：`og:*` 字段，支持 `type`、`site_name`、`image`、`locale` 等；字段值会在构建时自动补全为绝对 URL。
   - `defaults.twitter`：`twitter:*` 字段，常见值包含 `card`、`creator`、`image` 等。
   - `defaults.canonical.base`：canonical 域名；若运行环境通过 `SITE_ORIGIN` 提供真实域名，会自动覆盖占位值。
   - `locales.<code>`：覆盖指定语言的 meta/OG/Twitter 字段，仅填写需要差异化的键即可。
2. **运行 Schema 与引用校验**

   ```bash
   npm run config:seo
   ```

   - 命令会读取 `schema/seo.schema.json` 校验字段类型，并确保 `canonical.base` 是合法 URL。
   - 未在 `schema/locales.json` 声明的语言会给出警告，方便及时补齐。
3. **最小化测试**

   ```bash
   npm run precheck              # 串联 Frontmatter + 所有配置校验
   npm run test:theme            # 运行主题相关单测（含 SEO 断言）
   node --test tests/theme/seo-head.test.mjs
   ```

   - 主题测试会验证 `<meta>`/`<link rel="canonical">` 的 SSR 输出与语言覆盖行为。
   - `seo-head` 单测确保 canonical 与 OG/Twitter 字段在不同语言下正确落盘并补全绝对 URL。
4. **可选的本地验证**
   - 执行 `npm run dev`，在浏览器 DevTools → Elements 中确认 `<head>` 的 meta/canonical 输出是否符合预期。
   - 切换语言或路由观察 meta 更新情况，确保 SPA 导航时标签会刷新。

## 4. 字段与注意事项

- `meta.keywords` 可填写数组，最终会以逗号分隔形式注入。
- `openGraph.image`、`twitter.image` 支持相对路径，构建时会自动拼接 BASE 与 `SITE_ORIGIN`。
- 未显式声明的 `og:description` / `twitter:description` 会回退到 `meta.description`，无需重复维护。
- canonical 链接默认组合 `SITE_ORIGIN` + 路由，若需为某语言使用独立域名，可在 `locales.<code>.canonical.base` 中覆盖。

## 5. 回滚策略

- 若修改导致 CI 失败或上线效果异常，可直接恢复上一版 `schema/seo.json`。
- 运行 `npm run config:seo && npm run precheck` 确认校验通过，再执行 `npm run test:theme` 验证 `<meta>` 输出恢复。
- 如需紧急回退生产环境，可在 `.env` 或构建环境中暂时恢复旧的 `SITE_ORIGIN`，重新执行 `codex run publish` 发布。

## 6. 检查清单

- [ ] `schema/seo.json` 通过 `npm run config:seo` 校验，无未知语言或无效 URL 警告。
- [ ] `npm run precheck` / `npm run test:theme` / `node --test tests/theme/seo-head.test.mjs` 全部通过。
- [ ] 本地或预览环境中，语言切换后 `<meta>` 与 canonical 正确更新。
- [ ] README、AGENTS 或相关文档已根据实际改动同步更新（如新增字段、说明等）。

> 修改完成后，请在 PR 描述或变更说明中记录字段调整与验证结果，方便后续追溯。
