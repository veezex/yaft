# Contract · PWA, Worker, and Catalog

## Browser Entry Points

- `/` opens the local editor, library, and comparison view. Sign-in is available from the character interface. The host serves the client page for direct EVE SSO navigation to `/auth/eve/callback` at an origin root, or `/yaft/auth/eve/callback/` on GitHub Pages. The editor remains available after a sign-in error.
- `/manifest.webmanifest` describes the application's ID, scope, start URL, installed display mode, and icons. `/sw.js` manages the versioned shell. Retain hashed shell and Worker assets for open tabs and rollback. Use a short cache lifetime for HTML and the service worker, and immutable caching for hashed assets. Project hosting puts these paths under the deployment prefix.
- The service worker caches a consistent list of static resources, including lazy editor modules and the Worker, and activates the new shell after download and a safe transition. An open tab can keep using matching code and data. OAuth, ESI, and callback requests use the network. The editor reports offline readiness separately.
- At a phone width of 360 CSS pixels, switch between the catalog, fit, and stats without horizontal page scrolling. The same actions are available by mouse and keyboard on desktop. If storage runs low, the app explains the issue and offers an export of editor data.

## Catalog Publication

| URL | Fields or contents |
| --- | --- |
| `/updates/current.json` | `formatVersion`, monotonically increasing `revision`, `publishedAt`, `current`, and optional `previous`. Each reference contains `compatibilityId`, the immutable manifest URL, and its SHA-256. Read over the network outside the shell cache. |
| `/updates/releases/<compatibilityId>/manifest.json` | `formatVersion`, `compatibilityId`, `sdeReleaseId`, `sdeBuildNumber`, `datasetSchemaVersion`, `engineProtocolVersion`, `engineRulesVersion`, `enginePackageVersion`, Pyfa tag and commit, provenance, and artifact purposes, sizes, and SHA-256 hashes. |
| `/updates/blobs/<sha256>.<ext>` | Immutable index, Dogma, and type segment files. Hash the artifact bytes after decoding HTTP Content-Encoding. |

Publish files and the manifest first. Verify availability, then switch the pointer atomically. Rollback also increases `revision`. Keep old artifacts available for the previous release, rollback, and active clients. Catalog data can ship independently when its format and rules are compatible with both sides.

## Activation in the App

1. Load the active local pointer at startup, then check the network pointer. On first install, use the compatible manifest pinned at build time if the current channel is incompatible with the open app version.
2. Choose a release compatible with the catalog schema, Worker protocol, and rules version. Verify the manifest and every required file, including size and hash, before marking the release `verified`.
3. Activate the pointer in one IndexedDB transaction that compares the previous local revision and observed channel revision. Under contention, reread the active release. Concurrent downloads keep release records separate. A failed import or insufficient quota leaves the working release available.
4. Start new calculations with the new `compatibilityId`. Retain the previous release and artifacts needed by active tabs until cleanup is safe. If local data disappears, check integrity and use the previous release when available, or offer a fresh download and backup restoration.
5. A change to the rules version requires a compatible shell build and catalog. Preserve local library format compatibility on rollback and let active tabs finish saving. Clean up obsolete catalogs separately from user-data migrations.

## Calculation Worker Messages

- `initialize` confirms `compatibilityId`, rules version, and data access. `search` takes a query and filters and returns a bounded page of catalog results.
- `calculate` takes `requestId`, `fitRevision`, `compatibilityId`, and a snapshot of the inputs. The Worker loads segments from that catalog, adapts the `FittingDataset`, and returns metrics, warnings, and chart points tagged with the request and version. Unknown types produce an explicit partial result.
- The interface applies only responses for the current revision. Cancellable searches and calculations can release the queue when newer work supersedes them. See the [data model](../data-model.md) for data and state contracts.
