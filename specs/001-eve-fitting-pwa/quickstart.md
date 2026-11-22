# Quickstart · Verify the PWA

Run these commands after implementation. See the [npm contract](contracts/npm-scripts.md) for arguments.

## Preparation

- Use Node.js 26.13.1 LTS and its bundled npm. Node.js 24.21.0 LTS also supports local development.
- Prepare the workspace with the lockfile, approved OpenAPI and SDE test snapshots, and Pyfa reference fixtures. Updating the reference requires a prepared local Pyfa v2.70.0 harness and an aligned dataset. CI and the app use the existing reference results.
- Live ESI requires a registered public CCP client, the exact HTTPS callback, `VITE_EVE_CLIENT_ID` at build time, and two test characters with test fits. Local UI acceptance can use mocked ESI.

```sh
npm ci
npm run typecheck
npm test
npm run test:browsers
npm run build
```

If the local channel is empty, first import, verify, and publish release A with `--target local` following the import, update, and rollback procedure below. Run `npm run preview` and open the printed URL. For a real phone, serve the same static build at an HTTPS address the device can reach.

## Fits, Formats, and Accuracy

```sh
npm run test:parity
npm run test:e2e
```

1. Find a hull and several modules in the catalog, add charges and drones, toggle an active module, and select a different skill profile. Compare the results, exceed CPU or powergrid intentionally, and save the fit as a draft. Reload, compare it with a named copy, and restore the original library in another browser profile.
2. Compare at least 30 reference fits against Pyfa. Cover constraints, profiles, overheating, charges, Abyssal items, structure configurations, effects, and selected chart points. See SC-001 in the [specification](spec.md) for expected values and tolerances.
3. Run 12 EFT, XML, and DNA import and export cycles with reference files from Pyfa or the EVE client. Verify representable values and the loss preview for additional states. Include an unresolved type and an XML file with multiple fittings.
4. On desktop and mobile, run 40 searches and 40 typical fit edits after startup. Compare p95 timings against SC-002. Run the first-use scenario in SC-003 with ten players, including at least five on each screen type.

## Installation and Offline Use

1. Wait until both the shell and catalog are ready. On a phone at least 360 CSS pixels wide, use touch to select equipment, review a warning, and open the stats.
2. Where installation is supported, launch from the home screen or app list. Restore the library from a backup if the installed app has separate storage.
3. Disconnect the network, close the app or browser, and open it again. Verify catalog access, fit editing and calculation, saving, and export. Online actions indicate that the network is unavailable. Verify that local changes survive reconnection.
4. Test desktop Chrome, Edge, Firefox, and Safari, plus Chrome on Android and Safari on iOS. Playwright covers automated scenarios. Verify installation, offline startup, and callback handling on real mobile browsers.

## ESI Contract and EVE SSO

```sh
npm run esi:import -- --date 2026-11-19
npm run esi:update -- --date 2026-11-19 --check
```

Expect an OpenAPI 3.1 snapshot, the date and source hash, and a report for five operations. An incompatible fixture must return a nonzero exit code and explain the difference.

Sign in with CCP at the registered HTTPS address from a desktop browser and an installed mobile PWA. Connect two consenting test characters, switch between them, refresh skills, and verify access renewal. Import a test fit, send a test copy, and verify it appears on the intended character. After confirmation, delete only the uploaded test copy. Test a permission denial, revocation, rate limiting, and an interrupted POST with an uncertain outcome. Verify that local work survives. [EVE contract](contracts/eve-esi.md)

## Import, Update, and Rollback

Check for changes before publication.

```sh
npm run data:update -- --check
npm run pyfa:check
```

Prepare two local SDE fixtures with different `release` identifiers and the same `buildNumber`. Set `YAFT_RELEASE_A`, `YAFT_RELEASE_B`, `YAFT_SDE_A`, and `YAFT_SDE_B`. Use the candidate ID reported by each import in the subsequent commands.

```sh
npm run data:import -- --release "$YAFT_RELEASE_A" --from "$YAFT_SDE_A"
npm run data:verify -- --candidate "$YAFT_CANDIDATE_A"
npm run data:publish -- --candidate "$YAFT_CANDIDATE_A" --target local
```

Open the published catalog through `preview`, save a fit, and leave two tabs open. Publish the second verified candidate.

```sh
npm run data:import -- --release "$YAFT_RELEASE_B" --from "$YAFT_SDE_B"
npm run data:verify -- --candidate "$YAFT_CANDIDATE_B"
npm run data:publish -- --candidate "$YAFT_CANDIDATE_B" --target local
```

Verify the update in the browser, then roll it back.

```sh
npm run data:rollback -- --target local
```

- Verify that the version changes after the complete set passes verification, the recalculation uses the expected attribute, and saved records remain available. Confirm that rollback restores the first combination at a higher pointer revision.
- Interrupt a download, supply an artifact with the wrong hash, try an incompatible schema, and reproduce a quota error. Verify that the working catalog remains active in each case.
- For a known Pyfa release change, verify that the report identifies the affected cases. If inputs change, regenerate the reference with `pyfa:fixtures`, verify provenance, and compare with a single matched combination of data and rules.
- For SC-005, time two real or replayed releases from when publication becomes detectable. For SC-006, measure time to the diff report. Verify against a local channel before using static hosting. [Publication and activation contract](contracts/pwa-data.md)
