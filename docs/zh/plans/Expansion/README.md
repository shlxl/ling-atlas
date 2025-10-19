# AI 管线落地路线（Expansion 章节）

## 背景与阶段目标

- **路线图阶段 5** 聚焦于把 Pagegen 与 AI 自演进脚本输出的指标统一写入 telemetry，使 `codex run audit`、CI 与仪表盘能同步观测缓存命中率、处理耗时与 AI 产物情况。
- `AGENTS.md` 的未来扩展清单要求接入 Transformers.js L1 语义检索，并预留 onnxruntime-node/wasm 的混合空间，确保浏览器端兜底与 Node 侧批处理都能逐步升级。
- `scripts/embed-build.mjs`、`scripts/summary.mjs`、`scripts/qa-build.mjs` 仍处于占位状态，仅导出文本与元信息，尚未串接模型或暴露可观测事件。本文档梳理落地路线、实验计划与回滚策略，支撑多代理协同。

## 现有脚本盘点与待暴露事件

### scripts/embed-build.mjs

- 现状：遍历多语言内容目录，导出 `{ url, title, text, lang }`，没有向量或执行指标。
- 待补充事件：
  - `ai.embed.start`：记录 locale、候选数量、模型配置、缓存命中策略。
  - `ai.embed.batch`：记录批次耗时、批次大小、失败数与重试次数。
  - `ai.embed.complete`：输出成功/失败计数、总耗时、平均耗时。
  - `ai.embed.write`：记录输出文件路径、文件大小、向量维度。
- 配置建议：`AI_EMBED_MODEL`、`AI_EMBED_PROVIDER`、`AI_EMBED_BATCH_SIZE`、`AI_EMBED_CACHE_DIR`、`AI_EMBED_DISABLE`。
- 备注：在占位模式下仍写入 `generatedAt`，未来补充 `vector` 字段及维度元信息。

### scripts/summary.mjs

- 现状：生成 `summary` 字段，无法区分来源（frontmatter 或模型）。
- 待补充事件：`ai.summary.start`、`ai.summary.request`（包含调用耗时、token 计数）、`ai.summary.complete`（成功率、降级原因）。
- 配置建议：`AI_SUMMARY_PROVIDER`、`AI_SUMMARY_MODEL`、`AI_SUMMARY_MAX_TOKENS`、`AI_SUMMARY_PROMPT_PATH`、`AI_SUMMARY_DISABLE`。
- 备注：占位逻辑保留为 fallback，禁用模型时依旧输出文本摘要。

### scripts/qa-build.mjs

- 现状：基于 frontmatter 生成静态问答对，没有模型推理。
- 待补充事件：`ai.qa.start`、`ai.qa.request`、`ai.qa.complete`、`ai.qa.write`（记录问答对数量与写入耗时）。
- 配置建议：`AI_QA_PROVIDER`、`AI_QA_MODEL`、`AI_QA_FEW_SHOT_PATH`、`AI_QA_PARALLELISM`、`AI_QA_DISABLE`。
- 备注：支持手动跳过模型并回退至规则生成的问答对。

### scripts/telemetry-merge.mjs

- 现状：合并 `data/telemetry.tmp.json`，写入 `docs/public/telemetry.json`，包含 `build.pagegen` 摘要。
- 待补充事件：新增 `build.ai` 节点汇总上述脚本的统计，支持从多个临时事件文件中聚合数据。
- 配置建议：`AI_TELEMETRY_PATH` 指定事件流水目录，`AI_TELEMETRY_DISABLE` 控制回退行为。
- 备注：Pagegen 已输出结构化摘要，可复用同样的字段格式，确保仪表盘渲染逻辑保持一致。

> 事件命名遵循 `ai.<domain>.<stage>`；临时事件文件建议写入 `data/ai-events/<timestamp>.json`，在合并后删除，避免覆盖 `telemetry.tmp.json`。

## Transformers.js / onnxruntime 接入规划

1. **共用的脚本接口层**
   - 新增 `scripts/ai/runtime/`，定义 `loadModel(config)`、`generate(items, options)` 等抽象，脚本内仅调用 `runtime.invoke({ input, metadata })`。
   - 配置读取顺序：CLI 参数 > 环境变量 > `.env`，并将最终配置写入 telemetry，便于排查。

2. **Transformers.js（浏览器端）**
   - 适用于前端即时语义检索，可选模型如 `Xenova/all-MiniLM-L6-v2`。
   - 计划步骤：
     1. 运行 `npm run ai:prepare -- --target=browser`，下载模型到 `docs/public/models/<model-id>/` 并生成 `manifest.json`（版本、SHA）。
     2. 当 Node 端未提供向量时，`embed-build` 仅输出文本索引，前端通过 Transformers.js 懒加载模型并生成向量。
     3. 前端埋点 `ai.embed.browser.inference` 记录推理耗时、加载阶段，允许通过 `AI_EMBED_BROWSER_DISABLE=1` 回退到 Pagefind。
   - 性能考量：模型体积约 40~120 MB，需要 PWA 预缓存策略与 CDN Range 请求；后端选择 WebAssembly 为默认后端，可选 WebGPU。

3. **onnxruntime（Node 端）**
   - 适用于构建阶段批量生成向量、摘要与问答。
   - 计划步骤：
     1. 引入 `onnxruntime-node` 或 `onnxruntime-web`（WASM）作为可选依赖，必要时通过 `optionalDependencies` 控制安装失败时的降级。
     2. 通过 `npm run ai:prepare` 建立并维护 `data/models.json` 清单，记录模型名称、来源、checksum、维度与最近验证时间。
     3. 脚本运行前检测模型缓存目录（默认 `~/.cache/ling-atlas/models` 或 `data/models/`），缺失时下载并校验哈希。
     4. 支持批处理（`AI_EMBED_BATCH_SIZE` 等），在 telemetry 中写入批处理耗时、CPU/GPU 信息（若可用）。
   - 安全与依赖：onnxruntime-node 需系统级依赖（libstdc++ 等）；在 CI 中可设置 `AI_RUNTIME=wasm` 回退至纯 WASM 版本，避免编译失败。

## 浏览器端与 Node 端方案对比

| 维度 | Transformers.js（Browser） | onnxruntime（Node） |
| --- | --- | --- |
| 推理延迟 | 首次加载约 1-3 秒，后续 50-150 毫秒/请求 | 批处理约 10-40 毫秒/条（CPU），GPU 更低 |
| 依赖体积 | 模型需随静态资源部署，需结合缓存与分发策略 | 模型驻留在构建环境，最终产物仅包含向量 |
| 安全性 | 前端暴露模型与 prompt，可结合 `crossOriginIsolated` 与速率限制 | 仅构建环境持有模型，需要保护缓存目录与凭证 |
| 回滚策略 | 通过环境变量禁用浏览器推理，回退到 Pagefind + 文本索引 | 重新运行占位脚本或回退 Git tag，删除生成数据 |
| 适用场景 | 读者在线个性化检索或匿名推理 | 构建/发布阶段批量生成语义数据 |

## 实验环境规划

1. **CI 预检**：新增 `codex run ai:smoke` 或 `npm run ai:smoke`，在 `ai:prepare` 成功后读取缓存并执行最小推理验证；`AI_RUNTIME=placeholder` 或 `AI_*_DISABLE` 时会输出降级日志并跳过。
2. **本地实验矩阵**：
   - Node 22 + `onnxruntime-node`（CPU）。
   - Node 22 + `onnxruntime-web`（WASM，多线程）。
   - Chromium 120+（WebAssembly 推理）。
   - 支持 WebGPU 的浏览器（如 Chrome 121+），通过 `TRANSFORMERS_BACKEND=webgpu` 测试。
3. **遥测输出**：实验阶段把模型版本、批量大小、平均耗时、峰值内存写入 `data/ai-experiments/<date>.json`。提交前仅保留最新文件，并在 `.gitignore` 中忽略模型缓存目录。

## 模型缓存与运行时配置

- `AI_RUNTIME`：决定 `ai:prepare`/`ai:smoke` 的目标运行时，可选 `placeholder`（默认）、`node`、`wasm` 等。设置为 `placeholder` 时保留占位模型并跳过真实推理。
- `AI_MODELS_SCOPE`：控制缓存目录作用域，`local`（默认）写入 `data/models/`，`global` 写入 `~/.cache/ling-atlas/models`。也可通过 `AI_MODELS_DIR=<absolute|relative>` 指定自定义目录。
- `AI_MODELS_CLEAN=1` 或 `npm run ai:prepare -- --clean`：在准备阶段清除 manifest 未声明的旧缓存，便于切换模型或释放空间。
- `AI_EMBED_DISABLE`、`AI_SUMMARY_DISABLE`、`AI_QA_DISABLE`：逐项关闭对应模型，`ai:smoke` 会输出降级日志，构建脚本自动回退到占位实现。
- `data/models.json` 为模型清单的单一事实来源，包含校验哈希、缓存状态与 smoke 测试定义。扩充真实模型时请先更新该文件，再运行 `ai:prepare` 刷新缓存并提交。

## 回滚策略

- **脚本级开关**：每个脚本接受 `--disable-model` 或 `AI_<TASK>_DISABLE=1`，禁用模型时仍输出占位 JSON。
- **模型缓存清理**：执行 `npm run ai:prepare -- --clean`（或设置 `AI_MODELS_CLEAN=1`）清除 manifest 未声明的旧缓存；必要时可额外删除 `data/models/` 与 `docs/public/models/` 并重新运行 `ai:prepare`。
- **Git 标签与产物备份**：上线真实模型前打 `ai-pipeline-vX` tag，将 `docs/public/data/*.json` 与 `data/models.json` 上传到 Release，并记录使用的 `AI_RUNTIME`/`AI_MODELS_SCOPE`。回滚时切换 tag、运行 `npm run ai:prepare` 还原模型缓存，再执行构建。
- **Telemetry 回滚**：若 `build.ai` 数据导致页面报错，可设置 `AI_TELEMETRY_DISABLE=1` 暂停合并，待修复后再恢复。

## 多代理协作指引

1. 规划代理（architect）更新本章节并同步路线图状态，确保事件命名与配置约定一致。
2. 实施代理（builder）按清单实现模型接入，在 PR 描述附上 telemetry 摘要，证明事件与配置已写入。
3. 验证代理（validator/inspector）运行 `ai:smoke`、`ai:all`，在 telemetry 页面确认 `build.ai` 节点更新；失败时按回滚策略执行。
4. 所有代理在 PR 中引用本章节链接，记录变更涉及的模型、版本与指标，保持历史可追踪。
