# Search navigation cards — editorial composition

The four cards use light backgrounds and typographic artwork, a large category word, the original RD signature with the destination name, and a separate muted-color footer. The footer preserves the existing live library/playlist/medley counts and upcoming-event information, including loading and error states.

The two-column layout and existing compact widths are retained. Artwork uses a 3:2 composition; the information footer reserves enough space for three lines on small screens. Corners are less rounded than the previous photographic cards. Each complete card remains one navigation button with its existing accessible label and description.

Barlow Condensed belongs to ROUDY's existing editorial-art typography. Inter remains the signature-label and metadata typeface. The graphic words fit the actual loaded font and are remeasured on font load and resize, so offline fallback faces cannot clip. Brand colors are preserved in the existing light-theme mechanism with `data-keep-colors`.

The four original photographic/vector assets remain in the project. The Search navigation cards now render typographic compositions in their place.

## Files

- `index.html`: four typographic artwork regions and signature rows; existing metadata IDs and click handlers retained.
- `css/search-menu.css`: artwork, signature, colored footer and pressed/focus states.
- `js/search-menu.js`: visual word fitting; existing navigation/data behavior retained.
- `service-worker.js`: refreshed stylesheet/script URLs and cache version.
- `tests/search-menu-ui.test.js`: updated containment, metadata, signature and navigation checks.

## Validation

Search UI integration at 320, 375, 390, 430, 1107 and 1440 px, including blocked web fonts, original SVG signature, all four destinations and real dynamic metadata fixtures. Shared design-role integration passes at six mobile/desktop widths. A mobile capture with the actual editorial font was visually inspected.

The footer palettes are intentionally darker than the large reference cards because ROUDY's compact cards use small metadata text. Calculated white/solid-footer contrast ratios are 5.65:1 for Músicas, 6.30:1 for Playlists, and 6.34:1 for Medleys and Eventos. These calculations exclude display effects.

## APPLE DESIGN RESEARCH

**Question:** How can editorial artwork and brand signatures distinguish four compact navigation buttons while keeping their function, touch areas and text hierarchy clear?

**Sources consulted:** Apple HIG Buttons was searched and read for this change. HIG Typography and Color were retrieved and read earlier in this conversation and inform the shared hierarchy and contrast decisions.

- https://developer.apple.com/design/human-interface-guidelines/buttons
- https://developer.apple.com/design/human-interface-guidelines/typography
- https://developer.apple.com/design/human-interface-guidelines/color

**Apple explicit guidance:** Clearly communicate button function through content/style, provide enough separation and usable hit areas, include a pressed state, and maintain legibility and coherent hierarchy.

**Design inference:** Separate typographic artwork from dynamic information to keep category identity stable while counts and dates change. Use the same dimensions and composition for peer destinations.

**ROUDY-specific decision:** Original RD signature in place of the reference brand symbol, ROUDY destination names in the signature row, light typographic artwork and muted footer palettes. Each card opens its existing destination rather than introducing playback behavior.

**Implementation:** Replaced the four Search card presentations and validated their containment and existing navigation.
