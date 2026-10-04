import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppHeader } from "@/components/AppHeader";
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
  title: {
    default: "Threadline · Your AI Wardrobe Studio",
    template: "%s · Threadline",
  },
  description: "Digitize your wardrobe, analyze any look, and build outfits from clothes you already own.",
  openGraph: {
    title: "Threadline · Your AI Wardrobe Studio",
    description: "Digitize your wardrobe, analyze any look, and build outfits from clothes you already own.",
    type: "website",
    images: [{ url: "/demo-outfit.png", width: 1024, height: 1536, alt: "Threadline demo outfit" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Threadline · Your AI Wardrobe Studio",
    description: "Digitize your wardrobe, analyze any look, and build outfits from clothes you already own.",
    images: ["/demo-outfit.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AppHeader />
        <div className="flex-1">{children}</div>
      </body>
    </html>
  );
}
