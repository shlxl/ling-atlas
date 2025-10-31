---
title: Graph Explorer
description: 交互式查看 GraphRAG 问答与子图结果。
---

> 在生成 Graph Explorer 数据前，请运行：
>
> ```bash
> npm run graphrag:explore -- --kind question --value "GraphRAG 集成的最新交付内容是什么？" --output docs/public/data/graphrag-explorer.json --pretty
> ```
>
> 也可以传入自定义 payload（see `scripts/graphrag/explore.mjs --help`），生成多个结果后将 JSON 合并为 `results` 数组。

<script setup>
import GraphExplorer from '../../.vitepress/theme/components/GraphExplorer.vue'
</script>

<GraphExplorer />
