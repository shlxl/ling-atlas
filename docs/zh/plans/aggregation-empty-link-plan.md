# 聚合页空链修复方案计划

## 背景

- 站点的导航栏目由 `docs/.vitepress/config.ts` 中的 `navFromMeta` 函数按语言生成，但当前逻辑默认所有聚合页（分类、系列、标签、归档）都会存在，因此直接拼出链接。【F:docs/.vitepress/config.ts†L63-L82】
- 聚合页的静态内容和 i18n 映射在 `scripts/pagegen.mjs` 内一次性生成。该脚本仅在对应目录下确有文章时才写出聚合页文件，也只有在存在文章的情况下才会写入 i18n 对应关系。【F:scripts/pagegen.mjs†L189-L252】【F:scripts/pagegen.mjs†L289-L347】
- 当语言切换到目标语言后，如果某个聚合页并不存在（例如英文侧缺失该分类），导航仍会展示对应入口，最终落到 404；即使 Locale Toggle 会 fallback 到该语言首页，用户仍可能通过导航点到空链。
- README 仍沿用早期的“`docs/zh/content` 与 `docs/en/content` 结构镜像”约定，使得 pagegen、导航与内容生产默认两种语言完全同步；这种假设与当前内容的实际状态相违背，也阻碍了只在英文侧增设聚合页或分类的需求。

## 目标

1. 让 `pagegen` 在生成聚合页时同步输出“可用链接清单”，并区分不同语言下的可用聚合页。
2. VitePress 配置层根据可用清单动态裁剪导航结构，仅渲染真正存在的聚合链接。
3. Locale 切换时，如果目标语言缺少对应聚合页，应优雅降级到该语言的聚合入口（例如分类列表首页或语言首页），避免 404。
4. 在 CI/脚本中加入守护，防止未来重新出现“导航包含空链”的回归。
5. 将内容生产流程从“目录结构镜像”中彻底解耦，允许某种语言独占聚合页或分类，并在站点入口与 README 中给出新的多语协作规范。

## 拆解

以下工作项按从生成到前端呈现的顺序展开，便于分阶段落地并回归。

### 语言解耦方案

- `scripts/pagegen.mjs`：为每种语言独立生成导航 manifest，将聚合类型、slug 与 URL 显式写入，并仅在目标语言实际存在聚合内容时输出条目。
- `docs/.vitepress/config.ts`：读取对应语言的 manifest，基于真实存在的聚合入口裁剪导航结构，同时保持对旧 manifest 缺失场景的兼容。
- `docs/.vitepress/theme/composables/localeMap.ts`：解析跨语言映射时优先查询 manifest，若找不到目标聚合页则回退到该语言的聚合索引或首页。
- `docs/.vitepress/theme/components/LocaleToggleButton.vue`：仅展示实际存在的语言切换目标；当映射缺失时触发上述回退逻辑，避免暴露空链。

### 1. Pagegen 输出可用聚合清单

- 在 `scripts/pagegen.mjs` 中收集每个语言生成的聚合页 slug → 路径，写入 `docs/<locale>/_generated/nav.manifest.<locale>.json`。
- 清单应包含：语言代码、聚合类型（categories/series/tags/archive）、slug 与最终 URL。未来若扩展其他聚合（作者等）也可复用结构。
- 同步更新 `i18n-map.json` 的生成逻辑，确保只在双语都存在时写入跨语言映射，避免记录“半吊子”链接。

### 2. VitePress 导航加载新清单

- 在 `docs/.vitepress/config.ts` 中新增读取 manifest 的辅助函数，根据当前语言过滤掉缺失的聚合项，再调用现有 `navFromMeta` 逻辑拼装导航。
- `navFromMeta` 需要接收“可用 slug 集”作为额外参数，用它来判断是否渲染某个分类/系列/标签入口；若没有对应 slug，就不在导航中渲染。
- 当全部分类或系列均缺失时，折叠该下拉菜单（或隐藏整个条目），以免展示空的分组。

### 3. Locale Toggle / 路由兜底

- 扩展 `docs/.vitepress/theme/composables/localeMap.ts` 与 `LocaleToggleButton.vue`，在解析目标路径时先检查 manifest 中是否存在对应 slug；若不存在则降级到语言首页或聚合主入口。
- 该逻辑也可以复用在搜索结果或站内跳转中：当发现 URL 指向的聚合页在当前语言缺失时，提示“暂未翻译，切换到 XX 语言”。（可作为后续增强。）

### 近期进展

- 登陆页的内联重定向脚本会在检测 BASE 与当前路径不一致时回退到 `/`，并把解析结果写入 `window.__LING_ATLAS_ACTIVE_BASE__`，Vue 侧在 hydration 期间读取该变量避免二次判断偏差。这保证了 Lighthouse、CI 静态预览与本地 `vitepress preview` 使用不同 BASE 时都能落到正确语言入口。
- 新增 `docs/.vitepress/theme/base.mjs` 负责读取 `<meta name="ling-atlas:base">`、`import.meta.env.BASE_URL` 与当前路径推断出的真实 BASE，并缓存到 `window.__LING_ATLAS_ACTIVE_BASE__`；
  `LocaleToggleButton.vue`、`useLocaleMap`、`telemetry.ts` 与 Landing 页的 `<script setup>` 均复用该模块，避免不同入口下出现 BASE 判定分叉。
- 扩充 `tests/pagegen/i18n-registry.test.mjs`，新增“仅存在英文聚合”与“聚合只属于单一语言”两种回归场景，验证 nav manifest 仅写入具备真实聚合页的语言，防止导航渲染空链，并确保 i18n-map 不会记录缺失目标语言的映射。
- 提取 `Locale Toggle` 的聚合解析逻辑为 `locale-map-core`，并通过 `tests/locale-map/core.test.mjs` 验证当聚合缺失时会优雅退回 manifest 提供的入口或语言首页，覆盖 direct mapping、manifest fallback 与纯首页降级的分支。
- 抽离导航构建逻辑为 `docs/.vitepress/theme/nav-core.mjs`，在 `docs/.vitepress/config.ts` 中复用同一实现，并以 `tests/theme/nav-core.test.mjs` 覆盖 manifest 裁剪、归档兜底与无 manifest 时的旧导航回退，确保导航入口与 pagegen 产物保持同步。
- 扩展 `scripts/check-links.mjs`，在 Markdown 巡检时同步校验 `nav.manifest.<locale>.json` 与 `i18n-map.json` 的链接指向，CI 如发现缺失聚合或跨语言映射会直接报错。
- `docs/.vitepress/theme/Layout.vue` 与 `i18n.ts` 已复用 `locale-map-core` 导出的 `normalizeRoutePath`、`getFallbackPath` 与 `hasLocalePrefix`，统一首页跳转、品牌链接与路由前缀检测的实现，避免与 Locale Toggle 的定位策略产生分叉。
- `docs/index.md` 的首屏脚本改为直接复用 `docs/.vitepress/theme/composables/preferredLocale.mjs`，与 Layout 与 Locale Toggle 共用首选语言记忆与存储键，避免登陆页与主题逻辑分叉。
- `LocaleToggleButton.vue` 会读取 `i18n.ui.localeToggleHint` 为每个语言选项追加“已翻译 / 聚合回退 / 首页跳转”等提示，提前告知读者切换后的落点；如需新增语言，请同步维护这段提示文本。

### 4. 验证与守护

- 新增一个脚本（或在 `scripts/check-links.mjs` 中扩展）来验证 manifest 中的 URL 均可读取文件，CI 失败时给出详细列表，并在 README 调整后同步更新守护脚本的“多语结构”提示。
- 本地手动跑一次 `codex run gen` + `npm run build`，确认 manifest 生效且构建通过。
- 编写回归测试：覆盖仅存在英文内容时的导航裁剪、分类只存在于单语时的 Locale 回退，以及 manifest 缺失场景下的兜底逻辑。
  - **仅有英文内容**：模拟只在 `docs/en/content` 下存在聚合数据时，确认中文导航不会生成空链。
  - **分类独占单语**：当分类只出现在一种语言时，验证 Locale Toggle 会回退到对应语言的分类索引或首页。
  - **manifest 缺失**：故意删除 manifest，确保配置和页面在读取失败时仍能回退到当前的导航生成逻辑。
- 更新 README：删去“目录结构需镜像”的旧约定，补充新的内容生产规范与语言独立策略，并在 CI 或 pagegen 校验中记录链接到该段落，提醒贡献者遵循。

## 里程碑

1. **实现 manifest 与导航裁剪**（预计 1-2 天）：完成 pagegen 与 config.ts 的改动，确保静态导航正确。
2. **Locale Toggle 兜底**（预计 0.5 天）：落地语言切换降级逻辑，防止空链跳转，并在 README 中说明语言缺失时的预期跳转策略。
3. **语言解耦文档与守护**（预计 0.5 天）：更新 README 与相关脚本提示，明确多语内容可独立演进的流程。
4. **验证脚本与 CI 接入**（预计 0.5-1 天）：加入检测脚本并跑通 `codex run precheck` 与 `codex run gen`，新增针对单语内容的测试用例。

## 风险与对策

- **性能风险**：生成 manifest 需读取/写入 JSON，但与现有 pagegen 同步执行，增量开销可忽略；若体积过大，可只写入必要字段。
- **缓存风险**：Locale Toggle 依赖 `fetch` 的 manifest，需要处理缓存；可与 `i18n-map.json` 同步走 `no-store` 策略。
- **回溯兼容**：若缺少 manifest 文件，配置应退回当前逻辑，避免阻断构建；可在读取失败时记录警告并继续使用 meta。
