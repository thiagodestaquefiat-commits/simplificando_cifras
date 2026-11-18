# Compact event title alignment

Cause: the compact-title font shorthand in the early external stylesheet defined a 60px line-height, but the later base inline font shorthand reset it to 1.2. The container stayed 60px high while its text sat at the top.

Fix: make the compact title's 60px line-height explicit at its existing final component rule. No title/font size, header height, control positions or scrolling behavior changed.

Validation: event-compact-header-ui scrolls real event detail views with short/long names at 320/375/390/430/820px. Text center aligns with action controls, no back/chat overlap, long names retain ellipsis and all titles remain visible. Inspected the compact-header screenshot. index-syntax passes.
