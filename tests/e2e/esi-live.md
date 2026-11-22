# Live EVE SSO acceptance

Pending a registered public CCP client, its exact HTTPS callback URL,
and a test character authorized to sign in. The local workspace has no
configured public client ID. The protected write and delete checks require
that account and are pending.

The OpenAPI source was imported for compatibility date `2026-11-19`.
The confirmed scopes are `esi-skills.read_skills.v1`,
`esi-fittings.read_fittings.v1`, and `esi-fittings.write_fittings.v1`.

Build with the public client ID and serve the result from the registered
origin. Start sign-in from the workspace, verify the callback confirms the
character, refresh the same session, and use that session to read skills.
Create a dedicated test fit and confirm its presence by the returned fitting
ID. Delete that exact entry and verify its absence. Repeat with a second
authorized character and from the installed mobile PWA for full acceptance.
Record outcomes by browser without including codes, tokens or character
credentials.
