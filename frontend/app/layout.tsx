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
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "Threadline · AI Outfit Studio",
  description: "Decompose garments, inspect visual attributes, and rebuild complete outfits with AI.",
  openGraph: {
    title: "Threadline · AI Outfit Studio",
    description: "One look, every piece, and new ways to wear it.",
    type: "website",
    images: [{ url: "/demo-outfit.png", width: 1024, height: 1536, alt: "Threadline demo outfit" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Threadline · AI Outfit Studio",
    description: "One look, every piece, and new ways to wear it.",
    images: ["/demo-outfit.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
