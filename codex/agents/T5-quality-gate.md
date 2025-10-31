# T5｜内容质量与安全闸门

## 1. 校验职责
- 在 Frontmatter → 图 写入前执行，阻断不合规内容。
- 输出 `{passed:boolean, skipped:number, errors:QualityError[]}`；`QualityError` 包含 `doc_id`、`type`、`message`、`suggestion`。

## 2. 校验项目
| 类型 | 规则 | 处理方式 |
| --- | --- | --- |
| Frontmatter 缺失 | 必填：`title`、`description`、`lang`、`updated`；`category` 至少一个 | 记录错误并中止该 Doc |
| 日期格式 | `updated`、`published` 必须符合 ISO8601 | 自动尝试解析/重写；失败则拒收 |
| 标签白名单 | 使用 `schema/tag-alias.json` 归一化；不存在则提示添加映射 | 标记 `SKIPPED_WITH_REASON` |
| 外链黑名单 | 正文链接匹配 `blacklistPatterns`（如 `http://` 未加 https、敏感域） | 拒收或要求人工确认 |
| PII 检测 | 通过正则/检测器发现邮箱、手机号、身份证号等敏感数据 | 掩码后再写入或直接拒收 |
| 脚本片段 | 禁止直接执行 `<script>`/`javascript:` 链接；允许 code block | 拒收并提示使用代码块 |
| AI 产物占位 | 若实体抽取返回 `placeholder`，记录并允许写入，但在日志中标识 | 允许，Caution 标记 |

## 3. 输出格式
```json
{
  "passed": false,
  "skipped": 1,
  "errors": [
    {
      "doc_id": "zh/guide/some-article",
      "type": "FRONTMATTER_MISSING",
      "message": "`category` 缺失",
      "suggestion": "补充 category 或在 schema/tag-alias.json 添加映射"
    }
  ]
}
```

## 4. 日志写入
- 文件：`data/graphrag/quality-log.jsonl`
- 字段：`timestamp`、`doc_id`、`severity`（ERROR/WARN/INFO）、`message`、`action`（reject/mask/skip）。

## 5. 集成点
1. `normalize-metadata.mjs` 调用 `quality-check`：`const result = await qualityCheck(doc);`
2. 对 `result.errors` 非空的文档，添加到 `skipped` 列表，最终写入 Neo4j 时跳过。
3. 对 `result.maskedFields`（如 PII）更新 Doc/Chunk 文本后再继续流程。

## 6. 配置
```json
// config/graphrag-quality.json
{
  "requiredFields": ["title", "description", "lang", "updated"],
  "blacklistPatterns": [
    "http://",
    "example-phishing.com",
    ".*\\.onion"
  ],
  "piiPatterns": {
    "email": "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}",
    "phone": "\\\\+?[0-9][0-9\\- ]{7,}[0-9]"
  },
  "maxTagCount": 8
}
```

## 7. 审计与回滚
- 质量闸门失败的文档加入 `data/graphrag/rejected/<doc_id>.json`，便于人工复核。
- 回滚时一并清空 `data/graphrag/rejected/` 并记录在 Telemetry。

## 8. 自动化测试
- 单测覆盖：缺 field、日期异常、黑名单命中、PII 掩码。
- 测试命令：`node --test tests/graphrag/quality-check.test.mjs`。

> 质量闸门确保入图数据符合站点规范，防止敏感或无效内容进入 Neo4j。
