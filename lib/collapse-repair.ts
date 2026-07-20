import type { TranscriptSegment } from "./types";

/**
 * Detection and repair planning for Whisper decoder repetition collapse.
 *
 * On speech buried under music beds (channel intros, montage clips), Whisper
 * — especially turbo models — can fall into degenerate loops: one token or
 * character repeated for a whole window ("improvement improvement …",
 * "四四四…", "в в в"), runs of identical short segments, or empty filler.
 * The real speech in that window is lost, not just garbled.
 *
 * This module finds those windows so the caller can re-transcribe just the
 * affected audio slices with a stronger model and loop-resistant decoding.
 * All functions are pure; audio work stays in lib/whisper.ts.
 */

export interface CollapseWindow {
  /** Slice bounds in the source audio (already padded). */
  startMs: number;
  endMs: number;
  /** Inclusive segment-index range to replace in the original array. */
  firstIndex: number;
  lastIndex: number;
}

const IDENTICAL_RUN_MIN = 4;
const PAD_MS = 1500;
const MERGE_GAP_MS = 3000;

/** A single segment whose text is a degenerate repetition artifact. */
export function isDegenerateText(raw: string): boolean {
  const text = raw.trim();
  if (!text) return false;
  // One or two distinct tokens repeated many times ("buzz buzz …", "в в в",
  // "如果 Geez Geez Geez Geez Geez Geez"), or a shorter exact-identical run
  // ("Geez Geez Geez Geez").
  const tokens = text.split(/\s+/).filter(Boolean);
  const uniqueTokens = new Set(tokens.map((t) => t.toLowerCase())).size;
  if (tokens.length >= 6 && uniqueTokens <= 2) return true;
  if (tokens.length >= 4 && uniqueTokens === 1) return true;
  // A single character repeated in a long run ("四四四四…").
  if (/(\S)\1{9,}/.test(text)) return true;
  // Long text drawing on almost no distinct characters.
  if (text.length >= 40 && new Set(text).size <= Math.max(3, Math.floor(text.length * 0.08))) {
    return true;
  }
  return false;
}

function segmentEndMs(seg: TranscriptSegment): number {
  return seg.startMs + Math.max(0, seg.durationMs);
}

/**
 * Find collapsed windows: degenerate segments, runs of >=4 identical
 * non-empty segments, and the empty/near-empty fragments adjacent to them.
 */
export function detectCollapseWindows(
  segments: TranscriptSegment[],
  opts: { padMs?: number; mergeGapMs?: number } = {}
): CollapseWindow[] {
  const padMs = opts.padMs ?? PAD_MS;
  const mergeGapMs = opts.mergeGapMs ?? MERGE_GAP_MS;
  const flagged = new Array<boolean>(segments.length).fill(false);

  for (let i = 0; i < segments.length; i++) {
    if (isDegenerateText(segments[i].text)) flagged[i] = true;
  }

  // Runs of identical non-empty text ("T в这里" x10 as separate segments).
  let runStart = 0;
  for (let i = 1; i <= segments.length; i++) {
    const same =
      i < segments.length &&
      segments[i].text.trim() !== "" &&
      segments[i].text.trim() === segments[runStart].text.trim();
    if (!same) {
      if (i - runStart >= IDENTICAL_RUN_MIN && segments[runStart].text.trim() !== "") {
        for (let j = runStart; j < i; j++) flagged[j] = true;
      }
      runStart = i;
    }
  }

  // Absorb empty / <=2-char fragments touching a flagged segment (both directions).
  let grew = true;
  while (grew) {
    grew = false;
    for (let i = 0; i < segments.length; i++) {
      if (flagged[i]) continue;
      if (segments[i].text.trim().length > 2) continue;
      if ((i > 0 && flagged[i - 1]) || (i + 1 < segments.length && flagged[i + 1])) {
        flagged[i] = true;
        grew = true;
      }
    }
  }

  // Group consecutive flagged indices into windows.
  const windows: CollapseWindow[] = [];
  let i = 0;
  while (i < segments.length) {
    if (!flagged[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < segments.length && flagged[j + 1]) j++;
    windows.push({
      firstIndex: i,
      lastIndex: j,
      startMs: Math.max(0, segments[i].startMs - padMs),
      endMs: segmentEndMs(segments[j]) + padMs,
    });
    i = j + 1;
  }

  // Merge windows separated by a short good gap (slice once, not thrice).
  const merged: CollapseWindow[] = [];
  for (const w of windows) {
    const prev = merged[merged.length - 1];
    if (prev && w.startMs - prev.endMs < mergeGapMs) {
      prev.endMs = Math.max(prev.endMs, w.endMs);
      prev.lastIndex = w.lastIndex;
    } else {
      merged.push({ ...w });
    }
  }
  return merged;
}

/**
 * Replace each window's segment range with its re-transcribed replacement
 * (already shifted to absolute time). Windows must be in ascending index
 * order and non-overlapping — as produced by detectCollapseWindows. A null
 * replacement keeps the window's original segments (failed repair).
 */
export function spliceRepairedWindows(
  segments: TranscriptSegment[],
  windows: CollapseWindow[],
  replacements: Array<TranscriptSegment[] | null>
): TranscriptSegment[] {
  let out = segments;
  for (let w = windows.length - 1; w >= 0; w--) {
    const replacement = replacements[w];
    if (replacement === null) continue;
    const win = windows[w];
    out = [...out.slice(0, win.firstIndex), ...replacement, ...out.slice(win.lastIndex + 1)];
  }
  return out;
}
