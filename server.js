/**
 * Standalone Node.js HTTP server for the Carerix RSS Feed.
 *
 * Wraps the same logic as api/rss.js but runs as a plain HTTP server
 * without any Vercel dependency. Suitable for VPS, Docker, or any
 * Node.js hosting environment.
 *
 * Usage:
 *   cp .env.example .env   # fill in your credentials
 *   node server.js
 *
 * Environment variables:
 *   CARERIX_CLIENT_ID       — OAuth2 client ID
 *   CARERIX_CLIENT_SECRET   — OAuth2 client secret
 *   CARERIX_TOKEN_ENDPOINT  — OAuth2 token URL
 *   PORT                    — HTTP port (default 3000)
 *   CACHE_TTL_SECONDS       — In-memory cache lifetime (default 3600)
 */

import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ─── Load .env file if present ───────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '.env');

if (existsSync(envPath)) {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

// ─── Configuration ───────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT, 10) || 3000;
const CACHE_TTL = parseInt(process.env.CACHE_TTL_SECONDS, 10) || 3600;
const CARERIX_GRAPHQL_URI = 'https://api.carerix.io/graphql/v1/graphql';

// ─── In-memory cache (per medium) ────────────────────────────────────────────

const VALID_MEDIUMS = ['web', 'betaald'];
const cacheStore = {};

// ─── OAuth2 Token ────────────────────────────────────────────────────────────

async function getAccessToken() {
  const { CARERIX_CLIENT_ID, CARERIX_CLIENT_SECRET, CARERIX_TOKEN_ENDPOINT } = process.env;

  if (!CARERIX_CLIENT_ID || !CARERIX_CLIENT_SECRET || !CARERIX_TOKEN_ENDPOINT) {
    throw new Error('Missing Carerix OAuth environment variables (CARERIX_CLIENT_ID, CARERIX_CLIENT_SECRET, CARERIX_TOKEN_ENDPOINT)');
  }

  const res = await fetch(CARERIX_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=client_credentials&client_id=${encodeURIComponent(CARERIX_CLIENT_ID)}&client_secret=${encodeURIComponent(CARERIX_CLIENT_SECRET)}`,
  });

  if (!res.ok) {
    throw new Error(`Token request failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return data.access_token;
}

// ─── GraphQL Query ───────────────────────────────────────────────────────────

function buildPublicationQuery() {
  return `
    query ($qualifier: String, $pageable: Pageable) {
      crPublicationPage(qualifier: $qualifier, pageable: $pageable) {
        items {
          _id
          publicationID
          publicationStart
          publicationEnd
          titleInformation
          workLocation
          additionalInfo
          introInformation
          companyInformation
          vacancyInformation
          requirementsInformation
          offerInformation
          functionContactInformation
          applicationContactInformation
          owner {
            _id
            firstName
            lastName
          }
          agency {
            _id
            name
          }
          toCompany {
            _id
            name
            visitPostalCode
            visitCity
          }
          toMedium {
            code
            name
          }
          toVacancy {
            _id
            titleInformation
            additionalInfo
            hoursPerWeek
            minSalary
            maxSalary
            workLocation
            rawWorkLocation
            toSalaryPeriodNode { value }
            toSalaryCurrencyNode { value }
            toContractTypeNode { value }
            toBrancheLevel1 { value }
            toBrancheLevel2 { value }
            toCategoryNode { value }
            toFunctionLevel1 { value }
            toFunctionLevel2 { value }
            toExperienceLevelNode { value }
            toCountry1Node { value }
            toProvince1Node { value }
            toCountry2Node { value }
            toProvince2Node { value }
            toCountry3Node { value }
            toProvince3Node { value }
            toContact {
              _id
              firstName
              lastName
            }
            procedureList {
              items { value }
            }
            groupNodes {
              items { value }
            }
            educations {
              items {
                toLevel1Education1 { value }
                toLevel1Education2 { value }
                toLevel1Education3 { value }
              }
            }
            publications {
              items {
                publicationID
                toMedium { code }
                publicationStart
                publicationEnd
              }
            }
          }
        }
      }
    }
  `;
}

async function fetchPublications(token, medium) {
  const now = new Date();
  const dateStr = formatDateCarerix(now);

  const mediumFilter = medium
    ? `toMedium.code = '${medium}'`
    : `(toMedium.code = 'web' or toMedium.code = 'betaald')`;

  const qualifier = `${mediumFilter} and publicationStart <= (NSCalendarDate)'${dateStr} Etc/GMT' and (publicationEnd > (NSCalendarDate)'${dateStr} Etc/GMT' or publicationEnd = nil)`;

  const res = await fetch(CARERIX_GRAPHQL_URI, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      query: buildPublicationQuery(),
      variables: {
        qualifier,
        pageable: { page: 0, size: 10000 },
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GraphQL request failed: ${res.status} ${text}`);
  }

  const json = await res.json();

  if (json.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }

  return json.data?.crPublicationPage?.items || [];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDateCarerix(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d} 00:00:00`;
}

function formatRssDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const cest = new Date(d.getTime() + 2 * 60 * 60 * 1000);
  const day = days[cest.getUTCDay()];
  const dd = String(cest.getUTCDate()).padStart(2, '0');
  const mon = months[cest.getUTCMonth()];
  const yyyy = cest.getUTCFullYear();
  const hh = String(cest.getUTCHours()).padStart(2, '0');
  const mm = String(cest.getUTCMinutes()).padStart(2, '0');
  const ss = String(cest.getUTCSeconds()).padStart(2, '0');
  return `${day}, ${dd} ${mon} ${yyyy} ${hh}:${mm}:${ss} +0200`;
}

function formatDateField(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const sec = String(d.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}:${sec}`;
}

function cdata(val) {
  if (val === null || val === undefined) return '<![CDATA[ ]]>';
  const s = String(val).trim();
  if (!s) return '<![CDATA[ ]]>';
  return `<![CDATA[ ${s} ]]>`;
}

function escapeXml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function extractPostalCode(vacancyAdditionalInfo, pubAdditionalInfo, companyPostalCode) {
  if (vacancyAdditionalInfo) {
    const info = typeof vacancyAdditionalInfo === 'string' ? tryParse(vacancyAdditionalInfo) : vacancyAdditionalInfo;
    if (info) {
      const pc = info.postalCode || info.postcode || info.zipCode || info.zip || info.postal_code;
      if (pc) return String(pc);
    }
  }
  if (pubAdditionalInfo) {
    const info = typeof pubAdditionalInfo === 'string' ? tryParse(pubAdditionalInfo) : pubAdditionalInfo;
    if (info) {
      const pc = info.postalCode || info.postcode || info.zipCode || info.zip || info.postal_code;
      if (pc) return String(pc);
    }
  }
  if (companyPostalCode) return String(companyPostalCode);
  return '';
}

function tryParse(str) {
  try { return JSON.parse(str); } catch { return null; }
}

function formatSalaryTag(tagName, value) {
  if (value === null || value === undefined || value === '' || value === 0) {
    return `<${tagName}/>`;
  }
  return `<${tagName}>${value}</${tagName}>`;
}

function buildPubIdList(publication) {
  const vacancyId = publication.toVacancy?._id;
  if (!vacancyId) return String(publication.publicationID);

  const siblings = publication.toVacancy?.publications?.items || [];
  const now = new Date();

  const validIds = siblings
    .filter((pub) => {
      const mediumCode = pub.toMedium?.code;
      if (mediumCode !== 'web' && mediumCode !== 'betaald') return false;
      const start = pub.publicationStart ? new Date(pub.publicationStart) : null;
      const end = pub.publicationEnd ? new Date(pub.publicationEnd) : null;
      if (start && start > now) return false;
      if (end && end <= now) return false;
      return true;
    })
    .map((pub) => pub.publicationID)
    .sort((a, b) => a - b);

  return validIds.length > 0 ? validIds.join(',') : String(publication.publicationID);
}

// ─── XML Generation ──────────────────────────────────────────────────────────

function publicationToXmlItem(pub) {
  const vacancy = pub.toVacancy || {};
  const ownerName = [pub.owner?.firstName, pub.owner?.lastName].filter(Boolean).join(' ');
  const ownerId = pub.owner?._id || '';
  const agencyName = pub.agency?.name || '';
  const agencyId = pub.agency?._id || '';
  const contactName = vacancy.toContact
    ? [vacancy.toContact.firstName, vacancy.toContact.lastName].filter(Boolean).join(' ')
    : '';
  const companyName = pub.toCompany?.name || '';
  const workLoc = pub.workLocation || vacancy.workLocation || '';
  const rawTitle = vacancy.titleInformation || pub.titleInformation || '';
  const title = rawTitle + (workLoc ? ` - ${workLoc}` : '');

  const postalCode = extractPostalCode(vacancy.additionalInfo, pub.additionalInfo, pub.toCompany?.visitPostalCode);
  const pubIdList = buildPubIdList(pub);

  const educations = vacancy.educations?.items || [];
  let educationXml = '';
  if (educations.length > 0) {
    educationXml = educations
      .map((edu) => {
        const edu1 = edu.toLevel1Education1?.value || '';
        const edu2 = edu.toLevel1Education2?.value || '';
        const edu3 = edu.toLevel1Education3?.value || '';
        const eduName = edu1 || edu2 || edu3 || '';
        const requiredParts = [edu1, edu2, edu3].join(' :|: ');
        return `<education>${cdata(eduName)}</education>\n<required>${cdata(requiredParts)}</required>`;
      })
      .join('\n');
  }

  const groups = vacancy.groupNodes?.items || [];
  const groupsXml = groups.map((g) => `<group>${cdata(g.value)}</group>`).join('\n');

  return `<item>
<guid isPermaLink="false">${pub.publicationID}</guid>
<pubIdList>${pubIdList}</pubIdList>
<pubDate>${cdata(formatRssDate(pub.publicationStart))}</pubDate>
<title>${cdata(title)}</title>
<postalCode>${cdata(postalCode)}</postalCode>
<rawTitle>${cdata(rawTitle)}</rawTitle>
<ownerName id="${escapeXml(String(ownerId))}">${cdata(ownerName)}</ownerName>
<agency id="${escapeXml(String(agencyId))}">${cdata(agencyName)}</agency>
<contact>${contactName ? cdata(contactName) : ''}</contact>
<company>${cdata(companyName)}</company>
<startDate>${cdata(formatDateField(pub.publicationStart))}</startDate>
<endDate>${cdata(formatDateField(pub.publicationEnd))}</endDate>
<test>${cdata(workLoc)}</test>
<titleWorkLocation>${cdata(workLoc)}</titleWorkLocation>
<workLocation>${cdata(workLoc)}</workLocation>
<country1>${cdata(vacancy.toCountry1Node?.value || '')}</country1>
<region1>${cdata(vacancy.toProvince1Node?.value || '')}</region1>
<country2>${cdata(vacancy.toCountry2Node?.value || '')}</country2>
<region2>${cdata(vacancy.toProvince2Node?.value || '')}</region2>
<country3>${cdata(vacancy.toCountry3Node?.value || '')}</country3>
<region3>${cdata(vacancy.toProvince3Node?.value || '')}</region3>
<introInformation>${cdata(pub.introInformation || '')}</introInformation>
<companyInformation>${cdata(pub.companyInformation || '')}</companyInformation>
<branche0>${cdata(vacancy.toBrancheLevel1?.value || '')}</branche0>
<branche1>${cdata(vacancy.toBrancheLevel2?.value || '')}</branche1>
<category>${cdata(vacancy.toCategoryNode?.value || '')}</category>
<function0>${cdata(vacancy.toFunctionLevel1?.value || '')}</function0>
<function1>${cdata(vacancy.toFunctionLevel2?.value || '')}</function1>
<toWorkLevelNode>${cdata(vacancy.toExperienceLevelNode?.value || '')}</toWorkLevelNode>
<vacancyInformation>${cdata(pub.vacancyInformation || '')}</vacancyInformation>
<requirementsInformation>${cdata(pub.requirementsInformation || '')}</requirementsInformation>
<offerInformation>${cdata(pub.offerInformation || '')}</offerInformation>
<functionContactInformation>${cdata(pub.functionContactInformation || '')}</functionContactInformation>
<applicationContactInformation>${cdata(pub.applicationContactInformation || '')}</applicationContactInformation>
<vacancyID>${cdata(vacancy._id || '')}</vacancyID>
<medium>${cdata(pub.toMedium?.code || '')}</medium>
<procedure>${cdata(vacancy.procedureList?.items?.[0]?.value || '')}</procedure>
<hoursPerWeek>${vacancy.hoursPerWeek || ''}</hoursPerWeek>
${formatSalaryTag('minSalary', vacancy.minSalary)}
${formatSalaryTag('maxSalary', vacancy.maxSalary)}
<salaryPeriod>${cdata(vacancy.toSalaryPeriodNode?.value || '')}</salaryPeriod>
<salaryCurrency>${cdata(vacancy.toSalaryCurrencyNode?.value || '')}</salaryCurrency>
<contractType>${cdata(vacancy.toContractTypeNode?.value || '')}</contractType>
<groups>${groupsXml}</groups>
<educations>${educationXml ? '\n' + educationXml + '\n' : ' '}</educations>
</item>`;
}

function buildRssFeed(publications) {
  const items = publications.map(publicationToXmlItem).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="0.91">
<channel>
${items}
</channel>
</rss>`;
}

// ─── Generate RSS feed (with per-medium caching) ────────────────────────────

async function generateFeed(medium) {
  const cacheKey = medium || '_all';
  const cached = cacheStore[cacheKey];
  const now = Date.now();

  if (cached && (now - cached.timestamp) < CACHE_TTL * 1000) {
    return cached.xml;
  }

  const label = medium || 'all';
  console.log(`[${new Date().toISOString()}] Refreshing RSS feed (medium=${label}) from Carerix API...`);
  const token = await getAccessToken();
  const publications = await fetchPublications(token, medium);
  const xml = buildRssFeed(publications);

  cacheStore[cacheKey] = { xml, timestamp: now };
  console.log(`[${new Date().toISOString()}] RSS feed cached (medium=${label}) — ${publications.length} items`);

  return xml;
}

// ─── HTTP Server ─────────────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = parsedUrl.pathname;

  // Health check
  if (pathname === '/health') {
    const now = Date.now();
    const caches = Object.entries(cacheStore).map(([key, c]) => ({
      medium: key === '_all' ? 'all' : key,
      cached: true,
      cacheAge: Math.round((now - c.timestamp) / 1000),
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', caches }));
    return;
  }

  // RSS feed — served on / and /api/rss, with optional ?medium=web or ?medium=betaald
  if (pathname === '/' || pathname === '/api/rss') {
    try {
      const mediumParam = parsedUrl.searchParams.get('medium');
      const medium = mediumParam && VALID_MEDIUMS.includes(mediumParam) ? mediumParam : null;
      const xml = await generateFeed(medium);
      res.writeHead(200, {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': `public, max-age=${CACHE_TTL}`,
        'X-Robots-Tag': 'index, follow',
      });
      res.end(xml);
    } catch (err) {
      console.error('RSS feed error:', err);
      res.writeHead(500, { 'Content-Type': 'application/xml; charset=utf-8' });
      res.end(`<?xml version="1.0" encoding="UTF-8"?><error>${escapeXml(err.message)}</error>`);
    }
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`Carerix RSS feed server running on http://localhost:${PORT}`);
  console.log(`  All:      http://localhost:${PORT}/api/rss`);
  console.log(`  Web:      http://localhost:${PORT}/api/rss?medium=web`);
  console.log(`  Betaald:  http://localhost:${PORT}/api/rss?medium=betaald`);
  console.log(`  Health:   http://localhost:${PORT}/health`);
  console.log(`  Cache TTL: ${CACHE_TTL}s`);
});
