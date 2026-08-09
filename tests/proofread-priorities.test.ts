import assert from "node:assert/strict";
import test from "node:test";

import { buildSystemPrompt } from "../lib/transcription/proofread.js";

/**
 * These transcripts are read for what the speaker did and at what level. A
 * mangled filler word costs nothing; a wrong ticker, a flipped action verb, or
 * a corrupted figure is read as fact by everything downstream.
 */

test("proofreading is aimed at tickers, position verbs, and figures", () => {
  const prompt = buildSystemPrompt({ title: "t", author: "a" }).toLowerCase();
  for (const required of ["ticker", "trim", "negation", "number"]) {
    assert.ok(prompt.includes(required), `prompt does not mention: ${required}`);
  }
});

test("negation must never be dropped or introduced", () => {
  // "not buying" read as "buying" inverts the only thing that matters.
  assert.match(buildSystemPrompt({}), /negation, which must never be dropped or introduced/);
});

test("an uncertain figure is left alone rather than guessed", () => {
  const prompt = buildSystemPrompt({}).toLowerCase();
  assert.ok(prompt.includes("unambiguous"));
  assert.ok(prompt.includes("leave the line exactly as it is"));
});

test("output script is pinned so consumers match one orthography", () => {
  // A corpus that mixes traditional and simplified is invisible to half the
  // patterns that read it.
  assert.ok(buildSystemPrompt({}).includes("simplified"));
});

test("context still reaches the prompt when supplied", () => {
  const prompt = buildSystemPrompt({ title: "MU NVDA 估值", author: "LABanker" });
  assert.ok(prompt.includes("MU NVDA 估值"));
  assert.ok(prompt.includes("LABanker"));
});

test("the output contract is stated: Arabic digits and percent signs", () => {
  const prompt = buildSystemPrompt({});
  assert.ok(prompt.includes("Arabic numerals"));
  assert.ok(prompt.includes("8%"));
  // Idioms are not quantities; rewriting them corrupts the line.
  assert.ok(prompt.includes("idiom"));
});
