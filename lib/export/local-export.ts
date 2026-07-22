import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import {
  buildTranscriptFilename,
  renderTranscriptMarkdown,
  safePathSegment,
} from "./export-utils";
import { prisma } from "../prisma";
import { transcriptionProgress, type ProgressEvent } from "../progress";
import { getVideoTranscript } from "../transcript";
import {
  addTranscriptionSourceMetadata,
  formatTranscriptionSource,
} from "../transcription/transcription-policy";
import type { TranscriptSegment } from "../types";
import { getYtdlpPath } from "../transcription/whisper";

// Default export root: <repo>/transcript/<Channel Name>/<video>.md.
// Override with YTT_EXPORT_ROOT to keep a library elsewhere.
const OUTPUT_ROOT =
  process.env.YTT_EXPORT_ROOT?.trim() || path.join(process.cwd(), "transcript");
const YTDLP_BROWSER = process.env.YTDLP_BROWSER?.trim() || "chrome:Default";

export type ExportPhase =
  "discovering" | "running" | "completed" | "failed" | "cancelled";

export type ExportItemState =
  "queued" | "processing" | "saved" | "skipped" | "failed";

export interface ExportItemSnapshot {
  index: number;
  videoId: string;
  title: string;
  url: string;
  state: ExportItemState;
  detail?: string;
  file?: string;
  segments?: number;
  source?: string;
  attempts?: number;
}

export interface ExportJobSnapshot {
  id: string;
  url: string;
  year?: number;
  phase: ExportPhase;
  channelName?: string;
  outputDir?: string;
  total: number;
  completed: number;
  saved: number;
  skipped: number;
  failed: number;
  progress: number;
  statusText: string;
  currentIndex?: number;
  currentTitle?: string;
  error?: string;
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
  items: ExportItemSnapshot[];
}

interface ExportJob extends ExportJobSnapshot {
  cancelRequested: boolean;
}

interface YtdlpEntry {
  id?: string;
  title?: string;
  url?: string;
  webpage_url?: string;
  availability?: string | null;
  channel?: string;
  uploader?: string;
  channel_url?: string;
}

interface YtdlpCollection extends YtdlpEntry {
  entries?: YtdlpEntry[];
}

interface DiscoveredVideo {
  id: string;
  title: string;
  url: string;
  availability?: string | null;
}

interface DiscoveryResult {
  channelName: string;
  channelUrl?: string;
  videos: DiscoveredVideo[];
}

interface GlobalExportState {
  job?: ExportJob;
  task?: Promise<void>;
}

const globalForExport = globalThis as typeof globalThis & {
  youtubeLocalExport?: GlobalExportState;
};

const exportState =
  globalForExport.youtubeLocalExport ??
  (globalForExport.youtubeLocalExport = {});

function now(): string {
  return new Date().toISOString();
}

function publicSnapshot(job: ExportJob | undefined): ExportJobSnapshot | null {
  if (!job) return null;
  const { cancelRequested: _cancelRequested, ...snapshot } = job;
  return structuredClone(snapshot);
}

function touch(job: ExportJob): void {
  job.updatedAt = now();
}

function validateYoutubeUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Paste a valid YouTube video or channel URL.");
  }

  const host = url.hostname.replace(/^www\./, "");
  if (!["youtube.com", "m.youtube.com", "youtu.be"].includes(host)) {
    throw new Error("This focused workflow accepts YouTube URLs only.");
  }

  if (host !== "youtu.be") {
    const parts = url.pathname.split("/").filter(Boolean);
    const isVideo =
      url.pathname === "/watch" ||
      ["shorts", "live", "embed"].includes(parts[0] ?? "");
    const hasChannelTab = ["videos", "streams", "shorts"].includes(
      parts.at(-1) ?? "",
    );
    const isChannel =
      parts[0]?.startsWith("@") ||
      ["channel", "c", "user"].includes(parts[0] ?? "");

    if (!isVideo && isChannel && !hasChannelTab) {
      url.pathname = `${url.pathname.replace(/\/$/, "")}/videos`;
    }
  }

  return url.toString();
}

function isSingleVideoUrl(value: string): boolean {
  const url = new URL(value);
  if (url.hostname.replace(/^www\./, "") === "youtu.be") return true;
  const parts = url.pathname.split("/").filter(Boolean);
  return (
    url.pathname === "/watch" ||
    ["shorts", "live", "embed"].includes(parts[0] ?? "")
  );
}

function runYtdlp(args: string[], timeout = 180_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      getYtdlpPath(),
      args,
      { maxBuffer: 50 * 1024 * 1024 },
      (error, stdout, stderr) => {
        clearTimeout(timer);
        if (error) {
          reject(new Error([error.message, stderr].filter(Boolean).join("\n")));
          return;
        }
        resolve(stdout);
      },
    );
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("YouTube channel discovery timed out."));
    }, timeout);
  });
}

function friendlyDiscoveryError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);

  if (
    /find-generic-password|cannot decrypt|safe storage|keychain/i.test(message)
  ) {
    return new Error(
      "Chrome access is required for members-only videos. Approve Chrome Safe Storage in macOS, then start the export again.",
    );
  }
  if (/account cookies are no longer valid|cookies.*rotated/i.test(message)) {
    return new Error(
      "YouTube refreshed your Chrome session. Open the channel in Chrome, confirm you are signed in, then start the export again.",
    );
  }
  if (
    /available to this channel.?s members|members-only content/i.test(message)
  ) {
    return new Error(
      "The signed-in Chrome profile does not currently have access to this members-only content.",
    );
  }

  return new Error(
    message.split("\n").find((line) => line.startsWith("ERROR:")) ?? message,
  );
}

async function uploadYear(url: string): Promise<number | undefined> {
  try {
    const output = await runYtdlp([
      "--no-playlist",
      "--no-warnings",
      "--print",
      "%(upload_date)s",
      url,
    ]);
    const value = Number(output.trim().slice(0, 4));
    return Number.isInteger(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

async function filterVideosForYear(
  videos: DiscoveredVideo[],
  year: number,
): Promise<DiscoveredVideo[]> {
  const filtered: DiscoveredVideo[] = [];
  const batchSize = 8;

  // YouTube returns channel videos newest-first. Resolve dates only until the
  // first public video before the requested year, so old channel archives are
  // never queued for transcription.
  for (let start = 0; start < videos.length; start += batchSize) {
    const batch = videos.slice(start, start + batchSize);
    const years = await Promise.all(
      batch.map((video) =>
        isMembersOnlyVideo(video.availability)
          ? Promise.resolve(undefined)
          : uploadYear(video.url),
      ),
    );

    for (let index = 0; index < batch.length; index += 1) {
      const publishedYear = years[index];
      if (publishedYear !== undefined && publishedYear < year) {
        return filtered;
      }
      if (publishedYear === undefined || publishedYear === year) {
        filtered.push(batch[index]);
      }
    }
  }

  return filtered;
}

async function discoverVideos(
  inputUrl: string,
  year?: number,
): Promise<DiscoveryResult> {
  const url = validateYoutubeUrl(inputUrl);
  let stdout: string;

  try {
    const baseArgs = [
      "--flat-playlist",
      "--dump-single-json",
      "--no-warnings",
      url,
    ];
    if (isSingleVideoUrl(url)) {
      try {
        stdout = await runYtdlp(baseArgs);
      } catch {
        stdout = await runYtdlp([
          "--cookies-from-browser",
          YTDLP_BROWSER,
          ...baseArgs,
        ]);
      }
    } else {
      stdout = await runYtdlp([
        "--cookies-from-browser",
        YTDLP_BROWSER,
        ...baseArgs,
      ]);
    }
  } catch (error) {
    throw friendlyDiscoveryError(error);
  }

  let data: YtdlpCollection;
  try {
    data = JSON.parse(stdout) as YtdlpCollection;
  } catch {
    throw new Error("YouTube returned an unreadable channel inventory.");
  }

  const rawEntries = data.entries?.length ? data.entries : [data];
  const seen = new Set<string>();
  let videos: DiscoveredVideo[] = [];

  for (const entry of rawEntries) {
    const id = entry.id?.trim();
    if (!id || !/^[\w-]{11}$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    videos.push({
      id,
      title: entry.title?.trim() || `YouTube video ${id}`,
      url: entry.webpage_url || `https://www.youtube.com/watch?v=${id}`,
      availability: entry.availability,
    });
  }

  if (year) {
    videos = await filterVideosForYear(videos, year);
  }

  if (videos.length === 0) {
    throw new Error("No videos were found at this YouTube URL.");
  }

  return {
    channelName:
      data.channel?.trim() ||
      data.uploader?.trim() ||
      rawEntries.find((entry) => entry.channel || entry.uploader)?.channel ||
      rawEntries.find((entry) => entry.uploader)?.uploader ||
      "Unknown Channel",
    channelUrl: data.channel_url,
    videos,
  };
}

function isAuthenticationError(message: string): boolean {
  return /available to this channel.?s members|members-only content|account cookies are no longer valid|cookies.*rotated|safe storage|keychain|cannot decrypt/i.test(
    message,
  );
}

function isMembersOnlyVideo(availability?: string | null): boolean {
  return /subscriber.?only|member.?only|members.?only/i.test(
    availability ?? "",
  );
}

function isMembersOnlyError(message: string): boolean {
  return /available to this channel.?s members|members-only content|member.?only/i.test(
    message,
  );
}

async function refreshChromeSession(url: string): Promise<void> {
  if (process.platform !== "darwin") return;
  await new Promise<void>((resolve) => {
    execFile("open", ["-a", "Google Chrome", url], () => resolve());
  });
  await new Promise((resolve) => setTimeout(resolve, 10_000));
}

async function findExistingFiles(
  outputDir: string,
): Promise<Map<string, string>> {
  const files = await fs.readdir(outputDir).catch(() => [] as string[]);
  const result = new Map<string, string>();

  for (const file of files) {
    const match = file.match(/\[([\w-]{11})\]\.md$/);
    if (match) result.set(match[1], path.join(outputDir, file));
  }

  return result;
}

async function addSourceToExistingFile(
  file: string,
  source?: string | null,
): Promise<void> {
  if (!source) return;
  const markdown = await fs.readFile(file, "utf8").catch(() => "");
  if (!markdown || markdown.includes("**Transcriber:**")) return;

  const updated = addTranscriptionSourceMetadata(markdown, source);

  if (updated !== markdown) await fs.writeFile(file, updated);
}

async function saveJobFiles(job: ExportJob): Promise<void> {
  if (!job.outputDir) return;
  const successful = job.items.filter((item) => item.state === "saved");
  const skipped = job.items.filter((item) => item.state === "skipped");
  const failed = job.items.filter((item) => item.state === "failed");
  const pending = job.items.filter(
    (item) => item.state === "queued" || item.state === "processing",
  );
  const lines = [
    "YouTube transcript export",
    `Updated: ${job.updatedAt}`,
    `Channel: ${job.channelName ?? "Unknown Channel"}`,
    `Output: ${job.outputDir}`,
    `Saved: ${successful.length}`,
    `Already present: ${skipped.length}`,
    `Failed: ${failed.length}`,
    `Pending: ${pending.length}`,
    "",
    "Files:",
    ...successful.map(
      (item) => `- ${item.file} — ${formatTranscriptionSource(item.source)}`,
    ),
    ...skipped.map(
      (item) =>
        `- ${item.file} (already present) — ${formatTranscriptionSource(item.source)}`,
    ),
    "",
    "Failures:",
    ...(failed.length
      ? failed.map((item) => `- ${item.url}: ${item.detail}`)
      : ["- None"]),
    "",
  ];

  await Promise.all([
    fs.writeFile(
      path.join(job.outputDir, "export-summary.json"),
      `${JSON.stringify(publicSnapshot(job), null, 2)}\n`,
    ),
    fs.writeFile(
      path.join(job.outputDir, "export-summary.txt"),
      lines.join("\n"),
    ),
  ]);
}

async function persistAndExport(
  job: ExportJob,
  item: ExportItemSnapshot,
  channelName: string,
): Promise<{ file: string; segments: number; source: string }> {
  const existing = await prisma.video.findUnique({
    where: { videoId: item.videoId },
  });
  let title = existing?.title;
  let author = existing?.author;
  let videoUrl = existing?.videoUrl;
  let capturedAt = existing?.createdAt;
  let source = existing?.source;
  let segments: TranscriptSegment[] | undefined;

  if (existing?.transcript && existing.transcript !== "[]") {
    segments = JSON.parse(existing.transcript) as TranscriptSegment[];
  } else {
    const result = await getVideoTranscript(item.url);
    title = result.title === "Untitled" ? item.title : result.title;
    author = result.author === "Unknown" ? channelName : result.author;
    videoUrl = item.url;
    capturedAt = new Date();
    source = result.source;
    segments = result.transcript;

    await prisma.video.upsert({
      where: { videoId: item.videoId },
      update: {
        title,
        author,
        channelUrl: result.channelUrl,
        thumbnailUrl:
          result.thumbnailUrl ||
          `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`,
        videoUrl,
        transcript: JSON.stringify(segments),
        source: result.source,
        platform: "youtube",
      },
      create: {
        videoId: item.videoId,
        title,
        author,
        channelUrl: result.channelUrl,
        thumbnailUrl:
          result.thumbnailUrl ||
          `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`,
        videoUrl,
        transcript: JSON.stringify(segments),
        source: result.source,
        platform: "youtube",
      },
    });
  }

  const filename = buildTranscriptFilename(
    item.index,
    job.total,
    title || item.title,
    item.videoId,
  );
  const file = path.join(job.outputDir!, filename);
  const markdown = renderTranscriptMarkdown({
    title: title || item.title,
    author: author || channelName,
    videoUrl: videoUrl || item.url,
    capturedAt: capturedAt || new Date(),
    source: source || "unknown",
    segments: segments || [],
  });
  await fs.writeFile(file, markdown);

  return { file, segments: segments?.length ?? 0, source: source || "unknown" };
}

function updateFromProgress(
  job: ExportJob,
  item: ExportItemSnapshot,
  event: ProgressEvent,
): void {
  if (event.videoId && event.videoId !== item.videoId) return;
  const itemOffset = item.index - 1;
  job.progress = Math.min(
    99,
    ((itemOffset + Math.max(0, Math.min(100, event.progress)) / 100) /
      job.total) *
      100,
  );
  job.statusText = event.statusText;
  item.detail = event.statusText;
  touch(job);
}

async function processItem(
  job: ExportJob,
  item: ExportItemSnapshot,
  channelName: string,
): Promise<void> {
  let lastError = "Transcription failed";

  for (let attempt = 1; attempt <= 3; attempt++) {
    item.attempts = attempt;
    try {
      const result = await persistAndExport(job, item, channelName);
      item.file = result.file;
      item.segments = result.segments;
      item.source = result.source;
      item.state = "saved";
      item.detail =
        attempt > 1
          ? `Saved after ${attempt} attempts with ${formatTranscriptionSource(result.source)}`
          : `Saved with ${formatTranscriptionSource(result.source)}`;
      job.saved += 1;
      return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (isMembersOnlyError(lastError)) {
        item.state = "skipped";
        item.detail = "Members-only video";
        job.skipped += 1;
        return;
      }
      if (isAuthenticationError(lastError) && attempt < 3) {
        job.statusText = "Refreshing the signed-in Chrome session…";
        item.detail = job.statusText;
        touch(job);
        await refreshChromeSession(item.url);
        continue;
      }
      if (attempt < 3) {
        const delay = attempt * 10_000;
        job.statusText = `Retrying in ${delay / 1000} seconds…`;
        item.detail = job.statusText;
        touch(job);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  item.state = "failed";
  item.detail = lastError;
  job.failed += 1;

  if (isAuthenticationError(lastError)) {
    throw new Error(lastError);
  }
}

async function runExport(job: ExportJob): Promise<void> {
  try {
    const discovery = await discoverVideos(job.url, job.year);
    job.channelName = safePathSegment(discovery.channelName);
    job.outputDir = path.join(OUTPUT_ROOT, job.channelName);
    await fs.mkdir(job.outputDir, { recursive: true });
    const existingFiles = await findExistingFiles(job.outputDir);

    job.total = discovery.videos.length;
    job.items = discovery.videos.map((video, index) => ({
      index: index + 1,
      videoId: video.id,
      title: video.title,
      url: video.url,
      state: "queued",
      detail:
        video.availability === "subscriber_only"
          ? "Members-only video"
          : "Ready",
    }));
    job.phase = "running";
    job.statusText = `${job.total} video${job.total === 1 ? "" : "s"} found`;
    touch(job);

    await fs.writeFile(
      path.join(job.outputDir, "channel-inventory.json"),
      `${JSON.stringify(
        {
          channel: discovery.channelName,
          channelUrl: discovery.channelUrl,
          sourceUrl: job.url,
          year: job.year,
          videos: discovery.videos,
        },
        null,
        2,
      )}\n`,
    );

    for (const item of job.items) {
      if (job.cancelRequested) {
        job.phase = "cancelled";
        job.statusText = "Stopped after the current video";
        break;
      }

      // Channel batches skip members-only videos up front; a single-video
      // export is an explicit request, so attempt it — audio download retries
      // with signed-in browser cookies, and a true access failure still lands
      // in the members-only skip path below.
      if (
        job.total > 1 &&
        isMembersOnlyVideo(discovery.videos[item.index - 1]?.availability)
      ) {
        item.state = "skipped";
        item.detail = "Members-only video";
        job.skipped += 1;
        job.completed += 1;
        job.progress = (job.completed / job.total) * 100;
        touch(job);
        await saveJobFiles(job);
        continue;
      }

      const existingFile = existingFiles.get(item.videoId);
      if (existingFile) {
        const stored = await prisma.video.findUnique({
          where: { videoId: item.videoId },
          select: { source: true },
        });
        item.state = "skipped";
        item.source = stored?.source;
        item.detail = stored?.source
          ? `Already in the channel folder · ${formatTranscriptionSource(stored.source)}`
          : "Already in the channel folder";
        item.file = existingFile;
        await addSourceToExistingFile(existingFile, stored?.source);
        job.skipped += 1;
        job.completed += 1;
        job.progress = (job.completed / job.total) * 100;
        touch(job);
        await saveJobFiles(job);
        continue;
      }

      item.state = "processing";
      item.detail = "Starting…";
      job.currentIndex = item.index;
      job.currentTitle = item.title;
      job.statusText = `Processing ${item.index} of ${job.total}`;
      touch(job);

      const onProgress = (event: ProgressEvent) =>
        updateFromProgress(job, item, event);
      transcriptionProgress.on("progress", onProgress);
      try {
        await processItem(job, item, job.channelName);
      } finally {
        transcriptionProgress.removeListener("progress", onProgress);
      }

      job.completed += 1;
      job.progress = (job.completed / job.total) * 100;
      touch(job);
      await saveJobFiles(job);
    }

    if (job.phase === "running") {
      job.phase = "completed";
      job.progress = 100;
      job.currentIndex = undefined;
      job.currentTitle = undefined;
      job.statusText = job.failed
        ? `Finished with ${job.failed} failed video${job.failed === 1 ? "" : "s"}`
        : "All transcripts are saved";
    }
  } catch (error) {
    job.phase = "failed";
    job.error = error instanceof Error ? error.message : String(error);
    job.statusText = "Export needs attention";
  } finally {
    job.finishedAt = now();
    touch(job);
    await saveJobFiles(job).catch(() => undefined);
  }
}

export function getExportJob(): ExportJobSnapshot | null {
  return publicSnapshot(exportState.job);
}

export function startExportJob(
  url: string,
  options: { year?: number } = {},
): ExportJobSnapshot {
  const current = exportState.job;
  if (current && ["discovering", "running"].includes(current.phase)) {
    throw new Error("An export is already running.");
  }

  const timestamp = now();
  const year = options.year;
  if (year && (!Number.isInteger(year) || year < 2005 || year > 9999)) {
    throw new Error("The export year must be a four-digit year.");
  }
  const job: ExportJob = {
    id: randomUUID(),
    url: validateYoutubeUrl(url),
    year,
    phase: "discovering",
    total: 0,
    completed: 0,
    saved: 0,
    skipped: 0,
    failed: 0,
    progress: 0,
    statusText: year
      ? `Reading the YouTube source for ${year}…`
      : "Reading the YouTube source…",
    startedAt: timestamp,
    updatedAt: timestamp,
    items: [],
    cancelRequested: false,
  };

  exportState.job = job;
  exportState.task = runExport(job).finally(() => {
    exportState.task = undefined;
  });
  return publicSnapshot(job)!;
}

export function cancelExportJob(): ExportJobSnapshot | null {
  const job = exportState.job;
  if (!job || !["discovering", "running"].includes(job.phase)) {
    return publicSnapshot(job);
  }
  job.cancelRequested = true;
  job.statusText = "Stopping after the current video…";
  touch(job);
  return publicSnapshot(job);
}

export async function openExportFolder(): Promise<string> {
  const outputDir = exportState.job?.outputDir;
  if (!outputDir) throw new Error("No export folder is available yet.");

  const resolvedRoot = path.resolve(OUTPUT_ROOT);
  const resolvedOutput = path.resolve(outputDir);
  if (
    resolvedOutput !== resolvedRoot &&
    !resolvedOutput.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    throw new Error(
      "The export path is outside the configured transcript folder.",
    );
  }

  const command =
    process.platform === "darwin"
      ? ["open", [resolvedOutput]]
      : process.platform === "win32"
        ? ["explorer", [resolvedOutput]]
        : ["xdg-open", [resolvedOutput]];

  await new Promise<void>((resolve, reject) => {
    execFile(command[0] as string, command[1] as string[], (error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  return resolvedOutput;
}

export function getOutputRoot(): string {
  return OUTPUT_ROOT;
}
