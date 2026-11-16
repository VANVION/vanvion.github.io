# VANVION ATELIER — catalogue product cards

Mobile-first product details for the existing VANVION catalogue on GitHub Pages. The catalogue grid, data source, filters and order destinations are retained.

## Repository and publication status

ATELIER 3.0 commit `1f26bf560ea32c6daaea92e88f5a1b4890d6ba24` was pushed to GitHub and is already in `main`. The original `design/vanvion-atelier-3` branch and `main` pointed to that same commit when stabilization began; the lack of differences between them is expected.

ATELIER 3.1 stabilization was developed in `fix/atelier-3-stabilization`; the full-catalogue extension and default activation were developed in `design/atelier-catalog-cards`. The user explicitly approved activation on the existing site. Future publication or changes to main still require user authorization. A Git push is not proof that Pages has deployed successfully.

GitHub Pages deployment needs a separate verification. The last public check was blocked by the environment's proxy (`Tunnel connection failed: 403 Forbidden`). This does not establish that the public site is broken, or that a deployment succeeded. Do not trigger a new deployment to work around the check.

## Preview

From the repository root:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open the local server normally: the catalogue remains the landing view and product details use ATELIER by default. A direct product link uses `#p=PR-3001` without a design parameter.

`?design=atelier-3#p=PR-3001` is retained for explicit comparison/QA; only this explicit mode auto-opens PR-3001 if no hash is supplied. The comparison control switches to the existing card; RU/EN switches the current product immediately.

`?design=classic#p=PR-3001` retains the original product detail, while `?design=modern-tailoring#p=PR-3001` retains the earlier experiment. These are modes of the same existing site, not separate deployments.

## Architecture

`index.html` loads the product-card script. It activates for normal URLs and explicit `design=atelier-3`, and exits for other explicit design modes. Its stylesheet is only loaded when active. Styles are scoped to `.at-card` and `at-` components and define their own colour, spacing, type, border, radius and motion tokens. Futura PT remains the existing local font. No runtime libraries are added.

The preview reuses PRODUCTS, getName, localised specification helpers, PALETTE, orderLinks, history routing, the existing product overlay, scroll locking, Telegram back navigation and fullscreen zoom. It adds keyboard focus handling to zoom in ATELIER mode. The ordinary catalogue's cart remains intact; the ATELIER card presents existing messenger channels rather than introducing checkout behavior.

The stabilized view covers every product in the existing catalogue (179 records at validation: 7 trousers and 172 jackets). ATELIER is enabled by default following explicit user approval; entering the catalogue does not automatically open a product.

Colour choices reuse the existing modelVariants grouping and additionally require exact matches for category, model, composition, fit, construction, lining, country, height and sizes. A product with no model is shown on its own. Same model names with different characteristics are not presented as interchangeable variants. Product JSON and photos are unchanged. Real second photographs use image2; no fictitious views or thumbnails are created. Sizes, including НОРМА/БАТАЛ, retain their existing formats.

WhatsApp uses the existing destination with localised model/article/colour text. Telegram and MAX keep the existing contact destinations and do not receive prefilled product details. The RU/EN interface now states this explicitly; users must include those details in Telegram/MAX messages themselves. Contact addresses and routing have not changed.

## 3.1 image stabilization

The photo stage reserves its responsive height independently of the image. Explicit hidden rules prevent the image and error overlay from occupying space while hidden. A single polite live-status message overlays the existing stage on failure; repeated errors do not append more messages. Loading and unavailable photos are marked `aria-disabled` and cannot open zoom, while the trigger stays keyboard-focusable. Gallery navigation remains accessible. Selecting another photo clears the error and restores the zoom label and affordance only after a successful load. No product data, pictures or integration settings are modified.

## Reproducible regression tests

Requirements: Node.js 22 or newer and Chromium. Tests use Node's built-in test runner and the pinned Playwright dev dependency in `tests/atelier-3/`; no application build or test framework is added to the catalogue.

```sh
cd tests/atelier-3
npm ci --ignore-scripts
# Use an installed Chromium (as in the prepared cloud environment):
CHROMIUM_PATH=/usr/bin/chromium npm test
```

Alternatively install Playwright's matching browser once, then omit CHROMIUM_PATH:

```sh
npx playwright install chromium
npm test
```

The runner starts and stops its own loopback HTTP server on a free port; no separately running app server is required. External network requests and service workers are blocked in test contexts to keep photo failure injection deterministic and avoid production SDK calls. Error messages in the browser network console for deliberate HTTP 404 fixtures are expected; JavaScript page errors fail every test.

Twelve tests cover:

- Default catalogue landing, category/search and ATELIER detail without a design parameter; explicit classic and previous Modern Tailoring modes remain available.
- Real PR-3001 ↔ PR-3003 switching, sizes, RU/EN, precise contact text and unchanged contact routes.
- Zoom keyboard activation, Tab/Shift+Tab containment and focus restoration.
- Loading → first-photo failure → working second photo, with unchanged stage/gallery/heading geometry.
- Second-photo failure, repeated error events, recovery and variant switching.
- Failed PR-3001 → working PR-3003 → failed PR-3001.
- RU/EN successful and failed-photo layouts at 320, 390 and 1440 px without horizontal overflow.

For two-photo checks, only intercepted JSON responses and local image responses are changed. The fixture reuses an existing picture to test mechanics; it is not a new product photograph. No product/image files are written. Geometry assertions compare stage height, gallery height and heading position with a tolerance below 1 px. Changing from a two-photo fixture to a one-photo variant intentionally removes navigation buttons; only photo-stage height is required to remain identical across that change.

The 3.1 run passed nine tests. The all-products extension additionally checks every real product in RU/EN at 320, 390 and 1440 px, and exercises a real two-photo jacket with НОРМА/БАТАЛ sizes and original-card comparison. The extension passed all eleven tests. Default activation adds a twelfth check covering legacy modes, and updates the default-catalogue check to require ATELIER without automatically opening a product. The activation run passed all twelve tests, with zero failures, skips or JavaScript page errors. Syntax and whitespace checks also passed. Acceptance screenshots and the test transcript are stored outside the checkout in `/workspace/artifacts/atelier-3.1/`. The before screenshots use the exact 3.0 JS/CSS from commit `1f26bf5` served through browser interception; after screenshots show the local 3.1 working tree.

## Remaining limitations

Native Telegram Mini App behavior, actual iPhone safe-area rendering, real touch devices, live AI chat, push SDKs and real outbound messaging were not exercised. Full accessibility and performance audits are outside this stabilization pass. External SDK domains and the public Pages URL are restricted in this environment. Local viewport checks do not establish real-device behavior. No production messages were sent and public deployment status must be checked independently of local tests.

All-product acceptance screenshots and the current test transcript are stored outside the checkout in `/workspace/artifacts/atelier-all-cards/`. Default activation has explicit user approval. Future changes and publication require authorization for their scope.
