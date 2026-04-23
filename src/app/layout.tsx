import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import { MobileDock } from "@/components/mobile-dock";
import { SiteHeader } from "@/components/site-header";
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
  openGraph: {
    title: "AHackaday",
    description: "Major cybersecurity incidents with broad implications.",
    type: "website",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "AHackaday",
    description: "Major cybersecurity incidents with broad implications.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${mono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <SiteHeader />
        {children}
        <MobileDock />
      </body>
    </html>
  );
}
