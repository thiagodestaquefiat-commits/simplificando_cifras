# Geometry-derived volumetric bevel

## Implementation

The four existing .roudy-search-shortcut buttons retain their image assets, panel colors, artwork/blur crop, signature, fonts, text, play controls, grid, dimensions, spacing and border radius. Removed the previous diagonal-gradient masked ring and the stack of external box shadows. No borders or outlines render the finish.

js/card-bevel.js generates a transparent illumination map from the actual rendered rounded rectangle. It computes signed distance to the silhouette and a 5 CSS px peripheral height profile, z(d)=2.4*sin(pi*clamp(d/5)/2). The front face is flat. Finite differences give the height-map normals, used in a normalized diffuse dot product with one distant light from upper left. A small smooth occlusion term and intensity cap keep it satin; no specular term. The front face and outside silhouette are alpha zero. No image/canvas sampling of artwork occurs.

The map is rendered once as a PNG at device pixel ratio (capped at 3), reused by equal-size cards, cached with a 16-entry bound, and regenerated only on geometry changes. ResizeObserver batches updates in requestAnimationFrame; no continuous render loop, filter animation or external dependency. CSS draws the one non-interactive map over the complete card. Its neutral translucent pixels affect only the curved region.

## SVG investigation and chosen alternative

Reviewed feGaussianBlur/feDiffuseLighting/feComposite architecture: a blurred rounded-rectangle alpha field can provide a geometric height map, and feDiffuseLighting computes diffuse illumination from that alpha. Its opaque result needs baseline compensation and peripheral compositing to leave the center unchanged. A shared objectBoundingBox filter would also need size-aware kernel/bevel handling to keep a fixed CSS-pixel width as card dimensions change.

Chose the explicitly permitted precomputed-map alternative for tighter control: analytic geometry gives continuous corner normals and a transparent center directly, with one cached texture rather than live per-card filter graphs. This is an engineering tradeoff, not a claim that SVG lighting is unsupported. Source: https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/feDiffuseLighting and https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/surfaceScale.

## APPLE DESIGN RESEARCH

Question: Como comunicar arestas sólidas sem fazer o conteúdo parecer vidro ou relevo na fotografia?

Sources consulted: Apple HIG Materials (search + read, design/human-interface-guidelines/materials); MDN SVG diffuse-lighting technical references above.

Apple explicit guidance: Materiais comunicam profundidade/hierarquia; Liquid Glass na camada de conteúdo pode causar complexidade e confusão de hierarquia.

Design inference: Um mapa exclusivamente geométrico preserva a imagem como superfície editorial, reservando volume às extremidades.

ROUDY-specific decision: Acabamento acetinado de baixa intensidade em 5px; sem componente especular, glow, aro ou contornos. Mesma geometria e identidade atuais.

Implementation: js/card-bevel.js, css/search-menu.css, script/cache references in index.html and service-worker.js.

## Validation

- card-bevel.test: transparent center/exterior, bounded peripheral region, correct light/shadow directions, continuous decay toward face and no exterior corner halo.
- search-menu-ui: six viewport widths, no border/ring masks/box-shadow stack, geometry and artwork containment, all four routes, press interaction and reduced motion.
- card-bevel-captures: original without finish; with finish; upper/lower corners; full mobile composition at 390 CSS px and DPR 3 against #0B0B0C. Inspected comparison and refined the profile to eliminate an isolated lower shadow band.
- Pixel comparison: zero changed pixels in sampled flat front-face region between original and bevel screenshots.
- index-syntax passes.

Safari/iOS hardware and Playwright WebKit are not installed in this environment, so this is not a claim of device validation. Runtime uses ordinary Canvas2D, PNG background image and ResizeObserver rather than SVG lighting filters; actual iPhone visual review remains appropriate.

Captures are in the session visualization directory: bevel-original.png, bevel-volumetrico.png, bevel-canto-superior.png, bevel-canto-inferior.png, bevel-mobile.png and bevel-comparacao.png. No main-branch merge or production deploy.
