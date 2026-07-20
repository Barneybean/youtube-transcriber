import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

import { buildVideoFilename, safePathSegment } from "./export-utils";
import { getOutputRoot } from "./local-export";
import { classifyYtdlpError, getYtdlpPath } from "../transcription/whisper";

// Downloaded videos live inside the transcript library, one level below the
// channel folder so heavy media never crowds the Markdown files:
//   <YTT_EXPORT_ROOT>/<Channel Name>/video/<YYYY-MM-DD - Title [id]>.mp4
const VIDEO_SUBDIR = "video";

const YTDLP_BROWSER = process.env.YTDLP_BROWSER?.trim() || "chrome:Default";
const DOWNLOAD_FORMAT = process.env.VIDEO_DOWNLOAD_FORMAT?.trim() || "bv*+ba/b";
const DOWNLOAD_TIMEOUT_MS = (() => {
  const value = Number(process.env.VIDEO_DOWNLOAD_TIMEOUT_MS?.trim());
  return Number.isFinite(value) && value > 0 ? value : 900_000;
})();

export interface VideoDownloadResult {
  file: string;
  fileName: string;
  title: string;
  channel: string;
  videoId: string;
  sizeBytes: number;
  skipped: boolean;
}

interface VideoMetadata {
  id: string;
  title: string;
  channel: string;
  uploadDate?: string;
}

const globalForDownload = globalThis as typeof globalThis & {
  youtubeVideoDownloads?: Set<string>;
};

const inFlight =
  globalForDownload.youtubeVideoDownloads ??
  (globalForDownload.youtubeVideoDownloads = new Set<string>());

function runYtdlp(args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      getYtdlpPath(),
      args,
      { maxBuffer: 10 * 1024 * 1024 },
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
      reject(new Error("Video download timed out. Try again."));
    }, timeoutMs);
  });
}

function isAuthError(message: string): boolean {
  return /sign in to confirm|age-restricted|available to this channel.?s members|members-only content|account cookies are no longer valid/i.test(
    message,
  );
}

async function fetchVideoMetadata(url: string): Promise<VideoMetadata> {
  const args = [
    "--no-playlist",
    "--no-warnings",
    "--skip-download",
    "--print", "%(id)s",
    "--print", "%(title)s",
    "--print", "%(channel,uploader|Unknown Channel)s",
    "--print", "%(upload_date>%Y-%m-%d|)s",
    url,
  ];

  let stdout: string;
  try {
    stdout = await runYtdlp(args, 60_000);
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    if (!isAuthError(raw)) throw new Error(classifyYtdlpError(raw));
    stdout = await runYtdlp(
      ["--cookies-from-browser", YTDLP_BROWSER, ...args],
      60_000,
    ).catch((cookieError) => {
      const cookieRaw =
        cookieError instanceof Error ? cookieError.message : String(cookieError);
      throw new Error(classifyYtdlpError(cookieRaw));
    });
  }

  const [id, title, channel, uploadDate] = stdout
    .split("\n")
    .map((line) => line.trim());
  if (!id || !/^[\w-]{11}$/.test(id)) {
    throw new Error(
      "Video download needs a single YouTube video URL, not a channel or playlist.",
    );
  }

  return {
    id,
    title: title || `YouTube video ${id}`,
    channel: channel || "Unknown Channel",
    uploadDate: uploadDate || undefined,
  };
}

async function findExistingVideoFile(
  outputDir: string,
  videoId: string,
): Promise<string | null> {
  const files = await fs.readdir(outputDir).catch(() => [] as string[]);
  const pattern = new RegExp(`\\[${videoId}\\]\\.(mp4|mkv|webm|mov)$`);
  const match = files.find((file) => pattern.test(file));
  return match ? path.join(outputDir, match) : null;
}

/**
 * Download the full video as MP4 into the transcript library:
 * <export root>/<Channel>/video/<YYYY-MM-DD - Title [id]>.mp4
 *
 * Skips the download when a file for the same video id already exists.
 * Retries with signed-in browser cookies for members-only content.
 */
export async function downloadVideoMp4(url: string): Promise<VideoDownloadResult> {
  const meta = await fetchVideoMetadata(url);

  if (inFlight.has(meta.id)) {
    throw new Error("This video is already downloading.");
  }

  const outputDir = path.join(
    getOutputRoot(),
    safePathSegment(meta.channel),
    VIDEO_SUBDIR,
  );
  await fs.mkdir(outputDir, { recursive: true });

  const base = (result: string | null, skipped: boolean) => ({
    title: meta.title,
    channel: meta.channel,
    videoId: meta.id,
    skipped,
    file: result ?? "",
    fileName: result ? path.basename(result) : "",
    sizeBytes: 0,
  });

  const existing = await findExistingVideoFile(outputDir, meta.id);
  if (existing) {
    const stat = await fs.stat(existing);
    return { ...base(existing, true), sizeBytes: stat.size };
  }

  const fileName = buildVideoFilename(meta.title, meta.id, meta.uploadDate);
  const template = path.join(
    outputDir,
    `${fileName.replace(/\.mp4$/, "")}.%(ext)s`,
  );
  const args = [
    "-f", DOWNLOAD_FORMAT,
    "--merge-output-format", "mp4",
    "-o", template,
    "--no-playlist",
    "--no-progress",
    "--no-warnings",
    url,
  ];

  inFlight.add(meta.id);
  try {
    try {
      await runYtdlp(args, DOWNLOAD_TIMEOUT_MS);
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error);
      if (!isAuthError(raw)) throw new Error(classifyYtdlpError(raw));
      console.log(
        `[video-download] Auth required for ${meta.id}, retrying with browser cookies...`,
      );
      await runYtdlp(
        ["--cookies-from-browser", YTDLP_BROWSER, ...args],
        DOWNLOAD_TIMEOUT_MS,
      ).catch((cookieError) => {
        const cookieRaw =
          cookieError instanceof Error
            ? cookieError.message
            : String(cookieError);
        throw new Error(classifyYtdlpError(cookieRaw));
      });
    }

    const saved =
      (await findExistingVideoFile(outputDir, meta.id)) ??
      path.join(outputDir, fileName);
    const stat = await fs.stat(saved).catch(() => null);
    if (!stat) {
      throw new Error("The download finished but no video file was written.");
    }
    console.log(
      `[video-download] Saved ${meta.id} → ${saved} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`,
    );
    return { ...base(saved, false), sizeBytes: stat.size };
  } finally {
    inFlight.delete(meta.id);
  }
}
