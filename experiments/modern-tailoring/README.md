# Modern Tailoring card experiment

Branch: `design/modern-tailoring-card`. No deployment or merge is required to review locally.

From the repository root run `python3 -m http.server 8000 --bind 127.0.0.1`.
Open the served site with `?design=modern-tailoring#p=PR-3001` appended to its address.
With no hash, preview mode opens PR-3001 automatically. Use “Original design” / “New design” to compare. Remove the query parameter for the unchanged catalogue.

The experiment applies only to trousers model М93V (PR-3001 and its existing colour variants). It reuses modelVariants, localised product fields, sizeTiers, cart handlers, orderHTML, history routing and the zoom overlay. It does not change products, images, notifications or external integration configuration. The only index.html change loads an opt-in script; the stylesheet is loaded only in preview mode.

The real model has one photograph per colour, so the gallery shows 1 / 1. Navigation controls appear only when image2 exists. Swipe and keyboard navigation support two photographs without fabricating a second view. Gallery gestures do not navigate to another product. Unknown specification fields are omitted; legacy lin_ru/lin_en lining values are supported. Sizes are text, not individually selectable stock items. Existing pack quantities and cart behavior remain unchanged.

## Validation

Chromium headless: no horizontal overflow at 320, 375, 390, 430, 768 and 1440 px; catalogue data and product image loaded; original/new switch; fullscreen zoom; Russian/English rendering; PR-3001 → PR-3003 colour switch; existing order link destinations; add one pack to cart; normal catalogue search. No JavaScript page errors. `node --check experiments/modern-tailoring/card.js` and `git diff --check` passed.

Screenshots are stored outside the checkout in `/workspace/artifacts/modern-tailoring/` (old/new at 390 and 1440 px).

Limitations: the selected real model has no second photograph, so a real two-photo interaction cannot be demonstrated with its current data. Telegram host behavior, real iPhone safe-area rendering and outbound messaging are not verified by desktop Chromium. CDN SDKs are blocked in this environment; external service behavior is unverified. No production messages were sent.
