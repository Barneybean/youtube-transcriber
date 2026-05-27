// Substack content script (YTT-344)
// Detect podcasts on Substack post pages, whether they're embedded
// third-party players (Spotify, Apple) or Substack's own native podcast
// player. The first source found wins.

function isPostPage() {
  // Substack post URLs match /p/<slug>; skip browse/home/profile pages.
  return /\/p\/[^/]+/.test(location.pathname);
}

// ── Source extractors ──────────────────────────────────────────────────────

function findSpotifyEpisode() {
  const iframe = document.querySelector(
    'iframe[src*="open.spotify.com/embed/episode/"]'
  );
  if (iframe) {
    const m = iframe.src.match(
      /open\.spotify\.com\/embed\/episode\/([a-zA-Z0-9]{22})/
    );
    if (m) {
      return {
        platform: "spotify",
        videoId: m[1],
        url: `https://open.spotify.com/episode/${m[1]}`,
      };
    }
  }
  const link = document.querySelector('a[href*="open.spotify.com/episode/"]');
  if (link) {
    const m = (link.href || "").match(
      /open\.spotify\.com\/episode\/([a-zA-Z0-9]{22})/
    );
    if (m) {
      return {
        platform: "spotify",
        videoId: m[1],
        url: `https://open.spotify.com/episode/${m[1]}`,
      };
    }
  }
  return null;
}

function findApplePodcast() {
  const iframe = document.querySelector(
    'iframe[src*="embed.podcasts.apple.com"], iframe[src*="podcasts.apple.com/embed"]'
  );
  if (iframe) {
    return { platform: "apple", url: iframe.src };
  }
  return null;
}

function findOgAudio() {
  const og = document.querySelector('meta[property="og:audio"]');
  if (og?.content) {
    return { platform: "substack", url: og.content };
  }
  return null;
}

function findAudioElement() {
  // Substack's native player renders an <audio> element with the MP3 src.
  const audio = document.querySelector("audio[src]");
  if (audio?.src) {
    return { platform: "substack", url: audio.src };
  }
  // Some players use <source> children.
  const source = document.querySelector("audio source[src]");
  if (source?.src) {
    return { platform: "substack", url: source.src };
  }
  return null;
}

function findSubstackPodcastJson() {
  // Substack embeds podcast metadata in a JSON-LD <script>.
  const scripts = document.querySelectorAll(
    'script[type="application/ld+json"]'
  );
  for (const s of scripts) {
    try {
      const data = JSON.parse(s.textContent || "{}");
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const type = item["@type"];
        if (type === "PodcastEpisode" || type === "AudioObject") {
          const url = item.contentUrl || item.url;
          if (url) return { platform: "substack", url };
        }
        const audio = item.audio || item.associatedMedia;
        if (audio?.contentUrl) {
          return { platform: "substack", url: audio.contentUrl };
        }
      }
    } catch {
      // Ignore malformed JSON-LD
    }
  }
  return null;
}

function findMp3Link() {
  // Last-resort: any link to a substack-hosted mp3 (e.g. substackcdn.com).
  const a = document.querySelector(
    'a[href$=".mp3"], a[href*="substackcdn.com/audio"], a[href*="api.substack.com/feed/podcast"]'
  );
  if (a?.href) {
    return { platform: "substack", url: a.href };
  }
  return null;
}

function detectSource() {
  return (
    findSpotifyEpisode() ||
    findApplePodcast() ||
    findSubstackPodcastJson() ||
    findAudioElement() ||
    findOgAudio() ||
    findMp3Link() ||
    null
  );
}

function getPageTitle() {
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle?.content) return ogTitle.content.trim();
  return document.title.replace(/\s*[|\-]\s*Substack\s*$/i, "").trim() || null;
}

// ── Reporter ───────────────────────────────────────────────────────────────

let lastReportedUrl = null;
function reportPageInfo() {
  if (!isPostPage()) return;
  const source = detectSource();
  if (!source) return;
  if (lastReportedUrl === source.url) return;
  lastReportedUrl = source.url;
  try {
    const msg = {
      type: "PAGE_INFO",
      url: source.url,
      title: getPageTitle(),
      platform: source.platform,
    };
    if (source.videoId) msg.videoId = source.videoId;
    chrome.runtime.sendMessage(msg);
  } catch {
    // Service worker tearing down — observer will retry next mutation
  }
}

// Initial passes — Substack lazy-loads embeds.
setTimeout(reportPageInfo, 400);
setTimeout(reportPageInfo, 1500);
setTimeout(reportPageInfo, 3500);

// Mutation observer for late-arriving players and in-app navigation.
let lastUrl = window.location.href;
const observer = new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    lastReportedUrl = null;
    setTimeout(reportPageInfo, 600);
    return;
  }
  reportPageInfo();
});
observer.observe(document.body, { childList: true, subtree: true });

window.addEventListener("popstate", () => {
  lastReportedUrl = null;
  setTimeout(reportPageInfo, 300);
});
