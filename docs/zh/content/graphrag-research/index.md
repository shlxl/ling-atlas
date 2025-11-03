---
title: GraphRAG 研究概述与综述
date: '2025-11-01'
status: published
category_zh: RAG实战
tags_zh:
  - 生图检索增强生成
  - 多跳图检索
  - 向量融合
  - 混合检索
  - 子图提取与图路径检索
  - 图神经网络
  - 多模态知识图谱
series: GraphRAG
series_slug: GraphRAG
slug: graphrag-research
excerpt: 研究GraphRAG当前状况与最新发展方向，包括多跳图检索、向量融合、混合检索、子图提取与图路径检索、图神经网络、多模态知识图谱等前沿方向。
---

## GraphRAG研究概述与综述

> 本文为《GraphRAG 研究概述与综述》Markdown 版，用于 VitePress / GitHub Pages / 本地知识库工作流。结构与原稿一致，做了 Markdownlint 友好化处理。

## 1. 背景与范围

GraphRAG（Graph Retrieval-Augmented Generation，图检索增强生成）是在传统 RAG 基础上引入**图结构知识**（知识图谱、文本图、虚拟图、领域多模态图等），以提升多跳推理、结构化问答、跨源融合和减少幻觉的能力。

相比只做“向量召回 → 拼接上下文 → LLM 生成”的朴素 RAG，GraphRAG 一般会多出至少三类能力：

1. **图谱索引 / 图构建**：把原始文本或结构化数据变成图（实体、关系、属性、路径、子图）。
2. **图引导的检索 / 子图抽取**：不是一次性捞很多文本，而是根据查询在图上走路，拿到能解释问题的子图。
3. **图增强的生成**：把图里的结构化关系和路径，转成 LLM 能消费的提示或推理链。

这对做个人或组织知识库很重要，因为只要内容之间存在**结构、版本、层级、跨域的弱连接**，图式检索往往比纯向量更稳、更可解释。

下面按研究线索分节整理。

## 2. 综述类工作

### 2.1 早期系统性综述（2024）

2024 年出现的综述性工作，大多把 GraphRAG 拆成三段：

- 图谱构建（从文本、数据库、API、日志中抽实体和关系）；
- 图引导检索（根据问题在图上走一段路，得到子图）；
- 图增强生成（把子图变成自然语言或结构化提示）。

这一类工作的价值在于给了一个**模块化视角**，你可以直接对照自己现有的 RAG 管线，看看少了哪一段。很多人其实就少了“组织器/结构化重排”这一层，所以上下文总要塞很多。

### 2.2 更新到 2025 的五段式框架

2025 年初有论文把流程扩成了五段：

1. 查询处理器；
2. 检索器；
3. 组织器；
4. 生成器；
5. 数据源。

多出来的“组织器”就是专门管**怎么把检索出来的文本、图节点、关系，排成 LLM 最好吃的格式**。这一步在工程项目里非常实用，也最容易被忽略。

对你来说，可以直接用这五段去审视 Ling Atlas 或将来的 GraphRAG 流水线，看是不是要把“组织器”单独变成一个模块或一个 Action。

## 3. 多跳图检索方向

很多人搞 GraphRAG，是因为普通 RAG 在多跳问题上表现很差：第一跳能找对，第二跳就飘了，第三跳就瞎说。

### 3.1 划分—协调式子图检索

这一类方法的典型套路是：

- 先把文档或段落变成图；
- 针对问题在图上找一片**连通性好、语义相关的子图**；
- 再把这片子图的内容喂给 LLM。

这样做的直接好处是：LLM 看到的不是“20 段互不相干的文字”，而是一组本身就有结构的内容。对多跳问答、事件链条、因果链问题特别友好。

### 3.2 虚拟知识图谱（VKG）多跳

还有一条思路是不真的建大 KG，而是先让 LLM 把文本临时变成**虚拟知识图谱**，然后在这个临时图上做多跳。这样能大幅提升检索速度，同时保持比较高的准确率。对于静态站/自建知识库来说，这种“先离线图化、后快检索”的方式很合适。

## 4. 向量融合与混合检索

实践里大家都发现，只用图也不完美，只用向量也不完美，于是 2024–2025 出了一批“图 + 稠密向量 + 稀疏向量 + 摘要”的混合管线。

典型做法是：

- 预处理阶段先做**摘要/压缩**，把超长文档缩短，防止检索阶段塞太多；
- 检索阶段多通道并行：图检索一条，向量检索一条，必要时再跑一次关键词/稀疏检索；
- 合并阶段做一次排序或打分，生成阶段只吃“高置信度 + 可解释”的那一小撮。

这种思路对你的场景有两个直接收益：

1. 现有 Markdown 太碎或者太长都不怕，先做离线摘要就行。
2. 你可以保留现有向量化检索，再额外挂一个图检索，不用推翻原来的管线。

## 5. 子图提取与图路径检索

有些问题其实不需要一大片知识图谱，只要那**一条能解释问题的路径**。

路径式 GraphRAG 的核心步骤通常是：

1. 先召回一批可能相关的节点。
2. 在这些节点之间做关系/流量的筛选，剪掉噪音节点。
3. 把剩下的路径转成自然语言，交给 LLM。

这样一来，提示长度明显下降，但解释性反而更好，因为你能告诉用户“我是从 A → B → C 推出来的”。

对 Ling Atlas 这种要讲“从概念到实现”的内容，这条线特别适合：用户问“GraphRAG 怎么做多模态”，你就给他一条路径，而不是把所有 GraphRAG 文章都贴过去。

## 6. GNN 参与的 GraphRAG

2025 年的一个明显趋势是：**先用 GNN 在图上做硬推理/筛选，再让 LLM 说人话**。

基本模式是这样的：

- 用 GNN 在知识图谱上跑一遍，找出和问题相关性最高的节点或子图。
- 把从问题实体到候选答案的路径抽取出来。
- 再把这条路径转成 LLM 能理解的解释或证据。
- 最后由 LLM 输出自然语言答案。

好处非常直接：

- LLM 看到的 token 变少了。
- 解释路径是现成的。
- 有时候用小模型就能达到大模型的准确率。

你如果将来要做“图数据库 + 本地 GNN + 远端 LLM”的混合工作流，这条线可以直接拿来当蓝本。

## 7. 多模态知识图谱的 GraphRAG

当知识里有图片、视频、表格、设备配置这类内容时，普通 RAG 很容易漏信息。多模态 GraphRAG 一般会先把文本和图像/视频做一次**多模态实体与关系抽取**，再做图上的两阶段检索，最后把图的信息注入到生成阶段。

这对你要做的“静态站 → 多模态知识库 → 检索 → 回答”是高度贴合的：静态内容先结构化，检索的时候就不用临时去翻文件。

## 8. 面向推荐与个性化的 GraphRAG

还有一支是做推荐的。思路也不复杂：

- 用户、文档、标签、主题、时间等先变成图。
- 检索时找“和当前问题/用户/上下文最接近的子图”。
- 再把这个子图喂给 LLM 生成推荐/解释。

对你来说，这意味着 Ling Atlas 可以做成“知识导航器”：不是只查得到，还能说“接下来你可以看哪一篇”。

## 9. Agent 化与自我优化

2024–2025 的一些工作把 GraphRAG 嵌进了多智能体（Agent）框架，让系统变成一个“观察 → 检索 → 生成 → 反思 → 再检索”的循环，而不是“一次问答就结束”。

好处是：

- 第一次没检到的内容，可以在同一轮对话里再补。
- 图可以增量更新，不用每次全量重建。
- 幻觉可以通过“再检索 + 图对齐”来压低。

你要做的自动化（n8n / Dify / GitHub Actions / 本地脚本）都可以用这个思路，把 GraphRAG 当成一个可反复调用的检索-组织单元。

## 10. 参考文献（整理版）

1. Graph Retrieval-Augmented Generation: A Survey, 2024.
2. Retrieval-Augmented Generation with Graphs (GraphRAG), 2025.
3. GRAG: Graph Retrieval-Augmented Generation, 2024.
4. Multi-hop Database Reasoning with Virtual Knowledge Graph, 2024.
5. KeyKnowledgeRAG (K²RAG): An Enhanced RAG Method for Improved LLM Question-Answering Capabilities, 2025.
6. HybGRAG: Hybrid Retrieval-Augmented Generation on Textual and Relational Knowledge Bases, 2024.
7. PathRAG: Pruning Graph-based RAG with Relational Paths, 2025.
8. GNN-RAG: Graph Neural Retrieval for Efficient LLM Reasoning on Knowledge Graphs, 2025.
9. DualR: A GNN-LLM Collaborative Framework for KGQA, 2025.
10. mKG-RAG: Multimodal Knowledge Graph-Enhanced RAG for VQA, 2025.
11. Observation-Driven Agent for Integrating LLMs and Knowledge Graphs, 2024.
12. RAG-KG-IL: A Multi-Agent Hybrid Framework for Reducing Hallucinations and Enhancing LLM Reasoning, 2025.
