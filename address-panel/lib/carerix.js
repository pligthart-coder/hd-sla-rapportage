/**
 * Writes an address to a Carerix record through the Carerix GraphQL API
 * (the same API and OAuth client as the RSS feed).
 *
 *   mutation ($id: ID!, $request: CREmployeeRequest) {
 *     crEmployeeUpdate(_id: $id, request: $request) { _id }
 *   }
 *   variables: { id: "123", request: { _kind: "CREmployee", street: "Dam", …,
 *                                      toCountryNode: { _id: "1234" } } }
 *
 * Mutation name per entity: CREmployee → crEmployeeUpdate, CRCompany →
 * crCompanyUpdate, CRUser → crUserUpdate, CRVacancy → crVacancyUpdate.
 * Argument types are read from the schema (introspection), so they always
 * match your Carerix environment.
 *
 * Auth: CARERIX_CLIENT_ID / CARERIX_CLIENT_SECRET / CARERIX_TOKEN_ENDPOINT
 * (Carerix → Identity Access → Clients). The client needs write access.
 *
 * Live writes are opt-in: unless ADDRESS_DRY_RUN=false AND credentials are set,
 * nothing is sent and the mutation that would be sent is returned instead.
 */

import { getTargets, getCountryNodeIds } from './targets.js';

const ALLOWED_PARTS = ['street', 'houseNumber', 'houseNumberSuffix', 'postalCode', 'city', 'province'];

function graphqlUrl() {
  return process.env.CARERIX_GRAPHQL_URL || 'https://api.carerix.io/graphql/v1/graphql';
}

function hasCredentials() {
  const { CARERIX_CLIENT_ID, CARERIX_CLIENT_SECRET, CARERIX_TOKEN_ENDPOINT } = process.env;
  return Boolean(CARERIX_CLIENT_ID && CARERIX_CLIENT_SECRET && CARERIX_TOKEN_ENDPOINT);
}

export function isDryRun() {
  return process.env.ADDRESS_DRY_RUN !== 'false' || !hasCredentials();
}

/** CREmployee → { mutation: 'crEmployeeUpdate', requestType: 'CREmployeeRequest' } */
export function mutationFor(entity) {
  return { mutation: `cr${entity.slice(2)}Update`, requestType: `${entity}Request` };
}

/** Builds the GraphQL `request` object for the chosen address types. */
export function buildRequest(entity, targetKeys, address) {
  const def = getTargets()[entity];
  if (!def) throw new Error(`Entity not configured: ${entity}`);
  if (!targetKeys.length) throw new Error('Choose at least one address type');

  const countryIds = getCountryNodeIds();
  const countryNodeId = address.countryCode ? countryIds[address.countryCode.toUpperCase()] : undefined;

  const request = { _kind: entity };
  const warnings = [];

  for (const key of targetKeys) {
    const target = def.targets[key];
    if (!target) throw new Error(`Unknown address type for ${entity}: ${key}`);

    for (const part of ALLOWED_PARTS) {
      const field = target.fields[part];
      if (field) request[field] = (address[part] ?? '').toString().trim();
    }

    const countryField = target.fields.country;
    if (countryField && address.countryCode) {
      if (countryNodeId) {
        request[countryField] = { _id: String(countryNodeId) };
      } else {
        warnings.push(`Land ${address.countryCode} niet opgeslagen: geen Carerix id in COUNTRY_NODE_IDS`);
      }
    }
  }

  return { request, warnings: [...new Set(warnings)] };
}

// ─── GraphQL plumbing ────────────────────────────────────────────────────────

let tokenCache = { token: null, expires: 0 };

async function getAccessToken() {
  if (!hasCredentials()) {
    throw new Error('Carerix credentials missing (CARERIX_CLIENT_ID, CARERIX_CLIENT_SECRET, CARERIX_TOKEN_ENDPOINT)');
  }
  if (tokenCache.token && Date.now() < tokenCache.expires) return tokenCache.token;

  const { CARERIX_CLIENT_ID, CARERIX_CLIENT_SECRET, CARERIX_TOKEN_ENDPOINT } = process.env;
  const res = await fetch(CARERIX_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=client_credentials&client_id=${encodeURIComponent(CARERIX_CLIENT_ID)}&client_secret=${encodeURIComponent(CARERIX_CLIENT_SECRET)}`,
  });
  if (!res.ok) throw new Error(`Token request failed: ${res.status} ${await res.text()}`);

  const data = await res.json();
  // Refresh a minute early; default to 5 minutes when no expiry is given
  tokenCache = { token: data.access_token, expires: Date.now() + ((data.expires_in || 300) - 60) * 1000 };
  return tokenCache.token;
}

async function graphql(query, variables) {
  const res = await fetch(graphqlUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await getAccessToken()}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) throw new Error(`Carerix GraphQL failed: ${res.status} ${(await res.text()).slice(0, 500)}`);

  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(`Carerix GraphQL: ${json.errors.map((e) => e.message).join('; ').slice(0, 500)}`);
  }
  return json.data;
}

/** NON_NULL(SCALAR ID) → "ID!" */
function typeToString(t) {
  if (!t) return '';
  if (t.kind === 'NON_NULL') return `${typeToString(t.ofType)}!`;
  if (t.kind === 'LIST') return `[${typeToString(t.ofType)}]`;
  return t.name;
}

const TYPE_REF = 'kind name ofType { kind name ofType { kind name ofType { kind name } } }';
const schemaCache = new Map();

/** Reads the update mutation's argument types and the request type's fields. */
async function introspect(entity) {
  if (schemaCache.has(entity)) return schemaCache.get(entity);

  const { mutation, requestType } = mutationFor(entity);
  const data = await graphql(`
    query ($requestType: String!) {
      __schema { mutationType { fields { name args { name type { ${TYPE_REF} } } } } }
      __type(name: $requestType) { inputFields { name type { ${TYPE_REF} } } }
    }`, { requestType });

  const mutationField = data.__schema?.mutationType?.fields?.find((f) => f.name === mutation);
  const info = {
    mutation,
    requestType,
    mutationExists: Boolean(mutationField),
    args: Object.fromEntries((mutationField?.args || []).map((a) => [a.name, typeToString(a.type)])),
    requestFields: Object.fromEntries((data.__type?.inputFields || []).map((f) => [f.name, typeToString(f.type)])),
  };
  schemaCache.set(entity, info);
  return info;
}

function buildMutation(entity, args) {
  const { mutation, requestType } = mutationFor(entity);
  const idType = args?._id || 'ID!';
  const requestTypeName = args?.request || requestType;
  return `mutation ($id: ${idType}, $request: ${requestTypeName}) {\n  ${mutation}(_id: $id, request: $request) { _id }\n}`;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function saveAddress(entity, id, targetKeys, address) {
  if (!/^\d+$/.test(String(id))) throw new Error('Invalid record id');

  const { request, warnings } = buildRequest(entity, targetKeys, address);
  const variables = { id: String(id), request };

  if (isDryRun()) {
    const query = buildMutation(entity);
    return {
      saved: false,
      dryRun: true,
      preview: `${query}\n\nvariables: ${JSON.stringify(variables, null, 2)}`,
      warnings,
    };
  }

  const schema = await introspect(entity);
  if (!schema.mutationExists) {
    throw new Error(`Mutation ${schema.mutation} bestaat niet in jouw Carerix GraphQL API`);
  }
  const unknown = Object.keys(request).filter((f) => f !== '_kind' && !(f in schema.requestFields));
  if (Object.keys(schema.requestFields).length && unknown.length) {
    throw new Error(`Onbekende Carerix-velden voor ${entity}: ${unknown.join(', ')} (pas lib/targets.js aan)`);
  }

  await graphql(buildMutation(entity, schema.args), variables);
  return { saved: true, dryRun: false, warnings };
}

/**
 * Compares the field mapping with the live schema — for setting up and testing.
 * GET /api/address?action=check&entity=CREmployee
 */
export async function checkMapping(entity) {
  const def = getTargets()[entity];
  if (!def) throw new Error(`Entity not configured: ${entity}`);

  const schema = await introspect(entity);
  const known = (field) => (Object.keys(schema.requestFields).length ? field in schema.requestFields : null);

  const targets = Object.entries(def.targets).map(([key, t]) => ({
    key,
    label: t.label,
    fields: Object.fromEntries(
      Object.entries(t.fields).filter(([, f]) => f).map(([part, f]) => [part, { field: f, exists: known(f) }]),
    ),
  }));

  // Address-like fields that exist in the schema, to help fix the mapping
  const suggestions = Object.keys(schema.requestFields)
    .filter((f) => /street|number|postal|zip|city|country|address|adres/i.test(f))
    .sort();

  return {
    entity,
    mutation: schema.mutation,
    mutationExists: schema.mutationExists,
    mutationArgs: schema.args,
    requestType: schema.requestType,
    requestTypeFound: Object.keys(schema.requestFields).length > 0,
    targets,
    addressFieldsInSchema: suggestions,
    dryRun: isDryRun(),
  };
}
