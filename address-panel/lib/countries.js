/**
 * Countries the panel knows by name (ISO code → Dutch name). Used for
 * OpenStreetMap results and for the country dropdown in the panel.
 */

export const COUNTRY_NAMES = {
  NL: 'Nederland', BE: 'België', DE: 'Duitsland', FR: 'Frankrijk', LU: 'Luxemburg',
  GB: 'Verenigd Koninkrijk', IE: 'Ierland', ES: 'Spanje', PT: 'Portugal', IT: 'Italië',
  AT: 'Oostenrijk', CH: 'Zwitserland', DK: 'Denemarken', SE: 'Zweden', NO: 'Noorwegen',
  FI: 'Finland', PL: 'Polen', CZ: 'Tsjechië', HU: 'Hongarije', RO: 'Roemenië', BG: 'Bulgarije',
  GR: 'Griekenland', HR: 'Kroatië', SI: 'Slovenië', SK: 'Slowakije', LT: 'Litouwen',
  LV: 'Letland', EE: 'Estland',
};

/**
 * Dropdown options: the countries from ADDRESS_COUNTRIES first (default
 * NL, BE, DE), then the rest alphabetically. The first one is the default for
 * manually entered addresses.
 */
export function countryOptions() {
  const preferred = (process.env.ADDRESS_COUNTRIES || 'nl,be,de')
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter((c) => COUNTRY_NAMES[c]);
  const rest = Object.keys(COUNTRY_NAMES)
    .filter((c) => !preferred.includes(c))
    .sort((a, b) => COUNTRY_NAMES[a].localeCompare(COUNTRY_NAMES[b], 'nl'));
  return [...preferred, ...rest].map((code) => ({ code, name: COUNTRY_NAMES[code] }));
}
