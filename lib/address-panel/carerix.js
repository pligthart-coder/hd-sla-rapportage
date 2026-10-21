/**
 * Writes an address to a Carerix record through the Carerix REST API.
 *
 * Update request:  POST {CARERIX_REST_BASE}/{entity}/{id}  with an XML body
 *   <CREmployee>
 *     <street>Dam</street>
 *     …
 *     <toCountryNode><CRDataNode id="1234"/></toCountryNode>
 *   </CREmployee>
 *
 * Auth (first one configured wins):
 *   1. CARERIX_REST_USER + CARERIX_REST_TOKEN  → HTTP Basic (classic REST token)
 *   2. CARERIX_CLIENT_ID/SECRET/TOKEN_ENDPOINT → OAuth2 bearer (same client as the RSS feed)
 *
 * Live writes are opt-in: unless ADDRESS_DRY_RUN=false AND credentials are set,
 * nothing is sent and the XML that would be written is returned instead, so
 * you can check the mapping first.
 */

import { getTargets, getCountryNodeIds } from './targets.js';

const ALLOWED_PARTS = ['street', 'houseNumber', 'houseNumberSuffix', 'postalCode', 'city', 'province'];

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Builds { fieldName: value } plus the country relation for the chosen targets. */
export function buildUpdate(entity, targetKeys, address) {
  const def = getTargets()[entity];
  if (!def) throw new Error(`Entity not configured: ${entity}`);
  if (!targetKeys.length) throw new Error('Choose at least one address type');

  const countryIds = getCountryNodeIds();
  const countryNodeId = address.countryCode ? countryIds[address.countryCode.toUpperCase()] : undefined;

  const attributes = {};
  const relations = {};
  const warnings = [];

  for (const key of targetKeys) {
    const target = def.targets[key];
    if (!target) throw new Error(`Unknown address type for ${entity}: ${key}`);

    for (const part of ALLOWED_PARTS) {
      const field = target.fields[part];
      if (field) attributes[field] = (address[part] ?? '').toString().trim();
    }

    const countryField = target.fields.country;
    if (countryField && address.countryCode) {
      if (countryNodeId) {
        relations[countryField] = countryNodeId;
      } else {
        warnings.push(`Land ${address.countryCode} niet opgeslagen: geen Carerix id in COUNTRY_NODE_IDS`);
      }
    }
  }

  return { attributes, relations, warnings: [...new Set(warnings)] };
}

export function buildXml(entity, { attributes, relations }) {
  const lines = Object.entries(attributes).map(([f, v]) => `  <${f}>${escapeXml(v)}</${f}>`);
  for (const [f, id] of Object.entries(relations)) {
    lines.push(`  <${f}><CRDataNode id="${escapeXml(id)}"/></${f}>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<${entity}>\n${lines.join('\n')}\n</${entity}>`;
}

async function authHeader() {
  const { CARERIX_REST_USER, CARERIX_REST_TOKEN } = process.env;
  if (CARERIX_REST_USER && CARERIX_REST_TOKEN) {
    return 'Basic ' + Buffer.from(`${CARERIX_REST_USER}:${CARERIX_REST_TOKEN}`).toString('base64');
  }

  const { CARERIX_CLIENT_ID, CARERIX_CLIENT_SECRET, CARERIX_TOKEN_ENDPOINT } = process.env;
  if (CARERIX_CLIENT_ID && CARERIX_CLIENT_SECRET && CARERIX_TOKEN_ENDPOINT) {
    const res = await fetch(CARERIX_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=client_credentials&client_id=${encodeURIComponent(CARERIX_CLIENT_ID)}&client_secret=${encodeURIComponent(CARERIX_CLIENT_SECRET)}`,
    });
    if (!res.ok) throw new Error(`Token request failed: ${res.status} ${await res.text()}`);
    return `Bearer ${(await res.json()).access_token}`;
  }

  return null;
}

export function isDryRun() {
  if (process.env.ADDRESS_DRY_RUN !== 'false') return true;
  const { CARERIX_REST_USER, CARERIX_REST_TOKEN, CARERIX_CLIENT_ID } = process.env;
  return !(CARERIX_REST_USER && CARERIX_REST_TOKEN) && !CARERIX_CLIENT_ID;
}

export async function saveAddress(entity, id, targetKeys, address) {
  if (!/^\d+$/.test(String(id))) throw new Error('Invalid record id');

  const update = buildUpdate(entity, targetKeys, address);
  const xml = buildXml(entity, update);

  if (isDryRun()) {
    return { saved: false, dryRun: true, xml, warnings: update.warnings };
  }

  const base = (process.env.CARERIX_REST_BASE || 'https://api.carerix.com').replace(/\/$/, '');
  const res = await fetch(`${base}/${entity}/${id}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      Accept: 'application/xml',
      Authorization: await authHeader(),
    },
    body: xml,
  });

  if (!res.ok) {
    throw new Error(`Carerix update failed: ${res.status} ${(await res.text()).slice(0, 500)}`);
  }

  return { saved: true, dryRun: false, warnings: update.warnings };
}
