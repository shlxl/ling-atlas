# 部署指南（GitHub Pages）

1. 在 GitHub 仓库中打开 **Settings → Pages**，Source 选择 **GitHub Actions**。
2. 确保默认分支为 `main`，推送后工作流会自动构建并部署。
3. 自定义域名：新增 `CNAME` 到仓库 Pages 设置，或在 `docs/public/` 放置 `CNAME` 文件。
4. 使用自定义域时，建议在仓库设置开启 **Enforce HTTPS**。
