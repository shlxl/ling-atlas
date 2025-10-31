# T2｜入图流水线设计（Frontmatter → 图，不写代码）

## 1. 文件树与职责
```
scripts/graphrag/
├── ingest/
│   ├── collect-frontmatter.mjs      # 扫描 docs/ 读取 Markdown frontmatter、正文片段
│   ├── normalize-metadata.mjs       # 归一化分类/标签/日期，生成 Doc/Chunk 原始对象
│   ├── extract-entities.mjs         # 调用 AI/规则提取实体、关系（允许占位回退）
│   ├── build-payload.mjs            # 整合 Doc/Chunk/Entity/Tag/Category/Community 入图 JSON
│   └── cli.mjs                      # CLI 入口，串联以上步骤并输出 MERGE 批次
├── ingest.pipeline.mjs              # 编排器，支持 --no-cache / --dry-run
└── adapters/
    ├── entity-extractor-placeholder.mjs # 占位或第三方模型适配
    └── neo4j-writer.mjs                 # 写入 Neo4j（依赖 T1 约束）
```

## 2. 输入与输出
- **输入**：Markdown frontmatter（title、description、lang、category、tags、updated）、正文段落。
- **输出**：符合 T1 中 MERGE 结构的 JSON 批次（Doc/Chunk/Entity/Category/Tag/Community），供 `neo4j-writer` 写入。
- **缓存**：`data/graphrag/ingest.<locale>.json`（Doc/Chunk 哈希），`data/graphrag/entities.<locale>.json`（实体提取结果）。

## 3. 幂等策略
1. 执行 ingest 前调用 `neo4j-writer ensureConstraints()` 创建 T1 定义的约束。
2. `collect-frontmatter` 生成 Doc ID（`<lang>/<path>`）与 Chunk ID（附段落顺序）。
3. `normalize-metadata` 保持日期 ISO8601、标签 slug 化，记录 `hash`（frontmatter + 内容）。
4. `build-payload` 对比缓存哈希，仅为变更 Doc 生成 MERGE 批次；未变更文档跳过并记录 reason。
5. `neo4j-writer` 采用 `MERGE` + 属性更新，关系使用 `MERGE`，防止重复写入。

## 4. 错误收集与日志
- 每步返回 `{items, errors}`；`errors` 写入 `data/graphrag/ingest-errors.log`。
- 对关键错误分类：Frontmatter 缺失字段、实体提取失败、Neo4j 连接异常。
- CLI 入口支持 `--fail-fast`（遇到错误直接退出）与 `--skip-errors`（记录后继续）。

## 5. 样例演练
1. 选择 `docs/zh/guide/some-article.md`（含 category、tags）。
2. `collect-frontmatter` 输出 Doc: `{id:"zh/guide/some-article", updated_at:"2024-05-20T12:00:00Z"}` 与若干 Chunk。
3. `normalize-metadata` 将 tags 标准化 `{name:"GraphRAG", slug:"graphrag"}`。
4. `extract-entities` 返回实体：`{type:"Person", name:"Ada Lovelace"}`；关系：`RELATED`。
5. `build-payload` 组装 Doc/Chunk/Entity/Tag/Category/关系 JSON。
6. `neo4j-writer` 先执行约束，再按顺序 MERGE Doc、Category/Tag、Chunk、Entity、关系。

## 6. CLI 参数约定
```
node scripts/graphrag/ingest.pipeline.mjs \
  --neo4j-uri bolt://localhost:7687 \
  --neo4j-user neo4j \
  --neo4j-password <password> \
  --neo4j-db neo4j \
  --locale zh \
  --changed-only \
  --dry-run        # 仅读取/打印 JSON，不写库
```

- `--no-cache`：忽略缓存，强制重建 payload。
- `--batch-size`：写入前按 Doc 分批，默认 50。
- `--plugins`：未来允许注入额外处理器。

## 7. 质量闸门对接
- `normalize-metadata` 与 T5 校验共享 `schema/frontmatter.graph.json`。
- 在写库前调用 T5 的 `quality-check.mjs`，对每批 Doc 执行拒收规则。

## 8. 依赖
- `gray-matter`：解析 frontmatter。
- `markdown-it`：提取段落文本。
- `neo4j-driver`：数据库写入。
- 可选：LLM/NER SDK（占位后续替换）。

> 本设计不包含真实实现代码，仅明确模块职责、流程与幂等策略。
