import assert from "node:assert/strict";
import test from "node:test";

import {
  addTranscriptionSourceMetadata,
  buildAudioFallbackOrder,
  formatTranscriptionSource,
} from "../lib/transcription-policy.js";

test("pins Groq then OpenAI before the configured audio fallback order", () => {
  const providers = [
    { provider: "openai", priority: 0 },
    { provider: "groq", priority: 3 },
    { provider: "openrouter", priority: 2 },
  ];

  assert.deepEqual(
    buildAudioFallbackOrder(providers, { enabled: true, priority: 1 }),
    [
      { type: "cloud", index: 1 },
      { type: "cloud", index: 0 },
      { type: "cloud", index: 2 },
      { type: "local" },
    ],
  );
});

test("adds source metadata to an existing transcript exactly once", () => {
  const original = [
    "# Lesson",
    "",
    "**URL:** https://youtube.com/watch?v=abc123def45",
    "**Captured:** 2026-07-16",
    "",
    "## Transcript",
  ].join("\n");

  const updated = addTranscriptionSourceMetadata(original, "whisper_local");
  assert.match(
    updated,
    /\*\*Captured:\*\* 2026-07-16\n\*\*Transcriber:\*\* Local Whisper/,
  );
  assert.equal(
    addTranscriptionSourceMetadata(updated, "whisper_local"),
    updated,
  );
});

test("keeps other cloud providers ordered and local Whisper last", () => {
  const providers = [
    { provider: "custom", priority: 2 },
    { provider: "openrouter", priority: 0 },
  ];

  assert.deepEqual(
    buildAudioFallbackOrder(providers, { enabled: true, priority: 1 }),
    [
      { type: "cloud", index: 1 },
      { type: "cloud", index: 0 },
      { type: "local" },
    ],
  );
});

test("formats durable transcription source labels", () => {
  assert.equal(
    formatTranscriptionSource("youtube_captions"),
    "YouTube captions",
  );
  assert.equal(
    formatTranscriptionSource("whisper_cloud_openai"),
    "OpenAI Whisper API",
  );
  assert.equal(formatTranscriptionSource("whisper_local"), "Local Whisper");
});
