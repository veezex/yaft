# Acceptance status

## Local desktop performance

The build used CCP release 20261120T165826Z with eve-fit-engine 0.2.28.
Chromium 159.0.8154.6 ran on an Apple silicon Mac with macOS 27.2.1
and a 1440×900 viewport. The first catalog load was outside the sample.
Timings include Playwright input and visibility checks.

| Measured action | Samples | p95 | SC-002 target |
|---|---:|---:|---:|
| Alternate Rifter and Punisher in hull search | 40 | 29 ms | ≤ 1 s |
| Toggle a Small Armor Repairer II between active and offline, then observe the updated repair rate | 40 | 31 ms | ≤ 500 ms |

The corresponding measurement on a physical midrange smartphone is
pending. SC-003 still requires ten first-time EVE players, including at
least five on mobile and five on desktop.

## Release checks

The local baseline passed 121 comparisons against Pyfa v2.70.0 on seven
aligned-data fits. The complete 30-fit corpus and advanced effect and
capacitor timeline cases remain open. The twelve codec cycles use local
format fixtures.

See [offline browser results](../../tests/e2e/browser-acceptance.md),
[live EVE prerequisites](../../tests/e2e/esi-live.md), and
[catalog release verification](../../tests/e2e/catalog-release.md)
for the outstanding acceptance work.
