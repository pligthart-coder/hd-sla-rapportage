/**
 * PDOK Locatieserver — the Dutch government's address search on top of the
 * BAG (Basisregistratie Adressen en Gebouwen). Free, no API key, every
 * Dutch address including house letters and suffixes. Netherlands only.
 * https://github.com/PDOK/locatieserver/wiki/API-Locatieserver
 */

const BASE = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1';

export const name = 'pdok';
export const attribution = 'PDOK / BAG (Kadaster)';
export const countries = ['NL'];

export function isConfigured() {
  return true;
}

export async function autocomplete(input) {
  const url = new URL(`${BASE}/suggest`);
  url.searchParams.set('q', input);
  url.searchParams.set('fq', 'type:adres');
  url.searchParams.set('rows', '7');

  const res = await fetch(url);
  if (!res.ok) throw new Error(`PDOK suggest failed: ${res.status} ${await res.text()}`);

  const data = await res.json();
  return (data.response?.docs || []).map((doc) => {
    // weergavenaam: "Oudegracht 12A, 3511AP Utrecht"
    const [main, ...rest] = (doc.weergavenaam || '').split(', ');
    return { id: doc.id, main, secondary: [rest.join(', '), 'Nederland'].filter(Boolean).join(', '), country: 'NL' };
  });
}

/** "3511AP" → "3511 AP" */
function formatPostcode(pc = '') {
  const m = pc.replace(/\s+/g, '').match(/^(\d{4})([A-Z]{2})$/i);
  return m ? `${m[1]} ${m[2].toUpperCase()}` : pc;
}

/** "POINT(5.1197 52.0918)" → { lat, lng } */
function parsePoint(wkt = '') {
  const m = wkt.match(/POINT\(([-\d.]+) ([-\d.]+)\)/);
  return m ? { lng: Number(m[1]), lat: Number(m[2]) } : { lat: null, lng: null };
}

export async function details(id) {
  const url = new URL(`${BASE}/lookup`);
  url.searchParams.set('id', id);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`PDOK lookup failed: ${res.status} ${await res.text()}`);

  const doc = (await res.json()).response?.docs?.[0];
  if (!doc) throw new Error('Adres niet gevonden bij PDOK');

  // Huisletter "A" + toevoeging "2" → "A-2"; either one alone stays as is
  const letter = doc.huisletter || '';
  const addition = doc.huisnummertoevoeging || '';
  const suffix = letter && addition ? `${letter}-${addition}` : letter || addition;
  const { lat, lng } = parsePoint(doc.centroide_ll);

  return {
    street: doc.straatnaam || '',
    houseNumber: doc.huisnummer != null ? String(doc.huisnummer) : '',
    houseNumberSuffix: suffix,
    postalCode: formatPostcode(doc.postcode),
    city: doc.woonplaatsnaam || '',
    province: doc.provincienaam || '',
    countryCode: 'NL',
    countryName: 'Nederland',
    formatted: doc.weergavenaam || '',
    lat,
    lng,
  };
}
