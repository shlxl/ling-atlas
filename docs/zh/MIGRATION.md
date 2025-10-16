# 迁移与重写（Rewrites）

当分类英文路径或 slug 变更时：

1. 在仓库根创建/维护 `rewrites.json`：

   ```json
   [
     { "from": "/blog/engineering/2025/10/hello-kb/", "to": "/blog/architecture/2025/10/hello-kb/" }
   ]
   ```

2. 在 `docs/.vitepress/config.ts` 读取该文件，并在 `transformHead` 或自定义中间件里写入 `<link rel="canonical">` 与 301 逻辑（Cloudflare/Worker 更方便）。
