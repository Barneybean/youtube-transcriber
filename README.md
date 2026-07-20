# YouTube Transcriber

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

**YouTube research to organized local Markdown in one click. Runs locally, costs nothing.**

Paste a YouTube video or channel URL and get timestamped Markdown transcripts on disk, organized by channel. Built for research workflows where the files — not a web library — are the product.

> This is a simplified fork of [lifesized/youtube-transcriber](https://github.com/lifesized/youtube-transcriber), stripped down to the essential file-first workflow: no browser extension, no MCP server, no hosted mode.

## Get Running in 60 Seconds

```bash
git clone https://github.com/Barneybean/youtube-transcriber.git
cd youtube-transcriber
npm run setup
npm run dev
```

Open [http://localhost:19720](http://localhost:19720), paste a YouTube video or channel URL, and start the export. Transcript files are saved under your configured export folder as `<Channel Name>/<date> - <title>.md`; existing files are skipped automatically when you run the same source again.

Use Node.js 24 (`.nvmrc` is included). With Homebrew on macOS:

```bash
export PATH="$(brew --prefix node@24)/bin:$PATH"
```

> **Mac/Linux only for auto-setup.** Windows: use WSL or follow the [Manual Installation](#manual-installation) section.

> `npm run setup` installs all dependencies (yt-dlp, ffmpeg, Whisper, MLX on Apple Silicon) and configures everything automatically. Requires Node.js 20.9–24, Python 3.8+, and a package manager (Homebrew / apt / dnf / pacman).

## How It Works

Paste a URL. The app grabs the transcript using a fixed fallback order:

1. **YouTube Captions** — fetches official captions when they exist (< 5 sec)
2. **Groq Whisper API** — when configured, Groq is the first audio fallback
3. **OpenAI Whisper API** — when configured, OpenAI runs after Groq
4. **Ordered cloud fallbacks** — enabled OpenRouter and custom providers run in the order selected in Settings
5. **Local Whisper** — always the final fallback

Every exported Markdown file includes a `Transcriber` field, and batch summaries list the source used for every file.

Works fully offline by default. Cloud Whisper is optional — bring your own API key to enable it.

## Features

- **Channel-organized local export** — process one video or a complete YouTube channel into timestamped Markdown files grouped by channel name
- **Authenticated members-only access** — use your signed-in Chrome profile for channels and videos included in your memberships
- **Checkpointed batch resume** — reuse stored transcripts, skip completed files, retry failures, and stop safely after the current video
- **Local + cloud transcription** — free local Whisper by default, with optional OpenAI, Groq, OpenRouter, or custom endpoints
- **Multi-language captions** — request captions in any language YouTube supports (see [Language Preference](#language-preference) below)
- **Optional AI proofreading** — fix ASR errors in Whisper output with an LLM pass (bring your own Anthropic API key)
- **Duplicate detection** — same video won't be saved twice
- **Speaker diarization** — optional speaker identification with pyannote.audio
- **SQLite storage** — all data stays on your machine
- **Fully offline-capable** after initial setup

Full REST API docs: [`docs/API.md`](./docs/API.md) | OpenAPI spec: [`docs/openapi.yaml`](./docs/openapi.yaml)

## Cloud Transcription Providers

Add one or more cloud providers in **Settings** (gear icon, bottom-left). YouTube captions are always attempted first. When configured, Groq is the first audio fallback and OpenAI is next; drag the remaining cloud providers to set their order. Local Whisper is always last.

### OpenAI Whisper API

Uses OpenAI's hosted `whisper-1` transcription endpoint. Create an API key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys). OpenAI API billing is separate from a ChatGPT Plus or Pro subscription.

### Groq (Free)

The fastest option — uses Groq's free Whisper API. No credit card required.

1. Sign up at [console.groq.com](https://console.groq.com)
2. Go to **API Keys** → **Create API Key**
3. Paste the key in Settings

**Free tier limits:** 14,400 audio-seconds per day (~4 hours). The Settings page shows a usage meter so you can track your quota.

### OpenRouter

Access dozens of transcription models through a single API key, including Gemini 2.5 Flash.

1. Sign up at [openrouter.ai/keys](https://openrouter.ai/keys)
2. Create an API key
3. Paste the key in Settings — pick your model from the dropdown

### Custom Endpoint

Point to any OpenAI-compatible transcription API by providing a base URL, API key, and model name.

## Language Preference

By default, the app fetches English captions. You can change this per-request or globally.

**Per-request** — pass `lang` in the API body:

```bash
curl -X POST http://localhost:19720/api/transcripts \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://youtube.com/watch?v=...", "lang": "es"}'
```

**Multi-language priority** — tries each language in order, falls back to first available:

```bash
-d '{"url": "...", "lang": "ja,en"}'   # Japanese preferred, English fallback
```

**Global default** — set in `.env`:

```env
YTT_CAPTION_LANGS="zh-Hans,zh-Hant,en"
```

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

# Optional — local Whisper
# WHISPER_BACKEND="auto"    # auto, mlx, or openai
# WHISPER_DEVICE="auto"     # auto, cpu, mps
# WHISPER_TIMEOUT_MS="480000"

# Optional — cloud providers are configured in Settings (UI)
# Legacy env var still works for a single Groq key:
# WHISPER_CLOUD_API_KEY="gsk_..."
```

**Windows paths:**

```env
WHISPER_CLI="C:\\Users\\YourName\\project\\.venv\\Scripts\\whisper.exe"
WHISPER_PYTHON_BIN="C:\\Users\\YourName\\project\\.venv\\Scripts\\python.exe"
```

</details>

## Verifying Your Setup

After setup, verify everything is wired up correctly:

```bash
npm run test:setup
```

This checks Node.js, Python, ffmpeg, yt-dlp, Whisper, database, and environment configuration. Each check prints pass/fail with actionable fix messages. It runs automatically at the end of `npm run setup`.

For a running instance, hit the health endpoint:

```bash
curl http://localhost:19720/api/health
```

Returns JSON with per-check pass/fail — useful for Docker health checks or debugging. See [docs/TESTING.md](./docs/TESTING.md) for the full test protocol.

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

## License

[GNU Affero General Public License v3.0](LICENSE)

## Credits

Original project designed and built by [lifesized](https://github.com/lifesized) — [lifesized/youtube-transcriber](https://github.com/lifesized/youtube-transcriber). This fork simplifies it to the local file-first workflow.
