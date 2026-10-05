# ROUDY UX/UI Research Policy

## Core principle

Research before meaningful design decisions. Apple informs the decision; Apple does not make the decision. ROUDY's users, product context, identity, and existing architecture determine the final implementation.

## When Apple research is required

Before implementing a new or materially changed UX/UI decision, use the `apple-docs` MCP to research the relevant design question. This applies to decisions involving:

- information architecture, navigation, content organization, or discoverability;
- component selection, anatomy, behavior, hierarchy, or state communication;
- buttons, segmented controls, search, lists, cards whose behavior or hierarchy changes, menus, toolbars, sheets, dialogs, and contextual actions;
- gestures, touch interactions, editing, selection, loading, feedback, motion, or progressive disclosure;
- typography, spacing, or color when they affect usability, hierarchy, or state;
- materials, Liquid Glass, accessibility, touch targets, and responsive or adaptive behavior.

Research the design decision, not every CSS declaration. Group related questions into one focused research pass.

Apple research is not required for purely mechanical implementation that introduces no new UX/UI judgment, including:

- fixing a typo or an obvious implementation bug;
- applying a value explicitly specified by the user;
- applying an established ROUDY token or approved component specification;
- making code match an already-approved design;
- code cleanup without visual or interaction consequences;
- fixing responsive behavior according to an already-defined rule.

For example, “change padding from 16px to 12px” is mechanical. “This control feels too large; improve its hierarchy and usability” requires design judgment and Apple research.

## Required research workflow

For each meaningful UX/UI decision:

1. **Define the question.** State the actual behavior or usability question before searching. Prefer “How should a three-option single-selection navigation control behave?” over “How do I make this look like Apple?”
2. **Search Apple documentation.** Invoke `apple-docs/search_docs` for the relevant concept. Prefer sources in this order:
   1. Human Interface Guidelines;
   2. Apple design or technology overviews;
   3. relevant WWDC design sessions;
   4. Apple accessibility guidance;
   5. Apple platform or component documentation;
   6. Apple sample code.
   Prefer or filter for HIG sources when appropriate. Refine broad searches when API symbols dominate the results.
3. **Read the source.** Invoke `apple-docs/read_doc` for the relevant result. Do not base a decision only on a search-result snippet. Read enough of the document to understand its context.
4. **Classify the evidence.** Keep these categories explicit and separate:
   - **APPLE EXPLICIT GUIDANCE:** supported directly by the retrieved Apple source.
   - **DESIGN INFERENCE:** design reasoning that Apple does not explicitly prescribe.
   - **ROUDY-SPECIFIC DECISION:** a choice based on ROUDY's users, workflows, identity, technical constraints, or architecture.
   Never present a design inference as an Apple rule.
5. **Apply the evidence to ROUDY.** Translate relevant principles into ROUDY's design language; do not copy an Apple interface literally.
6. **Implement only after research and reasoning.** Preserve the requested scope.

## Apple is a reference, not ROUDY's design system

Do not turn ROUDY into an Apple clone or automatically reproduce Apple Music, native iOS screens, Apple layouts, colors, styling, or component appearance.

Use Apple guidance to inform clarity, hierarchy, interaction, component behavior, accessibility, discoverability, progressive disclosure, responsive behavior, material behavior, motion, and geometry where relevant. ROUDY determines its product identity, visual personality, workflows, priorities, and domain-specific interactions.

## ROUDY visual language

Preserve ROUDY's established direction: dark, precise, professional, musical, technical, premium, compact, and focused.

- Near-black or black is the primary environment.
- White carries primary information.
- Cool gray carries secondary information.
- Blue communicates interaction, intelligence, selected states, and controlled illumination. Treat blue primarily as light or accent, not the dominant surface color.
- Warm accents may identify musical metadata where already established.
- Reserve red primarily for YouTube identity where relevant.

Avoid generic SaaS-dashboard aesthetics, excessive blue surfaces, neon, excessive glow, glassmorphism everywhere, and decorative effects without functional meaning.

## Material principle

Distinguish the content layer from the control layer. Content should generally remain visually quiet. Controls may receive stronger material treatment when it communicates interaction, state, hierarchy, separation, or focus. Material must have a functional reason; Apple material guidance is not permission to apply translucent glass everywhere.

## Preserve product architecture and functionality

Before redesigning a component, inspect its implementation and understand what it does. Do not infer functionality solely from screenshots or appearance.

Preserve existing routes, state, data, APIs, actions, accessibility behavior, product logic, persistence, backend behavior, and business logic unless the task explicitly requests a change. Apple guidance does not authorize silently removing or inventing features, changing navigation or workflows, moving functionality between screens, changing gestures, or changing data structures.

If Apple guidance suggests a product-level change outside the user's requested scope, do not implement it. Report it separately as:

`OPTIONAL UX RECOMMENDATION — NOT IMPLEMENTED`

## ROUDY song model

Preserve this product distinction:

```text
PLAYLIST
    ↓ tap song
SONG SCREEN
    ↓
lyrics + chords organized in blocks
    ↓
individual lyric/chord blocks can be edited
```

Playlist song cards or rows are navigation elements. Do not infer that they are editable. Do not add long-press editing to playlist song cards unless explicitly requested. Do not move block-editing behavior from the Song screen to the Playlist screen.

## MCP failure policy

`apple-docs` is required for meaningful UX/UI decisions. If `apple-docs/search_docs` or `apple-docs/read_doc` is unavailable or fails during work that requires Apple research:

- do not claim Apple guidance was consulted;
- do not fabricate Apple guidance;
- do not silently continue as though the research succeeded;
- stop the design-decision work and report `APPLE-DOCS RESEARCH UNAVAILABLE`, identifying the failed MCP operation.

Purely mechanical work that introduces no new UX/UI judgment may continue.

## Source discipline

Treat `apple-docs` as a retrieval and indexing layer; Apple's original documentation remains authoritative. When available, retain enough source information to identify the document title, source type, relevant section, WWDC session where applicable, and original Apple source or path when recoverable. Never attribute community material to Apple as first-party guidance, and use extra care with older WWDC transcripts.

## Reporting after meaningful UX/UI work

After implementing a meaningful UX/UI decision, include this concise section:

```text
APPLE DESIGN RESEARCH

Question:
[UX/UI question investigated]

Sources consulted:
[documents actually retrieved]

Apple explicit guidance:
[brief factual summary]

Design inference:
[reasoning not explicitly prescribed by Apple]

ROUDY-specific decision:
[how the final decision fits this product]

Implementation:
[what changed]
```

Keep this useful and proportionate; do not produce a large research report for every task.
