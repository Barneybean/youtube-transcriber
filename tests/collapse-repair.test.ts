import assert from "node:assert/strict";
import test from "node:test";

import {
  detectCollapseWindows,
  isDegenerateText,
  spliceRepairedWindows,
} from "../lib/transcription/collapse-repair.js";
import type { TranscriptSegment } from "../lib/types.js";

function seg(startMs: number, durationMs: number, text: string): TranscriptSegment {
  return { startMs, durationMs, text };
}

test("isDegenerateText catches observed collapse patterns", () => {
  // Real patterns from a collapsed transcription (2026-07-19).
  assert.equal(isDegenerateText("improvement ".repeat(200).trim()), true);
  assert.equal(isDegenerateText("四".repeat(220)), true);
  assert.equal(isDegenerateText("в ".repeat(120).trim()), true);
  assert.equal(isDegenerateText("很相似的主意,因為它 " + "buzz ".repeat(150).trim()), true);
  assert.equal(isDegenerateText("现在是这里的《T " + "в ".repeat(100).trim()), true);
  assert.equal(isDegenerateText("Geez Geez Geez Geez"), true);
  assert.equal(isDegenerateText("如果 Geez Geez Geez Geez Geez Geez"), true);
});

test("isDegenerateText keeps normal speech, including short and repetitive-ish lines", () => {
  assert.equal(isDegenerateText("我们下期再见"), false);
  assert.equal(isDegenerateText("very, very, very good numbers overall"), false);
  assert.equal(isDegenerateText("that's the first thing"), false);
  assert.equal(isDegenerateText("no, no, no — listen"), false);
  assert.equal(isDegenerateText("very very good, very very strong"), false);
  assert.equal(isDegenerateText(""), false);
  assert.equal(isDegenerateText("哈哈哈"), false);
});

test("detects a window from a run of identical short segments plus adjacent fragments", () => {
  const segments = [
    seg(0, 2000, "正常的一句话"),
    seg(2000, 1000, "T в这里"),
    seg(3000, 1000, "T в这里"),
    seg(4000, 1000, "T в这里"),
    seg(5000, 1000, "T в这里"),
    seg(6000, 500, ""),
    seg(6500, 500, "T"),
    seg(7000, 500, "!"),
    seg(7500, 2000, "接下来也是正常的话语"),
  ];
  const windows = detectCollapseWindows(segments, { padMs: 1000 });
  assert.equal(windows.length, 1);
  assert.equal(windows[0].firstIndex, 1);
  assert.equal(windows[0].lastIndex, 7);
  assert.equal(windows[0].startMs, 1000); // 2000 - pad
  assert.equal(windows[0].endMs, 8500); // "!" ends at 7500 + pad
});

test("three identical segments do not trigger the identical-run rule", () => {
  const segments = [
    seg(0, 1000, "好的"),
    seg(1000, 1000, "好的"),
    seg(2000, 1000, "好的"),
    seg(3000, 1000, "然后我们继续"),
  ];
  assert.equal(detectCollapseWindows(segments).length, 0);
});

test("nearby windows merge into one slice", () => {
  const segments = [
    seg(0, 30000, "四".repeat(200)),
    seg(30000, 2000, "短暂正常"),
    seg(32000, 30000, "improvement ".repeat(100).trim()),
  ];
  const windows = detectCollapseWindows(segments, { padMs: 1000, mergeGapMs: 3000 });
  assert.equal(windows.length, 1);
  assert.equal(windows[0].firstIndex, 0);
  assert.equal(windows[0].lastIndex, 2);
});

test("splice replaces window ranges and keeps originals on failed repairs", () => {
  const segments = [
    seg(0, 1000, "开头正常的一句话"),
    seg(1000, 1000, "四".repeat(200)),
    seg(2000, 1000, "中间是正常的一句话"),
    seg(3000, 1000, "в ".repeat(50).trim()),
    seg(4000, 1000, "结尾正常的一句话"),
  ];
  const windows = detectCollapseWindows(segments, { padMs: 0, mergeGapMs: 1 });
  assert.equal(windows.length, 2);
  const repairedFirst = [seg(1000, 500, "修复后的话"), seg(1500, 500, "第二句")];
  const out = spliceRepairedWindows(segments, windows, [repairedFirst, null]);
  assert.deepEqual(
    out.map((s) => s.text),
    ["开头正常的一句话", "修复后的话", "第二句", "中间是正常的一句话", "в ".repeat(50).trim(), "结尾正常的一句话"]
  );
});
