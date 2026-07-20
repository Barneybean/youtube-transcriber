import type { TranscriptSegment } from "../types";
import { formatTranscriptionSource } from "../transcription/transcription-policy";
import { formatTimestamp } from "../utils";

const INVALID_PATH_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;

export function safePathSegment(
  value: string,
  fallback = "Unknown Channel",
): string {
  const safe = value
    .normalize("NFKC")
    .replace(INVALID_PATH_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+$/, "")
    .trim()
    .slice(0, 120);

  return safe || fallback;
}

export function buildTranscriptFilename(
  index: number,
  total: number,
  title: string,
  videoId: string,
): string {
  const width = Math.max(2, String(total).length);
  const order = String(index).padStart(width, "0");
  const safeTitle = safePathSegment(title, "Untitled");
  return `${order} - ${safeTitle} [${videoId}].md`;
}

export function buildVideoFilename(
  title: string,
  videoId: string,
  uploadDate?: string,
): string {
  const safeTitle = safePathSegment(title, "Untitled");
  const datePrefix = /^\d{4}-\d{2}-\d{2}$/.test(uploadDate ?? "")
    ? `${uploadDate} - `
    : "";
  return `${datePrefix}${safeTitle} [${videoId}].mp4`;
}

export function renderTranscriptMarkdown({
  title,
  author,
  videoUrl,
  capturedAt,
  source,
  segments,
}: {
  title: string;
  author: string;
  videoUrl: string;
  capturedAt: Date;
  source: string;
  segments: TranscriptSegment[];
}): string {
  const lines = [
    `# ${title}`,
    "",
    `**Channel:** ${author}`,
    `**URL:** ${videoUrl}`,
    `**Captured:** ${capturedAt.toISOString().slice(0, 10)}`,
    `**Transcriber:** ${formatTranscriptionSource(source)}`,
    "",
    "---",
    "",
    "## Transcript",
    "",
    ...segments.map((segment, index) => {
      const previous = segments[index - 1];
      const speakerChanged =
        segment.speaker && (!previous || previous.speaker !== segment.speaker);
      const speaker = speakerChanged ? `**${segment.speaker}:** ` : "";
      return `[${formatTimestamp(segment.startMs)}] ${speaker}${segment.text}`;
    }),
    "",
  ];

  return lines.join("\n");
}
