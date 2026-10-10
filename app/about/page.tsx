import type { Metadata } from "next";
import Link from "next/link";
import { publicSiteUrl, SITE_DESCRIPTION } from "../../lib/site-metadata.js";

export const metadata: Metadata = {
  title: "About the local YouTube transcript generator",
  description:
    "Learn how Transcript Desk converts YouTube videos and channels into private, timestamped Markdown with captions or Whisper speech-to-text.",
  alternates: publicSiteUrl ? { canonical: "/about" } : undefined,
};

const answers = [
  {
    question: "What is Transcript Desk?",
    answer:
      "Transcript Desk is a free, open-source YouTube transcript generator that runs on your computer. Paste one video or a channel URL and it saves timestamped Markdown files organized by channel.",
  },
  {
    question: "Does it work when a video has no captions?",
    answer:
      "Yes. It tries official or auto-generated YouTube captions first, then configured cloud Whisper providers, and finally local Whisper. Every saved transcript records which engine produced it.",
  },
  {
    question: "Can it transcribe an entire YouTube channel?",
    answer:
      "Yes. Channel exports are checkpointed: completed files are skipped on later runs, failures can be retried, and an active batch can stop safely without discarding finished transcripts.",
  },
  {
    question: "Is it private and free?",
    answer:
      "The app, SQLite library, Markdown files, and local Whisper pipeline stay on your machine. Local transcription needs no API key. Data leaves the machine only when you explicitly configure a cloud transcription or proofreading provider.",
  },
  {
    question: "Can it download the video too?",
    answer:
      "Yes. The MP4 plus transcript action saves the full video under the channel's video folder and runs the same transcript pipeline alongside it.",
  },
];

export default function AboutPage() {
  return (
    <main className="min-h-screen px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-3xl">
        <header className="mb-10 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-[hsl(var(--muted-2))]">
              Transcript Desk
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-[hsl(var(--text))]">
              Local YouTube transcription, built for files you keep.
            </h1>
          </div>
          <Link
            href="/"
            className="text-xs text-[hsl(var(--muted-2))] underline decoration-[hsl(var(--accent))] underline-offset-4 transition-[box-shadow,background,color] duration-150 hover:text-[hsl(var(--muted))] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--accent))]"
          >
            Back to app
          </Link>
        </header>

        <section className="rounded-xl bg-[hsl(var(--panel))] p-5 shadow-[var(--edge-strong)] sm:p-6">
          <p className="text-sm leading-6 text-[hsl(var(--muted))]">
            {SITE_DESCRIPTION} The project is designed for researchers,
            students, journalists, and anyone who wants searchable source files
            instead of another hosted transcript silo.
          </p>

          <h2 className="mt-8 text-base font-semibold text-[hsl(var(--text))]">
            How transcription works
          </h2>
          <ol className="mt-4 space-y-4 text-sm leading-6 text-[hsl(var(--muted))]">
            <li>
              <strong className="text-[hsl(var(--text))]">1. Fast path:</strong>{" "}
              use available YouTube captions, including a configured language
              priority list.
            </li>
            <li>
              <strong className="text-[hsl(var(--text))]">
                2. Speech-to-text:
              </strong>{" "}
              use an optional cloud Whisper provider or local Whisper when
              captions are unavailable.
            </li>
            <li>
              <strong className="text-[hsl(var(--text))]">
                3. Quality pass:
              </strong>{" "}
              detect repetition collapse, retry damaged windows with a stronger
              model, and optionally proofread likely ASR errors.
            </li>
            <li>
              <strong className="text-[hsl(var(--text))]">
                4. File export:
              </strong>{" "}
              save dated, timestamped Markdown under the channel name so the
              result works with search, notes, scripts, and AI tools.
            </li>
          </ol>
        </section>

        <section className="mt-6 rounded-xl bg-[hsl(var(--panel))] p-5 shadow-[var(--edge-strong)] sm:p-6">
          <h2 className="text-base font-semibold text-[hsl(var(--text))]">
            Common questions
          </h2>
          <dl className="mt-5 space-y-6">
            {answers.map(({ question, answer }) => (
              <div key={question}>
                <dt className="text-sm font-semibold text-[hsl(var(--text))]">
                  {question}
                </dt>
                <dd className="mt-2 text-sm leading-6 text-[hsl(var(--muted))]">
                  {answer}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-6 rounded-xl bg-[hsl(var(--panel))] p-5 shadow-[var(--edge-strong)] sm:p-6">
          <h2 className="text-base font-semibold text-[hsl(var(--text))]">
            Open source and local-first
          </h2>
          <p className="mt-3 text-sm leading-6 text-[hsl(var(--muted))]">
            Transcript Desk is an AGPL-3.0 fork of{" "}
            <a
              href="https://github.com/lifesized/youtube-transcriber"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[hsl(var(--text))] underline decoration-[hsl(var(--accent))] underline-offset-4"
            >
              lifesized/youtube-transcriber
            </a>
            , simplified around a local file-first workflow. The complete
            modified source, setup instructions, REST API, and change history
            are available in the{" "}
            <a
              href="https://github.com/Barneybean/youtube-transcriber"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[hsl(var(--text))] underline decoration-[hsl(var(--accent))] underline-offset-4"
            >
              project repository
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
