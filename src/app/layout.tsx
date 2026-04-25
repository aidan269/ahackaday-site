import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import { MobileDock } from "@/components/mobile-dock";
import { SidebarShell } from "@/components/sidebar-shell";
import { computeSidebarCounts } from "@/lib/sidebar-counts";
import { getAllIncidents } from "@/lib/incidents";
import "./globals.css";

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ahackaday-site.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "AHackaday",
  description: "Major cybersecurity incidents with broad implications.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "AHackaday",
    description: "Major cybersecurity incidents with broad implications.",
    siteName: "AHackaday",
    type: "website",
    url: "/",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "AHackaday incident intelligence",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AHackaday",
    description: "Major cybersecurity incidents with broad implications.",
    images: ["/twitter-image"],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const all = await getAllIncidents();
  const counts = computeSidebarCounts(all);

  return (
    <html lang="en" className={`${mono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <SidebarShell counts={counts} />
        {children}
        <MobileDock />
      </body>
    </html>
  );
}
