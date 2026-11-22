# Contract · EVE SSO and ESI

## Browser Sign-In

- Register a public application with CCP using its exact HTTPS callback URL. Use `/auth/eve/callback` at an origin root or `/yaft/auth/eve/callback/` on GitHub Pages. Supply the public client ID at build time as `VITE_EVE_CLIENT_ID`. The callback URL combines the application's HTTPS origin and the corresponding path.
- Use EVE SSO Authorization Code with PKCE S256. Store the expiring, single-use `state` and verifier in `sessionStorage` in the initiating tab and remove them after use. The app prompts for a fresh sign-in if the state is invalid. Read callback values into memory and immediately clear them from the URL.
- Token validation follows CCP's published requirements for discovery, signing keys, issuer, application and `EVE Online` audiences, expiry, and the character `sub`. Fetch uses approved CCP endpoints. Cache Storage excludes auth responses and personal ESI data.
- Keep access tokens in memory. Store each character's refresh token in `sessionStorage` in the initiating tab so the redirect for a second character preserves the first session. Coalesce concurrent token refreshes for the same character. Closing the tab, revoking access, or disconnecting requires a new sign-in. A local skills snapshot remains available with its retrieval date. CCP's Authorized Applications page supports revoking permissions.
- Keep application secrets, tokens, and codes out of static files, backups, telemetry, and logs. Use first-party callback resources and limit referrer disclosure. Verify that an installed PWA returns to the initiating context, including in Safari. [Official SSO protocol](https://developers.eveonline.com/docs/services/sso/)

## API Contract

The base URL is `https://esi.evetech.net`. Request paths omit trailing slashes and carry `X-Compatibility-Date: 2026-11-19`. An earlier response date is valid for a route whose behavior has remained stable. [OpenAPI 3.1 snapshot](https://esi.evetech.net/meta/openapi.json?compatibility_date=2026-11-19) · [ESI compatibility dates](https://developers.eveonline.com/docs/services/esi/overview/) · [Response version semantics](https://developers.eveonline.com/blog/changing-versions-v42-was-getting-out-of-hand)

| Method and route | Scope | Result |
| --- | --- | --- |
| `GET /characters/{character_id}/skills` | `esi-skills.read_skills.v1` | `200` with the skills snapshot. Calculations use the active skill level and retain the trained level as metadata when present. |
| `GET /characters/{character_id}/fittings` | `esi-fittings.read_fittings.v1` | `200` with the selected character's saved fits. |
| `POST /characters/{character_id}/fittings` | `esi-fittings.write_fittings.v1` | `201` with the new fitting ID. |
| `DELETE /characters/{character_id}/fittings/{fitting_id}` | `esi-fittings.write_fittings.v1` | `204` on completion. |
| `GET /markets/prices` | Public | `200` with `average_price` for estimating value. Flag unpriced items and show the retrieval time. |

Request scopes for the supported integration actions. Import the schema with the maintenance command. Check supported paths, fields, and ID formats against the snapshot and when parsing responses. Calculations use only the documented subset of fields.

## Fitting Writes and Errors

- Before writing, show the character, fit name, and any information the format loses. ESI accepts a name of 1–50 characters, an optional description of up to 500 characters, `ship_type_id`, and 1–512 `{type_id, flag, quantity}` records. Map equipment to valid slots or locations and include extra states in the loss preview.
- Confirm the specific character and `fitting_id` before deletion. Refresh the list after success, accounting for ESI caching. The local fit is independent of the server list.
- A lost POST or DELETE response leaves the outcome unknown. Reconcile by ID or by a fingerprint of the representable fit. A cached list can lag a write. After reconciliation, the user can explicitly choose to retry.
- Respect `ETag`, cache lifetimes, rate-limit headers, and `Retry-After` for bounded read retries. Show distinct states for insufficient permissions, revoked access, rate limits, and unavailability. Cancel personal requests when the view changes character or the character disconnects. [ESI caching](https://developers.eveonline.com/blog/esi-etag-best-practices) · [ESI rate limits](https://developers.eveonline.com/docs/services/esi/rate-limiting/)
