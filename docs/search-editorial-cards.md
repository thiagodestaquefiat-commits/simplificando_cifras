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

## Mobile width correction

Cause: the legacy 60vw grid cap left each card only 30vw wide; the play column further reduced metadata width. The unavailable state wrapped mid-word and stretched the row.

Correction: two columns use the available content width (retaining the 420px desktop cap and existing gap). Metadata spans the footer width; subtitle and play share the second row. Words wrap at spaces. Original image aspect, assets and transition remain intact.

APPLE DESIGN RESEARCH
Question: Como impedir quebra excessiva sem reduzir a legibilidade dos textos no mobile?
Sources consulted: HIG Typography / Ensuring legibility, já recuperada e lida nesta tarefa.
Apple explicit guidance: Testar legibilidade em diferentes contextos.
Design inference: Dar largura real ao conteúdo evita tentar resolver falta de espaço diminuindo a fonte.
ROUDY-specific decision: Remover o limite antigo de 60vw e separar os espaços da contagem e do play.
Implementation: search-menu.css; suíte valida Dados indisponíveis de 320 a 430px, palavra inteira e ausência de overflow, além de navegação e seis larguras existentes.

## Card footer and signature contrast

The old white button background was exposed below shorter footer contents on some layouts. Card background now uses its exact panel color, footer stretches to fill its track, and native button appearance is disabled. The signature moves within the lower end of the existing artwork box, where the fusion is already fully opaque (88%). Its gray is derived from the canonical primary/secondary text roles instead of the old dark gray that disappeared over silhouettes and blue waves. No white band, glow or changed assets; typography size remains unchanged.

Validation: responsive search suite verifies bottom edges match, card/panel share background color, bright signature sits on opaque panel, source/blur crops still match, and all four routes work. Browser visual inspection confirms the corrected composition. Apple HIG Typography / Ensuring legibility consulted earlier in this task informs the contrast correction; exact blending/position are ROUDY-specific implementation decisions.

## Inset card frame

APPLE DESIGN RESEARCH

Question: Como adicionar profundidade apenas nas extremidades sem mudar a superfície editorial ou a área de conteúdo?

Sources consulted: Apple HIG Materials, design/human-interface-guidelines/materials (search + read).

Apple explicit guidance: Materiais podem estabelecer profundidade/hierarquia; Liquid Glass não deve ser aplicado na camada de conteúdo, pois pode adicionar complexidade e confundir hierarquia.

Design inference: Para os cards de conteúdo, contornos discretos e sombras curtas nas bordas atendem ao acabamento solicitado sem superfície de vidro.

ROUDY-specific decision: Dois contornos de 1px desenhados sobre o card inteiro, interno a 3px; raio derivado do existente, sombra curta de baixa opacidade. Nenhum filtro novo sobre as artes nem mudança de composição.

Implementation: css/search-menu.css centraliza --card-radius e duas camadas decorativas sem consumo de layout, pointer-events:none. Sombra externa 0 2px 6px/16% e contorno preto/22%. Interna 0 2px 3px/20%, 1px 0 2px/10% e filete inferior/5%. Preserva feedback de opacidade/scale(.985), acrescenta transição 150ms e suprime escala quando movimento reduzido está ativo. index.html e service-worker.js apenas atualizam versão do CSS/cache.

Validation: search-menu-ui testa raios, espessura, inset, geometria inalterada, camada sem captura de clique, pressionamento normal e movimento reduzido, seis larguras e rotas existentes. Inspeção visual dos quatro cards; index-syntax passa. Nenhum asset modificado.

## Sharp vector signature and hierarchy

Cause: assets/icons/roudy-rd-premium.svg contains embedded raster images and filters; its small mask looked soft. Search cards now use the existing assets/search/rd.svg, a path-only vector, without editing either asset. The mask preserves currentColor. RD size increases to 1.45em by .98em; category title is 10.5cqw instead of 7.5cqw, retaining Inter 700 and the approved light gray. The signature remains in the artwork layer, explicitly unfiltered, and gets 18% of the artwork height to avoid clipping. Metadata and hint sizes/weights remain unchanged. Card geometry, frame, imagery and blur remain unchanged.

APPLE DESIGN RESEARCH
Question: Como separar identidade da categoria e metadados sem perder nitidez em tamanhos pequenos?
Sources consulted: Apple HIG Typography (search + read; returned Ensuring legibility section).
Apple explicit guidance: Tamanho e peso afetam legibilidade; testar em diferentes contextos e considerar tamanho/contraste quando necessário.
Design inference: Um monograma em caminhos vetoriais evita reamostrar imagem embutida; tamanho visivelmente diferente distingue assinatura de contagem.
ROUDY-specific decision: Reutilizar RD vetorial existente e aumentar somente a assinatura, mantendo as demais camadas.
Implementation: CSS compartilhado, versão/cache e testes.
Validation: search-menu-ui confere path-only SVG sem image/filter, filtro none da assinatura, proporção de tamanho maior que metadados, contenção nos cantos, seis larguras, reduced motion e navegação. Inspeção visual dos quatro cards.

## Revised edge to match supplied card reference

The user rejected the detached 3px inner frame. Replaced it with a continuous 1px edge highlight, using a masked CSS gradient whose center is fully excluded; no gradient paints the content surface. The short inner shade is attached at 1px from the edge rather than outlining a separate rectangle. Original radius, image, composition, dimensions and interaction remain unchanged. Outer shadow stays short. This mechanically follows the new reference; prior HIG Materials research remains applicable without implying Apple prescribes these values.

Validation: Chrome search-menu suite checks center-excluding mask, continuous contour, attached radius, geometry and all four routes across six widths, including reduced motion. Visual inspection confirmed removal of the detached inner frame.

## Lightly elevated piece (latest approved reference)

Removed the inset shadow completely. A single 1px neutral contour at 10% opacity follows the outer edge; there is no detached rim or highlight. External shadows are 0 8px 18px -5px at 32% black and 0 2px 5px at 12% black, giving soft separation predominantly below the card on the near-black background. Corner radius is now clamp(12px,3.6vw,18px) for the rounded continuous silhouette requested. No layout dimensions, typography, assets or blur were changed. RD/title retain the explicitly measured #4A4A4A.

Validation: search-menu-ui confirms no inset shadows on either card or edge, no second contour, soft external shadow and rounded radius; geometry/content/routes/reduced motion remain passing across six widths. Visual inspection performed. This applies the user's approved elevation specification; previous HIG Materials research distinguishes depth/hierarchy from content-layer glass.

## Visible tonal frame requested after the faint contour

The prior 10%-opacity contour was too faint for the user's reference. New single continuous frame is 2px wide; a center-excluding mask confines tonal variation to the perimeter. Tones derive from each panel with subtle lighter top/left and deeper side/lower shading, avoiding an independent silver color or second inner line. No inset shadow, surface gradient or changes to layout/assets/blur/type. Existing external elevation and press behavior remain.

Validation: Chrome suite confirms one masked ring with 2px padding and transparent center, unchanged geometry, no inset shadows, routes and reduced motion across six widths. Visual comparison confirmed the perimeter is visible without detached parallel lines. Implements the user's explicit reference correction; prior Materials research applies.
