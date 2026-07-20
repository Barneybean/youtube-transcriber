# Product

## Register

product

## Users

The primary user is an active trading learner who studies market commentary and investment analysis on YouTube, including videos available through paid channel memberships. They use the tool on their own Mac and want to turn individual videos or a channel archive into durable, searchable study material without managing transcription infrastructure.

Their primary workflow is: provide a YouTube video or channel URL, let the tool find and transcribe the relevant videos, then use the resulting local Markdown files to review trading reasoning and build skill over time.

## Product Purpose

Convert authorized YouTube content into timestamped local transcript files with as little interaction as possible. Files are organized by YouTube channel name under a predictable local folder. The tool handles captions, authenticated members-only access, local Whisper fallback, batching, retries, deduplication, and checkpointed resume behind one focused workflow.

Success means the user can paste a URL, start the job, and later find complete transcripts in `Desktop/Youtube_Transcript/<Channel Name>/` without manually downloading audio, approving repeated work, or organizing files.

## Brand Personality

Quiet, disciplined, and dependable. The product should feel like a serious research utility: calm enough for long study sessions, explicit about progress and failures, and free of promotional or decorative distractions.

## Anti-references

- Trading terminals filled with flashing prices, red/green noise, charts, and urgency cues.
- Generic AI dashboards with oversized gradients, feature-card grids, or assistant-like marketing copy.
- Media-library interfaces that make stored database records more prominent than the exported files.
- Setup-heavy developer tools that expose provider, model, and pipeline choices during the normal workflow.

## Design Principles

1. **File first**: the local transcript file and its destination are the product outcome.
2. **One obvious path**: a URL field and a single primary action should cover normal use.
3. **Automation earns trust through visibility**: show what is queued, active, saved, skipped, or blocked without exposing implementation noise.
4. **Resume instead of repeat**: preserve completed work and make recovery automatic wherever possible.
5. **Advanced capability stays backstage**: keep only controls needed for the current job in the main interface; configuration and diagnostics remain secondary.

## Accessibility & Inclusion

Target WCAG 2.2 AA. Support full keyboard operation, visible focus states, meaningful status text that does not rely on color, reduced-motion preferences, readable contrast, and clear recovery instructions for authentication or network failures.
