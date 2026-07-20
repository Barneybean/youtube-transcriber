# Transcript Desk

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

**Transcript Desk — YouTube research to organized local Markdown in one click. Runs locally, costs nothing.**

Paste a YouTube video or channel URL and get timestamped Markdown transcripts on disk, organized by channel. Built for research workflows where the files — not a web library — are the product.

## About this fork

Transcript Desk is a **fork and customization of [lifesized/youtube-transcriber](https://github.com/lifesized/youtube-transcriber)** by [lifesized](https://github.com/lifesized), simplified to the essential local file-first workflow. In accordance with the **GNU AGPL v3** license of the original project, this fork:

- is distributed under the **same AGPL-3.0 license** ([LICENSE](./LICENSE), original copyright retained);
- publishes its **complete modified source** in this repository;
- documents its changes in [CHANGELOG.md](./CHANGELOG.md).

What this fork changed from upstream:

- **Removed** the Chrome extension, MCP server, contrib skills, native messaging host, and hosted/cloud mode — this is a local-only app.
- **Added** a file-first channel export workflow (batch discovery, checkpointed resume, per-file transcriber audit trail).
- **Added** automatic repetition-collapse repair and AI proofreading (see below).
- Restructured the codebase by domain (`lib/sources/`, `lib/transcription/`, `lib/export/`).

If you want the browser extension, hosted mode, or MCP server, use the [original project](https://github.com/lifesized/youtube-transcriber).

## What it can do

- **Transcribe a single video** — paste any YouTube URL; official captions are fetched when they exist (< 5 sec), otherwise audio is transcribed with Whisper (local by default, cloud optional).
- **Export a whole channel** — paste a channel URL and get every video as a timestamped Markdown file under `transcript/<Channel Name>/` (or your `YTT_EXPORT_ROOT`), with inventory and summary files. Re-runs skip what's already done; failures can be retried; a running batch can be stopped safely.
- **Repair repetition collapse automatically** — Whisper (especially turbo models) can degenerate into token loops on speech under music beds, losing that content. Collapsed windows are detected and re-transcribed with a stronger model using loop-resistant decoding.
- **Proofread with an AI agent** — ASR homophone and name errors are fixed by Claude after transcription. Works with an Anthropic API key **or** your local Claude Code CLI (no key needed). The agent is resolved *before* transcription starts, you're told which one will run, and a broken setup automatically falls back to the other available agent.
- **Access members-only videos** — uses your signed-in Chrome profile for channels you're a member of.
- **Work in any language** — request captions in any language YouTube supports; multi-language priority with fallback.
- **Stay local** — SQLite storage, offline-capable after setup, per-file `Transcriber` audit label so you always know how a transcript was produced.

## Get Running in 60 Seconds

```bash
git clone https://github.com/Barneybean/youtube-transcriber.git
cd youtube-transcriber
npm run setup
npm run dev
```

Open [http://localhost:19720](http://localhost:19720), paste a YouTube video or channel URL, and start the export. Transcript files are saved under `transcript/<Channel Name>/` in the repo by default (set `YTT_EXPORT_ROOT` in `.env` to use another folder); existing files are skipped automatically when you run the same source again.

Use Node.js 24 (`.nvmrc` is included). With Homebrew on macOS:

```bash
export PATH="$(brew --prefix node@24)/bin:$PATH"
```

> **Mac/Linux only for auto-setup.** Windows: use WSL or follow the [Manual Installation](#manual-installation) section.

> `npm run setup` installs all dependencies (yt-dlp, ffmpeg, Whisper, MLX on Apple Silicon) and configures everything automatically. Requires Node.js 20.9–24, Python 3.8+, and a package manager (Homebrew / apt / dnf / pacman).

## How to use it

**Web app** — the primary surface at `localhost:19720`: paste a URL, pick a destination, watch progress, open the folder. Settings (gear icon) configure cloud transcription providers and language.

**REST API** — everything is scriptable ([full docs](./docs/API.md), [OpenAPI spec](./docs/openapi.yaml)):

```bash
# Transcribe one video (stores to the library; response includes the transcript
# and a proofreadNotice stating which AI agent proofread it)
curl -X POST http://localhost:19720/api/transcripts \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://youtube.com/watch?v=..."}'

# Start a channel batch export / check its progress
curl -X POST http://localhost:19720/api/export \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://www.youtube.com/@SomeChannel/videos", "year": 2026}'
curl http://localhost:19720/api/export

# Download a stored transcript as Markdown
curl http://localhost:19720/api/transcripts/<id>/download

# Health check (Node, Python, ffmpeg, yt-dlp, Whisper, DB)
curl http://localhost:19720/api/health
```

**From an AI assistant or your own scripts** — wrap the REST API. A minimal pattern: `POST /api/transcripts` for one-offs, `POST /api/export` + poll `GET /api/export` for channels.

## Transcription pipeline

Fixed fallback order, with the source recorded per file:

1. **YouTube Captions** — official captions when they exist
2. **Groq Whisper API** — when configured, the first audio fallback
3. **OpenAI Whisper API** — when configured, runs after Groq
4. **Ordered cloud fallbacks** — enabled OpenRouter / custom providers, in your configured order
5. **Local Whisper** — always the final fallback (MLX-accelerated on Apple Silicon)

After transcription: collapsed windows are repaired (`WHISPER_REPAIR_MODEL`, default `large-v3`), then the AI proofread pass runs if an agent is available.

Works fully offline by default. Cloud Whisper is optional — bring your own API key to enable it.

## AI proofreading setup

Pick one (or neither — proofreading is optional):

```env
# Option A: Anthropic API (metered)
ANTHROPIC_API_KEY="sk-ant-..."

# Option B: your local Claude Code CLI (uses its auth/plan, no key)
PROOFREAD_BACKEND="claude-cli"
# CLAUDE_CLI_PATH="claude"        # if the binary isn't on PATH
```

Before each audio transcription the app announces which agent will proofread; if the configured one is broken it falls back to the other, and if neither is available it says so and transcribes without proofreading.

## Cloud Transcription Providers

Add one or more cloud providers in **Settings** (gear icon, bottom-left). YouTube captions are always attempted first. When configured, Groq is the first audio fallback and OpenAI is next; drag the remaining cloud providers to set their order. Local Whisper is always last.

- **OpenAI Whisper API** — hosted `whisper-1`; key from [platform.openai.com/api-keys](https://platform.openai.com/api-keys) (billed separately from ChatGPT subscriptions).
- **Groq (free)** — free Whisper API, no credit card; key from [console.groq.com](https://console.groq.com). Free tier: 14,400 audio-seconds/day, with a usage meter in Settings.
- **OpenRouter** — many transcription models through one key from [openrouter.ai/keys](https://openrouter.ai/keys).
- **Custom endpoint** — any OpenAI-compatible transcription API (base URL + key + model).

## Manual Installation

If the automated setup doesn't work or you prefer to do it yourself:

<details>
<summary>Expand manual steps</summary>

```bash
git clone https://github.com/Barneybean/youtube-transcriber.git
cd youtube-transcriber

# Install Node dependencies
npm install

# Set up Python virtual environment
python3 -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

# Install Whisper
pip install openai-whisper

# Optional: MLX Whisper for Apple Silicon
pip install mlx-whisper

# Configure environment
cp .env.example .env
# Edit .env with your paths
```

**Environment variables (`.env`):**

```env
DATABASE_URL="file:./dev.db"
WHISPER_CLI="/path/to/your/.venv/bin/whisper"
WHISPER_PYTHON_BIN="/path/to/your/.venv/bin/python3"

# Optional — export folder for channel batches
# YTT_EXPORT_ROOT="/path/to/your/transcript/library"

# Optional — local Whisper
# WHISPER_BACKEND="auto"    # auto, mlx, or openai
# WHISPER_DEVICE="auto"     # auto, cpu, mps
# WHISPER_TIMEOUT_MS="480000"

# Optional — collapse repair (on by default)
# WHISPER_REPAIR_ENABLED="true"
# WHISPER_REPAIR_MODEL="large-v3"

# Optional — cloud providers are configured in Settings (UI)
# Legacy env var still works for a single Groq key:
# WHISPER_CLOUD_API_KEY="gsk_..."
```

</details>

## Verifying Your Setup

```bash
npm run test:setup     # checks Node, Python, ffmpeg, yt-dlp, Whisper, DB, env
curl http://localhost:19720/api/health    # same checks for a running instance
```

See [docs/TESTING.md](./docs/TESTING.md) for the full test protocol.

## Troubleshooting

<details>
<summary>"spawn whisper ENOENT" error</summary>

- Check that `WHISPER_CLI` and `WHISPER_PYTHON_BIN` paths in `.env` are correct
- Use absolute paths, not relative paths
- Restart the dev server after updating `.env`

</details>

<details>
<summary>Slow transcription</summary>

- Enable cloud Whisper for the fastest option: set `WHISPER_CLOUD_API_KEY` in `.env` (Groq free tier available)
- On Apple Silicon, install `mlx-whisper` for 3-5x local speedup
- Use smaller Whisper models (`tiny`, `base`) for faster local results
- Set `WHISPER_BACKEND="mlx"` in `.env` to force MLX

</details>

<details>
<summary>Rate limiting / bot detection</summary>

- The app automatically tries multiple InnerTube clients
- Wait a few minutes and retry if YouTube blocks requests
- Disable VPN if you're getting consistent 403 errors

</details>

## Contributing

Issues and pull requests are welcome.

**Dev setup:**

```bash
npm run setup && npm run dev          # Node 24 (see .nvmrc)
npx tsx --test --test-concurrency=1 tests/*.test.ts   # test suite
npx tsc --noEmit && npm run lint      # typecheck + lint
npm run build                         # production build must pass
```

**Ground rules:**

- Bug fixes start with a reproducing test; features come with tests. All four commands above must pass.
- Code layout: sources in `lib/sources/`, transcription engine in `lib/transcription/`, file export in `lib/export/`; orchestrators at `lib/` root. User-facing changes get a [CHANGELOG.md](./CHANGELOG.md) entry.
- By submitting a contribution you agree it is licensed under **AGPL-3.0** like the rest of the project.
- Features that belong to the upstream scope (extension, hosted mode, MCP) are better contributed to the [original project](https://github.com/lifesized/youtube-transcriber).

## License

[GNU Affero General Public License v3.0](LICENSE). This fork is a derivative work of [lifesized/youtube-transcriber](https://github.com/lifesized/youtube-transcriber) and keeps the original license and copyright; modifications are documented in the [CHANGELOG](./CHANGELOG.md) and this README.

## Credits

Original project designed and built by [lifesized](https://github.com/lifesized). This fork simplifies it to the local file-first workflow and adds the collapse-repair and AI-proofread pipeline.
