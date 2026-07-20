import { NextResponse } from "next/server";

import { openExportFolder } from "@/lib/export/local-export";

export const runtime = "nodejs";

export async function POST() {
  try {
    return NextResponse.json({ path: await openExportFolder() });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not open the folder.",
      },
      { status: 400 },
    );
  }
}
