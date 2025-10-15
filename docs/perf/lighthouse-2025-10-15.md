# Lighthouse 分析（2025-10-15）

## 测试概览

- **/index.html**（简体中文首页）性能评分仅 0.73，总阻塞时间（TBT）高达 1.42 s，Largest Contentful Paint 为 1.7 s。该页的最大潜在 FID 也达到 746 ms，说明主线程在初始渲染时被长任务阻塞。【d034be†L1-L2】【f1d696†L1-L21】
- **/en/index.html**（英文首页）性能评分 0.89，TBT 仅 278 ms，整体表现明显优于中文首页。【8bab91†L1-L2】【f207d1†L1-L27】

## 主要瓶颈

1. **搜索组件在页面加载阶段就初始化语义检索**
   导航栏的 `SearchBox` 组件在 `onMounted` 钩子中立即调用 `initSemantic()`，会尝试加载 `embeddings-texts.json`、启动 Web Worker，并为语义检索准备大批数据结构，即使用户尚未打开搜索面板。这些初始化逻辑（包括多次 `Map` 与 `Set` 的构建）会占用主线程，触发多个超过 300 ms 的长任务，从而推高了首页的总阻塞时间。【F:docs/.vitepress/theme/components/SearchBox.vue†L144-L199】【F:docs/.vitepress/theme/components/SearchBox.vue†L309-L618】

2. **语义向量资源 404，造成额外的高优先级请求与错误处理开销**  
   Lighthouse 记录到首页在加载阶段请求 `/embeddings-texts.json`，该请求返回 404（transferSize≈1.8 KB，resourceSize≈5.6 KB）。虽然资源不存在，但浏览器仍然把它当成高优先级 Fetch，并触发异常处理逻辑，进一步放大了初始化的 CPU 开销。【fab0cb†L1-L17】

3. **脚本评估占比过大**  
   主线程工作细分显示脚本执行占用了约 1.14 s 的时间（经移动端 4×CPU 节流后表现为 1.4 s 的阻塞），而这部分时间在英文首页要少得多，说明目前的初始化逻辑对中文首页尤为不利。【a5ce48†L1-L13】【f1d696†L1-L21】

## 建议的优化方向

- **延迟语义检索初始化**：仅在用户首次打开搜索面板或显式切换到语义检索模式时，再加载向量文件和启动 Worker，可显著降低首屏脚本执行时间。
- **修复缺失的 `embeddings-texts.json`**：要么在构建流程中产出该文件，要么在前端增加存在性检查并降级到纯词法搜索，避免无效的 404 高优先级请求。
- **按需拆分搜索逻辑**：将语义融合、MMR 等算法拆分为异步模块（如 `import()`），在需要时再加载，可减小首屏需要解析的脚本体积和执行成本。

上述调整应能把中文首页的 TBT 拉回到 200–300 ms 的区间，从而恢复 Lighthouse >0.9 的性能评分。
