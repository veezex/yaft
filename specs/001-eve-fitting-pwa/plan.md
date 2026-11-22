# Implementation Plan · EVE Online Browser Fitting Assistant

**Branch** · `001-eve-fitting-pwa` is the Spec Kit identifier for the working directory

**Date** · 2026-11-22

**Spec** · [Specification](spec.md)

**Input** · A browser PWA using React, Vite, and TypeScript, with npm commands for builds and EVE Online updates.

## Summary

Build one static PWA for desktop and mobile browsers using React, Vite, and TypeScript. A Web Worker handles calculation and search. IndexedDB stores the library and catalog. A service worker enables offline startup. The browser uses EVE SSO and ESI for sign-in and character operations. Node runs the TypeScript maintenance scripts through npm for builds, OpenAPI and SDE import, Pyfa compatibility checks, data publication, and rollback.

## Technical Context

| Area | Decision |
| --- | --- |
| Language and version | TypeScript 7.0.2. Node.js 26.13.1 LTS for CI and builds, with 24.21.0 LTS also used for local verification. |
| Primary dependencies | React and React DOM 19.3.1, Vite 8.3.8, React plugin 6.3.0, and `eve-fit-engine` 0.2.28. At initialization, verify stable versions and compatibility, then pin the exact set in the lockfile. |
| Storage | IndexedDB for the library, profiles, catalog index, and version pointer. Cache Storage for the shell. Memory and `sessionStorage` for active EVE session data. Static HTTPS hosting for immutable catalog files. |
| Testing | `node:test`, Playwright 1.65.1, Pyfa v2.70.0 reference calculations, acceptance on real Safari and Android Chrome, and manual ESI verification. |
| Target platform | Current Chrome, Edge, Firefox, and Safari on desktop, Chrome on Android, and Safari on iOS. Installation where supported. |
| Project type | One client-side Vite project with Node maintenance scripts that run separately from the app. |
| Performance goals | SC-001 on at least 30 fits. Search within 1 s p95 and recalculation within 500 ms p95. Compatible SDE within 24 hours and a Pyfa change report within one business day. |
| Constraints | HTTPS hosting, external SSO and ESI for online operations, offline use after catalog setup, an accessible editor starting at 360 CSS pixels, and compatible data and rules versions. |
| Scale and scope | Full Tranquility fitting catalog, local library, multiple EVE characters, common transfer formats, and the basic and advanced calculation modes in FR-001–FR-015. |

See the [research](research.md) for decisions, sources, and prerequisites for early verification.

## Constitution Check

**Before research** · `.specify/memory/constitution.md` contains an unratified template. The specification and user request define the project constraints.

**After design** · The client build and npm scripts form one project. The design preserves offline calculations and independent SDE and ESI maintenance and defines how to validate the calculation engine. The contracts and [acceptance scenarios](quickstart.md) cover FR-001–FR-015 and SC-001–SC-007. Planning can proceed under the current constitution.

## Project Structure

### Documentation for This Feature

```text
specs/001-eve-fitting-pwa/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    ├── eve-esi.md
    ├── npm-scripts.md
    └── pwa-data.md
```

### Source Code at the Repository Root

```text
package.json
package-lock.json
vite.config.ts
src/
├── app/            # React, editor, library, comparison, and character UI
├── domain/         # Fit and profile models and constraints
├── fitting/        # Web Worker, engine adapter, checked rules, and charts
├── formats/        # EFT, XML, DNA, and backup
├── storage/        # IndexedDB, migrations, and catalog management
├── esi/            # SSO, character sessions, Fetch, and response validation
└── pwa/            # Service worker, manifest, and installation state
public/
└── icons/
scripts/
├── data/           # SDE download, normalization, verification, and publication
├── esi/            # OpenAPI import, diff report, and compatibility check
├── pyfa/           # Release review and reference fixture harness
└── build/          # Application and shell builds
tests/
├── unit/
├── contract/
├── parity/
└── e2e/
```

**Structure decision** · One npm project separates browser and Node maintenance code and shares models and validators for common formats. CI and static hosting use npm scripts to build and verify the app. Store raw data and temporary import output outside `dist/` and the application source tree.

## Design and Delivery Sequence

1. **Build an end-to-end prototype.** Set up Vite, React, and npm and verify a clean build with the pinned dependencies. Import the pinned SDE and ESI and supply the first catalog to the browser Worker. Compare representative engine calculations with Pyfa and independently verify browser PKCE on an actual HTTPS URL. Complete each check before expanding its integration.
2. **Build the editor and local library.** Add catalog search, slots, states, constraints, calculations, profiles, saves, and backups. Place the catalog, fit, and stats side by side on wide screens and use switchable panels on phones. Use a neutral palette, visible focus, error messages, and keyboard and touch controls. Add PWA installation, offline readiness, and coordinated shell updates. FR-001–FR-005, FR-007, FR-012–FR-013.
3. **Add transfer and analysis.** Support EFT, XML, and DNA codecs, price estimates, and advanced stats. Cover unknown types, multiple skill profiles, external sources, Abyssal items, capacitor simulation, and target-profile damage. Compare at least 30 reference fits and run a separate set of 12 transfer cycles. FR-004–FR-006, FR-008, FR-011.
4. **Integrate characters.** Add authenticated ESI operations with an explicit character context, write previews, deletion confirmation, and recovery after revocation or an uncertain result. Verify two characters and the installed PWA on mobile Safari. FR-009–FR-011.
5. **Maintain and release.** Run scheduled and manual SDE and Pyfa discovery. Preparation can run automatically, and publication switches the pointer after verification. Changed reference-fit inputs require new aligned reference results. Logic changes require updated rules and a compatible build. Verify both paths, rollback, a corrupted artifact, and two open tabs. FR-014–FR-015.

## Release Acceptance

- The browser build contains client modules. Verify installation, offline restart, and restoration from a backup file on the supported browser matrix.
- Verify direct EVE SSO with a registered public client and authenticated operations on two test characters.
- Inconsistent data or an unsupported significant effect reports its status and blocks promotion. Verify SC-001–SC-007 against the precise inputs.
- Distribute the build with GPL-compatible terms, notices, and corresponding source for `eve-fit-engine` and the app. Handle CCP data rights and attribution separately. [Engine license](https://github.com/capsuleers-app/capsuleers.fitting-engine) · [CCP terms](https://developers.eveonline.com/license-agreement)
