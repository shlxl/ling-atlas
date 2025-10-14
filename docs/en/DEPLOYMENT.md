---
title: Deployment Guide (GitHub Pages)
layout: doc
---

1. Open **Settings → Pages** in your GitHub repository and choose **GitHub Actions** as the source.
2. Ensure the default branch is `main`. Any push will trigger the workflow that builds and publishes the site.
3. Custom domain: add the `CNAME` within the Pages settings, or place a `CNAME` file under `docs/public/` if you prefer versioning it.
4. After configuring a domain, enable **Enforce HTTPS** to serve the site securely.
5. Need troubleshooting? Inspect the latest run of the `CI + Deploy` workflow; the logs list every validation and build step.
