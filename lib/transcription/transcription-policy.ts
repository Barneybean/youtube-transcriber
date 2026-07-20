export interface OrderedProvider {
  provider: string;
  priority: number;
}

export type AudioFallbackStep =
  { type: "cloud"; index: number } | { type: "local" };

/**
 * Groq and OpenAI are the fixed first audio fallbacks after YouTube captions.
 * Other cloud providers retain the order selected in Settings, with local
 * Whisper fixed as the final safety net.
 */
export function buildAudioFallbackOrder(
  providers: OrderedProvider[],
  localWhisper: { enabled: boolean; priority: number },
): AudioFallbackStep[] {
  const groqSteps: Array<AudioFallbackStep & { priority: number }> = [];
  const openAiSteps: Array<AudioFallbackStep & { priority: number }> = [];
  const configuredSteps: Array<AudioFallbackStep & { priority: number }> = [];

  providers.forEach((provider, index) => {
    const step = { type: "cloud" as const, index, priority: provider.priority };
    if (provider.provider === "groq") groqSteps.push(step);
    else if (provider.provider === "openai") openAiSteps.push(step);
    else configuredSteps.push(step);
  });

  const byPriority = (
    a: AudioFallbackStep & { priority: number },
    b: AudioFallbackStep & { priority: number },
  ) => a.priority - b.priority;

  const cloudSteps: AudioFallbackStep[] = [
    ...groqSteps.sort(byPriority),
    ...openAiSteps.sort(byPriority),
    ...configuredSteps.sort(byPriority),
  ].map(({ priority: _priority, ...step }) => step);

  return localWhisper.enabled ? [...cloudSteps, { type: "local" }] : cloudSteps;
}

export function formatTranscriptionSource(source?: string | null): string {
  const labels: Record<string, string> = {
    client_panel_scrape: "YouTube captions (browser)",
    youtube_captions: "YouTube captions",
    youtube_captions_ytdlp: "YouTube captions (yt-dlp)",
    whisper_cloud_openai: "OpenAI Whisper API",
    whisper_cloud_groq: "Groq Whisper API",
    whisper_cloud_openrouter: "OpenRouter transcription API",
    whisper_cloud_custom: "Custom transcription API",
    whisper_local: "Local Whisper",
  };

  if (!source) return "Unknown";
  return labels[source] ?? source.replaceAll("_", " ");
}

export function addTranscriptionSourceMetadata(
  markdown: string,
  source?: string | null,
): string {
  if (!source || !markdown || markdown.includes("**Transcriber:**")) {
    return markdown;
  }

  const sourceLine = `**Transcriber:** ${formatTranscriptionSource(source)}\n`;
  if (markdown.includes("**Captured:**")) {
    return markdown.replace(/(\*\*Captured:\*\*[^\n]*\n)/, `$1${sourceLine}`);
  }
  if (markdown.includes("**Recorded:**")) {
    return markdown.replace(/(\*\*Recorded:\*\*[^\n]*\n)/, `$1${sourceLine}`);
  }
  return markdown.replace(/(\*\*URL:\*\*[^\n]*\n)/, `$1${sourceLine}`);
}
