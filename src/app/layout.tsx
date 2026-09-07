import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : process.env.NODE_ENV === "production"
    ? "https://tryminutes.vercel.app"
    : "http://localhost:3000";

const description =
  "Record, transcribe, summarize, and chat with Hindi, English, and Hinglish conversations—with speaker-aware transcripts.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Minutes", template: "%s · Minutes" },
  description,
  applicationName: "Minutes",
  authors: [{ name: "Minutes" }],
  creator: "Minutes",
  publisher: "Minutes",
  category: "productivity",
  keywords: [
    "audio transcription",
    "meeting notes",
    "speaker diarization",
    "Hinglish transcription",
    "Hindi transcription",
    "AI meeting assistant",
  ],
  alternates: { canonical: "/" },
  formatDetection: { email: false, address: false, telephone: false },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Minutes",
    title: "Minutes — Hear every voice. Keep every detail.",
    description,
  },
  twitter: {
    card: "summary_large_image",
    title: "Minutes — Hear every voice. Keep every detail.",
    description,
  },
  appleWebApp: {
    capable: true,
    title: "Minutes",
    statusBarStyle: "default",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#ff5a0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body>
        <ClerkProvider dynamic>{children}</ClerkProvider>
      </body>
    </html>
  );
}
