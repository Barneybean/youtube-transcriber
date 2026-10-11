import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parsePublicSiteUrl,
  serializeStructuredData,
} from "../lib/site-metadata.js";

describe("site metadata", () => {
  it("leaves public metadata disabled when no site URL is configured", () => {
    assert.equal(parsePublicSiteUrl(undefined), undefined);
    assert.equal(parsePublicSiteUrl("  "), undefined);
  });

  it("accepts a public HTTPS origin", () => {
    assert.equal(
      parsePublicSiteUrl("https://transcripts.example.com")?.toString(),
      "https://transcripts.example.com/",
    );
  });

  it("rejects non-public protocols and non-origin URLs", () => {
    assert.throws(
      () => parsePublicSiteUrl("file:///tmp/transcript-desk"),
      /must be a public HTTPS origin/,
    );
    assert.throws(
      () => parsePublicSiteUrl("http://localhost:19720"),
      /must be a public HTTPS origin/,
    );
    assert.throws(
      () => parsePublicSiteUrl("https://example.com/transcript-desk"),
      /must be a public HTTPS origin/,
    );
    assert.throws(
      () => parsePublicSiteUrl("https://example.com?preview=true"),
      /must be a public HTTPS origin/,
    );
  });

  it("escapes markup characters in structured data", () => {
    assert.equal(
      serializeStructuredData({ value: "</script>" }),
      '{"value":"\\u003c/script>"}',
    );
  });
});
