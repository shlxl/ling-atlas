# Ling Atlas · 小凌的个人知识库

> 现代化、可演进、可检索的知识库工程。以 **协议优先**、**内容为王**、**混合检索**、**渐进增强** 为设计原则。

## 一句话特性
- 从 **统一 JSON** → Markdown → PageGen → **VitePress** → Pages/CDN
- **taxonomy 守门**：多语言分类/标签 Canonical、Slug 规则与路径映射
- **元数据驱动导航** + 自动 **分类/系列/标签/归档** + **RSS/Sitemap**
- CI 守门：Schema 校验 + 体积预算 + stats 快照对比；主干推送额外跑 Lighthouse
- 预留 **L1 语义检索（Transformers.js）** 与 **USearch/WASM** 接口
- PR-I AI 自演进（占位版）：构建阶段自动生成 embeddings/summaries/Q&A JSON，前端可按需消费
- PR-J 知识 API + Chat：导出段落级只读数据，前端提供带引用的轻量问答
- PR-L 多语/i18n：`schema/locales.json` 统一描述所有语言的内容目录、导航文案与生成路径，Pagegen 会遍历配置生成各语言的聚合页 / RSS / Sitemap，并输出 `nav.manifest.<locale>.json`
- PR-M 供应链加固 2.0：npm ci + Audit/License 审计、CycloneDX SBOM、SRI 哈希变更守门
- PR-M SEO/OpenGraph 配置：`schema/seo.json` + 主题 `<meta>` 注入，站点级元数据集中托管
- PR-K 搜索评测：离线 nDCG/MRR/Recall 守门 + 线上查询参数 variant（lex / rrf / rrf-mmr）交替曝光

## 快速开始
```bash
# 1) 安装依赖
npm i

# 2) 生成聚合页
npm run gen

# 3) 本地预览
npm run dev
```

## 环境配置

在运行项目之前，您需要在项目根目录创建一个 `.env` 文件来配置环境变量。

```bash
# .env
GRAPHRAG_ENTITY_PROVIDER=auto
```

该文件已被列在 `.gitignore` 中，不会被提交到版本库。

## 目录结构
```
.
├─ docs/                 # 站点根
│  ├─ <locale>/          # 语言子目录（例如 zh、en），结构由 schema/locales.json 决定
│  │  ├─ content/        # 对应语言的内容源（每篇文章一个文件夹）
│  │  └─ _generated/     # 对应语言的聚合页、meta等生成产物
│  ├─ public/            # 静态文件（rss.xml、sitemap.xml 由脚本生成）
│  └─ .vitepress/        # VitePress 配置与主题
├─ security/             # CSP/SRI 模板配置
├─ schema/               # Frontmatter schema 与 tag 别名
├─ scripts/              # 生成器与校验脚本
│  └─ pagegen/           # Pagegen 模块化实现（collect/sync/feeds/i18n 等）
└─ .github/workflows/    # CI
```

## 命令
- `npm run gen`：生成分类/系列/标签/归档 + RSS/Sitemap
- `npm run gen -- --full-sync`：强制全量同步内容目录（默认增量），也可通过设置环境变量 `PAGEGEN_FULL_SYNC=1` 达到同样效果
- `npm run gen -- --no-cache`：禁用内容缓存重新解析 Markdown，亦可设置 `PAGEGEN_DISABLE_CACHE=1`
- `npm run gen -- --no-batch`：回退到串行写入（禁用批量写入与哈希跳过），或设置 `PAGEGEN_DISABLE_BATCH=1`
- `PAGEGEN_CONCURRENCY=<num>`：控制内容解析并发度（默认 8），可在 `npm run gen` 前临时指定
- `npm run gen -- --parallel-stage feeds=4`：覆盖特定阶段的并发度，也可设置 `PAGEGEN_PARALLEL_STAGES=feeds=4,collect=off`
- `npm run gen -- --plugin ./scripts/pagegen/plugins/example.mjs`：加载示例插件，运行后会在 `data/pagegen-plugin.example.json` 输出调度摘要；使用 `--no-plugins` 或 `PAGEGEN_DISABLE_PLUGINS=1` 可回退默认管线
- `npm run test:pagegen`：运行 Pagegen 模块单元测试 + 集成测试（含 nav manifest 输出与聚合产物核对）
- `npm run test:links`：基于临时站点夹具运行链接巡检，覆盖 Markdown、nav manifest、i18n map 成功与失败场景
- `npm run stats:lint`：按语言统计分类/标签，控制台输出 TopN 并写入 `data/stats.snapshot.json`，CI 会上传该快照方便历史对比
- `npm run stats:diff -- --baseline <ref:path|file> [--current <file>]`：对比两份分类/标签快照，输出高于阈值的差异（默认 warn≥30%、fail≥60%）；未显式指定时会尝试从 git 历史（`origin/main`、`HEAD^` 等）寻找 baseline，若无法定位则打印提示并跳过对比
- `npm run precheck`：Frontmatter 与导航/SEO/标签配置校验（阻断）
- `npm run config:seo`：校验 SEO/OpenGraph 配置（Schema + 引用完整性）
- `npm run build`：构建站点（串联 `ai:prepare` → `ai:smoke` → `gen` → `knowledge:build`），自动生成中英双语 RSS/Sitemap
- `npm run pwa:build`：独立构建 PWA 产物（`sw.js`、`manifest.webmanifest`、`icons/`）
- `npm run dev`：本地开发（前置 `gen`）
- `npm run dev:site`：读取 `.env` 中的 `BASE`（默认 `/ling-atlas/`）并启动 dev server，例如访问 `http://127.0.0.1:5173/ling-atlas/`
- `npm run knowledge:build`：单独更新 `/api/knowledge.json`（段落级知识数据）
- `npm run graphrag:constraints`：为 GraphRAG 入图准备 Neo4j 唯一约束与索引
- `npm run graphrag:ingest -- --locale zh --adapter transformers`：写入 Doc/Chunk/Entity/Tag 结构，可配合 `--changed-only` 增量同步
  - 也可使用 `--adapter gemini --adapter-model gemini-1.5-pro` 来调用 Gemini API 进行实体提取（需配置 `GEMINI_API_KEY`），默认模型为 `gemini-1.5-pro`。
- `npm run graphrag:ingest -- --include-only <file>`：白名单模式，只处理指定文件（每行一个相对路径）中列出的文章
- `npm run graphrag:ingest -- --ignore-file <file>`：忽略列表模式，跳过指定文件（每行一个相对路径）中列出的文章
- `npm run graphrag:retrieve -- --mode <subgraph|path|topn> --input payload.json`：执行子图、最短路径或 Top-N 查询（payload 支持使用 `-` 从 stdin 读取）。`subgraph` 模式可加上 `--max-hops`、`--node-limit`、`--edge-limit`、`--include-label <Label>`、`--include-edge-type <TYPE>` 精细控制跳数、节点/边阈值与过滤条件。
- `npm run graphrag:retrieve -- --mode hybrid --input payload.json [--hybrid-alpha 0.7 0.3]`：语义 + 结构融合检索（默认读取 `gnn_pagerank` 等结构指标），`alpha` 控制语义/结构权重。
- `npm run graphrag:gnn -- --graph entity --algo pagerank --write-property gnn_pagerank`：GDS/GNN 管道（投影、算法写回），配置详见 `data/graphrag/gnn-config.json`。
- `npm run graphrag:export -- --doc-id <doc-id> [--topic <slug>] [--title <标题>]`：生成 `docs/graph/<topic>/` 下的 mermaid / context / metadata 产物，供站点展示
- `npm run graphrag:explore -- --kind question --value "<问题>" --output docs/public/data/graphrag-explorer.json --pretty`：生成 Graph Explorer 统一 JSON（整合问答、文档、子图指标），前端可在 `/graph/explorer/` 展示
- `npm run ai:prepare`：读取 `data/models.json`、写入模型缓存目录（默认 `data/models/`），并校验 SHA256 与缓存状态
- `npm run ai:smoke`：在已准备的缓存上运行最小推理验证，失败会写入结构化日志并将 manifest 回退到占位运行时；`AI_RUNTIME=placeholder` 或相关 `AI_*_DISABLE` 时自动跳过
- `npm run ai:all`：执行 AI 自演进管线（文本嵌入 / 摘要 / 问答，占位实现）
- `npm run audit`：运行 `npm audit --omit=dev`（不阻断，输出依赖安全告警）
- `npm run license`：汇总第三方许可证（`license-checker --summary`）
- `npm run sbom`：生成 CycloneDX SBOM（输出到 `docs/public/.well-known/sbom.json` 并同步 dist）
- 离线验证：`npm run build` → `npx vitepress preview docs --host 127.0.0.1 --port 4173`，在浏览器中访问站点、打开 DevTools → Application → Service Workers，勾选 “Offline” 后刷新确认最近访问页和搜索仍能使用缓存；同时观察底部“检测到新版本/已缓存”提示条触发刷新

### GraphRAG 工作流快速上手

```bash
# 1. 启动 Neo4j（可参考 [docker-compose.neo4j.yml](docker-compose.neo4j.yml)），首次建立约束
npm run graphrag:constraints

# 2. 将 Markdown 入图，可配合 --changed-only 增量写入
npm run graphrag:ingest -- --locale zh --adapter transformers

# 3. 调用子图 / 最短路径 / Top-N 检索（示例增加 4 跳、仅保留 Entity 节点与 MENTIONS 边）
npm run graphrag:retrieve -- \
  --mode subgraph \
  --input payload.json \
  --max-hops 4 \
  --node-limit 120 \
  --include-label Entity \
  --include-edge-type MENTIONS \
  --pretty

# 4. 运行 GNN 算法写回结构指标（示例）
npm run graphrag:gnn -- --graph entity --algo pagerank --write-property gnn_pagerank

# 5. 导出 mermaid / context / metadata，并生成布局页
npm run graphrag:export -- \
  --doc-id zh/content/ai-runtime-guide/index \
  --topic zh-ai-runtime \
  --title "AI 管线占位与切换指南" \
  --locale zh

# 6. （可选）生成 Graph Explorer 数据，并在 `/graph/explorer/` 浏览问答+图谱结果
#    npm run graphrag:explore -- --kind question --value "GraphRAG 集成的最新交付内容是什么？" --output docs/public/data/graphrag-explorer.json --pretty
# 7. 打开 /graph/ 或 /graph/<topic>/ 查看可视化页面
```

混合检索示例：
```bash
npm run graphrag:retrieve -- --mode hybrid --input hybrid.example.json --pretty
```
> `hybrid.example.json` 可包含 `{"question":"..."}` 或显式 `embedding`，脚本会使用 `data/graphrag/vector-config.json` 的默认索引与模型，并结合 Neo4j 中的 `gnn_*` 结构得分进行重排。若尚未运行 `graphrag:gnn` 写回图算法结果，可通过 `--hybrid-alpha 1 0` 暂时只看语义分数。

导出目录包含 `subgraph.mmd`（Mermaid 子图）、`context.md`（实体统计与推荐阅读）、`metadata.json` 与自动生成的 `index.md` 主题页，可直接被 VitePress 渲染。所有 GraphRAG 主题会在 [`docs/graph/index.md`](docs/graph/index.md) 列出，便于在站点导航中访问。

### AI 管线配置与回滚

- `AI_RUNTIME`：决定 `ai:prepare`/`ai:smoke` 的运行时（`placeholder`、`node`、`wasm` 等）。未设置时默认为 `placeholder` 并跳过真实模型下载。
- `AI_EMBED_MODEL`：选择嵌入模型适配器，格式为 `<adapter>:<model>`；**未设置时默认尝试** `transformers-node:sentence-transformers:Xenova/all-MiniLM-L6-v2`，若需停用请显式设置为 `placeholder`。
- `GEMINI_API_KEY`：用于 Gemini 适配器，请在 `.env` 文件中配置您的 Gemini API 密钥。
- `AI_ENTITY_ADAPTER`：选择实体提取适配器，例如 `transformers` 或 `gemini`。默认值为 `placeholder`。
- `AI_ENTITY_MODEL`：当使用 `gemini` 适配器时，指定要使用的 Gemini 模型，例如 `gemini-1.5-pro` 或 `gemini-1.5-flash`。默认值为 `gemini-1.5-pro`。
- `AI_SUMMARY_MODEL`：摘要生成的适配器配置，格式同上；默认值为 `transformers-node:Xenova/distilbart-cnn-12-6`，问答脚本默认复用该值，可通过 `AI_QA_MODEL` 覆盖。
- `AI_QA_MODEL`：问答生成适配器，默认 `transformers-node:Xenova/distilbert-base-uncased-distilled-squad`；如需占位请显式设置 `placeholder`。
- CLI 覆盖：所有 AI CLI（`scripts/embed-build.mjs`、`scripts/summary.mjs`、`scripts/qa-build.mjs`）均支持 `--adapter <spec>`，用于临时指定 `<adapter>:<model>`，优先级高于环境变量。
- 已内置适配器：
  - `placeholder`：延续现有占位逻辑，仅导出首段文本/Frontmatter 元信息，任何环境均可使用。
  - `transformers-node`：基于 `@xenova/transformers` 的 Node 推理，需要先执行 `npm install @xenova/transformers` 并提供模型 ID。模型文件默认会缓存在 `~/.cache/huggingface/`，如需离线部署请提前下载并设置 `TRANSFORMERS_CACHE`。
  - `onnxruntime`：预留 onnxruntime-node 加载入口，需 `npm install onnxruntime-node` 后按需扩展实现，并将 `.onnx` 模型放置在可读目录（可使用 `ORT_DYN_THREADS` 控制线程数）。
- 适配器加载失败或执行异常时，脚本会记录结构化降级日志（`ai.*.adapter.*`）并自动回退到 placeholder 产出，同时尝试复用上一次生成的缓存文件，尽量保持前端体验。
- 模型缓存：`data/models.json` 记录模型来源、校验哈希与缓存状态，`npm run ai:prepare` 会在默认目录（`data/models/`）或指定目录（见下）生成/覆盖模型文件。手动切换到全局缓存时，可设置 `AI_MODELS_SCOPE=global`，或通过 `AI_MODELS_DIR=<path>` 指向自定义目录。传入 `--clean` 或设置 `AI_MODELS_CLEAN=1` 会在准备阶段删除清单外的旧文件。
- 冒烟记录：`npm run ai:smoke` 会更新每个模型的 `smoke` 字段与顶层 `smoke` 摘要，失败时会写入 `fallback` 节点记录原始运行时、失败模型，并把 manifest 的 `runtime` 重置为 `placeholder`，便于追踪与回滚。
- 降级开关：`AI_EMBED_DISABLE=1`、`AI_SUMMARY_DISABLE=1`、`AI_QA_DISABLE=1` 可分别跳过对应模型；当运行时为 `placeholder` 时，`ai:prepare` 仍会生成占位模型并更新缓存状态，`ai:smoke` 会输出跳过日志。
- 回滚策略：清空相关环境变量或设置为 `placeholder`，依次运行 `npm run ai:prepare`（刷新模型缓存与状态）和 `npm run ai:all` 即可恢复占位产物；如遇模型产出异常，可手动删除 `docs/public/data/*.json` 并重新执行命令。若需临时停止遥测事件写入，可设置 `AI_TELEMETRY_DISABLE=1`；需要将事件输出重定向到自定义目录（如测试夹具或沙箱）时，可设置 `AI_TELEMETRY_PATH=<dir>`。
- 单测：`node --test tests/ai/*.test.mjs` 通过 mock 适配器覆盖默认回退、缓存命中与 CLI 解析逻辑。
- CI 守门：主干推送与带 `ai-smoke` 标签的 PR 会先执行 `npm run ai:prepare` 再运行 `npm run ai:smoke`，确保缓存可用并在失败时自动降级到占位实现。

推荐模型与验证
- 嵌入：`transformers-node:sentence-transformers:Xenova/all-MiniLM-L6-v2`
- 摘要：`transformers-node:Xenova/distilbart-cnn-12-6`
- 问答：`transformers-node:Xenova/distilbert-base-uncased-distilled-squad`

快速验证命令
- `AI_SUMMARY_MODEL="transformers-node:Xenova/distilbart-cnn-12-6" node scripts/summary.mjs | rg 'ai\.summary\.(adapter\.resolved|adapter\.error|complete)'`
- `AI_QA_MODEL="transformers-node:Xenova/distilbert-base-uncased-distilled-squad" node scripts/qa-build.mjs | rg 'ai\.qa\.(adapter\.resolved|adapter\.error|complete)'`

## 当前进展与下一阶段
- Pagegen 各阶段（collect/sync/collections/feeds/i18n/writer）已模块化并输出指标，CLI 会汇总缓存命中率与写入跳过原因，最新一轮指标会同步写入 telemetry 页面，便于运维直接观测。
- 多语言内容统计脚本 `npm run stats:lint` 已上线，CI 会生成 `data/stats.snapshot.json` 工件；配套的 `npm run stats:diff` 已接入 CI，自动抓取 `origin/main:data/stats.snapshot.json` 作为基线，对比结果会写入 Step Summary 与 `stats-diff-report` 工件，便于在 PR 审查阶段复核差异。
- Feeds 模板配置化：`schema/feeds.templates.json` + `scripts/validate-feeds-template.mjs` 已用于管理 RSS/Sitemap 模板，`tests/pagegen/feeds.test.mjs` 覆盖自定义模板与限流分支。
- 链接巡检守门补测：新增 `tests/pagegen/check-links.integration.test.mjs` 以覆盖临时目录与 nav/i18n 缺失路径，CI 现可直接阻断缺链提交。
- 站点级 SEO/OpenGraph Schema：`schema/seo.json` + 主题 `<meta>` 注入与回滚指引已上线，运维手册同步更新。
- AI 适配层：`scripts/ai/adapters/*` 支持 Transformers.js / onnxruntime-node，与占位实现共享降级路径，并将构建摘要写入 `docs/public/data/*.json`。
- **近期交付摘要**：
  - 🧩 局部重建实验：`scripts/pagegen/sync.mjs`、`scripts/pagegen/collect.mjs` 与 orchestrator 现联动 Git 快照与缓存命中率，默认增量流程在多语言目录下跑通，并补齐运行指引。
  - 📈 指标时间序列基线：`node scripts/telemetry-merge.mjs` 已将阶段指标写入带时间戳的 `data/telemetry.json`，路线图与文档同步记录导出路径。
  - 🤖 AI 质量评测蓝本：评测基准集写入 `data/gold.jsonl`，`npm run ai:smoke` 会读取基线并在 placeholder 模式输出跳过日志，形成后续守门的设计基础。
  - 🔌 Pagegen 插件示例：新增 `scripts/pagegen/plugins/example.mjs` 与 `node --test tests/pagegen/plugin-example.integration.test.mjs`，演示如何在管线末尾输出调度摘要并校验回退行为。
  - 🛰️ 调度插件化：`scripts/pagegen/plugin-registry.mjs` / `scheduler.mjs` 支持 `--parallel-stage`、`--plugin`、`--no-plugins` 等覆盖，metrics 新增 `scheduler` 与 `plugins` 摘要。
  - 🛡️ AI 守门串联：`npm run build` / `codex run publish` 默认执行 `ai:prepare` → `ai:smoke`，`build.ai` 节点带 schema 版本与 overview，失败时自动写入回退原因。
- 下一阶段重点：
  1. 📊 将 scheduler / AI 指标接入站点 Telemetry 页面，补齐可视化与阈值告警脚本。
  2. 🔌 产出官方 Pagegen 插件示例与端到端用例，完善 `--plugin` 协议与回滚测试夹具。
  3. 🧪 扩展 `ai:smoke` 结果写入 telemetry，生成结构化失败清单并与 `build.ai` 打通。
  4. 📚 更新协作手册，汇总并发覆盖、插件加载与 AI 守门的运维/回退案例，使 README、AGENTS 与规划文档保持一致。
- 执行顺序建议：先完成 1（先补齐可观测面板再推进依赖任务）→ 3（把冒烟结果接入 telemetry 与降级链路）→ 2（在指标到位后补强插件示例与测试）→ 4（功能稳定后统一文档）。

## 协作约束速查

> 以下清单同步自仓库根部的 `AGENTS.md`，便于贡献者在不离开 README 的情况下快速了解约束与常用命令。

- **角色与脚本管线**：通过 `codex run <task>` 调用 `.codex/*.mjs` 中的脚本，涵盖 `plan`、`precheck`、`gen`、`build`、`deploy`、`audit` 等角色；`publish` 会串联 tags 规范化 → precheck → ai:prepare → ai:smoke → gen → build → git 推送。
- **内容统计守门**：CI 在 `npm run test:pagegen` 后追加 `node scripts/stats-lint.mjs`，同时上传 `data/stats.snapshot.json` 作为工件，便于观察分类/标签分布的阶段变化。
- **本地预检**：安装依赖后会自动执行 `husky install`，现有的 `pre-commit` 钩子会调用 `lint-staged`，针对提交的 Markdown 运行 `npm run md:lint`。如需跳过，可在本地使用 `HUSKY=0 git commit ...`。
- **环境要求**：Node ≥ 22、npm ≥ 10、git ≥ 2.45，`.env` 需包含 `BASE=/ling-atlas/`、`SITE_ORIGIN=https://<user>.github.io/ling-atlas`、`GIT_REMOTE=origin`、`GIT_BRANCH=main`。
- **首次初始化**：建议执行 `codex run setup --base "/ling-atlas/" --site "https://<user>.github.io/ling-atlas"`，完成依赖安装、预检、聚合页生成与首次构建。
- **CI 守门**：流水线默认执行 `npm ci`、前置校验、Pagegen 单测、`node scripts/stats-lint.mjs` + `node scripts/stats-diff.mjs`、`node .codex/budget.mjs` 等步骤；主干推送会额外安装 Chrome 依赖并运行 `npx lhci autorun --collect.chromeFlags="--no-sandbox"`，PR 仅保留核心守门以控制耗时。
**内容生产力工具**：通过 `npm run md:lint`、`node scripts/check-links.mjs`、`node scripts/img-opt.mjs` 守门 Markdown、链接与图片质量；其中 `check-links` 会额外校验 `nav.manifest.<locale>.json` 与 `i18n-map.json` 内的目标路径，必要时可在 CI 中暂时调高阈值或跳过。
**Landing 入口 BASE 兜底**：`docs/index.md` 的内联重定向脚本会写入 `__LING_ATLAS_ACTIVE_BASE__` 并由 `<script setup>` 在 hydration 期间复用，确保 `/` 与 `/ling-atlas/` 等不同 BASE 下的首屏重定向一致；前端通过 `docs/.vitepress/theme/base.mjs` 统一读取、缓存与复用该 BASE，Locale Toggle、导航 manifest 以及 Telemetry 资产加载都会依赖此模块。如需修改入口，请同步维护内联脚本、`base.mjs` 与相关调用。
**导航/标签/SEO 配置 Playbook**：在修改 `schema/nav.json`、`schema/tag-alias.json` 或 `schema/seo.json` 之前，务必阅读 `docs/zh/plans/nav-config-playbook.md` 与 `docs/zh/plans/seo-config-playbook.md`；文档提供配置步骤、守门命令与常见故障排查。
**想了解目录现状和 TODO？** 参考 `docs/zh/plans/module-inventory.md`，该文档汇总了 `schema/`、`scripts/`、`docs/zh/plans/` 与 `tests/` 目录的资产与后续建议；Pagegen 模块的详细检查清单见 `docs/zh/plans/pagegen-deep-dive.md`。
**如何自定义 metrics 输出？** 默认写入 `data/pagegen-metrics.json`。也可以通过 `PAGEGEN_METRICS_OUTPUT=<path>` 或运行 `node scripts/pagegen.mjs --metrics-output <file>` 指定目标文件，便于在 CI 中收集统计。
**可以只观察指标不落盘吗？** 支持在运行 Pagegen 时加上 `--dry-run`（或设定 `PAGEGEN_DRY_RUN=1`）来跳过文件写入，配合 `--metrics-output` 可以在 CI 中快速收集指标而不改动仓库。
**只输出指标、不显示阶段日志？** 使用 `--metrics-only`（或 `PAGEGEN_METRICS_ONLY=1`）可将指标 JSON 直接写到 stdout，并自动启用 dry-run 写入保护；适合在 CI 中解析。
**Landing 语言卡片 / 主题文案在哪配置？** 同一份 `schema/locales.json` 也托管首页语言卡片文案与主题切换提示（`ui.*` 字段）。修改后无需调整前端源码，`npm run build` 会自动读取最新配置并同步到 VitePress 主题。

---

> 名称约定：仓库名 **ling-atlas**，站点标题“Ling Atlas · 小凌的个人知识库”。

````

## VS Code workspace

This repository contains a ready-to-open workspace file `ling-atlas.code-workspace` and editor helpers in `.vscode/`:

- Open the workspace: File → Open Workspace... → select `ling-atlas.code-workspace`.
- Recommended extensions are listed in `.vscode/extensions.json` (ESLint, Prettier, YAML, Markdown tools, npm script runner, GitLens).
- Common tasks are available via the Run/Tasks UI: `npm: dev`, `npm: build`, `npm: gen`, `npm: test:pagegen`.

These are convenience helpers — edit `.vscode/tasks.json` to add or adjust scripts.
1. 修改内容或配置后，依次执行：
   ```bash
   npm run config:nav   # 如涉及导航
   npm run config:seo   # 如涉及站点级 SEO/OpenGraph
   npm run config:tags  # 如涉及标签
   node scripts/pagegen.mjs --dry-run --metrics-output /tmp/pagegen-metrics.json
   npm run test:pagegen && npm run test:theme
   ```
2. 确认 `npm run precheck` 通过，再运行 `codex run publish --message "<消息>"`，命令会自动串联 tags 归一化、precheck、gen、build 以及 push。
3. 如需人工检查产物，可执行 `npm run gen` 并查看 `_generated/`、`docs/public/` 中的新文件；完成后清理临时文件避免误提交。

## 近期进展

- 完成 feeds 模板配置化，CLI/metrics 会区分各语言模板的写入结果，`tests/pagegen/feeds.test.mjs` 已覆盖自定义与限流场景。
- 新增 `tests/pagegen/check-links.integration.test.mjs`，对 `node scripts/check-links.mjs` 的 nav manifest/i18n 缺失路径进行回归，CI 现会立即阻断缺链提交。
- 站点级 SEO/OpenGraph Schema (`schema/seo.json`) 与 README/运维指引同步落地，主题 `<meta>` 回归测试已补齐。
- Transformers.js/onnxruntime-node 适配层上线，占位实现可回退；AI 构建脚本会将摘要/问答遥测写入 `docs/public/data/` 以便后续分析。
- 完成导航配置引用守门：`scripts/validate-nav-config.mjs` 与 `pagegen.locales.mjs` 会校验 `aggregates`、`sections`、`links` 之间的引用关系，缺失键会在预检阶段即时报错。
- Pagegen 指标与日志增强：collect 阶段输出缓存命中率、解析错误摘要，feeds 阶段汇总各语言 RSS/Sitemap 数量，指标同时写入 metrics JSON， dry-run/CI 更易观测。
- 添补失败场景测试：`tests/pagegen/feeds.test.mjs`、`tests/pagegen/collections.failures.test.mjs` 验证写入异常会正确抛错，为生产环境提供兜底守门。
- RSS/Sitemap 模板配置化：`schema/feeds.templates.json` + `schema/feeds.templates.schema.json` 驱动多语言模板，`tests/pagegen/feeds.test.mjs` 覆盖自定义模板、限流与 fallback。
- `scripts/check-links.mjs` 集成测试纳入 `npm run test:pagegen`，临时目录夹具覆盖导航/i18n 缺失路径，CI 能即时阻断。
- 站点级 SEO/OpenGraph 配置迁移到 `schema/seo.json` + `schema/seo.schema.json`，`scripts/validate-seo-config.mjs` 接入 `npm run precheck` 并同步更新主题 `<meta>`。
- AI 适配层上线：`scripts/ai/adapters/*` 支持真实模型或 dummy 回退，CLI 可通过环境变量切换并附带回滚策略。

## 即将开展的审查路线

本阶段聚焦于梳理工程协作约束与 Pagegen 重构进度，按照以下顺序逐步审查：

1. **协作规约复核**（`AGENTS.md`、`README.md`、`.codex/`）——确认命令入口、环境变量与发布节奏，形成可执行清单。
2. **目录与模块盘点**（`schema/`、`docs/zh/plans/`、`scripts/`、`tests/fixtures/`）——锁定需要重点巡检的脚本、配置与文档，更新路线图与计划文档。
3. **Pagegen 模块深入检查**（`scripts/pagegen/*.mjs`、`tests/pagegen.test.mjs`）——核对模块化拆分、增量同步、批量写入与 i18n 逻辑，结合 `npm run test:pagegen` 覆盖范围制定补测方案。
4. **配套守门脚本回顾**（`scripts/validate-frontmatter.mjs`、`scripts/check-links.mjs`、`node scripts/embed-build.mjs`）——确保与 Pagegen 输出一致且具备回滚/降级策略。

每个步骤的审查结果会同步到 `docs/zh/plans/pagegen-refactor-roadmap.md` 与 `AGENTS.md` 的路线图章节，方便后续代理或贡献者继续推进。

## 部署（GitHub Pages）
1. 打开 **Settings → Pages**，选择 **GitHub Actions**。
2. 工作流文件在 `.github/workflows/deploy.yml`；首次 push 后会自动部署。
3. 自定义域名建议使用子域（如 `kb.example.com`），并开启 HTTPS。
4. 更多细节参考 [docs/zh/DEPLOYMENT.md](docs/zh/DEPLOYMENT.md)，迁移路径与重写策略见 [docs/zh/MIGRATION.md](docs/zh/MIGRATION.md)。

## 安全与索引
- `.well-known/security-headers.txt`：`npm run build:search` 会自动更新并同步到发布目录，同时在静态页面注入 CSP `<meta>`。
- CSP `<meta>` 会跳过 `frame-ancestors` 指令（浏览器限制），构建时会输出警告，部署到生产环境时请通过服务器响应头追加该指令。
- `.well-known/sri-manifest.json`：记录外部资源的 SRI；若 CDN 内容变更但未更新 `security/sri-allowlist.json`，CI 会直接失败。
  - 离线或无法访问 CDN 时，`node scripts/sri.mjs` 会沿用 allowlist 中的哈希写入 manifest，同时打印跳过校验的警告；请在网络恢复后重新运行以确认哈希未漂移。
- `docs/public/robots.txt`：默认禁止抓取 `/data/`、`/admin/`，并指向站点 `sitemap.xml`。
- `docs/public/sitemap.xml`：由 PageGen 生成，保持与 robots 中链接一致。
- AI 自演进产物：`docs/public/data/embeddings.json`、`summaries.json`、`qa.json`，CI/构建阶段自动刷新，失败不阻断主流程。
- 搜索评测：`data/gold.jsonl` 维护标注，`node scripts/eval/offline.mjs` 运行离线指标；线上调试可通过 `?variant=lex|rrf|rrf-mmr` 切换，与默认 `rrf-mmr` 做 Team Draft 交替曝光，点击偏好会记录匿名 hash 与位次。
- 多语言：`npm run gen` 会同步各语言内容到 `docs/<locale>/content`，并产出 `/<locale>/_generated/**`、按语言划分的 RSS/Sitemap 与 `docs/<locale>/_generated/nav.manifest.<locale>.json`。导航根据 manifest 裁剪分类/系列/标签/归档，仅展示目标语言真实存在的聚合入口；缺少映射时回退到语言首页或 manifest 中的首个聚合页，避免空链。
  - 导航栏中有两类语言切换：
    1. **VitePress 默认下拉菜单**（`localeLinks`），负责跳转到当前页面的另一语言版本，但只在两侧都有对等文章时才安全；因此配置中默认关闭该下拉，以免聚合页落到缺失的 slug 导致 404。
    2. **自定义按钮**（`LocaleToggleButton.vue`），与亮/暗色主题开关类似，读取 `docs/public/i18n-map.json` 与 `nav.manifest.<locale>.json`；仅当目标语言存在对应 slug 或可用聚合页时展示，缺少映射则直接回退到语言首页。
  - 自定义按钮的下拉选项会结合 `i18n.ui.localeToggleHint` 的提示词附加“已翻译 / 聚合回退 / 首页跳转”等标记，帮助读者预判切换后的落点；新增语言时请同步补充该段翻译，避免出现空白后缀。每个选项的 `title` 与 `aria-label` 会读取 `i18n.ui.localeToggleDetail` 提供的完整说明，缺失时会回退到默认语言的文案，请一并维护。
  - 两者共享同一份语言配置，但逻辑完全独立；保留按钮、关闭下拉即可避免依赖关系导致的 404 问题。
  - `tests/pagegen/i18n-registry.test.mjs` 已补充“仅英文聚合”与“聚合独占单语”等回归场景，确保 nav manifest 只暴露真实存在的聚合入口并避免 i18n-map 输出缺失语言的映射，CI 若失败请优先排查聚合产物。
  - `node scripts/check-links.mjs` 会在链接巡检阶段同步验证 Markdown、`nav.manifest.<locale>.json` 与 `i18n-map.json` 的目标路径，阻止聚合入口与跨语言映射指向不存在的页面。
  - `docs/.vitepress/theme/Layout.vue` 复用 `locale-map-core` 的 `normalizeRoutePath`、`getFallbackPath` 与 `hasLocalePrefix` 维护首页重定向与导航品牌跳转，保持与 Locale Toggle 的定位逻辑一致。
  - Landing 页与主题共享 `docs/.vitepress/theme/composables/preferredLocale.mjs`，统一本地存储键、重定向与 Locale Toggle 的首选语言记忆；调整记忆策略时需同步更新内联重定向脚本与该模块。
  - 搜索面板（`SearchBox.vue`）的结果归类会调用 `localeMap` 的 `detectLocaleFromPath` 判断条目语言，并继承聚合页的兜底策略；结果列表会基于 `i18n.ui.searchLocaleBadge` 的翻译展示“本语言/跨语言回退”徽标，以便读者预判跳转落点。调整搜索排序或新建入口时请复用该模块，并同步维护该段翻译避免遗漏 BASE/语言判定。
- `npm run test:theme` 会执行 `tests/locale-map/core.test.mjs`、`tests/theme/nav-core.test.mjs` 与 `tests/theme/preferred-locale.test.mjs`，既覆盖 Locale Toggle 的降级逻辑，也校验导航裁剪与首选语言记忆仅依赖真实存在的聚合与存储键。
- `docs/.vitepress/config.ts` 现改用 `vite-plugin-pwa` 的 `injectManifest` 模式，并与 `docs/.vitepress/service-worker.ts` 自定义 Service Worker 协作：导航请求使用 `NetworkFirst`，仅在站点根路径回退到预缓存的 `index.html`，并在激活阶段主动清理旧缓存以避免 GitHub Pages 保留旧版布局。
- `scripts/postbuild-pwa.mjs` 会在 `npm run build` 结束后补全自定义 Service Worker 的预缓存 HTML 列表，同时兼容新版的 `service-worker.js` 与历史的 `sw.js` 命名，避免离线回退触发 `non-precached-url` 错误。
- 供应链：CI 默认 `npm ci` 安装，审计输出（`npm run audit`、`npm run license`）可追踪依赖风险；`npm run sbom` 及构建流程会生成 `docs/public/.well-known/sbom.json`，SRI 哈希变化需先更新 allowlist，否则脚本将阻断。

## 约定
- 所有文章文件置于 `docs/<locale>/content/**/index.md`（例如 `docs/zh/content/**/index.md`）；Frontmatter 字段遵循 `schema/frontmatter.schema.json`。
- `status: draft` 的文章不会进入聚合页与 RSS/Sitemap。

## FAQ
- **可以放在根仓库吗？** 可以，但推荐独立仓库，后续可用 subtree 回挂到旧仓 `docs/`。
- **中文标题如何转 slug？** `scripts/slug.ts` 提供简版实现，优先手写 `slug` 字段。
- **如何自定义默认语言？** 生成器默认以 `docs/zh/content` 作为首选语言，输出 `/zh/` 路由；如需调整，请编辑 `schema/locales.json` 中对应语言的 `preferred`、`basePath` 与目录字段，并为新的默认语言补齐 `docs/<locale>/` 站点结构。保存后运行 `npm run gen` 或 `codex run gen` 校验生成结果；JSON 会依据 `schema/locales.schema.json` 自动校验并缓存至 `.codex/cache/`。
- **导航栏入口如何维护？** 顶部导航与固定链接的结构在 `schema/nav.json` 中配置（受 `schema/nav.schema.json` 校验）。修改后无需动任何前端源码，Pagegen 与 VitePress 会在下一次 `npm run gen`/`npm run build` 时自动读取最新配置并裁剪导航入口。
- **想了解目录现状和 TODO？** 参考 `docs/zh/plans/module-inventory.md`，该文档汇总了 `schema/`、`scripts/`、`docs/zh/plans/` 与 `tests/` 目录的资产与后续建议；Pagegen 模块的详细检查清单见 `docs/zh/plans/pagegen-deep-dive.md`。
- **如何自定义 metrics 输出？** 默认写入 `data/pagegen-metrics.json`。也可以通过 `PAGEGEN_METRICS_OUTPUT=<path>` 或运行 `node scripts/pagegen.mjs --metrics-output <file>` 指定目标文件，便于在 CI 中收集统计。
- **可以只观察指标不落盘吗？** 支持在运行 Pagegen 时加上 `--dry-run`（或设定 `PAGEGEN_DRY_RUN=1`）来跳过文件写入，配合 `--metrics-output` 可以在 CI 中快速收集指标而不改动仓库。
- **只输出指标、不显示阶段日志？** 使用 `--metrics-only`（或 `PAGEGEN_METRICS_ONLY=1`）可将指标 JSON 直接写到 stdout，并自动启用 dry-run 写入保护；适合在 CI 中解析。
- **Landing 语言卡片 / 主题文案在哪配置？** 同一份 `schema/locales.json` 也托管首页语言卡片文案与主题切换提示（`ui.*` 字段）。修改后无需调整前端源码，`npm run build` 会自动读取最新配置并同步到 VitePress 主题。

---

> 名称约定：仓库名 **ling-atlas**，站点标题“Ling Atlas · 小凌的个人知识库”。
