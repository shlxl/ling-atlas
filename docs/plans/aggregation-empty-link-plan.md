# 聚合页空链修复方案计划

## 背景
- 站点的导航栏目由 `docs/.vitepress/config.ts` 中的 `navFromMeta` 函数按语言生成，但当前逻辑默认所有聚合页（分类、系列、标签、归档）都会存在，因此直接拼出链接。【F:docs/.vitepress/config.ts†L63-L82】
- 聚合页的静态内容和 i18n 映射在 `scripts/pagegen.mjs` 内一次性生成。该脚本仅在对应目录下确有文章时才写出聚合页文件，也只有在存在文章的情况下才会写入 i18n 对应关系。【F:scripts/pagegen.mjs†L189-L252】【F:scripts/pagegen.mjs†L289-L347】
- 当语言切换到目标语言后，如果某个聚合页并不存在（例如英文侧缺失该分类），导航仍会展示对应入口，最终落到 404；即使 Locale Toggle 会 fallback 到该语言首页，用户仍可能通过导航点到空链。

## 目标
1. 让 `pagegen` 在生成聚合页时同步输出“可用链接清单”，并区分不同语言下的可用聚合页。
2. VitePress 配置层根据可用清单动态裁剪导航结构，仅渲染真正存在的聚合链接。
3. Locale 切换时，如果目标语言缺少对应聚合页，应优雅降级到该语言的聚合入口（例如分类列表首页或语言首页），避免 404。
4. 在 CI/脚本中加入守护，防止未来重新出现“导航包含空链”的回归。

## 拆解
### 1. Pagegen 输出可用聚合清单
- 在 `scripts/pagegen.mjs` 中收集每个语言生成的聚合页 slug → 路径，写入 `docs/_generated/nav.manifest.json`（或按语言拆分）。
- 清单应包含：语言代码、聚合类型（categories/series/tags/archive）、slug 与最终 URL。未来若扩展其他聚合（作者等）也可复用结构。
- 同步更新 `i18n-map.json` 的生成逻辑，确保只在双语都存在时写入跨语言映射，避免记录“半吊子”链接。

### 2. VitePress 导航加载新清单
- 在 `docs/.vitepress/config.ts` 中新增读取 manifest 的辅助函数，根据当前语言过滤掉缺失的聚合项，再调用现有 `navFromMeta` 逻辑拼装导航。
- `navFromMeta` 需要接收“可用 slug 集”作为额外参数，用它来判断是否渲染某个分类/系列/标签入口；若没有对应 slug，就不在导航中渲染。
- 当全部分类或系列均缺失时，折叠该下拉菜单（或隐藏整个条目），以免展示空的分组。

### 3. Locale Toggle / 路由兜底
- 扩展 `docs/.vitepress/theme/composables/localeMap.ts` 与 `LocaleToggleButton.vue`，在解析目标路径时先检查 manifest 中是否存在对应 slug；若不存在则降级到语言首页或聚合主入口。
- 该逻辑也可以复用在搜索结果或站内跳转中：当发现 URL 指向的聚合页在当前语言缺失时，提示“暂未翻译，切换到 XX 语言”。（可作为后续增强。）

### 4. 验证与守护
- 新增一个脚本（或在 `scripts/check-links.mjs` 中扩展）来验证 manifest 中的 URL 均可读取文件，CI 失败时给出详细列表。
- 本地手动跑一次 `codex run gen` + `npm run build`，确认 manifest 生效且构建通过。
- 编写回归测试：至少确保在只有单语内容时，导航不会输出另一语言的聚合链接。

## 里程碑
1. **实现 manifest 与导航裁剪**（预计 1-2 天）：完成 pagegen 与 config.ts 的改动，确保静态导航正确。
2. **Locale Toggle 兜底**（预计 0.5 天）：落地语言切换降级逻辑，防止空链跳转。
3. **验证脚本与 CI 接入**（预计 0.5-1 天）：加入检测脚本并跑通 `codex run precheck` 与 `codex run gen`。

## 风险与对策
- **性能风险**：生成 manifest 需读取/写入 JSON，但与现有 pagegen 同步执行，增量开销可忽略；若体积过大，可只写入必要字段。
- **缓存风险**：Locale Toggle 依赖 `fetch` 的 manifest，需要处理缓存；可与 `i18n-map.json` 同步走 `no-store` 策略。
- **回溯兼容**：若缺少 manifest 文件，配置应退回当前逻辑，避免阻断构建；可在读取失败时记录警告并继续使用 meta。
