import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { GeistPixelSquare } from "geist/font/pixel";
import {
  publicSiteUrl,
  serializeStructuredData,
  SITE_DESCRIPTION,
  SITE_NAME,
} from "../lib/site-metadata.js";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: publicSiteUrl,
  applicationName: SITE_NAME,
  title: {
    default: "Transcript Desk — Local YouTube Transcript Generator",
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "YouTube transcript generator",
    "YouTube to text",
    "local transcription",
    "Whisper speech to text",
    "channel transcription",
    "Markdown transcripts",
  ],
  category: "technology",
  alternates: publicSiteUrl ? { canonical: "/" } : undefined,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: "Transcript Desk — Local YouTube Transcript Generator",
    description: SITE_DESCRIPTION,
    url: publicSiteUrl,
  },
  twitter: {
    card: "summary",
    title: "Transcript Desk — Local YouTube Transcript Generator",
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: Boolean(publicSiteUrl),
    follow: Boolean(publicSiteUrl),
    googleBot: {
      index: Boolean(publicSiteUrl),
      follow: Boolean(publicSiteUrl),
      "max-snippet": -1,
      "max-image-preview": "large",
    },
  },
};

const structuredData = publicSiteUrl
  ? {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebSite",
          "@id": `${publicSiteUrl}#website`,
          name: SITE_NAME,
          url: publicSiteUrl,
          description: SITE_DESCRIPTION,
        },
        {
          "@type": "SoftwareApplication",
          "@id": `${publicSiteUrl}#software`,
          name: SITE_NAME,
          applicationCategory: "UtilitiesApplication",
          operatingSystem: "macOS, Linux",
          description: SITE_DESCRIPTION,
          url: publicSiteUrl,
          codeRepository: "https://github.com/Barneybean/youtube-transcriber",
          license: "https://www.gnu.org/licenses/agpl-3.0.html",
          offers: {
            "@type": "Offer",
            price: 0,
            priceCurrency: "USD",
          },
        },
      ],
    }
  : undefined;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {structuredData ? (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: serializeStructuredData(structuredData),
            }}
          />
        ) : null}
      </head>
      <body
        className={`${GeistSans.className} ${GeistMono.variable} ${GeistPixelSquare.variable} min-h-screen bg-[hsl(var(--bg))] text-[hsl(var(--text))] antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
