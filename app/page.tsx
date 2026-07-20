"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

type ExportPhase =
  "discovering" | "running" | "completed" | "failed" | "cancelled";
type ExportItemState = "queued" | "processing" | "saved" | "skipped" | "failed";

interface ExportItem {
  index: number;
  videoId: string;
  title: string;
  url: string;
  state: ExportItemState;
  detail?: string;
  file?: string;
  segments?: number;
  attempts?: number;
}

interface ExportJob {
  id: string;
  url: string;
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
  items: ExportItem[];
}

type HealthState = "checking" | "ready" | "unavailable";

const buttonFocus =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--accent))]";

function FolderIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <path d="M3.75 6.75h5l1.5 2h10v8.5a2 2 0 0 1-2 2H5.75a2 2 0 0 1-2-2V6.75Z" />
      <path d="M3.75 8.75h16.5" />
    </svg>
  );
}

function FileIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <path d="M6.75 3.75h7l3.5 3.5v13H6.75v-16.5Z" />
      <path d="M13.75 3.75v4h3.5M9 12h6M9 15.5h6" />
    </svg>
  );
}

function StatusMark({ state }: { state: ExportItemState }) {
  if (state === "processing") {
    return (
      <span
        className="mt-1.5 h-2 w-2 shrink-0 animate-pulse rounded-full bg-[hsl(var(--accent))]"
        aria-hidden="true"
      />
    );
  }
  if (state === "failed") {
    return (
      <span
        className="mt-1.5 flex h-3 w-3 shrink-0 items-center justify-center text-[10px] font-semibold text-red-300"
        aria-hidden="true"
      >
        ×
      </span>
    );
  }
  return (
    <svg
      className="mt-1 h-3.5 w-3.5 shrink-0 text-[hsl(var(--muted-2))]"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      {state === "saved" ? (
        <path d="m3.25 8.25 3 3 6.5-7" />
      ) : (
        <path d="M3 8h10" />
      )}
    </svg>
  );
}

function itemLabel(state: ExportItemState): string {
  switch (state) {
    case "processing":
      return "In progress";
    case "saved":
      return "Saved";
    case "skipped":
      return "Already present";
    case "failed":
      return "Failed";
    default:
      return "Queued";
  }
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [job, setJob] = useState<ExportJob | null>(null);
  const [outputRoot, setOutputRoot] = useState(
    "~/Desktop/AI Trading/Youtube_Transcript",
  );
  const [health, setHealth] = useState<HealthState>("checking");
  const [submitting, setSubmitting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadResult, setDownloadResult] = useState<{
    file: string;
    skipped: boolean;
    note?: string;
  } | null>(null);
  const [openingFolder, setOpeningFolder] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshJob = useCallback(async () => {
    try {
      const response = await fetch("/api/export", { cache: "no-store" });
      if (!response.ok) throw new Error("Local export service is unavailable.");
      const data = (await response.json()) as {
        job: ExportJob | null;
        outputRoot: string;
      };
      setJob(data.job);
      setOutputRoot(data.outputRoot);
      setHealth("ready");
    } catch {
      setHealth("unavailable");
    }
  }, []);

  useEffect(() => {
    void refreshJob();
    const timer = window.setInterval(() => void refreshJob(), 1500);
    return () => window.clearInterval(timer);
  }, [refreshJob]);

  const isRunning = job?.phase === "discovering" || job?.phase === "running";
  const visibleItems = useMemo(
    () =>
      (job?.items ?? [])
        .filter((item) => item.state !== "queued")
        .slice(-7)
        .reverse(),
    [job?.items],
  );
  const compactOutputRoot = outputRoot.replace(/^\/Users\/[^/]+/, "~");

  async function startExport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!url.trim() || submitting || isRunning || health !== "ready") return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await response.json()) as {
        job?: ExportJob;
        error?: string;
      };
      if (!response.ok || !data.job) {
        throw new Error(data.error || "Could not start the export.");
      }
      setJob(data.job);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not start the export.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function downloadVideo() {
    if (!url.trim() || downloading || health !== "ready") return;
    setDownloading(true);
    setError(null);
    setDownloadResult(null);
    try {
      const response = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await response.json()) as {
        video?: { file: string; skipped: boolean };
        job?: ExportJob | null;
        transcriptNote?: string;
        error?: string;
      };
      if (!response.ok || !data.video) {
        throw new Error(data.error || "Could not download the video.");
      }
      setDownloadResult({
        file: data.video.file,
        skipped: data.video.skipped,
        note: data.transcriptNote,
      });
      if (data.job) setJob(data.job);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not download the video.",
      );
    } finally {
      setDownloading(false);
    }
  }

  async function stopExport() {
    setError(null);
    try {
      const response = await fetch("/api/export", { method: "DELETE" });
      const data = (await response.json()) as { job: ExportJob | null };
      setJob(data.job);
    } catch {
      setError(
        "Could not stop the export. It may still finish the current video.",
      );
    }
  }

  async function openFolder() {
    setOpeningFolder(true);
    setError(null);
    try {
      const response = await fetch("/api/export/open", { method: "POST" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(data.error || "Could not open the folder.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not open the folder.",
      );
    } finally {
      setOpeningFolder(false);
    }
  }

  const primaryButtonCopy =
    health === "checking"
      ? "Checking local service…"
      : health === "unavailable"
        ? "Local service unavailable"
        : submitting
          ? "Starting export…"
          : isRunning
            ? "Export in progress"
            : job?.phase === "completed"
              ? "Start another export"
              : "Start export";

  return (
    <main className="min-h-screen overflow-x-hidden px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full min-w-0 max-w-3xl">
        <header className="mb-10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[hsl(var(--panel))] text-[hsl(var(--muted))] shadow-[var(--edge)]">
              <FileIcon className="h-4.5 w-4.5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-[hsl(var(--text))]">
                Transcript Desk
              </p>
              <p className="text-xs text-[hsl(var(--muted-2))]">
                Local YouTube research files
              </p>
            </div>
          </div>
          <div
            className="flex items-center gap-2 text-xs text-[hsl(var(--muted-2))]"
            aria-live="polite"
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                health === "ready"
                  ? "bg-[hsl(var(--accent))]"
                  : health === "unavailable"
                    ? "bg-red-300"
                    : "animate-pulse bg-[hsl(var(--muted-2))]"
              }`}
              aria-hidden="true"
            />
            {health === "ready"
              ? "Ready"
              : health === "unavailable"
                ? "Unavailable"
                : "Checking"}
          </div>
        </header>

        <section aria-labelledby="page-title" className="mb-8">
          <h1
            id="page-title"
            className="max-w-xl text-2xl font-semibold tracking-[-0.02em] text-[hsl(var(--text))]"
          >
            Turn YouTube research into local Markdown.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[hsl(var(--muted))]">
            Paste one video or an entire channel. Completed transcripts are
            organized by channel and saved directly to your Desktop.
          </p>
        </section>

        <form
          onSubmit={startExport}
          className="w-full min-w-0 max-w-full overflow-hidden rounded-xl bg-[hsl(var(--panel))] p-5 shadow-[var(--edge-strong)] sm:p-6"
        >
          <label
            htmlFor="youtube-url"
            className="text-xs font-medium text-[hsl(var(--muted))]"
          >
            YouTube video or channel URL
          </label>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <input
              id="youtube-url"
              type="url"
              inputMode="url"
              autoComplete="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://www.youtube.com/@channel/videos"
              disabled={isRunning}
              aria-invalid={Boolean(error)}
              aria-describedby="url-help"
              className={`min-h-12 min-w-0 flex-1 rounded-md bg-[hsl(var(--bg))] px-4 py-3 text-sm text-[hsl(var(--text))] shadow-[var(--edge)] transition-[box-shadow,background,color] duration-150 placeholder:text-[hsl(var(--muted-2))] hover:bg-white/[0.02] focus-visible:shadow-[var(--edge-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--accent))] disabled:cursor-not-allowed disabled:bg-[hsl(var(--panel-2))] disabled:text-[hsl(var(--muted-2))] ${
                error ? "shadow-[var(--edge-danger)]" : ""
              }`}
            />
            <button
              type="submit"
              disabled={
                !url.trim() || isRunning || submitting || health !== "ready"
              }
              aria-busy={submitting}
              className={`min-h-12 shrink-0 rounded-md bg-[hsl(var(--accent))] px-5 py-3 text-sm font-medium text-[hsl(var(--bg))] shadow-[var(--edge-top)] transition-[box-shadow,background,color] duration-150 hover:bg-[hsl(var(--accent)/0.9)] active:bg-[hsl(var(--accent)/0.82)] disabled:cursor-not-allowed disabled:bg-[hsl(var(--panel-2))] disabled:text-[hsl(var(--muted-2))] disabled:shadow-[var(--edge)] ${buttonFocus}`}
            >
              {primaryButtonCopy}
            </button>
            <button
              type="button"
              onClick={downloadVideo}
              disabled={
                !url.trim() || downloading || health !== "ready"
              }
              aria-busy={downloading}
              title="Download the full video as MP4 and extract its transcript"
              className={`min-h-12 shrink-0 rounded-md bg-[hsl(var(--panel-2))] px-4 py-3 text-sm font-medium text-[hsl(var(--muted))] shadow-[var(--edge)] transition-[box-shadow,background,color] duration-150 hover:bg-white/[0.04] hover:text-[hsl(var(--text))] active:bg-white/[0.06] disabled:cursor-not-allowed disabled:text-[hsl(var(--muted-2))] disabled:hover:bg-[hsl(var(--panel-2))] ${buttonFocus}`}
            >
              {downloading ? "Downloading…" : "MP4 + transcript"}
            </button>
          </div>
          <div
            id="url-help"
            className="mt-3 flex flex-col gap-1 text-xs text-[hsl(var(--muted-2))] sm:flex-row sm:items-center sm:justify-between"
          >
            <span>Signed-in Chrome is used for members-only videos.</span>
            <span className="break-all font-mono">
              Output: {compactOutputRoot}/&lt;Channel&gt;
            </span>
          </div>
          {error && (
            <p
              className="mt-4 rounded-md bg-red-400/[0.06] px-3 py-3 text-sm leading-5 text-red-200 shadow-[var(--edge-danger)]"
              role="alert"
            >
              {error}
            </p>
          )}
          {downloadResult && (
            <div
              className="mt-4 flex items-start gap-2 rounded-md bg-[hsl(var(--bg))] px-3 py-3 text-xs shadow-[var(--edge)]"
              role="status"
            >
              <FileIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--muted-2))]" />
              <div className="min-w-0">
                <p className="text-[hsl(var(--muted))]">
                  {downloadResult.skipped
                    ? "Video already in your library"
                    : "Video saved"}
                  {!downloadResult.note && " · transcript export started"}
                </p>
                <p className="mt-1 break-all font-mono leading-5 text-[hsl(var(--muted-2))]">
                  {downloadResult.file}
                </p>
                {downloadResult.note && (
                  <p className="mt-1 leading-5 text-[hsl(var(--muted-2))]">
                    {downloadResult.note}
                  </p>
                )}
              </div>
            </div>
          )}
        </form>

        <section
          aria-labelledby="work-status-title"
          className="mt-6 w-full min-w-0 max-w-full overflow-hidden rounded-xl bg-[hsl(var(--panel))] p-5 shadow-[var(--edge)] sm:p-6"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p
                id="work-status-title"
                className="text-xs font-medium text-[hsl(var(--muted-2))]"
              >
                Work status
              </p>
              <h2 className="mt-1 text-base font-semibold text-[hsl(var(--text))]">
                {job?.statusText ?? "Ready for a YouTube URL"}
              </h2>
            </div>
            {isRunning ? (
              <button
                type="button"
                onClick={stopExport}
                className={`min-h-11 rounded-md bg-[hsl(var(--panel-2))] px-4 py-3 text-xs font-medium text-[hsl(var(--muted))] shadow-[var(--edge)] transition-[box-shadow,background,color] duration-150 hover:bg-white/[0.04] active:bg-white/[0.06] ${buttonFocus}`}
              >
                Stop after current
              </button>
            ) : job?.outputDir ? (
              <button
                type="button"
                onClick={openFolder}
                disabled={openingFolder}
                aria-busy={openingFolder}
                className={`inline-flex min-h-11 items-center gap-2 rounded-md bg-[hsl(var(--panel-2))] px-4 py-3 text-xs font-medium text-[hsl(var(--muted))] shadow-[var(--edge)] transition-[box-shadow,background,color] duration-150 hover:bg-white/[0.04] hover:text-[hsl(var(--text))] active:bg-white/[0.06] disabled:cursor-not-allowed disabled:text-[hsl(var(--muted-2))] ${buttonFocus}`}
              >
                <FolderIcon />
                {openingFolder ? "Opening…" : "Open folder"}
              </button>
            ) : null}
          </div>

          {job ? (
            <div className="mt-5" aria-live="polite">
              <div
                className="h-1.5 overflow-hidden rounded-full bg-[hsl(var(--panel-2))]"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(job.progress)}
                aria-label="Export progress"
              >
                <div
                  className="h-full rounded-full bg-[hsl(var(--accent))] transition-[width] duration-150"
                  style={{
                    width: `${Math.max(0, Math.min(100, job.progress))}%`,
                  }}
                />
              </div>

              <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs">
                <div className="flex gap-2">
                  <dt className="text-[hsl(var(--muted-2))]">Processed</dt>
                  <dd className="font-mono text-[hsl(var(--muted))]">
                    {job.completed}/{job.total || "…"}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-[hsl(var(--muted-2))]">Saved</dt>
                  <dd className="font-mono text-[hsl(var(--muted))]">
                    {job.saved}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="text-[hsl(var(--muted-2))]">
                    Already present
                  </dt>
                  <dd className="font-mono text-[hsl(var(--muted))]">
                    {job.skipped}
                  </dd>
                </div>
                {job.failed > 0 && (
                  <div className="flex gap-2">
                    <dt className="text-red-300">Failed</dt>
                    <dd className="font-mono text-red-200">{job.failed}</dd>
                  </div>
                )}
              </dl>

              {job.outputDir && (
                <div className="mt-4 flex items-start gap-2 rounded-md bg-[hsl(var(--bg))] px-3 py-3 text-xs shadow-[var(--edge)]">
                  <FolderIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--muted-2))]" />
                  <span className="break-all font-mono leading-5 text-[hsl(var(--muted-2))]">
                    {job.outputDir}
                  </span>
                </div>
              )}

              {job.error && (
                <div
                  className="mt-4 rounded-md bg-red-400/[0.06] px-3 py-3 text-sm leading-5 text-red-200 shadow-[var(--edge-danger)]"
                  role="alert"
                >
                  <p>{job.error}</p>
                  <p className="mt-1 text-xs text-red-200/70">
                    Completed files are safe. Start the same URL again to
                    resume.
                  </p>
                </div>
              )}

              {visibleItems.length > 0 && (
                <div className="mt-5">
                  <p className="text-xs font-medium text-[hsl(var(--muted-2))]">
                    Latest activity
                  </p>
                  <ol className="mt-2 space-y-2">
                    {visibleItems.map((item) => (
                      <li
                        key={item.videoId}
                        className="flex items-start gap-3 rounded-md bg-[hsl(var(--panel-2))] px-3 py-3 shadow-[var(--edge)]"
                      >
                        <StatusMark state={item.state} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                            <p className="truncate text-sm text-[hsl(var(--muted))]">
                              {item.title}
                            </p>
                            <span className="shrink-0 text-xs text-[hsl(var(--muted-2))]">
                              {itemLabel(item.state)}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-xs text-[hsl(var(--muted-2))]">
                            {item.detail}
                            {item.segments
                              ? ` · ${item.segments.toLocaleString()} segments`
                              : ""}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-5 rounded-md bg-[hsl(var(--panel-2))] px-4 py-5 shadow-[var(--edge)]">
              <p className="text-sm text-[hsl(var(--muted))]">
                Nothing is running.
              </p>
              <p className="mt-1 text-xs leading-5 text-[hsl(var(--muted-2))]">
                Channel exports skip existing files and continue from the first
                missing transcript.
              </p>
            </div>
          )}
        </section>

        <footer className="mt-6 flex flex-col gap-1 px-1 text-xs leading-5 text-[hsl(var(--muted-2))] sm:flex-row sm:items-center sm:justify-between">
          <span>Captions first, local Whisper when needed.</span>
          <span>Your transcript files stay on this Mac.</span>
        </footer>
      </div>
    </main>
  );
}
