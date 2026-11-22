# Browser acceptance

Local automated checks used Playwright 1.65.1 on macOS 27.2.1
(Apple silicon). Chromium 159 and WebKit 27.2 passed the editor,
backup transfer, catalog update, exchange, and offline restart
flows. The offline test used a 360 CSS-pixel viewport, disabled
networking, closed the original page, and reopened the app in the
same browser context. A separate test moved a backup into a clean
browser context.

Playwright's Firefox 159 launcher exited during profile startup
on this host. Desktop Edge, installed Safari, Android Chrome and
iOS Safari still require real-browser acceptance. Physical device
installability and return from EVE SSO to an installed PWA are
pending.
