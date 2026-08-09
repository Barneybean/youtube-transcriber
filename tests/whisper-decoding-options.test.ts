import assert from "node:assert/strict";
import test from "node:test";

import { buildOpenAiWhisperArgs } from "../lib/transcription/whisper.js";

/**
 * Unset decoding options are not a neutral default — they decide whether a
 * transcript is usable downstream. In one captured Mandarin corpus an
 * unconditioned run mixed scripts (traditional 倉 1,337 times against
 * simplified 仓), misheard domain words as homophones (古哥 for 谷歌), and
 * emitted stray English over silence because the language was re-detected per
 * window. Consumers matching simplified-Chinese terms saw a fraction of what
 * was actually said.
 */

function args(opts: Parameters<typeof buildOpenAiWhisperArgs>[4] = {}) {
  return buildOpenAiWhisperArgs("a.wav", "/out", "large-v3-turbo", "cpu", opts);
}

function valueAfter(list: string[], flag: string): string | undefined {
  const at = list.indexOf(flag);
  return at === -1 ? undefined : list[at + 1];
}

test("pins the decoding language when one is configured", () => {
  assert.equal(valueAfter(args({ language: "zh" }), "--language"), "zh");
});

test("conditions decoding on the domain vocabulary when one is configured", () => {
  const prompt = "以下是关于美股投资的中文讨论,涉及仓位、加仓、减仓、谷歌、英伟达。";
  assert.equal(valueAfter(args({ initialPrompt: prompt }), "--initial_prompt"), prompt);
});

test("omits both flags rather than passing an empty value", () => {
  // Whisper treats an empty --language as invalid; absent must stay absent.
  const list = args({ language: "", initialPrompt: "" });
  assert.equal(list.includes("--language"), false);
  assert.equal(list.includes("--initial_prompt"), false);
});

test("keeps the existing device and conditioning behaviour", () => {
  assert.equal(args({ noCondition: true }).includes("--condition_on_previous_text"), true);
  assert.equal(args().includes("--condition_on_previous_text"), false);
  const mps = buildOpenAiWhisperArgs("a.wav", "/out", "m", "mps");
  assert.equal(valueAfter(mps, "--device"), "mps");
  assert.equal(valueAfter(mps, "--fp16"), "False");
  assert.equal(args().includes("--device"), false);
});

test("always requests JSON into the requested directory", () => {
  const list = args({ language: "zh" });
  assert.equal(list[0], "a.wav");
  assert.equal(valueAfter(list, "--output_format"), "json");
  assert.equal(valueAfter(list, "--output_dir"), "/out");
});
