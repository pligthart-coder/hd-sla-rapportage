/**
 * Google Places API (New) — autocomplete + place details.
 *
 * The API key stays on the server; the panel only talks to our own backend.
 * Without GOOGLE_MAPS_API_KEY the module runs in demo mode with a few fixed
 * Dutch addresses, so the whole flow can be tested without a Google account.
 */

const AUTOCOMPLETE_URL = 'https://places.googleapis.com/v1/places:autocomplete';
const DETAILS_URL = 'https://places.googleapis.com/v1/places/';

export function isDemoMode() {
  return !process.env.GOOGLE_MAPS_API_KEY;
}

function regionCodes() {
  return (process.env.GOOGLE_REGION_CODES || 'nl,be,de')
    .split(',')
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
}

function languageCode() {
  return process.env.GOOGLE_LANGUAGE_CODE || 'nl';
}

export async function autocomplete(input, sessionToken) {
  if (isDemoMode()) return demoAutocomplete(input);

  const body = {
    input,
    sessionToken,
    languageCode: languageCode(),
    includedRegionCodes: regionCodes(),
  };

  const res = await fetch(AUTOCOMPLETE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Google autocomplete failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return (data.suggestions || [])
    .map((s) => s.placePrediction)
    .filter(Boolean)
    .map((p) => ({
      placeId: p.placeId,
      main: p.structuredFormat?.mainText?.text || p.text?.text || '',
      secondary: p.structuredFormat?.secondaryText?.text || '',
    }));
}

export async function placeDetails(placeId, sessionToken) {
  if (isDemoMode()) return demoDetails(placeId);

  const url = new URL(DETAILS_URL + encodeURIComponent(placeId));
  url.searchParams.set('languageCode', languageCode());
  if (sessionToken) url.searchParams.set('sessionToken', sessionToken);

  const res = await fetch(url, {
    headers: {
      'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': 'id,formattedAddress,addressComponents,location',
    },
  });

  if (!res.ok) {
    throw new Error(`Google place details failed: ${res.status} ${await res.text()}`);
  }

  return res.json();
}

// ─── Demo data (same shape as the Places API responses) ─────────────────────

function comp(longText, shortText, ...types) {
  return { longText, shortText, types };
}

const DEMO_PLACES = [
  {
    id: 'demo-dam-1',
    formattedAddress: 'Dam 1, 1012 JS Amsterdam, Nederland',
    location: { latitude: 52.3731, longitude: 4.8926 },
    addressComponents: [
      comp('1', '1', 'street_number'),
      comp('Dam', 'Dam', 'route'),
      comp('Amsterdam', 'Amsterdam', 'locality', 'political'),
      comp('Noord-Holland', 'NH', 'administrative_area_level_1', 'political'),
      comp('Nederland', 'NL', 'country', 'political'),
      comp('1012 JS', '1012 JS', 'postal_code'),
    ],
  },
  {
    id: 'demo-coolsingel-40',
    formattedAddress: 'Coolsingel 40, 3011 AD Rotterdam, Nederland',
    location: { latitude: 51.9227, longitude: 4.4792 },
    addressComponents: [
      comp('40', '40', 'street_number'),
      comp('Coolsingel', 'Coolsingel', 'route'),
      comp('Rotterdam', 'Rotterdam', 'locality', 'political'),
      comp('Zuid-Holland', 'ZH', 'administrative_area_level_1', 'political'),
      comp('Nederland', 'NL', 'country', 'political'),
      comp('3011 AD', '3011 AD', 'postal_code'),
    ],
  },
  {
    id: 'demo-oudegracht-12a',
    formattedAddress: 'Oudegracht 12A, 3511 AP Utrecht, Nederland',
    location: { latitude: 52.0918, longitude: 5.1197 },
    addressComponents: [
      comp('12A', '12A', 'street_number'),
      comp('Oudegracht', 'Oudegracht', 'route'),
      comp('Utrecht', 'Utrecht', 'locality', 'political'),
      comp('Utrecht', 'UT', 'administrative_area_level_1', 'political'),
      comp('Nederland', 'NL', 'country', 'political'),
      comp('3511 AP', '3511 AP', 'postal_code'),
    ],
  },
  {
    id: 'demo-grote-markt-1',
    formattedAddress: 'Grote Markt 1, 2000 Antwerpen, België',
    location: { latitude: 51.2212, longitude: 4.3997 },
    addressComponents: [
      comp('1', '1', 'street_number'),
      comp('Grote Markt', 'Grote Markt', 'route'),
      comp('Antwerpen', 'Antwerpen', 'locality', 'political'),
      comp('Vlaams Gewest', 'Vlaams Gewest', 'administrative_area_level_1', 'political'),
      comp('België', 'BE', 'country', 'political'),
      comp('2000', '2000', 'postal_code'),
    ],
  },
];

function demoAutocomplete(input) {
  const q = input.toLowerCase();
  return DEMO_PLACES
    .filter((p) => p.formattedAddress.toLowerCase().includes(q) || q.length < 3)
    .map((p) => {
      const [main, ...rest] = p.formattedAddress.split(', ');
      return { placeId: p.id, main, secondary: rest.join(', ') };
    });
}

function demoDetails(placeId) {
  const place = DEMO_PLACES.find((p) => p.id === placeId);
  if (!place) throw new Error(`Unknown demo place: ${placeId}`);
  return place;
}
