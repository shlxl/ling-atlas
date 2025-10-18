# pagegen 脚本优化重构提案

## 背景

`scripts/pagegen.mjs` 经过多轮功能叠加，目前承担了目录同步、Markdown 解析、聚合页生成、RSS/Sitemap 输出以及跨语言映射等职责，整段逻辑集中在一个异步自执行函数内串行执行，使得每次运行都需要完整遍历所有语言与内容目录。【F:scripts/pagegen.mjs†L28-L117】配套的 `pagegen.locales.mjs` 曾内置大量语言配置常量，扩展时需要直接改动脚本源码，缺少数据驱动能力（现已迁移到 `schema/locales.json` 并由 JSON Schema 守门，同时提供给前端主题与 Landing 页面复用）。【F:scripts/pagegen.locales.mjs†L10-L199】

## 现状痛点

1. **职责过载的串行流程**：语言初始化、内容采集、聚合写入、RSS/Sitemap 和 i18n 映射都在单文件内顺序执行，任一步骤阻塞都会拖慢整体生成时间，也难以单独测试某个阶段的逻辑。【F:scripts/pagegen.mjs†L101-L115】
2. **无差异的目录同步**：`syncLocaleContent` 每次执行都会整目录删除再复制，即使内容没有变化也会做全量 I/O，放大了构建时间和磁盘写入成本。【F:scripts/pagegen.mjs†L146-L157】
3. **文件读取缺乏并发与缓存**：文章元数据解析采用顺序 `for...of`，每个 Markdown 都独立 `readFile` 与 `gray-matter` 解析；随着文章规模扩大，该区域成为热点瓶颈，且没有缓存层复用解析结果。【F:scripts/pagegen.mjs†L165-L216】
4. **写入阶段逐条 await**：聚合页、RSS、Sitemap 以及导航 manifest 都在语言循环内逐条写文件，缺乏批量调度和错误隔离机制，导致 I/O 次数偏高，失败时也无法快速定位具体阶段。【F:scripts/pagegen.mjs†L247-L305】【F:scripts/pagegen.mjs†L473-L499】
5. **配置不可扩展**：语言定义与字段映射曾 hardcode 在 `pagegen.locales.mjs`，新增方言/地区配置需修改源码并重新部署，难以让内容团队独立维护配置表（已迁移至 `schema/locales.json`，导航/标签配置仍待外置）。【F:scripts/pagegen.locales.mjs†L10-L172】

## 重构方向

1. **拆分职责模块**：
   - 将内容采集、聚合生成、RSS/Sitemap、i18n 映射等逻辑拆分到独立模块，主流程只负责 orchestrator，便于单元测试与未来替换实现。
   - 为每个模块定义明确的输入/输出契约，例如内容采集返回标准化的 `Post`、`TaxonomyIndex`，写入模块只处理序列化与落盘。

2. **引入差异化同步**：
   - 对 `syncLocaleContent` 增加哈希/mtime 比较，仅在源目录有变更时触发复制，或采用 `fs.cp` 的 `filter` 结合 `Promise.allSettled` 并发复制。
   - 保留“强制覆盖”作为回退选项，通过 CLI flag 控制，兼顾安全与性能。

3. **并发化内容解析**：
   - 使用 `Promise.all` 或基于 `p-map` 的并发池对 Markdown 解析做节流并行，减少 I/O 等待时间。
   - 在 `collectPosts` 中增加简单缓存（例如读取 `lang.outMeta` 与源文件 mtime 对比），避免对未变化的文档重复解析。【F:scripts/pagegen.mjs†L165-L206】

4. **批量写入与幂等设计**：
   - 聚合页、RSS、Sitemap、导航 manifest 等写入操作可以收集待写入任务后统一 `await Promise.allSettled`，并引入内容哈希判断是否需要重写文件。
   - 失败时输出结构化日志（模块名、语言、目标路径），便于排查，而不是只看到顶层脚本失败。

5. **配置外置与 Schema 化**：
   - 将 `RAW_LOCALES` 抽离到 `schema/locales.json` 并通过 `schema/locales.schema.json` 校验字段完整性，让内容运营可在不触碰脚本的情况下增减语言；导航配置已迁移至 `schema/nav.json`（受 `schema/nav.schema.json` 守门），Pagegen nav manifest 与 VitePress 主题共用同一份定义，后续可继续将标签/固定链接等守门数据纳入该体系。
   - 主脚本加载配置后可缓存到 `.codex/cache` 等目录，避免每次运行都重新解析；同时补充运维指南，告知如何通过配置文件扩展语言并同步到 README/AGENTS。

6. **未来扩展与验证**：
   - 在拆分后的模块周围补充单元测试，尤其是分类聚合、i18n 映射合并、tag alias 归一化等逻辑，确保重构不破坏现有输出。【F:scripts/pagegen.mjs†L328-L439】
   - 将 `node scripts/pagegen.mjs` 的运行时间、处理文件数量、各阶段耗时写入 telemetry，便于后续迭代持续优化。

## 预期收益

- 构建阶段 I/O 次数和耗时显著下降，CI 与 `codex run gen` 会更快。
- 脚本模块化后，可针对单一功能（如 RSS）独立迭代，不必担心牵一发而动全身。
- 配置外置降低跨职能协作门槛，使内容团队能够自行新增或调整语言策略。
- 有了缓存与差异化同步后，重复运行 `pagegen` 将趋于增量化，为未来引入实时 watch 或增量构建打下基础。
