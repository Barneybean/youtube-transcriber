---
name: Transcript Desk
description: A quiet local workbench for turning YouTube research into durable study files.
colors:
  canvas: "hsl(0 0% 4%)"
  work-surface: "hsl(0 0% 7%)"
  raised-surface: "hsl(0 0% 9%)"
  structural-edge: "hsl(0 0% 14%)"
  primary-text: "hsl(0 0% 98%)"
  secondary-text: "hsl(0 0% 70%)"
  quiet-text: "hsl(0 0% 55%)"
  research-amber: "hsl(38 30% 50%)"
typography:
  headline:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.25
  title:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.02em"
  mono:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  control: "6px"
  surface: "12px"
  dialog: "16px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.research-amber}"
    textColor: "{colors.canvas}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "12px 16px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.raised-surface}"
    textColor: "{colors.primary-text}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "12px 16px"
    height: "44px"
  url-field:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.primary-text}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "12px 16px"
    height: "48px"
  work-panel:
    backgroundColor: "{colors.work-surface}"
    textColor: "{colors.primary-text}"
    rounded: "{rounded.surface}"
    padding: "24px"
---

# Design System: Transcript Desk

## Overview

**Creative North Star: "The Research Desk"**

The interface is one quiet work surface for a serious repeated task. It should feel like placing a source on a desk, starting a dependable process, and returning to an organized folder. Density is moderate, language is direct, and the current job always has priority over stored history or configuration.

This is a warm-dark local utility, not a trading terminal or an AI assistant. It rejects flashing market colors, decorative analytics, promotional feature grids, and provider controls in the normal workflow. Motion exists only to explain state changes.

**Key Characteristics:**

- One primary action and one clearly labeled input.
- Restrained amber reserved for action, focus, and active progress.
- File destinations and saved outcomes are always explicit.
- Tonal surfaces and inset edges create structure without visible borders.
- Compact, readable status language replaces implementation logs.

## Colors

The palette is nearly neutral, with a muted research amber used sparingly as the single active voice.

### Primary

- **Research Amber**: Used for the primary export action, visible focus, current progress, and successful completion accents.

### Neutral

- **Night Canvas**: The uninterrupted application background.
- **Desk Surface**: The primary work panel and grouped content.
- **Raised Tray**: Secondary controls, queued items, and status rows.
- **Structural Edge**: The source tone for inset shadow rings, never a visible card border.
- **Paper White**: Primary text only.
- **Pencil Gray**: Explanatory text and secondary labels.
- **Quiet Graphite**: Metadata, timestamps, and inactive states that remain readable.

**The One Active Voice Rule.** Amber appears on less than ten percent of a screen and only communicates action or state.

**The No Market Signal Rule.** Red and green never decorate the interface; they appear only in clearly labeled error and success states.

## Typography

**Display Font:** Geist (with system-ui fallback)  
**Body Font:** Geist (with system-ui fallback)  
**Label/Mono Font:** Geist Mono (with ui-monospace fallback)

**Character:** Neutral, compact, and familiar. Type should disappear into the research workflow while preserving a clear reading order.

### Hierarchy

- **Headline** (600, 1.5rem, 1.25): The single page purpose and current job milestone.
- **Title** (600, 1rem, 1.4): Panel titles, current video titles, and completion outcomes.
- **Body** (400, 0.875rem, 1.6): Instructions and status descriptions, capped near 70 characters where prose is used.
- **Label** (500, 0.75rem, 0.02em): Field labels and concise metadata; sentence case is preferred.
- **Mono** (400, 0.75rem, 1.5): File paths, video counts, and durable identifiers.

**The One Read Rule.** The user should understand the current state without rereading a paragraph; labels name facts and body copy explains only the next useful action.

## Elevation

Depth is structural, not atmospheric. Tonal layering separates the canvas, work surface, and raised rows. Inset edge shadows define interactive boundaries; one ambient shadow is reserved for a temporary floating surface such as a confirmation dialog.

### Shadow Vocabulary

- **Quiet Edge** (`inset 0 0 0 1px rgba(255, 255, 255, 0.06)`): Default controls and panels.
- **Strong Edge** (`inset 0 0 0 1px rgba(255, 255, 255, 0.10)`): Selected or emphasized containers.
- **Active Edge** (`inset 0 0 0 1px hsl(var(--accent) / 0.5)`): Focus and current work only.
- **Ambient Lift** (`0 26px 70px rgba(0, 0, 0, 0.34)`): Dialogs and temporary overlays only.

**The Flat Desk Rule.** Resting content stays flat. Elevation appears only when a surface temporarily sits above the workflow.

## Components

### Buttons

- **Shape:** Compact, gently rounded controls (6px).
- **Primary:** Research amber with dark text, at least 44px high and 12px vertical padding.
- **Hover / Focus:** A translucent white overlay for hover; an active inset edge plus a visible outline for keyboard focus. Size never changes.
- **Secondary / Ghost:** Raised neutral or transparent surfaces using the same height, radius, and state vocabulary.

### Cards / Containers

- **Corner Style:** Calm work surfaces (12px).
- **Background:** Desk Surface for the main workflow, Raised Tray for queue and result rows.
- **Shadow Strategy:** Quiet inset edges at rest; no generic drop shadows.
- **Border:** No Tailwind border utilities on panels.
- **Internal Padding:** 16px on compact rows, 24px on primary panels.

### Inputs / Fields

- **Style:** Night Canvas fill, 6px corners, Quiet Edge, at least 48px high.
- **Focus:** Active Edge plus a visible amber outline; placeholder text remains readable.
- **Error / Disabled:** Error edge with explicit text; disabled fields retain full text clarity and remove hover response.

### Navigation

- The normal workflow has no persistent sidebar. A compact utility link may expose system status or advanced settings without competing with the export action.
- Active state uses text weight and the amber focus vocabulary, never a filled navigation pill by default.

### Work Status

- A single vertical work log shows discovery, queue position, saved files, skips, retries, and blockers.
- The current item receives the only active accent. Completed items become quiet factual rows rather than celebratory cards.

## Do's and Don'ts

### Do:

- **Do** keep the URL field, output destination, and primary action in the first viewport.
- **Do** use `shadow-[var(--edge)]` and stronger edge tokens instead of visible card borders.
- **Do** organize every automatic export under `Desktop/Youtube_Transcript/<Channel Name>/` and show the exact path.
- **Do** write progress in plain language with counts and recovery instructions.
- **Do** preserve keyboard focus, reduced motion, and WCAG 2.2 AA contrast.

### Don't:

- **Don't** build a trading terminal filled with flashing prices, red/green noise, charts, or urgency cues.
- **Don't** ship a generic AI dashboard with oversized gradients, feature-card grids, or assistant-like marketing copy.
- **Don't** make stored database records more prominent than the exported files.
- **Don't** expose setup-heavy provider, model, or pipeline choices during the normal workflow.
- **Don't** use visible card borders, purple or indigo accents, gradient text, glassmorphism, or button scaling.
- **Don't** promote Spotify, cloud providers, diarization, the extension, or MCP in the primary interface.
