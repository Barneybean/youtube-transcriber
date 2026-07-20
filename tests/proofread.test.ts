import assert from "node:assert/strict";
import test from "node:test";

import {
  applyCorrections,
  chunkSegments,
  extractJsonObject,
  getProofreadConfig,
  clearPreflightCache,
  preflightProofread,
  proofreadSegments,
  shouldProofread,
} from "../lib/transcription/proofread.js";
import type { TranscriptSegment } from "../lib/types.js";

function seg(text: string, startMs = 0): TranscriptSegment {
  return { text, startMs, durationMs: 1000 };
}

test("config disabled without credentials, enabled with a key", () => {
  assert.equal(getProofreadConfig({}).enabled, false);
  assert.equal(getProofreadConfig({ ANTHROPIC_API_KEY: "sk-ant-x" }).enabled, true);
  assert.equal(getProofreadConfig({ ANTHROPIC_AUTH_TOKEN: "tok" }).enabled, true);
});

test("PROOFREAD_ENABLED=false wins over a present key", () => {
  const cfg = getProofreadConfig({ ANTHROPIC_API_KEY: "sk-ant-x", PROOFREAD_ENABLED: "false" });
  assert.equal(cfg.enabled, false);
});

test("model and sources default sensibly and are overridable", () => {
  const cfg = getProofreadConfig({ ANTHROPIC_API_KEY: "k" });
  assert.equal(cfg.model, "claude-opus-4-8");
  assert.equal(cfg.sources, "whisper");
  const custom = getProofreadConfig({
    ANTHROPIC_API_KEY: "k",
    PROOFREAD_MODEL: "claude-haiku-4-5",
    PROOFREAD_SOURCES: "all",
  });
  assert.equal(custom.model, "claude-haiku-4-5");
  assert.equal(custom.sources, "all");
});

test("proofreads whisper sources only, unless sources=all", () => {
  const whisperOnly = getProofreadConfig({ ANTHROPIC_API_KEY: "k" });
  assert.equal(shouldProofread("whisper_local", whisperOnly), true);
  assert.equal(shouldProofread("whisper_cloud_groq", whisperOnly), true);
  assert.equal(shouldProofread("youtube_captions", whisperOnly), false);
  const all = getProofreadConfig({ ANTHROPIC_API_KEY: "k", PROOFREAD_SOURCES: "all" });
  assert.equal(shouldProofread("youtube_captions", all), true);
});

test("chunking respects the segment-count bound and keeps order", () => {
  const segments = Array.from({ length: 150 }, (_, i) => seg(`line ${i}`));
  const chunks = chunkSegments(segments);
  assert.ok(chunks.every((c) => c.length <= 60));
  assert.deepEqual(
    chunks.flat().map((s) => s.text),
    segments.map((s) => s.text)
  );
});

test("chunking respects the character budget", () => {
  const segments = Array.from({ length: 10 }, () => seg("x".repeat(1500)));
  const chunks = chunkSegments(segments);
  // 4000-char budget → at most 2 of these 1500-char lines per chunk
  assert.ok(chunks.every((c) => c.length <= 3));
  assert.equal(chunks.flat().length, 10);
});

test("applyCorrections replaces text but never timing", () => {
  const segments = [seg("熊屎", 100), seg("肺成半导体指数", 200)];
  const { segments: out, applied } = applyCorrections(segments, [
    { i: 0, text: "熊市" },
    { i: 1, text: "费城半导体指数" },
  ]);
  assert.equal(applied, 2);
  assert.equal(out[0].text, "熊市");
  assert.equal(out[0].startMs, 100);
  assert.equal(out[1].text, "费城半导体指数");
  // originals untouched
  assert.equal(segments[0].text, "熊屎");
});

test("applyCorrections ignores out-of-range, empty, and no-op corrections", () => {
  const segments = [seg("a"), seg("b")];
  const { segments: out, applied } = applyCorrections(segments, [
    { i: -1, text: "x" },
    { i: 5, text: "x" },
    { i: 0, text: "  " },
    { i: 1, text: "b" },
  ]);
  assert.equal(applied, 0);
  assert.deepEqual(
    out.map((s) => s.text),
    ["a", "b"]
  );
});

test("proofreadSegments is a no-op when disabled — no network, segments unchanged", async () => {
  const segments = [seg("hello")];
  const result = await proofreadSegments(segments, {}, getProofreadConfig({}));
  assert.equal(result.proofread, false);
  assert.equal(result.segments, segments);
});

test("PROOFREAD_BACKEND=claude-cli enables the feature without an API key", () => {
  const cfg = getProofreadConfig({ PROOFREAD_BACKEND: "claude-cli" });
  assert.equal(cfg.enabled, true);
  assert.equal(cfg.backend, "claude-cli");
  const off = getProofreadConfig({ PROOFREAD_BACKEND: "claude-cli", PROOFREAD_ENABLED: "false" });
  assert.equal(off.enabled, false);
  assert.equal(getProofreadConfig({ ANTHROPIC_API_KEY: "k" }).backend, "api");
});

test("extractJsonObject tolerates fences and prose around the JSON", () => {
  const wrapped = 'Here you go:\n```json\n{"corrections": [{"i": 2, "text": "木头姐说"}]}\n```\nDone.';
  assert.deepEqual(extractJsonObject(wrapped), { corrections: [{ i: 2, text: "木头姐说" }] });
  assert.deepEqual(extractJsonObject('{"corrections": []}'), { corrections: [] });
  assert.throws(() => extractJsonObject("no json here"));
});

test("preflight: healthy claude-cli backend stays active with a notice", async () => {
  clearPreflightCache();
  const cfg = getProofreadConfig({ PROOFREAD_BACKEND: "claude-cli" });
  const pf = await preflightProofread(cfg, async () => ({ ok: true, detail: "2.x" }));
  assert.equal(pf.active, true);
  assert.equal(pf.repaired, false);
  assert.equal(pf.config.backend, "claude-cli");
  assert.match(pf.notice, /local Claude agent/);
});

test("preflight: broken claude-cli falls back to the API when a key exists", async () => {
  clearPreflightCache();
  const prev = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  try {
    const cfg = getProofreadConfig({ PROOFREAD_BACKEND: "claude-cli" });
    const pf = await preflightProofread(cfg, async () => ({ ok: false, detail: "not found" }));
    assert.equal(pf.active, true);
    assert.equal(pf.repaired, true);
    assert.equal(pf.config.backend, "api");
    assert.match(pf.notice, /Anthropic API instead/);
  } finally {
    if (prev === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = prev;
  }
});

test("preflight: broken claude-cli with no key disables with a clear notice", async () => {
  clearPreflightCache();
  const prevKey = process.env.ANTHROPIC_API_KEY;
  const prevTok = process.env.ANTHROPIC_AUTH_TOKEN;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  try {
    const cfg = getProofreadConfig({ PROOFREAD_BACKEND: "claude-cli" });
    const pf = await preflightProofread(cfg, async () => ({ ok: false, detail: "not found" }));
    assert.equal(pf.active, false);
    assert.equal(pf.config.enabled, false);
    assert.match(pf.notice, /disabled/);
    assert.match(pf.notice, /not found/);
  } finally {
    if (prevKey !== undefined) process.env.ANTHROPIC_API_KEY = prevKey;
    if (prevTok !== undefined) process.env.ANTHROPIC_AUTH_TOKEN = prevTok;
  }
});

test("preflight: disabled config reports how to enable", async () => {
  clearPreflightCache();
  const pf = await preflightProofread(getProofreadConfig({}), async () => ({ ok: true, detail: "" }));
  assert.equal(pf.active, false);
  assert.match(pf.notice, /off/);
});
