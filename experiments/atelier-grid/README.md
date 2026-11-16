# ATELIER catalogue grid

This is a presentation update to the existing catalogue in VANVION/vanvion.github.io, not another site or deployment. The user approved publishing this stage. It was developed on `design/atelier-catalog-grid`, based on main commit `d8af6a6`. A push to main does not by itself confirm completion of GitHub Pages deployment.

## Review

The normal catalogue address now uses the approved ATELIER grid and product details by default. `?catalog=atelier` remains an explicit equivalent for QA; `?catalog=classic` retains the old grid for comparison. A local server is solely a technical testing tool.

The script activates by default and exits before adding styles or wrapping functions when another explicit catalog mode is supplied. It reuses modelCardHTML, attachCardEvents, selectTileColor, openDetail and existing pack/cart handlers. Scoped CSS changes only grid cards: matte surfaces, uncropped product pictures, separate category/model/article/selected-colour metadata, 44px colour controls and pack buttons below the photograph. Names are keyboard-operable buttons. Selecting a variant updates its article, colour, image alt and pressed state.

Existing product grouping, search, filters, languages, NEW/TOP tags, pack addition, swipe and long-press behavior are retained. No product data, photographs, contact destinations or notification settings change. Header, sidebar and external integration controls are outside this stage.

## Checks

From the repository root:

```sh
npm ci --ignore-scripts --prefix tests/atelier-3
CHROMIUM_PATH=/usr/bin/chromium npm test --prefix tests/atelier-3
```

All 14 tests passed: the prior 12 checks for the approved product details, plus default grid variant/metadata/cart/detail/language/search checks and RU/EN grid layouts and a classic-grid fallback at 320, 390, 768 and 1440px with no page/card overflow and touch controls at least 44px tall. Tests block service workers and external requests for deterministic local behavior; physical touch, native Telegram and outbound integrations are not established by these checks.

Screenshots and test transcript are outside Git at `/workspace/artifacts/atelier-grid/`: before-390.png, after-390.png, after-1440.png, test-results.txt.

Activation has explicit user approval. Future changes and publication require authorization for their scope; do not assume this approval covers unrelated stages.
