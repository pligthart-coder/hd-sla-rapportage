---
name: testing-rss-feed
description: Test the Carerix RSS feed endpoint (/api/rss) end-to-end. Use when verifying RSS feed changes, Carerix GraphQL integration, or XML output format.
---

# Testing the Carerix RSS Feed Endpoint

## Overview

The `/api/rss` endpoint is a Vercel serverless function that queries the Carerix GraphQL API and returns an RSS 0.91 XML feed of job publications. Testing is done locally via Node.js handler invocation since the Vercel preview deployment may be behind SSO team authentication.

## Devin Secrets Needed

- `CARERIX_CLIENT_ID` — OAuth2 client ID for Carerix API
- `CARERIX_CLIENT_SECRET` — OAuth2 client secret
- `CARERIX_TOKEN_ENDPOINT` — OAuth2 token endpoint URL (e.g., `https://company.carerix.com/cxoauth2/token`)

## Testing Approach

### Local Handler Invocation

Since this is a pure API endpoint with no UI, test via shell commands. No screen recording needed.

```bash
cd /home/ubuntu/repos/hd-sla-rapportage

# Full invocation - save output for analysis
node --input-type=module -e "
import handler from './api/rss.js';
class Res {
  constructor() { this.statusCode=200; this.headers={}; this.body=''; }
  status(c) { this.statusCode=c; return this; }
  setHeader(k,v) { this.headers[k]=v; return this; }
  send(d) { this.body=d; return this; }
}
const res = new Res();
await handler({method:'GET',url:'/api/rss',headers:{host:'localhost'}}, res);
console.error('Status:', res.statusCode);
console.error('Headers:', JSON.stringify(res.headers));
process.stdout.write(res.body);
" > /home/ubuntu/rss-output.xml 2>/dev/null
```

**Important:** The `headers:{host:'localhost'}` field is required because the handler uses `new URL(req.url, \`http://${req.headers.host}\`)` to parse query parameters. Without it, URL parsing will fail.

#### Testing with medium query parameter

```bash
# Web-only feed
node --input-type=module -e "
import handler from './api/rss.js';
class Res {
  constructor() { this.statusCode=200; this.headers={}; this.body=''; }
  status(c) { this.statusCode=c; return this; }
  setHeader(k,v) { this.headers[k]=v; return this; }
  send(d) { this.body=d; return this; }
}
const res = new Res();
await handler({method:'GET',url:'/api/rss?medium=web',headers:{host:'localhost'}}, res);
process.stdout.write(res.body);
" > /home/ubuntu/rss-web.xml 2>/dev/null

# Betaald-only feed
# Same as above but url:'/api/rss?medium=betaald'
```

Run all three variants (combined, web, betaald) in parallel to save time — they are independent API calls.

### Key Test Areas

1. **Response metadata**: Status 200, Content-Type `application/xml; charset=utf-8`, Cache-Control `s-maxage=3600, stale-while-revalidate=600`
2. **XML structure**: RSS 0.91 with `<channel>` wrapper, all 45 required child elements per item
3. **CRDataNode field values**: Must contain real data (industry names, country names, education levels) — NOT "Dossier" (the type descriptor). Grep for `CDATA[ Dossier ]` which should return 0 matches.
4. **Date formatting**: pubDate in RFC 822 (`Day, DD Mon YYYY HH:MM:SS +0200`), startDate/endDate in `YYYY-MM-DD HH:mm:ss`
5. **Date filtering**: No future startDates, no past endDates (empty endDate allowed)
6. **pubIdList**: Sibling publications grouped, numerically sorted. Note: ~0.2% of items may have their own ID missing from pubIdList due to Carerix API data consistency issues in nested queries.
7. **Education structure**: `<education>` with real levels (MBO, HBO, etc.), `<required>` uses ` :|: ` separator
8. **Medium filtering**: Only "web" and "betaald" values should appear
9. **Error handling**: Missing credentials → 500 with `<error>Missing Carerix OAuth environment variables</error>`

### Split-Medium Testing

When the endpoint supports `?medium=web` and `?medium=betaald` query parameters, test these additional scenarios:

10. **Web-only filtering**: `/api/rss?medium=web` returns items where ALL `<medium>` elements contain only "web" — zero "betaald" occurrences
11. **Betaald-only filtering**: `/api/rss?medium=betaald` returns items where ALL `<medium>` elements contain only "betaald" — zero "web" occurrences
12. **Count integrity**: web_count + betaald_count must equal combined_count exactly (same data, just split)
13. **Invalid medium fallback**: `/api/rss?medium=invalid` falls back to combined feed (same count as no-param)
14. **Backward compatibility**: `/api/rss` with no param still returns both mediums combined

**Expected item counts (approximate, will change over time):** Combined ~2500-3000, web ~55-60% of total, betaald ~40-45%. The web+betaald sum should always exactly equal the combined count.

**Verification approach:**
```bash
# Count items and verify medium isolation
grep -c '<item>' /home/ubuntu/rss-web.xml
grep -o 'CDATA\[ betaald \]' /home/ubuntu/rss-web.xml | wc -l  # should be 0
grep -o 'CDATA\[ web \]' /home/ubuntu/rss-betaald.xml | wc -l  # should be 0
```

### Gotchas and Tips

- **Carerix API transient errors**: The `cx5-wrapper-service` may occasionally return 500 "SERVICE_ERROR". This is transient — retry after a few seconds. If querying large result sets (size=10000) fails, test with smaller sizes first (size=5) to confirm query structure works.
- **Vercel preview might be behind SSO**: If curl to the preview URL returns a 302 to `vercel.com/sso-api`, the project has team SSO protection. Test locally instead.
- **CRDataNode `.value` vs `.label`**: The GraphQL schema uses `.value` for actual data and `.label` for the type descriptor. If fields show "Dossier" it means the query is incorrectly using `.label` or `.name`.
- **Carerix date qualifier syntax**: Must use `(NSCalendarDate)'YYYY-MM-DD HH:mm:ss Etc/GMT'` format in the GraphQL qualifier string.
- **Pagination**: Carerix uses `Pageable` input type with `page` and `size` fields (not `limit`/`offset`).
- **Large output**: Full feed is ~11MB with ~2450 items. Use file-based analysis rather than trying to inspect in terminal.
- **Node.js ESM**: The handler uses ES modules. Use `--input-type=module` flag with `node -e` for inline scripts.

### Verification Scripts

Parse the saved XML output with Node.js scripts to verify field values, date formats, item counts, and structure. The XML is too large for manual inspection — use regex matching and programmatic analysis.
