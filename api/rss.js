/**
 * Vercel Serverless Function — Carerix RSS Feed
 *
 * Queries the Carerix GraphQL API for active publications with medium "web" or "betaald",
 * filtered by publicationStart <= today and publicationEnd > today (or empty).
 * Returns RSS 0.91 XML, cached for 1 hour.
 */

const CARERIX_GRAPHQL_URI = 'https://api.carerix.io/graphql/v1/graphql';

// ─── OAuth2 Token ────────────────────────────────────────────────────────────

async function getAccessToken() {
  const { CARERIX_CLIENT_ID, CARERIX_CLIENT_SECRET, CARERIX_TOKEN_ENDPOINT } = process.env;

  if (!CARERIX_CLIENT_ID || !CARERIX_CLIENT_SECRET || !CARERIX_TOKEN_ENDPOINT) {
    throw new Error('Missing Carerix OAuth environment variables');
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

const VALID_MEDIUMS = ['web', 'betaald'];

async function fetchPublications(token, medium) {
  const now = new Date();
  const dateStr = formatDateCarerix(now);

  // Build medium filter: single medium or both
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
  // Format as RFC 822 with +0200 (CEST)
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // Offset to CEST (+0200)
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
  // Try vacancy additionalInfo first
  if (vacancyAdditionalInfo) {
    const info = typeof vacancyAdditionalInfo === 'string' ? tryParse(vacancyAdditionalInfo) : vacancyAdditionalInfo;
    if (info) {
      const pc = info.postalCode || info.postcode || info.zipCode || info.zip || info.postal_code;
      if (pc) return String(pc);
    }
  }
  // Try publication additionalInfo
  if (pubAdditionalInfo) {
    const info = typeof pubAdditionalInfo === 'string' ? tryParse(pubAdditionalInfo) : pubAdditionalInfo;
    if (info) {
      const pc = info.postalCode || info.postcode || info.zipCode || info.zip || info.postal_code;
      if (pc) return String(pc);
    }
  }
  // Fallback to company postal code
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

// Build pubIdList: all publication IDs for the same vacancy that match our medium filter and date criteria
function buildPubIdList(publication, allPublications) {
  const vacancyId = publication.toVacancy?._id;
  if (!vacancyId) return String(publication.publicationID);

  // Get sibling publications from the vacancy that are also active with web/betaald medium
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

  // Postal code: try additionalInfo from vacancy/publication, or company visitPostalCode
  const postalCode = extractPostalCode(vacancy.additionalInfo, pub.additionalInfo, pub.toCompany?.visitPostalCode);

  const pubIdList = buildPubIdList(pub, []);

  // Education handling
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

  // Groups
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

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  try {
    // Support ?medium=web or ?medium=betaald to split feeds
    const url = new URL(req.url, `http://${req.headers.host}`);
    const mediumParam = url.searchParams.get('medium');
    const medium = mediumParam && VALID_MEDIUMS.includes(mediumParam) ? mediumParam : null;

    const token = await getAccessToken();
    const publications = await fetchPublications(token, medium);
    const xml = buildRssFeed(publications);

    // Cache for 1 hour (3600s), serve stale while revalidating
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=600');
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.status(200).send(xml);
  } catch (err) {
    console.error('RSS feed error:', err);
    res.status(500).send(`<?xml version="1.0" encoding="UTF-8"?><error>${escapeXml(err.message)}</error>`);
  }
}
