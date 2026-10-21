/**
 * Demo provider — a few fixed addresses (Google-shaped) so the panel can be
 * tried without internet access or API keys. Enable with ADDRESS_PROVIDERS=demo.
 */

import { parseGooglePlace } from '../parse.js';

export const name = 'demo';
export const attribution = 'Demo-adressen';

export function isConfigured() {
  return true;
}

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

export async function autocomplete(input) {
  const q = input.toLowerCase();
  return DEMO_PLACES
    .filter((p) => p.formattedAddress.toLowerCase().includes(q) || q.length < 3)
    .map((p) => {
      const [main, ...rest] = p.formattedAddress.split(', ');
      return { id: p.id, main, secondary: rest.join(', ') };
    });
}

export async function details(placeId) {
  const place = DEMO_PLACES.find((p) => p.id === placeId);
  if (!place) throw new Error(`Unknown demo place: ${placeId}`);
  return parseGooglePlace(place);
}
