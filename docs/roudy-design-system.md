# ROUDY — typography and surface roles

The canonical values live in `css/roudy-tokens.css`, loaded before the component styles. Component owners reference those roles and retain their own geometry, responsive sizes and interaction states.

## Typography

| Role | Family | Weight |
|---|---|---|
| Page headings — login, Busca, Home and event detail | `--font-heading` (Manrope) | `--weight-page-title` (800) |
| Song, playlist and navigation-card titles | `--font-ui` (Inter) | `--weight-title` (700) |
| Buttons and actions | `--font-ui` | `--weight-control` (600) |
| Body and secondary information | `--font-ui` | `--weight-body` (400) |

The four navigation-card captions have the same family, body weight and minimum size of 12 px. The light Playlists artwork retains dark foreground text for contrast.

The UI stacks put Inter first instead of changing families between platform fonts and Inter. The system stack remains a fallback when the web font is unavailable. Musical reading styles keep their existing monospaced alignment and dedicated lyric styles. Barlow Condensed and Bungee remain owned by editorial artwork.

Sizes remain local to the component so a mobile card title and a full-page heading do not become the same size. Existing reading-size settings and responsive media queries remain in place.

## Surfaces

| Role | Value |
|---|---|
| Page background | `--ui-background`: #0B0B0C |
| Elevated sheet / modal | `--ui-surface`: #191A1C |
| Field / control | `--ui-control`: #242426 |
| Pressed control | `--ui-control-active`: #343438 |
| Idle search bar | `--ui-search-rest`: #414047 |
| Artwork placeholder | `--ui-artwork`: #202124 |
| Decorative music note | `--icon-placeholder`: #505156 |

The brighter idle search bar is an explicit product state. Event lights, artwork palettes, the login's blue light and other content treatments remain separate from neutral UI surfaces.

Form aliases (`--rf-*`) and legacy aliases (`--bg`, `--text2`, etc.) point to these canonical roles. They no longer introduce independent palettes. Simple form fields now share the control fill, readable placeholder and 44 px minimum height.

## Ownership and cascade

- `roudy-tokens.css` owns role values and compatibility aliases.
- `roudy-color-system-preview.css` owns existing cross-component semantic colors; its former duplicate token block was removed.
- `roudy-forms.css` owns form rendering and loads after the semantic component layer. Form and AI visual declarations use ordinary specificity; structural hidden rules remain explicit.
- `login-gate.css` owns the complete gate, including its hidden state and layout. The obsolete inline gate and Google-button presentation were removed.
- `home-playlists.css` owns the consolidated Home and playlist heading rules.
- `search-menu.css` owns the idle/active search states, typography and card captions.
- The final event-header rule owns the page title's Manrope family and 800 weight; a competing earlier title declaration was removed.
- Navigation colors are supplied by the semantic layer instead of competing inline colors on the UI-scale selector.

The old purple and intermediate monochrome root palettes and the superseded DM Sans body declaration were removed. The obsolete generic modal gradient was removed. Migrated styles reference semantic values rather than defining another nearly identical gray.

## Validation

`tests/roudy-design-system-ui.test.js` exercises the real page at 320, 375, 390, 430, 768 and 1440 px. It checks computed font roles, equal card-caption weights, active/idle search surfaces, form input usability, a shared surface-token change reaching both modal and event sheet, event-header typography, musical reading and the existing light-mode mechanism.

Existing search-navigation, song-to-playlist and Study-navigation UI tests cover the affected workflows. Core checks cover authentication, playlists, sync, events, theme settings and HTML/JavaScript syntax. Updated visual expectations now use the canonical control surface and text-primary color.

## APPLE DESIGN RESEARCH

**Question:** How should a custom dark interface keep a consistent typographic hierarchy while preserving musical alignment and meaningful surface depth?

**Sources consulted:** Apple HIG Typography, Color and Dark Mode. Typography was searched and read for this implementation; Color and Dark Mode were searched and read during the preceding audit in this conversation.

- https://developer.apple.com/design/human-interface-guidelines/typography
- https://developer.apple.com/design/human-interface-guidelines/color
- https://developer.apple.com/design/human-interface-guidelines/dark-mode

**Apple explicit guidance:** Minimize the number of typefaces, convey hierarchy with size/weight/color, preserve relative hierarchy as text sizes change, use colors consistently by semantic purpose, and test legibility in context.

**Design inference:** A shared family and weight per UI role improves continuity, while a monospaced musical layout has a separate alignment requirement. Common surface roles make equivalent sheets recognizable across workflows.

**ROUDY-specific decision:** Manrope 800 for page headings, Inter for the UI with three functional weights, preserved musical/editorial typography, a common neutral surface scale and a brighter explicit idle-search state.

**Implementation:** Canonical tokens, component-owner migration and removal of obsolete competing declarations. Routes, persistence, permissions and application logic are unchanged.
