import type { Metadata } from "next";
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

export const metadata: Metadata = {
  metadataBase: new URL("https://beta.griprank.com"),
  title: {
    default: "GripRank — From Score Sheet to Live Results",
    template: "%s — GripRank",
  },
  description:
    "Real-time competition results for the climbing community. Built by organisers, made for climbers.",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/icon.png",
  },
  openGraph: {
    title: "GripRank — Live Competition Results",
    description:
      "Follow competitions and view results in real time. From score sheet to live results.",
    url: "https://beta.griprank.com",
    siteName: "GripRank",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "GripRank — From Score Sheet to Live Results",
      },
    ],
    locale: "en_SG",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "GripRank — Live Competition Results",
    description:
      "Real-time results for the climbing community. Built by organisers, made for climbers.",
    images: ["/og.png"],
    creator: "@griprank",
  },
  applicationName: "GripRank",
  themeColor: "#0a0a0a",
  viewport:
    "width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content",
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
