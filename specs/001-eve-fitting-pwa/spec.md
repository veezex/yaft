# Feature Specification · EVE Online Browser Fitting Assistant

**Feature Branch** · No dedicated branch

**Created** · 2026-11-22

**Status** · Draft

**Input** · A PWA for EVE Online fitting and integration, based on Pyfa capabilities. The app works in desktop and mobile browsers, has a practical, subdued interface, and follows game data and Pyfa changes promptly.

## User Scenarios & Testing *(mandatory)*

### Create and Edit a Fit (P1)

The player picks equipment, checks the ship's constraints, sees the impact of each change, and saves a working fit or draft.

**Independent test** · Build and save a frigate fit in the browser without signing in to EVE, then reopen it after reloading.

1. **Given** a selected ship and skill profile, **when** the player adds a module, loads ammunition, changes a module state, or deploys drones, **then** the fit, constraints, and affected metrics reflect the new configuration.
2. **Given** a fit exceeds CPU or powergrid or contains an item with an unmet skill requirement, **when** the player reads the warning, **then** they see the cause and related item or resource and can correct the fit or save it as a draft.
3. **Given** a saved fit, **when** the player duplicates it, renames the copy, and restarts the browser, **then** both versions open independently.
4. **Given** a local library with fits, drafts, and custom profiles, **when** the player exports a backup and restores it in a different browser profile, **then** the original records, equipment states, calculation conditions, and settings are available.

### Connect a Character and Exchange Fits with EVE Online (P1)

The player connects characters through official EVE sign-in, uses their skills in calculations, and manages fits accessible in the game client.

**Independent test** · With two authorized test characters, refresh one character's skills, import a game fit, and send a separate fit to the selected character.

1. **Given** the player returns after successful EVE SSO, **when** they refresh and apply character skills, **then** the app shows the character and retrieval time and recalculates the fit for that profile.
2. **Given** two connected characters, **when** the player selects one and loads their saved fits, **then** they see the selected character's list and can import a fit as an independent local copy.
3. **Given** an open local fit, **when** the player reviews the equipment and character and confirms the write, **then** the app shows the outcome, and a successful upload appears for that character. Deletion requires separate confirmation with the character and fit names.
4. **Given** the player cancels sign-in, disconnects a character, revokes access, or loses the network, **when** an authenticated operation is unavailable, **then** the app shows the status and a recovery action, preserves local work, and shows the retrieval date on previously fetched skills.
5. **Given** public prices for several equipped items and a missing price for one, **when** the player opens the price estimate, **then** they see the quantity-adjusted total for priced items, the incomplete status, and the price retrieval time.

### Update Game Data and Pyfa Compatibility (P1)

The maintainer prepares an update when a new EVE static data release arrives or Pyfa changes its fitting rules. Players can see which versions the calculations use and keep their saved fits during updates.

**Independent test** · Publish a compatible data release that changes an item attribute. Then test an incompatible release and a release with a changed calculation rule.

1. **Given** CCP publishes a compatible release, including one with the same build number, **when** the update passes verification and is published, **then** the app shows the new release, uses it for calculation, and opens saved fits with their original equipment and user settings.
2. **Given** a release is incomplete, corrupt, or incompatible with the rules, **when** verification or download fails, **then** the app continues using the last working release and the maintainer sees the cause and can retry.
3. **Given** a new Pyfa release changes or fixes a calculation, **when** the maintainer verifies compatibility and publishes matching rules and data, **then** the reference fit reproduces the expected behavior, the reference version is visible, and the previous working combination can be restored.

### Analyze and Transfer Fits (P2)

The player compares fits, evaluates performance under specified conditions, and transfers configurations between the app, Pyfa, and the game client.

**Independent test** · Import a fit from Pyfa, compare it with an edited copy, change simulation conditions, and export the copy back.

1. **Given** two fit variants, **when** the player compares them under one skill profile and the same conditions, **then** differences in equipment and calculated results are visible. Changing the target profile changes applied damage.
2. **Given** a fit with implants, boosters, external effects, or items with modified attributes, **when** the player changes one factor, **then** affected metrics recalculate and export lists any settings that the selected format cannot store.
3. **Given** an import with an unknown item type or malformed entry, **when** the player tries to import it, **then** the app highlights problematic entries, previews what can transfer, and asks for confirmation before a partial import.

### Use the App on a Phone and Offline (P2)

The player opens the same editor in a mobile browser, can add it to the home screen, and can return to saved fits with poor connectivity.

**Independent test** · Assemble and save a fit by touch on a phone, prepare the app for offline use, and reopen it without a connection.

1. **Given** the app is open on a phone 360 CSS pixels wide, **when** the player searches for a module, adds it to a slot, and opens the calculated stats, **then** each action works by touch without horizontal page scrolling.
2. **Given** the app and working data have loaded and been saved, **when** the connection is disabled and the browser restarts, **then** the player can open the library, edit and recalculate a fit, save it, and export text. Online actions indicate that they require a connection.
3. **Given** a browser supports PWA installation, **when** the player installs and opens it from the home screen or app list, **then** the editor opens. If the installed PWA has separate storage, the player can restore a backup exported by the browser.

### Edge Cases

- If a patch removes an item type or changes a constraint, retain the saved fit's original entries. Flag unresolved or incompatible items and mark the affected metrics incomplete until corrected.
- During an interrupted update, a storage shortage, or concurrent tabs using fits during a version change, each calculation uses one consistent data and rules version. The working version stays available. If saving fails, the player can export unsaved work from the open editor.
- On first launch without network or stored data, explain that the initial download is required if the app page is already available. The local library depends on browser storage and can be restored from a user backup.
- If access expires, requests are rate-limited, the in-game library is full, or ESI is unavailable, show the service's explanation when available and the next action. If the network drops after an upload, keep its outcome unknown until reconciliation with the in-game library to avoid duplicates.
- Cover slot changes caused by subsystem or mode switches, overheating, incompatible charges, drone and fighter limits, and zero-valued metrics in reference scenarios. Display unavailable results separately from zero.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001** · The app MUST open from a link in desktop and mobile browsers. The editor, local library, and calculation MUST work in the browser without an installed EVE client, Pyfa, an extension, or a local service. Where supported, players MUST be able to install and launch the PWA independently.
- **FR-002** · Players MUST be able to search and filter hulls and items by name and category, inspect attributes, and compare suitable alternatives. The editor MUST support ships including strategic cruisers and capitals, plus fittable structures from the Pyfa reference catalog.
- **FR-003** · The editor MUST support high, medium, low, rig, subsystem, and service slots, hull modes, charges, drones, fighters, and cargo. Players MUST be able to add, replace, move, and remove equipment, change quantities, and select available states including offline, active, and overheated.
- **FR-004** · Fit changes MUST recalculate CPU, powergrid, calibration, slots, hardpoints, drone and fighter limits, capacitor use and stability, damage and volley, ranges, hit points and effective HP, resistances, repair, speed, align time, and targeting. Show violated constraints and missing skills. Provide mining and remote support metrics where applicable.
- **FR-005** · Players MUST be able to select all skills 0, all skills V, an editable custom profile, or an EVE character profile. Calculations MUST apply skill levels, hull bonuses, implants, boosters, stacking penalties, and mutated Abyssal attributes.
- **FR-006** · Analysis MUST support comparing two or more fits under the same conditions, incoming damage profiles, environment effects, command bonuses, effects from other fits, and applied damage and capacitor charts. When distance, target properties, or active effects change, show the resulting values and current comparison conditions.
- **FR-007** · Players MUST be able to create, find, rename, duplicate, and delete local fits. Fits, drafts, custom profiles, and settings MUST persist between sessions. Players MUST be able to export and restore a backup. Before replacing local records, show the consequences and request confirmation.
- **FR-008** · The app MUST import and export EFT text, game XML including multiple fits in one file, and in-game DNA links. Preserve all fields the selected format supports. Preview losses and request confirmation for a partial transfer. An import error MUST leave existing fits available.
- **FR-009** · Players MUST be able to connect, switch, and disconnect multiple characters through official EVE SSO. Request only scopes used by the app, refresh available skills via ESI, and show the character, update time, and constraints reported by EVE. Players enter their password at CCP. Disconnecting stops requests on behalf of that character.
- **FR-010** · Through ESI, players MUST be able to list a selected character's game fits, import selected fits, upload fits, and delete a selected game fit. Writes and deletions require explicit actions showing the character and fit. Preview differences when the game format stores fewer fields than the local fit. Report the result after EVE responds.
- **FR-011** · The app MUST estimate fit cost using available public ESI prices. Mark missing prices as unknown, show when prices were retrieved, and identify partial totals.
- **FR-012** · After initial app and game data loading, players MUST be able to open, create, edit, calculate, save, and export local fits offline. If the connection or EVE service fails, identify the actions that require connectivity and keep local features available.
- **FR-013** · The interface MUST use a subdued neutral palette, readable labels, visible focus, and distinct text warnings. The desktop editor MUST support mouse and keyboard. Phone users MUST be able to perform primary actions by touch. Catalog, slots, and stats MUST remain accessible from 360 CSS pixels wide.
- **FR-014** · Maintenance MUST track Tranquility static data releases and stable Pyfa releases independently. Maintainers MUST see detected versions, changes, verification results, and failure reasons and be able to rerun checks. Compatible data MUST publish independently of an app release. A Pyfa version change MUST trigger checks of affected fits and calculation rules.
- **FR-015** · Before publication, verify catalog completeness, compatibility with the calculation rules, and expected results on reference fits. The app MUST show the active data and Pyfa reference versions, switch after complete download and verification, preserve user records, and support maintainer rollback to the previous working combination.

### Key Entities *(include if feature involves data)*

- **Fit** · A named ship or structure configuration containing slots, items, quantities, charges, and equipment states. A fit can reference a skill profile and calculation conditions.
- **Skill profile** · Skill levels and their source. EVE profiles include the character and the date of the last successful refresh.
- **EVE character** · An authorized Tranquility character with granted scopes and a personal in-game fitting library.
- **Calculation conditions** · The damage profile, target parameters, environment effects, external modules, and command bonuses.
- **Game data release** · A set of hulls, items, skills, attributes, and effects with a CCP release ID, build number, and date.
- **Compatibility version** · A verified pairing of a data release and calculation rules with the Pyfa release used to check results.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001** · On at least 30 reference fits with aligned data, rules, and inputs, all discrete constraints and statuses match the reference Pyfa version. Numeric metrics, including sampled chart points, are within 0.5% of Pyfa's value or half its displayed increment, whichever is larger. Zero and non-applicable values match semantically.
- **SC-002** · On each supported class of device after initial catalog loading, at least 95% of 40 equipment searches finish within 1 second and at least 95% of 40 typical fit edits update the visible metrics within 500 ms.
- **SC-003** · At least 8 of 10 first-time EVE players create, save, and export a specified fit in 5 minutes without assistance. Test at least five players on phones and five in desktop browsers.
- **SC-004** · All 12 transfer cycles with Pyfa and the game client preserve fields that the selected format represents. With two test characters, the selected character's skills and fits load, uploaded fits appear for the intended character, and deletion requires confirmation.
- **SC-005** · Two compatible data releases, including one sharing the previous build number, reach the app within 24 hours of appearing at the update source. Use CCP releases or controlled replays. During interruption, incompatible data, and rollback tests, reference fits, profiles, and settings remain accessible and the app displays active data and rules versions.
- **SC-006** · Within one business day of a controlled Pyfa logic change, the maintainer receives a compatibility result and affected scenarios. After matching rules ship, a rerun confirms the correction and retention of user data.
- **SC-007** · On every supported browser, reopening the editor offline allows players to find, edit, recalculate, save, and export a reference fit. After reconnection, edits remain in the library and EVE operations follow granted permissions.

## Assumptions

- The requested EVE API and database refer to EVE Online ESI and the official Tranquility Static Data Export (SDE). SDE supplies static data and Pyfa serves as the calculation reference. Identify CCP releases by release ID because releases can share a build number. [ESI documentation](https://developers.eveonline.com/docs/services/esi/overview/) · [CCP static data publication](https://developers.eveonline.com/blog/the-sde-over-http-static-data-dynamically)
- Scope covers fitting, related analysis, and character and game-fit integration in the requirements above. The reference corpus covers a regular ship, strategic cruiser, capital, fittable structure, overheating, charges, implants and boosters, an Abyssal item, target and environment effects, command bonuses, and multiple skill profiles. Pin a stable Pyfa release and comparable dataset before preparing fixtures. [Pyfa source](https://github.com/pyfa-org/Pyfa) · [Pyfa releases](https://github.com/pyfa-org/Pyfa/releases) · [EVE fitting transfer](https://developers.eveonline.com/docs/guides/fitting/)
- YAFT has its own subdued interface. The library belongs to the browser profile or separate installed PWA storage. Use backups to move between those locations or devices. Use the FR-008 fitting formats for desktop Pyfa exchange. [Installed web apps in Safari](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/)
- Acceptance uses current stable Chrome, Edge, Firefox, and Safari on desktop, Chrome on Android, and Safari on iOS. Measure performance on a typical desktop and midrange phone using the same dataset. Installation depends on browser capabilities.
- Integration depends on the availability of official EVE SSO and ESI, app registration, and user-granted scopes. Verify browser sign-in, access renewal, and fitting exchange with authorized test characters before committing to the integration architecture. [Official EVE SSO](https://developers.eveonline.com/docs/services/sso/) · [ESI operations](https://developers.eveonline.com/api-explorer)
- Pyfa code is subject to its license. Access to game data and materials is subject to CCP terms. [Pyfa license](https://github.com/pyfa-org/Pyfa#license) · [CCP developer terms](https://developers.eveonline.com/license-agreement)
