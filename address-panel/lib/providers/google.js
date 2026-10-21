/**
 * Google Places API (New) provider — needs GOOGLE_MAPS_API_KEY (paid, with
 * a monthly free credit). Worldwide coverage.
 */

import { parseGooglePlace } from '../parse.js';

const AUTOCOMPLETE_URL = 'https://places.googleapis.com/v1/places:autocomplete';
const DETAILS_URL = 'https://places.googleapis.com/v1/places/';

export const name = 'google';
export const attribution = 'Google';

export function isConfigured() {
  return Boolean(process.env.GOOGLE_MAPS_API_KEY);
}

function languageCode() {
  return process.env.GOOGLE_LANGUAGE_CODE || 'nl';
}

export async function autocomplete(input, { sessionToken, regionCodes }) {
  const res = await fetch(AUTOCOMPLETE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY,
    },
    body: JSON.stringify({
      input,
      sessionToken,
      languageCode: languageCode(),
      includedRegionCodes: regionCodes,
    }),
  });

  if (!res.ok) {
    throw new Error(`Google autocomplete failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return (data.suggestions || [])
    .map((s) => s.placePrediction)
    .filter(Boolean)
    .map((p) => ({
      id: p.placeId,
      main: p.structuredFormat?.mainText?.text || p.text?.text || '',
      secondary: p.structuredFormat?.secondaryText?.text || '',
    }));
}

export async function details(placeId, { sessionToken }) {
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

  return parseGooglePlace(await res.json());
}
