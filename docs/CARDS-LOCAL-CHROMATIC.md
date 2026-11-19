# Local chromatic transition experiment

APPLE DESIGN RESEARCH — Question: preserve legibility when labels overlap imagery.
Source read: https://developer.apple.com/design/human-interface-guidelines/typography
APPLE EXPLICIT GUIDANCE: test legibility in context; modify foreground/background contrast when needed.
DESIGN INFERENCE: a gradual reduction in image detail can support reading without a visible rectangular scrim. Apple implementation cannot be established from screenshots.
ROUDY-SPECIFIC DECISION: preserve assets, typography, palette and geometry; use two identically cropped duplicate image layers (3px and card-specific 7–12px blur), eased masks and contextual color blending. Signature remains above all treatments and unfiltered. No glow or border edits.
IMPLEMENTATION: index.html + css/search-menu.css in this independent copy only. No Git commits, PR or deployment.
