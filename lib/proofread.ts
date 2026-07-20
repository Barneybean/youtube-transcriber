import Anthropic from "@anthropic-ai/sdk";
import type { TranscriptSegment } from "./types";

/**
 * AI proofreading pass for ASR transcripts.
 *
 * Whisper output (especially non-English) is full of homophone and
 * mis-segmentation errors ("熊屎" for "熊市"). After transcription, each
 * chunk of segments is sent to Claude with a strict fix-ASR-errors-only
 * prompt; only corrected lines come back, timing metadata is untouched.
 *
 * Fail-open by design: no API key, a request error, or malformed output
 * means the original segments are returned unchanged — proofreading must
 * never block or corrupt a transcription.
 *
 * Config (.env):
 *   ANTHROPIC_API_KEY     enables the feature (uses `ant auth login`
 *                         profile as fallback via the SDK's own resolution)
 *   PROOFREAD_ENABLED     "false" to force-disable (default: on when a
 *                         credential resolves)
 *   PROOFREAD_MODEL       default "claude-opus-4-8"
 *   PROOFREAD_SOURCES     "whisper" (default) = only whisper_* transcripts;
 *                         "all" = also proofread caption scrapes
 */

const MAX_SEGMENTS_PER_CHUNK = 60;
const MAX_CHARS_PER_CHUNK = 4000;
const CHUNK_CONCURRENCY = 3;

export interface ProofreadConfig {
  enabled: boolean;
  model: string;
  sources: "whisper" | "all";
}

export interface ProofreadResult {
  segments: TranscriptSegment[];
  proofread: boolean;
  model?: string;
  correctedCount?: number;
}

export interface ProofreadContext {
  title?: string;
  author?: string;
}

export function getProofreadConfig(
  env: Record<string, string | undefined> = process.env
): ProofreadConfig {
  const hasCredential = Boolean(
    env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN || env.PROOFREAD_ENABLED === "true"
  );
  return {
    enabled: env.PROOFREAD_ENABLED === "false" ? false : hasCredential,
    model: env.PROOFREAD_MODEL || "claude-opus-4-8",
    sources: env.PROOFREAD_SOURCES === "all" ? "all" : "whisper",
  };
}

/** Whisper output needs proofreading; caption tracks are opt-in via PROOFREAD_SOURCES=all. */
export function shouldProofread(source: string, config: ProofreadConfig): boolean {
  if (!config.enabled) return false;
  if (config.sources === "all") return true;
  return source.startsWith("whisper");
}

/** Split segments into chunks bounded by count and character budget. */
export function chunkSegments(segments: TranscriptSegment[]): TranscriptSegment[][] {
  const chunks: TranscriptSegment[][] = [];
  let current: TranscriptSegment[] = [];
  let chars = 0;
  for (const seg of segments) {
    const len = seg.text.length;
    if (
      current.length > 0 &&
      (current.length >= MAX_SEGMENTS_PER_CHUNK || chars + len > MAX_CHARS_PER_CHUNK)
    ) {
      chunks.push(current);
      current = [];
      chars = 0;
    }
    current.push(seg);
    chars += len;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

interface Correction {
  i: number;
  text: string;
}

/** Apply corrections by index; out-of-range or empty corrections are ignored. */
export function applyCorrections(
  segments: TranscriptSegment[],
  corrections: Correction[]
): { segments: TranscriptSegment[]; applied: number } {
  const out = segments.map((s) => ({ ...s }));
  let applied = 0;
  for (const c of corrections) {
    if (!Number.isInteger(c.i) || c.i < 0 || c.i >= out.length) continue;
    const text = typeof c.text === "string" ? c.text.trim() : "";
    if (!text || text === out[c.i].text) continue;
    out[c.i].text = text;
    applied++;
  }
  return { segments: out, applied };
}

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    corrections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          i: { type: "integer", description: "0-based line index from the input" },
          text: { type: "string", description: "the fully corrected line" },
        },
        required: ["i", "text"],
        additionalProperties: false,
      },
    },
  },
  required: ["corrections"],
  additionalProperties: false,
} as const;

function buildSystemPrompt(context: ProofreadContext): string {
  const about = [
    context.title ? `Video title: ${context.title}` : null,
    context.author ? `Channel: ${context.author}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  return [
    "You are proofreading an automatic speech-recognition (ASR) transcript. The lines are numbered and in order.",
    about ? `Use this context to resolve domain terminology:\n${about}` : null,
    "Fix ONLY transcription errors: wrong homophones, misrecognized names/tickers/terms, garbled words, and words split or joined incorrectly.",
    "Keep the original language of every line — never translate. Do not rephrase, summarize, censor, merge, split, or reorder lines. Do not add or remove content the speaker did not say. Keep filler words.",
    "Return only the lines that need a correction, each as its full corrected text with its original index. If nothing needs fixing, return an empty list.",
  ]
    .filter(Boolean)
    .join("\n");
}

async function proofreadChunk(
  client: Anthropic,
  model: string,
  chunk: TranscriptSegment[],
  context: ProofreadContext
): Promise<Correction[]> {
  const numbered = chunk.map((s, i) => `${i}: ${s.text}`).join("\n");
  const response = await client.messages.create({
    model,
    max_tokens: 8192,
    system: buildSystemPrompt(context),
    output_config: { format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    messages: [{ role: "user", content: numbered }],
  });
  if (response.stop_reason === "refusal") return [];
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return [];
  const parsed = JSON.parse(textBlock.text) as { corrections?: Correction[] };
  return Array.isArray(parsed.corrections) ? parsed.corrections : [];
}

/**
 * Proofread transcript segments with Claude. Chunked, bounded concurrency,
 * fail-open per chunk: a chunk that errors keeps its original lines.
 */
export async function proofreadSegments(
  segments: TranscriptSegment[],
  context: ProofreadContext = {},
  config: ProofreadConfig = getProofreadConfig(),
  onProgress?: (fraction: number) => void
): Promise<ProofreadResult> {
  if (!config.enabled || segments.length === 0) {
    return { segments, proofread: false };
  }

  let client: Anthropic;
  try {
    client = new Anthropic();
  } catch (err) {
    console.warn(`[proofread] disabled — no credential resolved: ${String(err)}`);
    return { segments, proofread: false };
  }

  const chunks = chunkSegments(segments);
  const offsets: number[] = [];
  let offset = 0;
  for (const chunk of chunks) {
    offsets.push(offset);
    offset += chunk.length;
  }

  const allCorrections: Correction[] = [];
  let failures = 0;
  let completed = 0;

  // Bounded-concurrency worker pool over the chunks.
  let next = 0;
  async function worker(): Promise<void> {
    while (next < chunks.length) {
      const idx = next++;
      try {
        const corrections = await proofreadChunk(client, config.model, chunks[idx], context);
        for (const c of corrections) {
          allCorrections.push({ i: c.i + offsets[idx], text: c.text });
        }
      } catch (err) {
        failures++;
        console.warn(`[proofread] chunk ${idx + 1}/${chunks.length} failed: ${String(err)}`);
      }
      completed++;
      onProgress?.(completed / chunks.length);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CHUNK_CONCURRENCY, chunks.length) }, () => worker())
  );

  if (failures === chunks.length) {
    return { segments, proofread: false };
  }

  const { segments: corrected, applied } = applyCorrections(segments, allCorrections);
  console.log(
    `[proofread] ${applied} line(s) corrected across ${chunks.length} chunk(s) (${failures} chunk failure(s)) using ${config.model}`
  );
  return { segments: corrected, proofread: true, model: config.model, correctedCount: applied };
}
