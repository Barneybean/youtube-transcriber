import "dotenv/config";

import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { addTranscriptionSourceMetadata } from "../lib/transcription-policy.js";

const execFileAsync = promisify(execFile);

const outputRoot =
  process.env.YTT_OUTPUT_ROOT ||
  path.join(os.homedir(), "Desktop", "AI Trading", "Youtube_Transcript");
const databaseUrl = process.env.DATABASE_URL || "file:./dev.db";
const databasePath = path.resolve(databaseUrl.replace(/^file:/, ""));

async function markdownFiles(directory: string): Promise<string[]> {
  const entries = await fs
    .readdir(directory, { withFileTypes: true })
    .catch(() => []);
  const nested = await Promise.all(
    entries.map((entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory()
        ? markdownFiles(entryPath)
        : Promise.resolve(entry.name.endsWith(".md") ? [entryPath] : []);
    }),
  );
  return nested.flat();
}

async function main(): Promise<void> {
  const files = await markdownFiles(outputRoot);
  const { stdout } = await execFileAsync("sqlite3", [
    "-json",
    databasePath,
    "SELECT videoId, source FROM Video WHERE source IS NOT NULL",
  ]);
  const sources = new Map(
    (
      JSON.parse(stdout || "[]") as Array<{ videoId: string; source: string }>
    ).map((row) => [row.videoId, row.source]),
  );
  let updated = 0;
  let alreadyLabeled = 0;
  let missingRecord = 0;

  for (const file of files) {
    const videoId = path.basename(file).match(/\[([\w-]{11})\]/)?.[1];
    if (!videoId) {
      missingRecord += 1;
      continue;
    }

    const source = sources.get(videoId);
    if (!source) {
      missingRecord += 1;
      continue;
    }

    const markdown = await fs.readFile(file, "utf8");
    const next = addTranscriptionSourceMetadata(markdown, source);
    if (next === markdown) {
      alreadyLabeled += 1;
      continue;
    }
    await fs.writeFile(file, next);
    updated += 1;
  }

  console.log(
    `Transcriber metadata: ${updated} updated, ${alreadyLabeled} already labeled, ${missingRecord} without a matching database record.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
