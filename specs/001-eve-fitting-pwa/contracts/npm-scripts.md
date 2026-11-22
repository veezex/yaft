# Contract · Build and Maintenance Commands

Pass command arguments after `--`. Maintenance scripts run in Node.js with pinned dependencies and write their output to the build workspace.

## Application and Tests

| Command | Result |
| --- | --- |
| `npm ci` | Install from the lockfile. |
| `npm run dev` | Run Vite with hot updates on source edits. |
| `npm run typecheck` | Type-check the app, Workers, and maintenance commands. |
| `npm run build` | Produce `dist/`, including the static app, manifest, icons, stable service worker URL, and versioned shell file list. |
| `npm run preview` | Preview the build. Also serve artifacts published with `--target local` under `/updates/`. |
| `npm test` | Run Node unit and contract tests, including import logic, OpenAPI comparisons, and catalog promotion. |
| `npm run test:browsers` | Install browsers for the pinned Playwright version. |
| `npm run test:e2e` | Verify offline use, PWA transfer and updates, fit exchange, errors, and mocked ESI. |
| `npm run test:pages` | Verify a prebuilt project site under `/yaft/` in Chromium using a static server. |
| `npm run test:parity -- [--candidate <id>]` | Compare with verified Pyfa output. Defaults to the reference set. |

The build uses declared sources and approved local contracts. Maintenance commands fetch updates to contracts and data and produce their own reports.

## ESI Contract and Pyfa Version Checks

| Command | Behavior |
| --- | --- |
| `npm run esi:import -- --date <YYYY-MM-DD> [--from <openapi.json>]` | Save the official OpenAPI 3.1 snapshot for the requested date or import a local snapshot. Record source and SHA-256, resolve the necessary schema references, and normalize the supported operations. |
| `npm run esi:update -- --date <YYYY-MM-DD> [--check]` | Compare a fresh snapshot with the approved snapshot. Report changes to paths, status codes, scopes, and data shapes. `--check` returns status and the report. Normal mode prepares a candidate for review and inclusion in the source. |
| `npm run pyfa:check -- [--ref <tag>]` | Check the latest stable Pyfa release or the supplied tag, resolve its commit, and list affected rules and reference cases. Approve changes to the reference version after comparison. |
| `npm run pyfa:fixtures -- --from <directory>` | Import aligned output from the Pyfa harness. Verify tag and commit, provenance, dataset fingerprint, inputs, units, expected values, and fixture schema. |
| `npm run pyfa:fixtures -- --oracle <directory> --dataset <directory>` | Run the local pinned Pyfa harness on aligned inputs and produce a new verifiable reference set. Only the maintenance machine needs the prepared Python environment. |

The approved ESI snapshot enters the next client build after type checks and contract tests. The `X-Compatibility-Date` of an existing build is independent of SDE publication.

## SDE Import, Update, and Rollback

| Command | Behavior |
| --- | --- |
| `npm run data:import -- --release <id> [--from <directory>]` | Import a pinned CCP release or an equivalent local snapshot. Record input table versions and validate expected shapes and references. |
| `npm run data:update -- [--release <id>] [--check]` | Find a new `release` and report changes. `--check` returns status and a report. Normal mode builds an immutable candidate and reuses verified unchanged tables. |
| `npm run data:verify -- --candidate <id>` | Check completeness, cross-references, schema, support for significant effects, and reference calculations. Return a hash-bound `verified` report or the reason for blocking. |
| `npm run data:publish -- --candidate <id> --target <local-or-configured>` | Publish the verified immutable files and switch the release pointer atomically. Check `local` through `preview`. |
| `npm run data:rollback -- --target <local-or-configured>` | Verify the previous combination and switch the pointer at a new revision. Coordinate any rules change with the application version. |

A local snapshot contains the primary release manifest and JSONL and schema files for the supported tables. The manifest contains `release`, `buildNumber`, `releaseDate`, and `tables` keyed by table name. Network import reads the pinned `tables[name].jsonl.url` and `tables[name].jsonl.recordSchemaUrl`. Each candidate records provenance and incompatibilities. A significant change to reference-fit inputs requires a new aligned reference before publication. Reuse the existing reference set when inputs match. [SDE format](https://developers.eveonline.com/docs/services/static-data/) · [Verified release manifest](https://sde.evetech.net/tranquility/20261120T165826Z/)

## Status and Retries

- Each command returns a compact summary and the path to its machine-readable report. Reports include source ID, date, hashes, differences, and the applicable `unchanged`, `staged`, `verified`, `published`, or `blocked` status. Failures return a nonzero exit code.
- Reimporting the same release and republishing the current verified release are idempotent. Changes to verification code or inputs require a fresh report. CCP releases sharing a build number are handled separately by `release`.
- CI checks sources every four hours and supports manual runs. Publication requires an explicit target. Serialize pointer writes or compare the expected and current revisions. On conflict, reread the channel and verify the conditions again.
- Hosting credentials belong to the maintenance environment. OpenAPI and SDE imports use public data. Diagnostic reports omit OAuth tokens and keys.
