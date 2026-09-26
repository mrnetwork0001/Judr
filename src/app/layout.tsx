import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The display face. A high-contrast editorial serif reads as a legal document
// rather than a dashboard, which is the whole register Judr is working in.
const instrumentSerif = Instrument_Serif({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

/**
 * Absolute URLs for social cards. SITE_URL is read at render time on the
 * server; NEXT_PUBLIC_SITE_URL is inlined at build time (so it must be a
 * build argument in Docker); Render sets RENDER_EXTERNAL_URL on its own.
 * Localhost is the fallback so a dev build never emits a broken card.
 */
const siteUrl =
  process.env.SITE_URL ??
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.RENDER_EXTERNAL_URL ??
  "http://localhost:3000";

const DESCRIPTION =
  "Autonomous arbitration for tokenized RWA escrow vaults. Evidence in, a verdict with a complete audit trail out, and a vault that settles against it after an appeal window.";

export const viewport = {
  themeColor: "#f1f1f3",
  colorScheme: "light" as const,
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Judr - Autonomous Arbitration for Tokenized RWA Vaults",
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "Judr",
    title: "Judr - Too small to litigate. Too big to walk away from.",
    description: DESCRIPTION,
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Judr - autonomous arbitration for tokenized RWA vaults",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Judr - Too small to litigate. Too big to walk away from.",
    description: DESCRIPTION,
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable}`}
    >
      <body>
        {/* The light sweep every page sits on. Purely decorative; see globals.css. */}
        <div className="sheen" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
