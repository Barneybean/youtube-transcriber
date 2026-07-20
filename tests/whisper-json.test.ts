import assert from "node:assert/strict";
import test from "node:test";

import { parsePythonJson } from "../lib/transcription/whisper.js";

test("parses whisper JSON containing bare NaN logprobs", () => {
  const raw =
    '{"text": "hello world", "segments": [' +
    '{"id": 0, "start": 0.0, "end": 1.5, "text": " hello", ' +
    '"avg_logprob": NaN, "compression_ratio": NaN, "no_speech_prob": NaN, "temperature": NaN},' +
    '{"id": 1, "start": 1.5, "end": 3.0, "text": " world", ' +
    '"avg_logprob": -0.2, "compression_ratio": Infinity, "no_speech_prob": -Infinity}]}';
  const parsed = parsePythonJson(raw) as {
    segments: Array<{ text: string; start: number; avg_logprob: number | null }>;
  };
  assert.equal(parsed.segments.length, 2);
  assert.equal(parsed.segments[0].text, " hello");
  assert.equal(parsed.segments[0].avg_logprob, null);
  assert.equal(parsed.segments[1].start, 1.5);
});

test("strict-valid JSON passes through unchanged, even with NaN-like text", () => {
  const raw = '{"segments": [{"text": "score: NaN, Infinity and beyond", "start": 0, "end": 1}]}';
  const parsed = parsePythonJson(raw) as { segments: Array<{ text: string }> };
  assert.equal(parsed.segments[0].text, "score: NaN, Infinity and beyond");
});
