// Substack content script (YTT-344)
// Detect podcasts embedded in Substack posts and surface them to the
// background script the same way content-spotify.js does for native Spotify
// tabs. Today only Spotify-episode embeds are reported because the backend
// already handles those URLs. Apple Podcasts / og:audio fallbacks are noted
// below and will be wired up once the cloud pipeline accepts them.

function isPostPage() {
  // Substack post URLs match /p/<slug>; skip browse/home/profile pages.
  return /\/p\/[^/]+/.test(location.pathname);
}

function findEmbeddedSpotifyEpisode() {
  const iframes = document.querySelectorAll(
    'iframe[src*="open.spotify.com/embed/"]'
  );
  for (const f of iframes) {
    const src = f.src || "";
    const m = src.match(
      /open\.spotify\.com\/embed\/episode\/([a-zA-Z0-9]{22})/
    );
    if (m) {
      return {
        episodeId: m[1],
        url: `https://open.spotify.com/episode/${m[1]}`,
      };
    }
  }
  // Anchor tag fallback (Substack sometimes links the canonical episode URL
  // alongside an embed).
  const links = document.querySelectorAll(
    'a[href*="open.spotify.com/episode/"]'
  );
  for (const a of links) {
    const m = (a.href || "").match(
      /open\.spotify\.com\/episode\/([a-zA-Z0-9]{22})/
    );
    if (m) {
      return {
        episodeId: m[1],
        url: `https://open.spotify.com/episode/${m[1]}`,
      };
    }
  }
  return null;
}

function getPageTitle() {
  const ogTitle = document.querySelector('meta[property="og:title"]');
  if (ogTitle?.content) return ogTitle.content.trim();
  return document.title.replace(/\s*[|\-]\s*Substack\s*$/i, "").trim() || null;
}

let lastReported = null;
function reportPageInfo() {
  if (!isPostPage()) return;
  const ep = findEmbeddedSpotifyEpisode();
  if (!ep) return;
  if (lastReported === ep.episodeId) return;
  lastReported = ep.episodeId;
  try {
    chrome.runtime.sendMessage({
      type: "PAGE_INFO",
      url: ep.url,
      title: getPageTitle(),
      videoId: ep.episodeId,
    });
  } catch {
    // Service worker likely tearing down — observer will retry on next mutation
  }
}

// Initial pass once the DOM settles (embeds can lazy-load).
setTimeout(reportPageInfo, 400);
setTimeout(reportPageInfo, 1500);
setTimeout(reportPageInfo, 3500);

// Lazy-loaded iframes and SPA-style navigations on the Substack reader UI.
let lastUrl = window.location.href;
const observer = new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    lastReported = null;
    setTimeout(reportPageInfo, 600);
    return;
  }
  // No URL change — could be a newly-inserted iframe.
  reportPageInfo();
});
observer.observe(document.body, { childList: true, subtree: true });

window.addEventListener("popstate", () => {
  lastReported = null;
  setTimeout(reportPageInfo, 300);
});
