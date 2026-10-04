"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Aperture,
  ArrowUpRight,
  CircleCheck,
  Layers3,
  ScanLine,
  Sparkles,
} from "lucide-react";
import { GarmentCard } from "@/components/GarmentCard";
import { MediaDropzone } from "@/components/MediaDropzone";
import { OutfitCanvas } from "@/components/OutfitCanvas";
import { StyleStudio } from "@/components/StyleStudio";
import { isOutfitAnalysisResponse, toImageSource } from "@/lib/outfit";
import type { OutfitAnalysisResponse } from "@/types/outfit";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

const DEMO_ANALYSIS: OutfitAnalysisResponse = {
  session_id: "demo-threadline-001",
  processed_image_base64: "/demo-outfit.png",
  overall_vibe: "Soft Utility Minimalism",
  detected_garments: [
    {
      id: "demo-outerwear",
      category: "outerwear",
      label: "Textured Oatmeal Overshirt",
      confidence: 0.97,
      box_2d: [185, 282, 515, 718],
      color: "warm oatmeal",
      material_estimate: "linen blend",
      silhouette: "relaxed",
      crop_base64: null,
    },
    {
      id: "demo-top",
      category: "top",
      label: "Charcoal Crewneck Tee",
      confidence: 0.94,
      box_2d: [200, 387, 481, 612],
      color: "charcoal black",
      material_estimate: "cotton jersey",
      silhouette: "regular",
      crop_base64: null,
    },
    {
      id: "demo-bottom",
      category: "bottom",
      label: "Relaxed Black Trousers",
      confidence: 0.98,
      box_2d: [445, 337, 912, 700],
      color: "black",
      material_estimate: "soft twill",
      silhouette: "wide straight",
      crop_base64: null,
    },
    {
      id: "demo-footwear",
      category: "footwear",
      label: "Minimal Court Sneakers",
      confidence: 0.96,
      box_2d: [884, 341, 968, 748],
      color: "off white",
      material_estimate: "smooth leather",
      silhouette: "low profile",
      crop_base64: null,
    },
    {
      id: "demo-accessory",
      category: "accessory",
      label: "Compact Crossbody Bag",
      confidence: 0.93,
      box_2d: [184, 405, 472, 666],
      color: "black",
      material_estimate: "matte leather",
      silhouette: "compact",
      crop_base64: null,
    },
  ],
  style_breakdown: {
    color_palette: "Warm neutrals with a black anchor",
    fit: "Relaxed, straight, softly structured",
    layering: "Open overshirt over a clean base",
    visual_balance: "Quiet volume with crisp footwear",
  },
  build_suggestions: [
    {
      title: "Gallery Run",
      description: "Keep the relaxed trouser, switch the tee for a fine-gauge cream knit, then finish with a sculptural silver cuff.",
      add: "Cream knit · silver cuff",
      why_it_works: "Tonal texture lifts the neutral base without losing its restraint.",
    },
    {
      title: "After-Dark Utility",
      description: "Button the overshirt, add a slim black belt, and trade the white sneakers for a polished square-toe shoe.",
      add: "Slim belt · polished black shoe",
      why_it_works: "Sharper accessories turn the same proportions into an evening look.",
    },
    {
      title: "Layered Alternative",
      description: "Swap the overshirt for a cropped olive field jacket and add a soft grey beanie while keeping the monochrome foundation.",
      add: "Olive jacket · grey beanie",
      why_it_works: "A muted color layer adds depth while the black column keeps it cohesive.",
    },
  ],
};

function getApiError(body: unknown, status: number): string {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
  }
  return `Analysis failed with status ${status}. Check that the FastAPI server is running.`;
}

export default function Home() {
  const [analysis, setAnalysis] = useState<OutfitAnalysisResponse>(DEMO_ANALYSIS);
  const [selectedId, setSelectedId] = useState<string | null>(DEMO_ANALYSIS.detected_garments[0].id);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const processedImage = toImageSource(analysis.processed_image_base64) ?? "/demo-outfit.png";
  const isImageUpload = Boolean(file && (file.type.startsWith("image/") || /\.(jpg|png|webp)$/i.test(file.name)));
  const canvasImage = isAnalyzing && isImageUpload && previewUrl ? previewUrl : processedImage;
  const visibleGarments = isAnalyzing ? [] : analysis.detected_garments;
  const selectedGarment = useMemo(
    () => analysis.detected_garments.find((garment) => garment.id === selectedId),
    [analysis.detected_garments, selectedId],
  );

  const analyzeFile = async (nextFile: File) => {
    const nextPreview = URL.createObjectURL(nextFile);
    setFile(nextFile);
    setPreviewUrl(nextPreview);
    setError(null);
    setIsAnalyzing(true);

    try {
      const formData = new FormData();
      formData.append("file", nextFile);
      const response = await fetch(`${API_URL}/api/analyze-outfit`, {
        method: "POST",
        body: formData,
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(getApiError(body, response.status));
      if (!isOutfitAnalysisResponse(body)) {
        throw new Error("The analysis service returned an unexpected response shape.");
      }

      setAnalysis(body);
      setSelectedId(body.detected_garments[0]?.id ?? null);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Could not analyze this file.";
      setError(message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const resetToDemo = () => {
    setFile(null);
    setPreviewUrl(null);
    setError(null);
    setAnalysis(DEMO_ANALYSIS);
    setSelectedId(DEMO_ANALYSIS.detected_garments[0].id);
  };

  const showAlternatives = (garmentId: string) => {
    setSelectedId(garmentId);
    window.requestAnimationFrame(() => {
      document.getElementById("style-studio")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const selectFromCanvas = (garmentId: string) => {
    setSelectedId(garmentId);
    window.requestAnimationFrame(() => {
      document.getElementById(`garment-${garmentId}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  };

  const statusLabel = isAnalyzing
    ? "Analysis running"
    : analysis.session_id.startsWith("demo-")
      ? "Demo ready"
      : `Session ${analysis.session_id.slice(0, 8)}`;

  return (
    <main className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-[var(--line)] bg-[var(--canvas)]/88 px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-full bg-[var(--ink)] text-[var(--canvas)] shadow-sm">
            <Aperture size={17} strokeWidth={1.8} />
          </span>
          <div>
            <p className="text-sm font-bold tracking-[-0.02em]">THREADLINE</p>
            <p className="font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--muted)]">AI wardrobe studio</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--panel)] px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.11em] text-[var(--muted)] sm:flex">
            <CircleCheck size={12} className="text-[#49714c]" /> No catalogs, pure styling
          </span>
          <span role="status" aria-live="polite" className={`flex items-center gap-2 rounded-full px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.11em] ${isAnalyzing ? "bg-[var(--selection)] text-[var(--accent)]" : "bg-[var(--ink)] text-[var(--canvas)]"}`}>
            <span className={`size-1.5 rounded-full ${isAnalyzing ? "animate-pulse bg-[var(--accent)]" : "bg-[#94cf8e]"}`} />
            {statusLabel}
          </span>
        </div>
      </header>

      <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <section className="mb-6 flex flex-wrap items-end justify-between gap-5" aria-labelledby="page-title">
          <div>
            <p className="mb-2 flex items-center gap-2 font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
              <ScanLine size={13} /> Outfit decomposition / Style rebuild
            </p>
            <h1 id="page-title" className="max-w-3xl text-[clamp(2.25rem,5vw,4.6rem)] font-semibold leading-[0.91] tracking-[-0.065em]">
              One look. Every piece.<br className="hidden sm:block" /> New ways to wear it.
            </h1>
          </div>
          <div className="max-w-xs pb-1 text-[11px] leading-5 text-[var(--muted)]">
            Upload a full outfit. We isolate the garments, read their visual language, and build complementary combinations around them.
          </div>
        </section>

        <div className="grid items-start gap-4 lg:grid-cols-[292px_minmax(0,1fr)] xl:grid-cols-[292px_minmax(470px,1fr)_360px]">
          <aside className="space-y-4">
            <div className="rounded-[24px] border border-[var(--line)] bg-[var(--panel)] p-4 shadow-[0_16px_54px_rgba(31,29,23,0.06)]">
              <MediaDropzone
                file={file}
                previewUrl={previewUrl}
                isLoading={isAnalyzing}
                error={error}
                onFileSelect={analyzeFile}
                onUseDemo={resetToDemo}
              />
            </div>

            <section className="overflow-hidden rounded-[24px] border border-[var(--line)] bg-[var(--panel)] shadow-[0_16px_54px_rgba(31,29,23,0.06)]" aria-labelledby="inspector-title">
              <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3.5">
                <div className="flex items-center gap-2">
                  <Layers3 size={13} />
                  <p id="inspector-title" className="section-label">Outfit inspector</p>
                </div>
                <span className="rounded-full bg-[var(--canvas)] px-2 py-1 font-mono text-[9px] text-[var(--muted)]">{analysis.detected_garments.length} ITEMS</span>
              </div>

              <div className="inspector-scroll space-y-2.5 p-3 xl:max-h-[680px] xl:overflow-y-auto">
                {isAnalyzing ? (
                  Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="h-[154px] animate-pulse rounded-[18px] border border-[var(--line)] bg-[var(--canvas)]" />
                  ))
                ) : analysis.detected_garments.length > 0 ? (
                  analysis.detected_garments.map((garment) => (
                    <GarmentCard
                      key={garment.id}
                      garment={garment}
                      selected={garment.id === selectedId}
                      sourceImage={processedImage}
                      onSelect={() => setSelectedId(garment.id)}
                      onFindAlternatives={() => showAlternatives(garment.id)}
                    />
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-[var(--line-strong)] p-5 text-center">
                    <p className="text-xs font-semibold">No garment regions found</p>
                    <p className="mt-1 text-[10px] leading-4 text-[var(--muted)]">Try a clearer full-body image with less overlap.</p>
                  </div>
                )}
              </div>
            </section>
          </aside>

          <div className="lg:col-start-2 lg:row-start-1 xl:col-start-2">
            <OutfitCanvas
              imageSource={canvasImage}
              garments={visibleGarments}
              selectedId={selectedId}
              isLoading={isAnalyzing}
              frameLabel={error ? "Last successful analysis" : file ? file.name : "Generated demo frame"}
              onSelect={selectFromCanvas}
            />

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 px-1 text-[10px] text-[var(--muted)]">
              <p>Click any region to sync it with the garment inspector.</p>
              <p className="flex items-center gap-1.5 font-mono uppercase tracking-[0.1em]"><Sparkles size={11} /> Attribute-aware styling</p>
            </div>
          </div>

          <div className="lg:col-span-2 xl:col-span-1 xl:col-start-3 xl:row-start-1">
            <StyleStudio
              overallVibe={analysis.overall_vibe}
              styleBreakdown={analysis.style_breakdown}
              suggestions={analysis.build_suggestions}
              garments={analysis.detected_garments}
              focusGarment={selectedGarment}
            />
          </div>
        </div>

        <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4 font-mono text-[8px] font-bold uppercase tracking-[0.15em] text-[var(--muted)]">
          <p>Threadline Studio · Analysis only · No commerce layer</p>
          <a href="#page-title" className="flex items-center gap-1.5 transition-colors hover:text-[var(--ink)]">Back to top <ArrowUpRight size={11} /></a>
        </footer>
      </div>
    </main>
  );
}
