---
title: Automating Deployments
date: '2025-10-15'
status: published
category_zh: 工程笔记
tags_zh:
  - 自动化
  - 工作流
series: Knowledge Ops
series_slug: knowledge-ops
slug: automation-playbook
excerpt: A concise walkthrough on how Ling Atlas automates content validation, build, and deployment.
---

Automating the content pipeline keeps Ling Atlas reliable while freeing writers from repetitive chores. This short guide summarises the current workflow and highlights the hooks you can customise.

## Validation First

- `npm run precheck` validates frontmatter against the shared schema.
- Markdown linting and internal link checks run inside CI; you can reproduce locally via `npm run md:lint` and `node scripts/check-links.mjs`.

## Build and Publish

- `npm run build` bundles both Chinese and English archives, updates RSS/Sitemap, and refreshes search indexes.
- GitHub Actions executes `npm run build:search` on push, so Pagefind assets and semantic embeddings are always in sync.

## Safeguards

- Supply chain steps (`npm run audit`, `npm run license`, `npm run sbom`) expose dependency, licence, and SBOM data for auditing.
- External resources are protected by strict SRI checks—changing a CDN asset without updating the allowlist causes CI to fail.

By combining these steps, the repository stays ready to publish with minimal manual intervention. Extend them with your own scripts to cover image optimisation, analytics, or custom QA tasks.
