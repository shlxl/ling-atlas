# T7｜回滚与不变式检查

## 1. 回滚触发条件
- 入图流程失败或数据质量审查未通过。
- GraphRAG 功能需暂时/永久下线。
- 站点构建出现 GraphRAG 相关错误。

## 2. 回滚步骤
1. **停止写入**：终止正在运行的 ingest/export 脚本。
2. **删除站点产物**：移除 `docs/graph/` 下新增目录与文件。
3. **清理 Neo4j 数据**：
```cypher
// 仅删除 Doc/Chunk/Entity/Tag/Category/Community 标签
MATCH (n)
WHERE any(label IN labels(n) WHERE label IN ["Doc","Chunk","Entity","Tag","Category","Community"])
CALL { WITH n DETACH DELETE n }
RETURN count(*) AS removed;
```
4. **删除约束/索引（如需）**：执行 T1 中列出的 `DROP CONSTRAINT/INDEX ... IF EXISTS`。
5. **清理缓存**：删除 `data/graphrag/*`、`.tmp/graph/` 等缓存，保留必要的日志备查。
6. **恢复导航**：撤销 `schema/nav.json`、`docs/.vitepress/config.ts` 的 GraphRAG 条目。
7. **重建站点**：运行 `npm run gen` → `npm run build`，验证站点恢复。

## 3. 不变式检查
| 序号 | 不变式 | 检查方法 |
| --- | --- | --- |
| 1 | 约束存在：`Doc.id`、`Entity (type,name)` 等唯一约束在写入前有效 | `SHOW CONSTRAINTS` 检查；如缺失立刻执行 `CREATE CONSTRAINT ...` |
| 2 | 幂等：重复执行 ingest 不新增节点/边 | 连续运行 ingest 两次，对比 Neo4j 节点/关系计数或 `data/graphrag/metrics.json` |
| 3 | 同输入同输出：Doc 哈希未变更时跳过写入 | 检查 `data/graphrag/ingest.<locale>.json` 中的 `status` 字段 |
| 4 | 回滚可逆：执行回滚后 `MATCH (n:Doc)` 返回 0 | `MATCH (n:Doc) RETURN count(n)` |
| 5 | 站点无残留链接：`node scripts/check-links.mjs` 通过 | 运行链接检查脚本确认 `graph/` 链接不存在 |
| 6 | Telemetry 状态更新：记录回滚事件 | `data/telemetry.json` 中添加 `graphrag.rollback` 事件 |

## 4. 日志与审计
- 回滚步骤记录至 `data/graphrag/rollback-log.jsonl`，包含时间、操作者、步骤、结果。
- 若清理失败需立即停止并人工介入；不可强制执行 `DETACH DELETE` 超出标签范围。

## 5. 复位确认
- Neo4j Browser 检查无 GraphRAG 标签或关系。
- `npm run build` 成功且站点不再引用 GraphRAG。
- `git status` 仅保留预期撤销的文件变动。

> 回滚策略必须可在 5 分钟内完成，以确保站点恢复能力。
