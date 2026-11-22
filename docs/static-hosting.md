# Static hosting

## GitHub Pages

The [YAFT site](https://veezex.github.io/yaft/) is published from `release`.
Push the tested release commit to that branch to build and deploy it. The
repository's Pages source is GitHub Actions and its `github-pages` environment
allows deployments from `release`.

To verify the same layout locally with Chromium:

```sh
npm run build -- --base /yaft/
npx playwright install --only-shell chromium
npm run test:pages
```

The Pages build serves the pinned catalog and carries the matching source
links in its license page. To enable EVE character sign-in on Pages, register
`https://veezex.github.io/yaft/auth/eve/callback/` at CCP and set the public
client ID in the repository's `VITE_EVE_CLIENT_ID` Actions variable.

## Hosting at an origin root

Build the app with `npm ci` and `npm run build`. Serve the contents of
`dist/` at the root of the selected HTTPS origin. Route
`/auth/eve/callback` to `index.html` for direct browser navigation.
Set `Referrer-Policy: no-referrer` on that response and exclude callback query
strings from access logs. Keep the page and its JavaScript first-party.

Set `VITE_EVE_CLIENT_ID` to the public CCP application ID at build time.
In the EVE Developer Portal, register the exact URL
`https://<your-host>/auth/eve/callback`, including the path and any port. The
required scopes are `esi-skills.read_skills.v1`,
`esi-fittings.read_fittings.v1`, and `esi-fittings.write_fittings.v1`. Use a
public application that can perform PKCE S256 without a secret.

A content security policy should permit application scripts, styles and
Workers from the application origin. Permit HTTPS connections to
`login.eveonline.com` and `esi.evetech.net`. Serve any configured catalog
channel on the application origin. Auth responses are fetched with
`Cache-Control: no-store` semantics so the access token and character data
stay within the browser session.

## Caching and offline startup

Serve `index.html`, `sw.js`, and `shell-manifest.json` with revalidation or a
short cache lifetime. Assets with hashed names and verified channel blobs
can use long-lived immutable caching. Preserve old hashed assets when
deploying a new build, so a tab with an older shell can finish its work.
Publish the channel blobs and release manifest before switching
`/updates/current.json`. Serve the channel pointer with `Cache-Control:
no-store`. Serve `.blob` artifacts as ordinary binary files and preserve
their bytes after HTTP Content-Encoding is decoded.

The service worker stages the whole built shell before activation. Open tabs
keep their running code and can load assets from the previous shell. A new
navigation checks the server for the latest HTML and uses the cached shell
when the network is unavailable. Keep the previous static release and its
compatible catalog available for rollback.
The local library can be moved between the browser and a separately
installed PWA using a downloaded backup.
