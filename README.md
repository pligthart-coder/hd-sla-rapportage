# HD Customer Success — SLA & volume jaaroverzicht 2026

Interactive one-page dashboard (HTML + Chart.js via CDN). No build step, no dependencies.
Covers all HD tickets created 1 Jan – 10 Jun 2026 (n=2704). June is a partial month.

Filter by month and by week (top right) — every chart, KPI and table recomputes live.
Includes per-period top-10 reporters and top-10 customers, and a monthly klant-vs-collega
volume trend that drills down to weeks when a month is selected.

## Deploy to Vercel — CLI (from Windsurf's terminal)
```bash
npm i -g vercel    # once
vercel             # preview deploy — first run links/creates the project
vercel --prod      # promote to production
```

## Deploy to Vercel — Git
Push this folder to a repo and "Import Project" in the Vercel dashboard.

## About the data (please read)
- Contains individual colleague names and SLA figures. `vercel.json` sets `X-Robots-Tag: noindex`
  so search engines won't index it, but a Vercel URL is still reachable by anyone who has it.
  For internal data, enable **Deployment Protection** (password) in the Vercel project settings.
- "Klant" = ticket via the customer portal (unambiguous). "Carerix-collega" = internal account
  without an external email domain — an approximation; a few customer users with full Atlassian
  accounts may fall in this bucket and vice versa. Treat the colleague count as an estimate.
- "Behandelaar" is the current assignee, not necessarily who sent the first response.
