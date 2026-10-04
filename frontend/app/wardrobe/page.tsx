import type { Metadata } from "next";
import { WardrobeDashboard } from "@/components/wardrobe/WardrobeDashboard";
import { ClosetProvider } from "@/providers/ClosetProvider";

export const metadata: Metadata = {
  title: "My Digital Closet",
  description: "Digitize your wardrobe and build AI-assisted outfits using only pieces you own.",
};

export default function WardrobePage() {
  return (
    <ClosetProvider>
      <WardrobeDashboard />
    </ClosetProvider>
  );
}
