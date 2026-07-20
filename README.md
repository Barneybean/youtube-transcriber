# Transcript Desk

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

**YouTube research to organized local Markdown in one click. Runs locally, costs nothing.**

A free, open-source **YouTube transcript generator**: paste a video or channel URL and get timestamped Markdown transcripts on disk, organized by channel. Convert YouTube to text with official captions or Whisper speech-to-text, batch-download transcripts for an entire channel, and keep everything searchable, private, and local. Built for research workflows where the files — not a web library — are the product.

| | |
|---|---|
| **What** | Local web app (Next.js 15) + REST API for YouTube transcription |
| **Runs at** | `http://localhost:19720` (`npm run dev`) |
| **Output** | `transcript/<Channel Name>/<date> - <title>.md` (configurable via `YTT_EXPORT_ROOT`) |
| **Storage** | Local SQLite (`dev.db`) — nothing leaves your machine by default |
| **Engines** | YouTube captions → optional cloud Whisper (Groq/OpenAI/OpenRouter) → local Whisper (MLX on Apple Silicon) |
| **Extras** | Automatic repetition-collapse repair · AI proofreading (API key or local Claude Code CLI) |
| **License** | AGPL-3.0 — fork of [lifesized/youtube-transcriber](https://github.com/lifesized/youtube-transcriber) |

## About this fork

Transcript Desk is a **fork and customization of [lifesized/youtube-transcriber](https://github.com/lifesized/youtube-transcriber)** by [lifesized](https://github.com/lifesized), simplified to the essential local file-first workflow. In accordance with the **GNU AGPL v3** license of the original project, this fork:

- is distributed under the **same AGPL-3.0 license** ([LICENSE](./LICENSE), original copyright retained);
- publishes its **complete modified source** in this repository;
- documents its changes in [CHANGELOG.md](./CHANGELOG.md).

Changes from upstream: **removed** the Chrome extension, MCP server, contrib skills, and hosted mode (local-only app); **added** the file-first channel export workflow, automatic collapse repair, and AI proofreading; restructured the code by domain. If you want the extension, hosted mode, or MCP server, use the [original project](https://github.com/lifesized/youtube-transcriber).

## Quickstart

```bash
git clone https://github.com/Barneybean/youtube-transcriber.git
cd youtube-transcriber
npm run setup     # installs yt-dlp, ffmpeg, Whisper, MLX (Apple Silicon), configures .env
npm run dev       # starts the app on http://localhost:19720
```

Open [http://localhost:19720](http://localhost:19720), paste a YouTube video or channel URL, and start. Transcripts land in `transcript/<Channel Name>/` inside the repo; re-running the same source skips files that already exist.

Requirements: Node.js 20.9–24 (`.nvmrc` says 24 — with Homebrew: `export PATH="$(brew --prefix node@24)/bin:$PATH"`), Python 3.8+, and a package manager (Homebrew / apt / dnf / pacman). **Mac/Linux only for auto-setup** — on Windows use WSL or the [manual installation](#manual-installation).

Verify any time:

```bash
npm run test:setup                          # checks Node, Python, ffmpeg, yt-dlp, Whisper, DB, env
curl http://localhost:19720/api/health      # same checks as JSON, for a running instance
```

## What it can do

- **Transcribe a single video** — captions when they exist (< 5 sec), Whisper otherwise.
- **Export a whole channel** — every video becomes a timestamped Markdown file under `transcript/<Channel Name>/`, with inventory and summary files. Checkpointed: re-runs skip existing files, failures retry, a running batch stops safely.
- **Repair repetition collapse automatically** — Whisper can degenerate into token loops on speech under music beds, losing that content; collapsed windows are detected and re-transcribed with a stronger model.
- **Proofread with an AI agent** — ASR homophone/name errors fixed by Claude after transcription, via an Anthropic API key **or** your local Claude Code CLI (no key). You're told which agent will run *before* transcription starts; a broken setup falls back to the other available agent.
- **Access members-only videos** — uses your signed-in Chrome profile for channels you're a member of.
- **Any language** — caption language priority list with fallback (`lang` parameter / `YTT_CAPTION_LANGS`).
- **Audit trail** — every export records which engine produced it (`Transcriber:` header in each file).

## Using it

### Web app (humans)

The primary surface at `localhost:19720`: paste a URL, pick a destination, watch progress, open the folder in Finder. Settings (gear icon) configure cloud transcription providers.

### REST API (scripts & AI agents)

Everything the app does is scriptable. Full reference: [docs/API.md](./docs/API.md) · [OpenAPI spec](./docs/openapi.yaml).

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/transcripts` | POST | Transcribe one video: `{"url": "...", "lang": "ja,en"?}` |
| `/api/transcripts` | GET | List stored transcripts |
| `/api/transcripts/<id>` | GET / DELETE | Fetch / remove one transcript |
| `/api/transcripts/<id>/download` | GET | Download as timestamped Markdown |
| `/api/transcripts/progress` | GET | Live progress (Server-Sent Events) |
| `/api/export` | POST | Start a channel batch: `{"url": "...", "year": 2026?}` |
| `/api/export` | GET | Batch status: phase, counts, per-video states, `outputRoot` |
| `/api/health` | GET | Per-dependency pass/fail (Node, Python, ffmpeg, yt-dlp, Whisper, DB) |

```bash
# One video → stored in the library, response includes the transcript
curl -X POST http://localhost:19720/api/transcripts \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://youtube.com/watch?v=..."}'

# Whole channel → Markdown files on disk; poll GET /api/export until phase=completed
curl -X POST http://localhost:19720/api/export \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://www.youtube.com/@SomeChannel/videos", "year": 2026}'
```

**Behavior an agent should know:**

- **Check `/api/health` first.** If the service is down, start it with `npm run dev` in the repo.
- **Timing:** captions return in seconds; the Whisper path takes minutes for long videos — use a generous request timeout (≥ 10 min) or watch the SSE progress stream.
- **One transcription at a time.** A second `POST /api/transcripts` while one is running returns **HTTP 429** — wait and retry.
- **Duplicates are cheap.** Posting an already-transcribed URL returns the stored record instantly with `"duplicate": true`. Same for channel exports: existing files are skipped, so re-running is always safe.
- **Response shape:** `transcript` is a JSON string of segments `[{text, startMs, durationMs}]`; `source` records the engine (`youtube_captions`, `whisper_local`, `whisper_cloud_groq`, …); `proofreadNotice` (Whisper paths) states which AI agent proofread the result.
- **Files vs library:** channel exports (`/api/export`) write Markdown files to `outputRoot`; single videos (`/api/transcripts`) store to the SQLite library — use `/download` to get the Markdown.
- **Errors are actionable strings** in `{"error": "..."}` — 400 invalid URL, 403 bot detection (VPN), 429 busy/rate-limited, 500 with the failure chain of every engine tried.

## Configuration

Everything lives in `.env` ([.env.example](./.env.example) has the full annotated list). The important ones:

| Variable | Default | Purpose |
|---|---|---|
| `YTT_EXPORT_ROOT` | `./transcript` | Where channel exports are written |
| `YTT_CAPTION_LANGS` | `en` | Caption language priority, e.g. `zh-Hans,zh-Hant,en` |
| `WHISPER_MODEL` | `large-v3-turbo` | Local Whisper model (`base` = faster, lower accuracy) |
| `WHISPER_REPAIR_ENABLED` | `true` | Auto re-transcribe collapsed windows |
| `WHISPER_REPAIR_MODEL` | `large-v3` | Stronger model used for repairs |
| `ANTHROPIC_API_KEY` | — | Enables AI proofreading via the Anthropic API |
| `PROOFREAD_BACKEND` | `api` | `claude-cli` = proofread via your local Claude Code CLI, no key needed |
| `PROOFREAD_MODEL` | `claude-opus-4-8` | Proofreading model |
| `WHISPER_CLOUD_API_KEY` | — | Single-key cloud Whisper (Groq); more providers in Settings UI |
| `PORT` | `19720` | Service port |

### AI proofreading

Pick one (or neither — it's optional):

```env
ANTHROPIC_API_KEY="sk-ant-..."      # Option A: Anthropic API (metered)

PROOFREAD_BACKEND="claude-cli"      # Option B: local Claude Code CLI (its auth, no key)
# CLAUDE_CLI_PATH="claude"          #   if the binary isn't on PATH
```

Before each audio transcription the app announces which agent will proofread; a broken setup falls back to the other available agent, and if neither works it says so and transcribes without proofreading.

### Cloud transcription providers

Configured in **Settings** (gear icon). Captions are always tried first; then Groq (free tier at [console.groq.com](https://console.groq.com), 14,400 audio-sec/day), then OpenAI `whisper-1` ([platform.openai.com/api-keys](https://platform.openai.com/api-keys), billed separately from ChatGPT), then OpenRouter / custom OpenAI-compatible endpoints in your configured order. Local Whisper is always the final fallback.

## How transcription works

1. **YouTube captions** — official/auto captions when available
2. **Cloud Whisper** — configured providers in order (Groq → OpenAI → others)
3. **Local Whisper** — always the final fallback; MLX-accelerated on Apple Silicon

Then two quality passes: **collapse repair** (degenerate windows re-transcribed with `WHISPER_REPAIR_MODEL` using loop-resistant decoding) and **AI proofreading** (if an agent is available). Every output records its engine in the `Transcriber` field.

Fully offline-capable by default — cloud engines and proofreading are opt-in.

## Manual Installation

<details>
<summary>If <code>npm run setup</code> doesn't work or you prefer doing it yourself</summary>

```bash
git clone https://github.com/Barneybean/youtube-transcriber.git
cd youtube-transcriber

npm install

python3 -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install openai-whisper
pip install mlx-whisper    # optional, Apple Silicon speedup

cp .env.example .env       # then edit the paths:
```

```env
DATABASE_URL="file:./dev.db"
WHISPER_CLI="/path/to/your/.venv/bin/whisper"
WHISPER_PYTHON_BIN="/path/to/your/.venv/bin/python3"
```

Install `yt-dlp` and `ffmpeg` with your package manager, then `npm run test:setup` to verify.

</details>

## Troubleshooting

<details>
<summary>"spawn whisper ENOENT" error</summary>

- Check that `WHISPER_CLI` and `WHISPER_PYTHON_BIN` in `.env` are correct **absolute** paths
- Restart the dev server after updating `.env`

</details>

<details>
<summary>Slow transcription</summary>

- Enable cloud Whisper (Groq free tier) in Settings for the fastest path
- On Apple Silicon, install `mlx-whisper` for a 3–5× local speedup
- Use a smaller model: `WHISPER_MODEL="base"` (faster, lower accuracy)

</details>

<details>
<summary>Rate limiting / bot detection</summary>

- The app automatically tries multiple InnerTube clients
- Wait a few minutes and retry if YouTube blocks requests
- Disable VPN if you're getting consistent 403 errors

</details>

## FAQ

**How do I get the transcript of a YouTube video?**
Run the app (`npm run dev`), open `localhost:19720`, paste the video URL, and click start — or `POST /api/transcripts` from a script. Videos with captions finish in seconds; anything else is transcribed with Whisper.

**Can I transcribe an entire YouTube channel at once?**
Yes — paste the channel URL (optionally filtered by year). Every video becomes a Markdown file under `transcript/<Channel Name>/`, and re-runs skip what's already done, so you can top up a channel any time.

**Is it free? Do I need an API key?**
Free and open source. Local Whisper needs no key or account. Cloud speedups (Groq's free tier, OpenAI) and AI proofreading via the Anthropic API are optional bring-your-own-key extras — and proofreading also works keyless through a local Claude Code CLI.

**Does it work on videos without captions or subtitles?**
Yes — that's the point of the Whisper fallback. No captions means the audio is downloaded with yt-dlp and transcribed locally (MLX-accelerated on Apple Silicon), with automatic repair when the model garbles music-heavy passages.

**What languages does it support?**
Any language YouTube or Whisper supports. Set a caption priority list like `zh-Hans,zh-Hant,en` and the first available wins; Whisper auto-detects the spoken language.

**Is my data private?**
Everything runs on your machine: SQLite database, local Markdown files, local Whisper. Nothing is uploaded unless you opt into a cloud provider.

## Contributing

Issues and pull requests are welcome.

```bash
npm run setup && npm run dev                          # Node 24 (see .nvmrc)
npx tsx --test --test-concurrency=1 tests/*.test.ts   # test suite
npx tsc --noEmit && npm run lint                      # typecheck + lint
npm run build                                         # production build must pass
```

- Bug fixes start with a reproducing test; features come with tests. All four commands above must pass.
- Code map: URL/media sources in `lib/sources/`, transcription engine in `lib/transcription/`, file export in `lib/export/`, orchestrators at `lib/` root. User-facing changes get a [CHANGELOG.md](./CHANGELOG.md) entry.
- Contributions are accepted under **AGPL-3.0**, like the rest of the project.
- Features in the upstream scope (extension, hosted mode, MCP) are better contributed to the [original project](https://github.com/lifesized/youtube-transcriber).

## License

[GNU Affero General Public License v3.0](LICENSE). Transcript Desk is a derivative work of [lifesized/youtube-transcriber](https://github.com/lifesized/youtube-transcriber) and keeps the original license and copyright; modifications are documented in the [CHANGELOG](./CHANGELOG.md) and this README.

## Credits

Original project designed and built by [lifesized](https://github.com/lifesized). This fork simplifies it to the local file-first workflow and adds the collapse-repair and AI-proofread pipeline.
