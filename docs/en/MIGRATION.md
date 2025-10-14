---
title: Migration & Rewrites
layout: doc
---

When you change a slug or folder structure, add an entry to `rewrites.json` at the repo root:

```json
[
  { "from": "/blog/engineering/2025/10/hello-kb/", "to": "/en/content/automation/" }
]
```

The PageGen scripts will surface this mapping so that edge proxies (Cloudflare Workers, GitHub Pages rules, etc.) can forward legacy links to the new destination.

- Keep canonical tags in sync—adjust `docs/.vitepress/config.ts` if you expose multiple aliases.
- Rebuild (`npm run build`) and redeploy to ensure the sitemap and RSS feeds advertise the new location.
- Audit external references (social posts, documentation) to point to the updated URL wherever possible.
