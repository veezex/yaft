# YAFT

A browser fitting workspace for EVE Online. The editor reads a pinned
Tranquility catalog and calculates fits in a Web Worker. Your library,
profiles, condition sets and installed catalog live in IndexedDB. Export
a library backup to transfer local data between browser profiles or
installations.

[Open YAFT](https://veezex.github.io/yaft/)

## Run locally

Use Node.js 26.13.1 from `.nvmrc`. Node.js 24.21.0 is also compatible.

```sh
npm ci
npm run dev
```

For a static production build with install and offline support:

```sh
npm run build
npm run preview
```

Use the URL printed by Vite. Under local preview, wait for **Offline ready**
before testing an offline restart. The bundled CCP release is
`20261120T165826Z`, Tranquility build `3724492`.

## Verification

```sh
npm run typecheck
npm test
npm run test:parity
npm run test:browsers
npm run test:e2e
```

The [Pyfa baseline](tests/parity/baseline-report.md) lists the tested inputs
and remaining coverage. See the [acceptance procedure](specs/001-eve-fitting-pwa/quickstart.md)
for physical browser, live EVE, and release acceptance.

## Catalog and EVE maintenance

```sh
npm run data:update -- --check
npm run data:import -- --release <release-id> --from <snapshot-directory>
npm run data:verify -- --candidate <candidate-id>
npm run data:publish -- --candidate <candidate-id> --target local
npm run data:rollback -- --target local
npm run pyfa:check
npm run esi:import -- --date 2026-11-19
npm run esi:update -- --date 2026-11-19 --check
```

The import accepts a directory containing a primary CCP HTTP manifest and
its named JSONL tables and record schemas. Omit `--from` to fetch the
specified release directly from CCP. Candidates and reports are written
to `.yaft/`. The local channel is served at `/updates/` by preview.
Publication verifies the artifact bytes and requires a fresh acceptance
report. A blocked report leaves the current channel in place. Configured
publication targets map names to mounted static directories using
`YAFT_CHANNEL_TARGETS`.

For the headless reference run, prepare the pinned Pyfa checkout with the
Python dependencies in its own `.venv`, then run
`npm run pyfa:fixtures -- --oracle <checkout> --dataset <snapshot-directory> --output <result>`.
The command rebuilds the Pyfa reference database in a temporary directory.
Review reference changes before including them.

See [static hosting](docs/static-hosting.md) for the HTTPS and public EVE
client configuration. See [third-party notices](THIRD_PARTY_NOTICES.md) for
source and catalog attribution.
