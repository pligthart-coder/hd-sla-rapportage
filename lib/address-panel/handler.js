/**
 * Request handler for the address panel backend.
 * Shared by the Vercel function (api/address.js) and the standalone server.js.
 *
 *   GET  /api/address?action=config&entity=CREmployee
 *   GET  /api/address?action=autocomplete&q=dam 1&session=…
 *   GET  /api/address?action=details&placeId=…&session=…
 *   POST /api/address?action=save   { entity, id, targets: [...], address: {...} }
 *
 * Every call must send the panel key (header X-Panel-Key) when PANEL_ACCESS_KEY is set.
 */

import { timingSafeEqual } from 'node:crypto';
import { autocomplete, details, attributions, getProviders } from './geocoder.js';
import { describeTargets } from './targets.js';
import { saveAddress, isDryRun } from './carerix.js';

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function keyIsValid(req) {
  const expected = process.env.PANEL_ACCESS_KEY;
  if (!expected) return true;
  const given = req.headers['x-panel-key'] || '';
  const a = Buffer.from(String(given));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function readJsonBody(req) {
  // Vercel already parses JSON bodies; the plain Node server does not.
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);

  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 20_000) throw new Error('Body too large');
  }
  return raw ? JSON.parse(raw) : {};
}

export default async function handleAddressRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers?.host || 'localhost'}`);
  const action = url.searchParams.get('action');

  if (!keyIsValid(req)) {
    send(res, 401, { error: 'Ongeldige of ontbrekende panel key' });
    return;
  }

  try {
    if (action === 'config' && req.method === 'GET') {
      const entity = url.searchParams.get('entity') || '';
      const config = describeTargets(entity);
      if (!config) {
        send(res, 400, { error: `Entiteit niet geconfigureerd: ${entity}` });
        return;
      }
      send(res, 200, {
        ...config,
        demoMode: getProviders().some((p) => p.name === 'demo'),
        dryRun: isDryRun(),
        attributions: attributions(),
      });
      return;
    }

    if (action === 'autocomplete' && req.method === 'GET') {
      const q = (url.searchParams.get('q') || '').trim();
      if (q.length < 2) {
        send(res, 200, { suggestions: [] });
        return;
      }
      const suggestions = await autocomplete(q.slice(0, 200), url.searchParams.get('session') || undefined);
      send(res, 200, { suggestions });
      return;
    }

    if (action === 'details' && req.method === 'GET') {
      const placeId = url.searchParams.get('placeId');
      if (!placeId) {
        send(res, 400, { error: 'placeId ontbreekt' });
        return;
      }
      const address = await details(placeId, url.searchParams.get('session') || undefined);
      send(res, 200, { address });
      return;
    }

    if (action === 'save' && req.method === 'POST') {
      const { entity, id, targets, address } = await readJsonBody(req);
      if (!entity || !id || !Array.isArray(targets) || !address) {
        send(res, 400, { error: 'entity, id, targets en address zijn verplicht' });
        return;
      }
      const result = await saveAddress(entity, id, targets, address);
      send(res, 200, result);
      return;
    }

    send(res, 404, { error: 'Onbekende actie' });
  } catch (err) {
    console.error('[address-panel]', err);
    send(res, 500, { error: err.message });
  }
}
