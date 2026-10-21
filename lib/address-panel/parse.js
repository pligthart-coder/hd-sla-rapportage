/**
 * Turns a Google place (Places API New) into the flat address shape the
 * panel and Carerix use.
 */

function find(components, type) {
  return components.find((c) => c.types?.includes(type));
}

/** "12A" → { number: "12", suffix: "A" }, "12-2" → { "12", "2" }, "12 bis" → { "12", "bis" } */
export function splitHouseNumber(raw) {
  const value = (raw || '').trim();
  const match = value.match(/^(\d+)\s*[-/\s]?\s*(.*)$/);
  if (!match) return { number: value, suffix: '' };
  return { number: match[1], suffix: match[2].trim() };
}

export function parseGooglePlace(place) {
  const components = place.addressComponents || [];
  const text = (type, short = false) => {
    const c = find(components, type);
    return c ? (short ? c.shortText : c.longText) : '';
  };

  const { number, suffix } = splitHouseNumber(text('street_number'));
  const subpremise = text('subpremise');

  return {
    street: text('route'),
    houseNumber: number,
    houseNumberSuffix: suffix || subpremise,
    postalCode: text('postal_code'),
    city: text('locality') || text('postal_town') || text('administrative_area_level_2'),
    province: text('administrative_area_level_1'),
    countryCode: text('country', true),
    countryName: text('country'),
    formatted: place.formattedAddress || '',
    lat: place.location?.latitude ?? null,
    lng: place.location?.longitude ?? null,
    placeId: place.id || '',
  };
}
