/**
 * Address targets — where the panel is allowed to write an address.
 *
 * Each Carerix entity (CREmployee, CRCompany, …) has one or more targets.
 * A target maps the normalised address parts onto Carerix field names.
 * Leave a part out (or set it to null) to skip it for that target.
 *
 * ⚠️  Verify every field name against YOUR Carerix data dictionary
 *     (Carerix → Instellingen → Data dictionary, or GraphQL introspection)
 *     before going live. Field names differ per data model/version and
 *     custom (extra) fields can be used as targets too.
 *
 * Override without a code change by setting ADDRESS_TARGETS_JSON to a JSON
 * string with the same shape as DEFAULT_TARGETS.
 *
 * Address parts available:
 *   street, houseNumber, houseNumberSuffix, postalCode, city,
 *   province, country (written as a CRDataNode relation, see COUNTRY_NODE_IDS)
 */

export const DEFAULT_TARGETS = {
  CREmployee: {
    label: 'Kandidaat',
    targets: {
      home: {
        label: 'Woonadres',
        fields: {
          street: 'street',
          houseNumber: 'houseNumber',
          houseNumberSuffix: 'houseNumberSuffix',
          postalCode: 'postalCode',
          city: 'city',
          country: 'toCountryNode',
        },
      },
      postal: {
        label: 'Postadres',
        fields: {
          street: 'postalStreet',
          houseNumber: 'postalHouseNumber',
          houseNumberSuffix: 'postalHouseNumberSuffix',
          postalCode: 'postalPostalCode',
          city: 'postalCity',
          country: 'toPostalCountryNode',
        },
      },
    },
  },

  CRCompany: {
    label: 'Bedrijf',
    targets: {
      visit: {
        label: 'Bezoekadres',
        fields: {
          street: 'visitStreet',
          houseNumber: 'visitNumber',
          houseNumberSuffix: 'visitNumberSuffix',
          postalCode: 'visitPostalCode',
          city: 'visitCity',
          country: 'toVisitCountryNode',
        },
      },
      postal: {
        label: 'Postadres',
        fields: {
          street: 'postalStreet',
          houseNumber: 'postalNumber',
          houseNumberSuffix: 'postalNumberSuffix',
          postalCode: 'postalPostalCode',
          city: 'postalCity',
          country: 'toPostalCountryNode',
        },
      },
      invoice: {
        label: 'Factuuradres',
        fields: {
          street: 'invoiceStreet',
          houseNumber: 'invoiceNumber',
          houseNumberSuffix: 'invoiceNumberSuffix',
          postalCode: 'invoicePostalCode',
          city: 'invoiceCity',
          country: 'toInvoiceCountryNode',
        },
      },
    },
  },
};

export function getTargets() {
  const raw = process.env.ADDRESS_TARGETS_JSON;
  if (!raw) return DEFAULT_TARGETS;
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`ADDRESS_TARGETS_JSON is not valid JSON: ${err.message}`);
  }
}

/**
 * Country ISO code → Carerix CRDataNode id (the country "tabel" values).
 * Set COUNTRY_NODE_IDS as JSON, e.g. {"NL":1234,"BE":1235,"DE":1236}.
 * Countries without a mapping are skipped (the other parts are still saved).
 */
export function getCountryNodeIds() {
  const raw = process.env.COUNTRY_NODE_IDS;
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`COUNTRY_NODE_IDS is not valid JSON: ${err.message}`);
  }
}

/** Public, label-only view of the targets for the front-end. */
export function describeTargets(entity) {
  const all = getTargets();
  const def = all[entity];
  if (!def) return null;
  return {
    entity,
    label: def.label,
    targets: Object.entries(def.targets).map(([key, t]) => ({ key, label: t.label })),
  };
}
