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

## Category artwork update

APPLE DESIGN RESEARCH

Question: Como preencher o topo dos cards com uma identificação gráfica sem repetir o nome da categoria?

Sources consulted: Apple HIG Icons, design/human-interface-guidelines/icons (search + read).

Apple explicit guidance: Formas simples e reconhecíveis; metáforas relacionadas ao conteúdo; consistência de peso e detalhe.

Design inference: A arte pode reaproveitar os símbolos já aprovados em escala maior, separada da assinatura de marca.

ROUDY-specific decision: Nota musical de música aprovada, símbolo de playlist aprovado, disco de medley e calendário de evento. Manter cores das categorias, assinatura RD + nome e frases no rodapé.

Implementation: SVG decorativo acima da assinatura, sem nomes duplicados nem novas ações. Validado visualmente no Chrome e pela suíte search-menu-ui em seis larguras.

## Original album artwork

A pedido do usuário, os símbolos ampliados foram substituídos pelas quatro artes originais (silhueta da banda, composição clara, ondas azuis e instrumentos). As versões album preservam a imagem incorporada e removem apenas o recorte arredondado interno, pois o card externo já recorta as bordas. Assinatura e textos continuam separados. Inferência de design: identificar a categoria pela arte familiar preserva a identidade visual do ROUDY; a referência HIG Icons consultada acima informa clareza, sem prescrever capas de álbum. Validado visualmente e pela suíte de navegação responsiva.

## Progressive image blur (replaces white fade)

Only the transition treatment changed. Original assets, crop, signature, type, card dimensions, corner radius, spacing, metadata, panel colors and play controls remain unchanged.

Layers: original sharp image; same-source duplicate with exactly matching object-fit/object-position and box, blurred at 8px and progressively revealed in the last 30%; transparent-to-panel-color fusion above both. The art clips the blur overflow. The opaque footer and signature remain outside the filtered layers. Removed the old white image mask and footer overlap gradient. No render JavaScript or dependencies.

Adjustments: --card-panel-color aliases the existing per-category footer color; --card-blur-strength defaults to 8px; --card-transition-height defaults to 30%.

APPLE DESIGN RESEARCH

Question: Como aplicar o acabamento solicitado sem desfocar textos e controles?

Sources consulted: Apple HIG Typography, Ensuring legibility (Apple Docs search + read, design/human-interface-guidelines/typography).

Apple explicit guidance: Testar legibilidade em diferentes contextos e considerar contraste quando o texto fica difícil de ler.

Design inference: Limitar filtros às imagens mantém a nitidez da assinatura e dos controles. A Apple não prescreve esta receita CSS nem valores de blur.

ROUDY-specific decision: Implementar exatamente as três camadas solicitadas, preservar o desenho e usar a cor existente de cada painel.

Implementation: index.html adiciona camadas decorativas; search-menu.css compõe máscara/blur/fusão; service-worker.js atualiza o cache; search-menu-ui verifica fonte idêntica, enquadramento, original sem filtro, blur limitado, ausência do pseudo-elemento branco, geometria em seis larguras e navegação existente.
