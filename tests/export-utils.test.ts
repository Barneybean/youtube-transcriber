import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTranscriptFilename,
  renderTranscriptMarkdown,
  safePathSegment,
} from "../lib/export/export-utils.js";

test("safePathSegment keeps channel names readable while removing path syntax", () => {
  assert.equal(
    safePathSegment("精英财经 / LABanker: Pro?"),
    "精英财经 LABanker Pro",
  );
  assert.equal(safePathSegment(".."), "Unknown Channel");
});

test("buildTranscriptFilename preserves queue order and video identity", () => {
  assert.equal(
    buildTranscriptFilename(3, 47, "仓位调整 / 复盘", "abc123def45"),
    "03 - 仓位调整 复盘 [abc123def45].md",
  );
});

test("renderTranscriptMarkdown produces durable timestamped study notes", () => {
  const markdown = renderTranscriptMarkdown({
    title: "Trading lesson",
    author: "Research Channel",
    videoUrl: "https://www.youtube.com/watch?v=abc123def45",
    capturedAt: new Date("2026-07-16T12:00:00.000Z"),
    source: "youtube_captions_ytdlp",
    segments: [
      { text: "First idea", startMs: 0, durationMs: 1000 },
      { text: "Second idea", startMs: 65_000, durationMs: 1000 },
    ],
  });

  assert.match(markdown, /^# Trading lesson/m);
  assert.match(markdown, /\*\*Channel:\*\* Research Channel/);
  assert.match(markdown, /\*\*Transcriber:\*\* YouTube captions \(yt-dlp\)/);
  assert.match(markdown, /\[00:00\] First idea/);
  assert.match(markdown, /\[01:05\] Second idea/);
});
