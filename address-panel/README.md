# Carerix address panel (Google address lookup)

A small HTML panel you embed in Carerix. The user searches an address, checks the result, ticks **where** to save it (e.g. *Woonadres*,
*Postadres*, *Factuuradres*) and clicks **Opslaan in Carerix**. The backend
writes the fields to the record through the Carerix REST API.

```
Carerix record ──iframe──▶ /address-panel/?entity=CREmployee&id=123&key=…
                                   │
                                   ▼
                           /api/address  (keeps API keys + Carerix credentials server-side)
                             ├─ address search: PDOK (NL) + Photon/OpenStreetMap (Europe), or Google
                             └─ Carerix REST API: POST /CREmployee/123 (XML)
```

| File | What it does |
|---|---|
| `address-panel/index.html` | The panel UI (search, review, choose target, save) |
| `api/address.js` | Vercel function, delegates to the handler |
| `lib/address-panel/handler.js` | Routes `config`, `autocomplete`, `details`, `save` |
| `lib/address-panel/geocoder.js` | Picks the address providers and merges their results |
| `lib/address-panel/providers/*.js` | One file per address source: `pdok`, `photon`, `google`, `demo` |
| `lib/address-panel/parse.js` | Splits house numbers ("12A" → 12 + A), parses Google results |
| `lib/address-panel/targets.js` | **The field mapping**: which Carerix fields each address type writes to |
| `lib/address-panel/carerix.js` | Builds the XML and writes it to Carerix |

## 1. Try it locally (no keys needed)

```bash
node server.js
# open http://localhost:3000/address-panel/?entity=CREmployee&id=1
```

Unless `ADDRESS_DRY_RUN=false`, nothing is written to Carerix: the panel shows
the XML it *would* send. Without internet access, set `ADDRESS_PROVIDERS=demo`
for sample addresses (try "dam", "utrecht", "rotterdam").

## 2. Address source

Set `ADDRESS_PROVIDERS` (comma-separated, searched together). The default
`pdok,photon` is free and needs no account or key.

| Provider | Coverage | Cost / key | Notes |
|---|---|---|---|
| `pdok` | Netherlands | Free, no key | Official BAG register: every Dutch address incl. house letter and suffix. Best for NL. |
| `photon` | Europe (worldwide data) | Free, no key | OpenStreetMap data. House numbers are good in NL/BE/DE, patchier elsewhere. Public server is "fair use" with no guarantee; for heavy use run your own and set `PHOTON_URL`. |
| `google` | Worldwide | Key, paid after monthly credit | Most complete outside NL. |
| `demo` | — | — | Sample data for testing. |

When `pdok` is enabled, Dutch results come only from PDOK. Photon's Dutch
duplicates are dropped. `ADDRESS_COUNTRIES=nl,be,de` limits results to those
countries.

Licence notes: PDOK/BAG data is open data. OpenStreetMap data (ODbL) may be
stored, but you must show "© OpenStreetMap contributors". The panel shows the
source under the results automatically.

**Why not Mapbox Address Autofill?** It isn't free in practice. Mapbox needs a
credit card, and the free allowance is small (about 100 to 1,000 sessions a
month, depending on the plan). Adding it later is one extra file in
`providers/`.

### Optional: Google API key

1. Google Cloud Console → create/select a project → enable billing.
2. *APIs & Services → Library* → enable **Places API (New)**.
3. *Credentials → Create credentials → API key*.
4. Restrict the key: *API restrictions* → only **Places API (New)**. The key
   is only used server-side, so no referrer restriction is needed (an IP
   restriction is possible if your server has a fixed IP).
5. Set `GOOGLE_MAPS_API_KEY` and add `google` to `ADDRESS_PROVIDERS`
   (e.g. `pdok,google`). Optional: `GOOGLE_LANGUAGE_CODE` (default `nl`).

The panel uses Google session tokens (one per search + selection), which keeps
autocomplete billing low.

## 3. Map the Carerix fields

Open `lib/address-panel/targets.js`. Per entity (`CREmployee`, `CRCompany`, …)
each address type lists the Carerix field per address part.

> ⚠️ The default field names are a starting point, **not verified against
> your environment**. Check each name in your Carerix data dictionary and fix
> them before going live. Extra/custom fields can be used too.

- Add or remove address types: add/remove entries under `targets`. The panel
  shows a checkbox for each one automatically.
- Add an entity (e.g. `CRUser`/contact person): add a block with the same shape.
- No code change: put the whole structure in `ADDRESS_TARGETS_JSON`.
- **Country** is a Carerix table value (`CRDataNode`), not text. Look up the
  node ids of your country values and set e.g.
  `COUNTRY_NODE_IDS={"NL":1234,"BE":1235,"DE":1236}`. A country without a
  mapping is skipped and the panel shows a warning (other fields still save).

Test with the dry run: pick an address and compare the shown XML with what you
expect.

## 4. Carerix write access

Pick one:

- **REST token** (classic): `CARERIX_REST_USER` + `CARERIX_REST_TOKEN`
  (Carerix → Instellingen → API). Uses HTTP Basic.
- **OAuth client** (same as the RSS feed): `CARERIX_CLIENT_ID`,
  `CARERIX_CLIENT_SECRET`, `CARERIX_TOKEN_ENDPOINT`. Make sure the client has
  write rights on the entities you use.

Then set `ADDRESS_DRY_RUN=false` to make saving live. `CARERIX_REST_BASE`
defaults to `https://api.carerix.com`.

Do a first live save on a test record and check the result in Carerix. If
Carerix rejects the request, the panel shows Carerix's error message (usually a
wrong field name in the mapping).

## 5. Security

- Set `PANEL_ACCESS_KEY` to a long random string and add it to the panel URL
  as `&key=…`. Without the key the API refuses every call. Anyone who has the
  key can update addresses, so treat it like a password and rotate it if it leaks.
- The panel may only be framed by Carerix (`frame-ancestors`): see
  `vercel.json`, or `PANEL_FRAME_ANCESTORS` for the standalone server. Set it
  to your exact Carerix domain if you know it.
- Turn on Vercel *Deployment Protection* only if Carerix can still load the
  iframe. A password prompt inside a Carerix panel does not work well.

## 6. Embed in Carerix

There is **one panel for all entities**: the `entity=` parameter decides which
address types it shows and which fields it writes (see `targets.js`). In
Carerix you add one HTML panel/template per screen, with the same iframe. Only
`entity=` and the record-id placeholder change:

| Carerix screen | `entity=` | Record id placeholder (example) | Address types |
|---|---|---|---|
| Kandidaat | `CREmployee` | `$employee.employeeID` | Woonadres, Postadres |
| Bedrijf | `CRCompany` | `$company.companyID` | Bezoekadres, Postadres, Factuuradres |
| Contactpersoon | `CRUser` | `$user.userID` | Zakelijk adres |
| Vacature | `CRVacancy` | `$vacancy.vacancyID` | Werklocatie |

```html
<iframe
  src="https://YOUR-DEPLOY.vercel.app/address-panel/?entity=CREmployee&id=<cx:write value="$employee.employeeID"/>&key=YOUR_PANEL_KEY"
  style="width:100%;height:520px;border:0">
</iframe>
```

Add `&lang=en` for English labels. To add or change address types for an
entity, edit `targets.js` (or `ADDRESS_TARGETS_JSON`). No change to the panel
or the Carerix templates is needed.

> The exact way to add an HTML panel and the placeholder syntax depend on your
> Carerix version and module. Check with your Carerix consultant/support if
> the snippet above doesn't fill in the id.

After saving, the user refreshes the Carerix page to see the new values.
The panel is in an iframe from another domain, so it cannot refresh Carerix itself.

## 7. Hide or lock the original address fields

You want users to fill addresses **only** through the panel. That's set up in
Carerix itself, not in this code:

1. **Read-only for users**: in Carerix's field/layout settings for the
   candidate and company screens, mark the address fields that the panel
   fills as *read-only* (or remove them from the edit layout), per user
   role where needed. The API keeps write access, so the panel can still save.
2. **Hide completely**: remove the fields from the screen layout and rely on
   the panel. Keep them visible somewhere read-only (e.g. the overview/summary)
   so users can still *see* the current address.
3. **Imports/web forms**: check that these still fill the address fields.
   Locking them in the UI must not break your job portal or import.

Recommended: make the fields **read-only rather than hidden**. Users then see
the current address and use the panel to change it.
