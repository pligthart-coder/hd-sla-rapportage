/**
 * Picks and combines the address providers.
 *
 * ADDRESS_PROVIDERS is a comma-separated list, searched in parallel:
 *   pdok    — Dutch government register (BAG). Free, no key, NL only.
 *   photon  — OpenStreetMap. Free, no key, all of Europe.
 *   google  — Google Places. Needs GOOGLE_MAPS_API_KEY, paid after free credit.
 *   demo    — fixed sample addresses, for testing without internet.
 * Default: "pdok,photon". When pdok is in the list and answers, Dutch
 * results from the other providers are dropped (PDOK is more complete).
 *
 * ADDRESS_COUNTRIES (e.g. "nl,be,de") limits results to those countries.
 */

import * as pdok from './providers/pdok.js';
import * as photon from './providers/photon.js';
import * as google from './providers/google.js';
import * as demo from './providers/demo.js';

const ALL = { pdok, photon, google, demo };

export function getProviders() {
  const names = (process.env.ADDRESS_PROVIDERS || 'pdok,photon')
    .split(',')
    .map((n) => n.trim().toLowerCase())
    .filter(Boolean);

  return names.map((n) => {
    const provider = ALL[n];
    if (!provider) throw new Error(`Unknown address provider: ${n}`);
    if (!provider.isConfigured()) throw new Error(`Address provider ${n} is not configured (missing API key?)`);
    return provider;
  });
}

function regionCodes() {
  return (process.env.ADDRESS_COUNTRIES || process.env.GOOGLE_REGION_CODES || '')
    .split(',')
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
}

export async function autocomplete(input, sessionToken) {
  const providers = getProviders();
  const opts = { sessionToken, regionCodes: regionCodes() };
  const allowed = opts.regionCodes.map((c) => c.toUpperCase());

  const results = await Promise.allSettled(providers.map((p) => p.autocomplete(input, opts)));

  const failures = results.filter((r) => r.status === 'rejected');
  failures.forEach((r) => console.error('[address-panel]', r.reason));
  if (failures.length === results.length) throw failures[0].reason;

  const pdokAnswered = providers.some((p, i) => p === pdok && results[i].status === 'fulfilled');

  // OpenStreetMap often has the same address twice (e.g. building + entrance)
  const seen = new Set();
  return providers.flatMap((p, i) => {
    if (results[i].status !== 'fulfilled') return [];
    return results[i].value
      .filter((s) => !(pdokAnswered && p !== pdok && s.country === 'NL'))
      .filter((s) => !s.country || !allowed.length || allowed.includes(s.country))
      .filter((s) => {
        const key = `${s.main}|${s.secondary}`.toLowerCase();
        return !seen.has(key) && seen.add(key);
      })
      .map((s) => ({
        placeId: `${p.name}:${s.id}`,
        main: s.main,
        secondary: s.secondary,
        source: p.attribution,
      }));
  });
}

export async function details(placeId, sessionToken) {
  const sep = placeId.indexOf(':');
  const provider = ALL[placeId.slice(0, sep)];
  if (sep < 0 || !provider) throw new Error('Unknown address id');
  return provider.details(placeId.slice(sep + 1), { sessionToken });
}

/** Attribution lines the panel must show (OpenStreetMap requires it). */
export function attributions() {
  return getProviders().map((p) => p.attribution);
}
