// @ts-check

export const SITE_NAME = "Transcript Desk";
export const SITE_DESCRIPTION =
  "Free local YouTube transcript generator for videos and channels, with timestamped Markdown, captions, Whisper speech-to-text, and optional AI proofreading.";

/**
 * @param {string | undefined} value
 * @returns {URL | undefined}
 */
export function parsePublicSiteUrl(value) {
  if (!value?.trim()) return undefined;

  const url = new URL(value);
  const isOrigin =
    !url.username &&
    !url.password &&
    url.pathname === "/" &&
    !url.search &&
    !url.hash;

  if (url.protocol !== "https:" || !isOrigin) {
    throw new Error("NEXT_PUBLIC_SITE_URL must be a public HTTPS origin");
  }

  return url;
}

export const publicSiteUrl = parsePublicSiteUrl(
  process.env.NEXT_PUBLIC_SITE_URL,
);

/** @param {unknown} value */
export function serializeStructuredData(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}
