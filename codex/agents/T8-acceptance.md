# T8｜验收手册（WGL）

## 1. 验收对象
- GraphRAG 入图流水线、Neo4j 写入结果
- 检索/证据导出功能
- 站点集成与可视化

## 2. 验收流程（GUI 最少步骤）
1. **准备数据**：确认 `docs/graph/` 目标主题存在示例 Markdown。
2. **执行入图**：运行 `npm run graphrag:ingest`（或等效命令），观察 CLI 输出无错误。
3. **验证 Neo4j**：在 Neo4j Browser（`http://localhost:7474`）执行 `MATCH (d:Doc) RETURN d LIMIT 5`，确认新节点存在。
4. **导出可视化**：运行 `npm run graphrag:export`，生成 `docs/graph/<topic>/`。
5. **构建站点**：执行 `npm run build`，启动 `npm run dev` 验证页面。
6. **检索验证**：调用 `POST /graphrag/topn`（或 CLI）确认返回 Top-N JSON。
7. **回滚验证**：运行 `npm run graphrag:rollback --dry-run`，确认输出命令正确。

## 3. 硬指标（必须满足）
| 指标 | 验证方式 | 通过标准 |
| --- | --- | --- |
| 幂等 | 连续执行 ingest 两次 | 第二次写入统计：新增节点/关系为 0 |
| 一致 | 同查询多次返回一致结果 | 两次调用 `/graphrag/topn` 输出完全一致 |
| 可视 | 站点页面渲染子图与 context | `docs/graph/<topic>/` 页面显示 Mermaid 图与 Top-N 表格 |
| 可回滚 | 5 分钟内恢复 | 执行回滚流程后 `MATCH (n:Doc)` 返回 0，站点无 GraphRAG 页面 |

## 4. 软指标（推荐满足）
| 指标 | 验证方式 | 目标 |
| --- | --- | --- |
| 可解释 | Top-N 返回理由列、Mermaid 与 context 对齐 | 人工抽查无自相矛盾描述 |
| 可观测 | Telemetry 记录 ingest/export/rollback 事件 | `data/telemetry.json` 存在最新记录 |

## 5. Checklist（一页）
- [ ] 约束/索引已创建（T1 清单）
- [ ] `npm run graphrag:ingest` 成功，`quality-log` 无阻塞错误
- [ ] Neo4j 中 Doc/Entity/Tag/Category 节点数量符合预期
- [ ] `npm run graphrag:export` 生成 `docs/graph/<topic>/` 产物
- [ ] `npm run build` + 浏览器检查页面渲染正常
- [ ] `/graphrag/subgraph`、`/graphrag/topn`、`/graphrag/path` 接口返回正确结果
- [ ] 回滚脚本 dry-run 输出预期命令；真实执行后恢复初始状态
- [ ] Telemetry/日志（`data/graphrag/*.jsonl`）记录本次运行

## 6. 验收结论
- 若所有硬指标通过且软指标至少满足一项，则判定为 **WGL 达成**。
- 如有未通过项目，记录在验收报告并退回整改。

> 验收经理需保存执行结果截图/日志，随 PR 一并归档。
