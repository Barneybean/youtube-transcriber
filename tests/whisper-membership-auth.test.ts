import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("retries members-only audio with Chrome cookies", async (t) => {
  const fixtureDir = await mkdtemp(
    path.join(tmpdir(), "ytt-member-auth-test-"),
  );
  const outputDir = path.join(fixtureDir, "audio");
  const logPath = path.join(fixtureDir, "calls.log");
  const fakeYtdlpPath = path.join(fixtureDir, "yt-dlp.cjs");

  t.after(async () => {
    await rm(fixtureDir, { recursive: true, force: true });
  });

  await writeFile(
    fakeYtdlpPath,
    `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.YTDLP_TEST_LOG, JSON.stringify(args) + "\\n");
if (!args.includes("--cookies-from-browser")) {
  console.error("ERROR: This video is available to this channel's members on level: Pro");
  process.exit(1);
}
const outputTemplate = args[args.indexOf("-o") + 1];
const outputPath = outputTemplate.replace("%(ext)s", "mp3");
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, "authenticated audio");
`,
  );
  await chmod(fakeYtdlpPath, 0o755);

  process.env.YTDLP_PATH = fakeYtdlpPath;
  process.env.YTDLP_BROWSER = "chrome:Default";
  process.env.YTDLP_TEST_LOG = logPath;
  const { downloadAudio } = await import("../lib/transcription/whisper.js");

  const audioPath = await downloadAudio("abc123def45", outputDir);

  assert.equal(audioPath, path.join(outputDir, "abc123def45.mp3"));
  const calls = (await readFile(logPath, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as string[]);
  assert.equal(calls.length, 2);
  assert.deepEqual(
    calls[1].slice(calls[1].indexOf("--cookies-from-browser"), -1),
    ["--cookies-from-browser", "chrome:Default"],
  );
});
