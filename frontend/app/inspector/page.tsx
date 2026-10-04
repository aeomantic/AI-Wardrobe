import type { Metadata } from "next";
import { InspectorExperience } from "@/components/inspector/InspectorExperience";

export const metadata: Metadata = {
  title: "Outfit Inspector",
  description: "Upload a look and inspect every garment with a fully interactive AI mock flow.",
};

export default function InspectorPage() {
  return <InspectorExperience />;
}
