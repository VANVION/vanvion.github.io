# ATELIER navigation — review stage

Prepared on `design/atelier-navigation` from the current main (`5021ae0`). This is an update to the existing VANVION catalogue and GitHub Pages site, not a new site, hosting service or application. Publishing this stage requires separate user approval.

## Review

Append `?navigation=atelier` to the existing catalogue address in the local technical test server. Without that parameter, this script returns before adding styles or changing DOM/handlers; the approved product cards and grid remain in their current default form.

The preview scopes matte styling to the header, sidebar and result count. Search has a compact visible placeholder, a descriptive accessible label and visible focus. Categories retain their actual product counts and existing handlers. Native details/summary controls group lining, fabric and colour; on mobile the groups start closed, on desktop they start open. Selected values appear in each summary. Groups with no applicable controls are hidden. Language changes rerender the labels, and resizing switches the layout without replacing filter state.

The common reset clears search, fabric, colour and lining while retaining the selected category, then focuses the search field. It only resets existing filter variables and uses the existing render pipeline. No product data, pictures, contact destinations, integration settings or order behavior change.

## Validation

Run the repository's existing tests from its root:

```sh
CHROMIUM_PATH=/usr/bin/chromium npm test --prefix tests/atelier-3
```

The full suite passed 16 tests with no JavaScript page errors. Two navigation checks cover real combined lining/fabric/colour filters, exact article search, reset, RU/EN, the language menu, Enter toggling summary controls, isolation from the default site, and layouts at 320, 390, 768, 1024 and 1440 px. No page overflow was observed; category buttons are at least 44px high. After shortening the search placeholder, the two navigation tests were rerun successfully.

Screenshots and transcripts are outside Git at `/workspace/artifacts/atelier-navigation/`: before-390.png, after-390.png, filters-390.png, after-1440.png, test-results.txt and focused-test-results.txt.

Real iPhone/Telegram, screenreader announcements and physical touch gestures remain outside the automated Chromium validation. External production services are not exercised. Do not activate this presentation by default, send it to main or publish merely to show the review stage.
