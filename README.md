# HD Customer Success — SLA-rapportage mei 2026

One-page static dashboard (HTML + Chart.js via CDN). No build step, no dependencies.

## Deploy to Vercel — CLI (from Windsurf's terminal)
```bash
npm i -g vercel    # once
vercel             # preview deploy — first run links/creates the project
vercel --prod      # promote to production
```

## Deploy to Vercel — Git
Push this folder to a repo and "Import Project" in the Vercel dashboard.
Redeploys automatically on every push — handy if you refresh this monthly.

## About the data
This report names individual colleagues and their SLA figures. `vercel.json` sets
`X-Robots-Tag: noindex` so search engines won't index it, but a Vercel deploy is still
reachable by anyone who has the URL. For internal data, turn on **Deployment Protection**
(password) under the Vercel project settings.
