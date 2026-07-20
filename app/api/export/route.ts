import { NextResponse } from "next/server";

import {
  cancelExportJob,
  getExportJob,
  getOutputRoot,
  startExportJob,
} from "@/lib/local-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    job: getExportJob(),
    outputRoot: getOutputRoot(),
  });
}

export async function POST(request: Request) {
  let body: { url?: unknown; year?: unknown };
  try {
    body = (await request.json()) as { url?: unknown; year?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (typeof body.url !== "string" || !body.url.trim()) {
    return NextResponse.json(
      { error: "Paste a YouTube video or channel URL." },
      { status: 400 },
    );
  }

  if (body.year !== undefined && typeof body.year !== "number") {
    return NextResponse.json(
      { error: "The export year must be a number." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      { job: startExportJob(body.url, { year: body.year }) },
      { status: 202 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not start export.";
    const status = message === "An export is already running." ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE() {
  return NextResponse.json({ job: cancelExportJob() });
}
