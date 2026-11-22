# Third-party notices

YAFT application code is distributed under the GNU General Public License,
version 3 or later. The corresponding application source includes this
repository, its lockfile, and its build scripts. Publish that source with the
matching build whenever distributing the application.

The application uses [eve-fit-engine 0.2.28](https://github.com/capsuleers-app/capsuleers.fitting-engine/tree/64981d2887c544d56e64e47b53f57f162bb386b4)
under GPL-3.0-or-later. Its notice and license are included in the pinned npm
package. The lockfile records its exact package integrity.

The bundled catalog derives from the
[CCP Tranquility Static Data Export](https://sde.evetech.net/tranquility/20261120T165826Z/).
EVE Online and the EVE logo are registered trademarks of Fenris Creations.
All EVE-related materials are the intellectual property of Fenris Creations,
which has no affiliation with YAFT. Use of CCP data is governed by the
[EVE Online Developer License Agreement](https://developers.eveonline.com/license-agreement).
The catalog in `public/catalog/` is distributed under those terms.

The parity fixtures were calculated with
[Pyfa v2.70.0](https://github.com/pyfa-org/Pyfa/releases/tag/v2.70.0).
They record the source commit, CCP data fingerprint and the derived reference
database checksum. Pyfa is used as a local reference and is not part of the
browser bundle.

React and React DOM are MIT licensed. The EVE XML parser
[saxes](https://github.com/lddubeau/saxes) is ISC licensed.

## saxes 6.0.0

Copyright (c) Contributors

Copyright (c) Isaac Z. Schlueter and Contributors (sax)

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR
IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
