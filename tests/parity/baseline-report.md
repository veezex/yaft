# Pyfa baseline

The seven reference fits use Pyfa v2.70.0 at commit
`e5483f8666ed2eda99c98985c59a29b07e3bb844`. The bundled Pyfa data was from
build 3682781. The reference database was rebuilt with Pyfa's own database
builder after translating the pinned CCP HTTP snapshot
`20261120T165826Z` (build 3724492). The fixture records the CCP table
fingerprint, downloaded Pyfa source archive digest and rebuilt database digest.

`npm run test:parity` passed 121 explicit checks on a bare hull, a passive
damage control, an active microwarpdrive, a charged weapon, an active
drone group, a mining laser and a remote shield booster. Checks cover fitting resources, defenses, capacitor, navigation,
targeting, DPS and total volley. The built Worker also returned the expected
bare Rifter CPU output in Chromium and WebKit. On this host, Playwright's
Firefox process exited during profile initialization.

The release corpus must still exercise overheated states, custom skills,
structures, Abyssal items, projected and command effects, and graphs. The
browser baseline covers catalog loading, search and calculation.
