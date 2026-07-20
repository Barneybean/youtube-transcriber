import { NextResponse } from "next/server";

import { startExportJob } from "@/lib/export/local-export";
import { downloadVideoMp4 } from "@/lib/export/video-download";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Video downloads can take minutes; keep the route alive for the duration.
export const maxDuration = 900;

export async function POST(request: Request) {
  let body: { url?: unknown; transcript?: unknown };
  try {
    body = (await request.json()) as { url?: unknown; transcript?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body.url !== "string" || !body.url.trim()) {
    return NextResponse.json(
      { error: "Paste a YouTube video URL." },
      { status: 400 },
    );
  }
  const wantTranscript = body.transcript !== false;

  let video;
  try {
    video = await downloadVideoMp4(body.url);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not download the video.";
    const status = message === "This video is already downloading." ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }

  // The MP4 is on disk; transcript extraction rides the normal export
  // pipeline (captions → Whisper → repair → proofread) as a background job.
  let job = null;
  let transcriptNote: string | undefined;
  if (wantTranscript) {
    try {
      job = startExportJob(body.url);
    } catch (error) {
      transcriptNote =
        error instanceof Error && error.message === "An export is already running."
          ? "Video saved. Transcript not started: an export is already running — start it again when the current export finishes."
          : `Video saved. Transcript not started: ${error instanceof Error ? error.message : "unknown error"}`;
    }
  }

  return NextResponse.json({ video, job, transcriptNote });
}
