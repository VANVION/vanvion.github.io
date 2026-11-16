# VANVION ATELIER 3.0

An isolated, mobile-first product-card prototype. It does not replace the normal catalogue or the Modern Tailoring preview.

## Preview

From the repository root:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Append `?design=atelier-3#p=PR-3001` to the served site address. With no hash, the preview opens PR-3001. The comparison control opens the existing card; RU/EN switches the current product immediately. Remove the query parameter to return to the ordinary catalogue. Do not publish or merge this branch without user confirmation.

## Architecture

`index.html` loads the opt-in script. It exits immediately outside `design=atelier-3`; its stylesheet is loaded only inside that mode. Styles are scoped to `.at-card` and `at-` components and define their own colour, spacing, type, border, radius and motion tokens. Futura PT remains the existing local font. No libraries are added.

The preview reuses PRODUCTS, getName, localised specification helpers, PALETTE, orderLinks, history routing, the existing product overlay, scroll locking, Telegram back navigation and fullscreen zoom. It adds keyboard focus handling to zoom in ATELIER mode. The ordinary catalogue's cart remains intact; the ATELIER card presents existing messenger channels rather than introducing checkout behavior.

The scope is the inspected М93V pair PR-3001 / PR-3003. Both have matching category, model, composition, fit, construction, lining, country and sizes. Their colour and photograph differ. A fixed allowlist plus field equality checks prevents an arbitrary same-model record or a future mismatched variant from becoming a colour option. Product JSON and photos are unchanged. The selected real model has one photo per article. A second photograph is supported only when image2 exists; no fictitious views or thumbnails are created.

WhatsApp uses the existing destination with localised model/article/colour text. Telegram and MAX keep the existing contact destinations; those routes do not support the same prefilled-message mechanism, so the prototype does not invent one.

## Validation

Chromium headless checks passed:

- RU and EN layouts at 320, 375, 390, 430, 768, 1024 and 1440 px without horizontal overflow.
- Real catalogue/photo loading, original-card comparison, size range and product specifications.
- One-photo mode without empty navigation controls; PR-3001 → PR-3003 updates article, image and contact text.
- A temporary in-memory image2 using another existing image exercised two-photo buttons, keyboard and touch swipe. This tests gallery behavior, not a second real view of the selected article. No fixture data was written to disk.
- Zoom open/close, keyboard focus containment and focus restoration.
- Mobile contact action brings the real WhatsApp link into view; reduced-motion preference is respected.
- A temporary mismatched size value excludes an unsafe colour variant.
- Default catalogue category/search/product detail and the previous Modern Tailoring preview still work. No JavaScript page errors in the main functional run.
- `node --check experiments/atelier-3/card.js` and `git diff --check` passed.

Screenshots: `/workspace/artifacts/atelier-3/` contains old/new cards at 390 and 1440 px, plus mobile details and contact screens.

Limitations: native Telegram Mini App behavior, actual iPhone safe-area rendering, live AI chat, push SDKs and real outbound messaging were not exercised. External SDK domains are restricted in this environment. Local viewport and DOM checks do not establish real-device behavior. No production messages were sent, no integration settings changed, no main-site deployment performed.
