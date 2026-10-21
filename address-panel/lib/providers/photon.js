/**
 * Photon (komoot) — address search on OpenStreetMap data. Free, no API key,
 * all of Europe. The public server at photon.komoot.io is for "reasonable"
 * use only, without guarantees; for heavy use run your own instance and set
 * PHOTON_URL. Data © OpenStreetMap contributors (ODbL), attribution required.
 * https://github.com/komoot/photon
 */

import { splitHouseNumber } from '../parse.js';

export const name = 'photon';
export const attribution = '© OpenStreetMap contributors';

// Rough bounding box of Europe (minLon,minLat,maxLon,maxLat)
const DEFAULT_BBOX = '-25,34,45,72';

const COUNTRY_NAMES = {
  NL: 'Nederland', BE: 'België', DE: 'Duitsland', FR: 'Frankrijk', LU: 'Luxemburg',
  GB: 'Verenigd Koninkrijk', IE: 'Ierland', ES: 'Spanje', PT: 'Portugal', IT: 'Italië',
  AT: 'Oostenrijk', CH: 'Zwitserland', DK: 'Denemarken', SE: 'Zweden', NO: 'Noorwegen',
  FI: 'Finland', PL: 'Polen', CZ: 'Tsjechië', HU: 'Hongarije', RO: 'Roemenië', BG: 'Bulgarije',
  GR: 'Griekenland', HR: 'Kroatië', SI: 'Slovenië', SK: 'Slowakije', LT: 'Litouwen',
  LV: 'Letland', EE: 'Estland',
};

export function isConfigured() {
  return true;
}

function baseUrl() {
  return (process.env.PHOTON_URL || 'https://photon.komoot.io').replace(/\/$/, '');
}

function toAddress(p) {
  const { number, suffix } = splitHouseNumber(p.housenumber);
  const countryCode = (p.countrycode || '').toUpperCase();
  const street = p.street || (p.type === 'street' ? p.name : '') || '';
  const city = p.city || p.town || p.village || p.locality || p.district || '';
  return {
    street,
    houseNumber: number,
    houseNumberSuffix: suffix,
    postalCode: p.postcode || '',
    city,
    province: p.state || '',
    countryCode,
    countryName: COUNTRY_NAMES[countryCode] || p.country || '',
    formatted: [[street, p.housenumber].filter(Boolean).join(' '), [p.postcode, city].filter(Boolean).join(' '), p.country]
      .filter(Boolean).join(', '),
  };
}

export async function autocomplete(input, { regionCodes }) {
  const url = new URL(`${baseUrl()}/api/`);
  url.searchParams.set('q', input);
  url.searchParams.set('limit', '10');
  url.searchParams.set('bbox', process.env.PHOTON_BBOX || DEFAULT_BBOX);
  for (const layer of ['house', 'street']) url.searchParams.append('layer', layer);

  const res = await fetch(url, { headers: { 'User-Agent': 'carerix-address-panel' } });
  if (!res.ok) throw new Error(`Photon search failed: ${res.status} ${await res.text()}`);

  const allowed = regionCodes.map((c) => c.toUpperCase());
  const data = await res.json();

  return (data.features || [])
    .filter((f) => {
      const cc = (f.properties?.countrycode || '').toUpperCase();
      return !allowed.length || allowed.includes(cc);
    })
    .map((f) => {
      const address = {
        ...toAddress(f.properties),
        lat: f.geometry?.coordinates?.[1] ?? null,
        lng: f.geometry?.coordinates?.[0] ?? null,
      };
      const [main, ...rest] = address.formatted.split(', ');
      // Photon has no separate details call, so the address travels inside the id
      return {
        id: Buffer.from(JSON.stringify(address)).toString('base64url'),
        main,
        secondary: rest.join(', '),
        country: address.countryCode,
      };
    });
}

export async function details(id) {
  try {
    return JSON.parse(Buffer.from(id, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Ongeldig Photon-resultaat');
  }
}
