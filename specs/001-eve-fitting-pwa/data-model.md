# Data Model · Fits, Catalog, and Versions

## Local Library

| Entity | Fields | Relationships and rules |
| --- | --- | --- |
| `Fit` | `id`, `revision`, `name`, `description`, `shipTypeId`, hull mode, equipment sets, `skillProfileId`, `conditionsId`, `status`, timestamps | Each import and copy receives a local ID. Saving increments `revision` and detects stale edits before overwriting them. Constraint validation runs independently of `draft` and `saved` status. |
| `FitItem` | Stable local `id`, `typeId` or unresolved original reference, slot group and position, quantity, state, charge, Abyssal attributes, source item ID | Equipment is stored separately from catalog attributes. Positions are unique within each slot group. Quantities are positive integers. Charge, quantity, and state are validated against the hull and module. An invalid combination can be saved as a draft with an explanation. |
| `SkillProfile` | `id`, name, source `all-zero`, `all-v`, `custom`, or `eve`, levels by `typeId`, `characterId`, `fetchedAt` | Levels range from 0 to 5. Sync replaces the EVE snapshot for the selected character. Create hypothetical profiles as editable copies. |
| `FitConditions` | `id`, incoming damage types and shares, target parameters, environment effects, implants, boosters, command and projected sources | Shares are nonnegative, have a positive sum, and are normalized before calculation. Distance and other quantities have units and allowed ranges. Sources may reference a pinned snapshot of another fit and its own profile. Resolve references and check for cycles before calculation. |
| `CharacterLink` | `characterId`, display name, scopes, last successful request, status `linked`, `reauth-required`, or `disconnected` | Local metadata is stored separately from the sign-in session. Disconnecting retains the local skills snapshot for calculations. |
| `Settings`, `Backup` | Editor preferences, `formatVersion`, export options, fits, profiles, conditions | Backups contain user data only. Restore first verifies the version and references, shows conflicts, and applies the confirmed records in a transaction. |

Local records and the catalog use separate sets of IndexedDB stores. Versioned user-data migrations preserve record IDs. Clearing the catalog preserves the library. A backup can transfer the library to separate PWA storage.

## Catalog and Calculation

| Entity | Fields | Relationships and rules |
| --- | --- | --- |
| `CatalogType` | `typeId`, names, group, category, market group, hulls and restrictions, Dogma references, publication flags | Stable SDE type. Fit references survive removal from a release. Removed entries display as unknown and affected calculations are `partial`. |
| `DogmaDataset` | Type index and segments, attributes, units, effects, modifiers, skill rules, bonus sets, mutation parameters, normalization version | Resolve natural references within one `releaseId`. The adapter prepares the needed types before invoking the synchronous engine. Versioned overrides record their source and test coverage. |
| `CalculationRequest` | `requestId`, `fitRevision`, frozen session inputs, `compatibilityId` | Each request uses one snapshot. Calculation leaves the fit intact. The interface ignores results for stale revisions. |
| `CalculationResult` | `requestId`, `compatibilityId`, metrics with units, constraints, warnings, chart points | Each value is `computed`, `partial`, `unavailable`, or `not-applicable`. A numeric zero is distinct. Results are displayed with the current snapshot, and the library stores the inputs. |

## Provenance and Updates

| Entity | Fields | Relationships and rules |
| --- | --- | --- |
| `SdeRelease` | Immutable CCP `releaseId`, `buildNumber`, date, local snapshot of the primary manifest, tables with version and hash | `releaseId` is the key. Reimporting an identical snapshot is idempotent. Record a hash mismatch for the same input for investigation. |
| `CompatibilityRelease` | `compatibilityId`, `sdeReleaseId`, `datasetSchemaVersion`, `engineProtocolVersion`, `engineRulesVersion`, engine version, Pyfa tag and commit, reference fingerprints, artifact list | Immutable, verified combination. The rules version includes a fingerprint of the engine and applied corrections. The acceptance report binds to the input identifiers. |
| `ChannelPointer` | Increasing `revision`, `current` and `previous` references, publication time | Both publishing and rollback create a new revision. The browser compares against the last observed revision. The host retains the preceding release. |
| `InstalledCatalog` | `compatibilityId`, state `staging`, `verified`, `active`, `retained`, or `failed`, local pointer revision | After verification, a transaction updates the pointer and marks the preceding release `retained`. Incomplete downloads stay outside the active pointer. Retain files that a running calculation still needs. |
| `EsiContractSnapshot` | Requested compatibility date, provenance, source SHA-256, five operation contracts with methods, fields and scopes, diff report | The approved snapshot is tied to the client version. A new date must pass contract and adapter checks before inclusion in a build. |
| `RemoteFitRef`, `RemoteMutation` | `characterId`, optional server `fittingId`, action, fingerprint of the representable fit, status `pending`, `confirmed`, `rejected`, or `unknown` | The operation retains the selected character context. Use the response or reconcile the server list to resolve an uncertain write. Repeating a write requires user confirmation. |

[Catalog and PWA contract](contracts/pwa-data.md) · [EVE SSO and ESI contract](contracts/eve-esi.md) · [Command contract](contracts/npm-scripts.md)
