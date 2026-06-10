# HD Customer Success — SLA & volume jaaroverzicht 2026

Interactive one-page dashboard (HTML + Chart.js via CDN). No build step, no dependencies.
All HD tickets created 1 Jan - 10 Jun 2026 (n=2704). June is a partial month.

Filter by month and week (top right) - every chart, KPI and table recomputes live, including
per-period top-10 reporters, top-10 customers, and top-10 Carerix colleagues who create tickets.

## Deploy to Vercel - CLI (from Windsurf's terminal)
```bash
npm i -g vercel    # once
vercel             # preview deploy
vercel --prod      # promote to production
```

## About the data (please read)
- Contains individual names and SLA figures. `vercel.json` sets `X-Robots-Tag: noindex`, but a
  Vercel URL is still reachable by anyone who has it - enable Deployment Protection (password)
  in the project settings for internal data.
- "Carerix-collega" = a reporter matched by name against the supplied Carerix staff list (48 names),
  or an internal Carerix account. Customers with their own Jira account count as customers. A
  colleague whose Jira display name differs from the list name may be missed.
- "Behandelaar" is the current assignee, not necessarily who sent the first response.
