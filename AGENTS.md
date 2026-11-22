# Repository Guidelines

## Project layout

- `src/app/` contains the React UI. `src/domain/` contains fit models and validation. `src/fitting/` contains the engine adapter and Web Worker.
- `src/storage/` handles IndexedDB and catalog updates. `src/pwa/` handles offline support. `src/formats/` handles fit exchange and backups, and `src/esi/` handles EVE API and SSO integration.
- `public/catalog/` holds the pinned catalog. Follow the [catalog workflow](README.md#catalog-and-eve-maintenance) when changing its generated files. See the [acceptance procedure](specs/001-eve-fitting-pwa/quickstart.md) for release checks.

## Coding conventions

- Write AI instructions, repository documentation, and code comments in English.
- Preserve translated application strings and their locale-specific test expectations.
- Use the existing localization helpers and update both `src/i18n/en.ts` and `src/i18n/ru.ts` for new UI text.
- Follow the surrounding TypeScript style, including two-space indentation and explicit `.ts` or `.tsx` extensions on relative TypeScript imports.
- Keep browser-side fitting calculations in the Web Worker. Preserve saved libraries and profiles when changing IndexedDB schemas or backup formats.

## Development and verification

- Use the Node version in `.nvmrc`. Install dependencies with `npm ci` and start Vite with `npm run dev`.
- Use test-driven development (TDD) for every new feature and bug fix. Start with a test that specifies the new behavior or reproduces the bug. Confirm that it fails for the expected reason before changing the implementation. Make the smallest change that passes the test, then refactor as needed and rerun the relevant tests.
- Run `npm run typecheck` and `npm test` for code changes. Use `*.test.ts` for Node tests in `tests/unit/` and `tests/contract/`.
- Run `npm run test:parity` for fitting or catalog changes to check results against the pinned Pyfa baseline.
- Run `npm run test:e2e` for browser behavior changes. It builds the app and runs the Playwright `tests/e2e/*.spec.ts` suite. Install browsers with `npm run test:browsers` if needed. Use `npm run build` and `npm run preview` to check the production build manually.
