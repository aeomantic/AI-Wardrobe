"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  CircleDashed,
  LoaderCircle,
  ScanLine,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { OutfitCanvas } from "@/components/OutfitCanvas";
import { InspectorDropzone } from "@/components/inspector/InspectorDropzone";
import { InspectorGarmentCard } from "@/components/inspector/InspectorGarmentCard";
import {
  analyzeOutfitMock,
  MOCK_ANALYSIS_STAGES,
  type MockAnalysisStage,
} from "@/lib/mock-inspector";
import type { OutfitAnalysisResponse } from "@/types/outfit";

type InspectorPhase = "idle" | "processing" | "complete" | "error";

function ProcessingSteps({ activeIndex }: { activeIndex: number }) {
  const activeStage = MOCK_ANALYSIS_STAGES[activeIndex];

  return (
    <div aria-live="polite" aria-atomic="true">
      <div className="rounded-[20px] bg-[var(--ink)] p-5 text-[#f3f0e8]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[8px] font-bold uppercase tracking-[0.16em] text-white/55">Mock AI analysis</p>
            <p className="mt-2 text-base font-semibold">{activeStage?.label ?? "Starting analysis"}</p>
            <p className="mt-1 text-[11px] leading-5 text-white/60">{activeStage?.description}</p>
          </div>
          <LoaderCircle size={20} className="shrink-0 animate-spin text-[#9eacff]" />
        </div>
        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/12">
          <div
            className="h-full rounded-full bg-[#9eacff] transition-[width] duration-500"
            style={{ width: `${activeStage?.progress ?? 5}%` }}
          />
        </div>
      </div>

      <ol className="mt-4 space-y-2" aria-label="Analysis progress">
        {MOCK_ANALYSIS_STAGES.map((stage, index) => {
          const complete = index < activeIndex;
          const active = index === activeIndex;
          return (
            <li
              key={stage.id}
              className={`flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-[11px] transition ${
                active
                  ? "border-[var(--accent)] bg-[var(--selection)] text-[var(--accent)]"
                  : "border-[var(--line)] bg-[var(--panel)] text-[var(--muted)]"
              }`}
            >
              <span className="grid size-6 shrink-0 place-items-center rounded-full border border-current/20">
                {complete ? <Check size={12} strokeWidth={3} /> : active ? <CircleDashed size={12} className="animate-spin" /> : index + 1}
              </span>
              <span className="font-semibold">{stage.label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function InspectorExperience() {
  const [phase, setPhase] = useState<InspectorPhase>("idle");
  const [imageSource, setImageSource] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<OutfitAnalysisResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeStageIndex, setActiveStageIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const selectedGarment = useMemo(
    () => analysis?.detected_garments.find((garment) => garment.id === selectedId) ?? null,
    [analysis, selectedId],
  );

  const replaceBlobUrl = (nextUrl: string | null) => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = nextUrl;
  };

  const runAnalysis = async (nextSource: string, nextName: string) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setPhase("processing");
    setAnalysis(null);
    setSelectedId(null);
    setError(null);
    setActiveStageIndex(0);

    try {
      const response = await analyzeOutfitMock({
        imageSource: nextSource,
        sourceName: nextName,
        signal: controller.signal,
        onStage: (_stage: MockAnalysisStage, index: number) => setActiveStageIndex(index),
      });
      if (controller.signal.aborted) return;
      setAnalysis(response);
      setSelectedId(response.detected_garments[0]?.id ?? null);
      setPhase("complete");
    } catch (analysisError) {
      if (analysisError instanceof Error && analysisError.name === "AbortError") return;
      setError("The mock analysis hit a snag. Reset and try the demo again.");
      setPhase("error");
    }
  };

  const handleFile = (file: File) => {
    const nextUrl = URL.createObjectURL(file);
    replaceBlobUrl(nextUrl);
    setImageSource(nextUrl);
    setSourceName(file.name);
    void runAnalysis(nextUrl, file.name);
  };

  const handleDemo = () => {
    replaceBlobUrl(null);
    const nextSource = "/demo-outfit.png";
    setImageSource(nextSource);
    setSourceName("Threadline demo look");
    void runAnalysis(nextSource, "Threadline demo look");
  };

  const reset = () => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    replaceBlobUrl(null);
    setImageSource(null);
    setSourceName(null);
    setAnalysis(null);
    setSelectedId(null);
    setError(null);
    setActiveStageIndex(0);
    setPhase("idle");
  };

  const selectFromCanvas = (garmentId: string) => {
    setSelectedId(garmentId);
    window.requestAnimationFrame(() => {
      document.getElementById(`inspector-garment-${garmentId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    });
  };

  const detectedGarments = phase === "complete" ? analysis?.detected_garments ?? [] : [];

  return (
    <main className="min-h-screen bg-[var(--canvas)] text-[var(--ink)]">
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-9">
        <Link href="/" className="mb-6 inline-flex items-center gap-2 text-[10px] font-semibold text-[var(--muted)] transition hover:text-[var(--ink)]">
          <ArrowLeft size={13} /> Back to studio
        </Link>

        <section className="mb-7 flex flex-wrap items-end justify-between gap-5" aria-labelledby="inspector-page-title">
          <div>
            <p className="mb-2 flex items-center gap-2 font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
              <ScanLine size={13} /> Look decomposition
            </p>
            <h1 id="inspector-page-title" className="max-w-3xl text-[clamp(2.3rem,5vw,4.8rem)] font-semibold leading-[0.91] tracking-[-0.065em]">
              See every piece<br className="hidden sm:block" /> inside the look.
            </h1>
          </div>
          <p className="max-w-sm text-[12px] leading-5 text-[var(--muted)]">
            Upload one clear outfit photo. The mock AI maps each garment, extracts visual details, and connects the image to an inspectable item list.
          </p>
        </section>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-4">
            <section className="rounded-[24px] border border-[var(--line)] bg-[var(--panel)] p-4 shadow-[0_16px_54px_rgba(31,29,23,0.06)] sm:p-5">
              <InspectorDropzone
                imageSource={imageSource}
                sourceName={sourceName}
                isProcessing={phase === "processing"}
                onFileSelect={handleFile}
                onUseDemo={handleDemo}
                onReset={reset}
              />
            </section>

            {imageSource ? (
              <OutfitCanvas
                imageSource={imageSource}
                garments={detectedGarments}
                selectedId={selectedId}
                isLoading={phase === "processing"}
                frameLabel={phase === "complete" ? "Mock detection complete" : "Local preview"}
                onSelect={selectFromCanvas}
              />
            ) : (
              <section className="canvas-grid grid min-h-[520px] place-items-center rounded-[24px] border border-[var(--line)] p-8 text-center shadow-[0_18px_60px_rgba(31,29,23,0.08)]" aria-label="Empty outfit canvas">
                <div className="max-w-xs">
                  <span className="mx-auto grid size-14 place-items-center rounded-full border border-[var(--line-strong)] bg-[var(--panel)]">
                    <ScanLine size={22} strokeWidth={1.6} />
                  </span>
                  <h2 className="mt-5 text-xl font-semibold tracking-[-0.035em]">Your outfit canvas starts here</h2>
                  <p className="mt-2 text-xs leading-5 text-[var(--muted)]">Add a photo above or use the demo to see selectable garment regions appear.</p>
                  <button type="button" onClick={handleDemo} className="mt-5 inline-flex items-center gap-2 rounded-full bg-[var(--ink)] px-5 py-3 text-xs font-semibold text-[#f3f0e8] transition hover:opacity-85">
                    <Sparkles size={14} /> Run demo analysis
                  </button>
                </div>
              </section>
            )}
          </div>

          <aside className="overflow-hidden rounded-[24px] border border-[var(--line)] bg-[var(--panel)] shadow-[0_16px_54px_rgba(31,29,23,0.06)] lg:sticky lg:top-[82px]" aria-labelledby="detected-items-title">
            <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-4">
              <div>
                <p className="section-label">02 / Inspect pieces</p>
                <h2 id="detected-items-title" className="mt-1 text-base font-semibold tracking-[-0.025em]">Detected garments</h2>
              </div>
              <span className="status-pill">
                {phase === "complete" ? <CheckCircle2 size={11} /> : <CircleDashed size={11} />}
                {detectedGarments.length} items
              </span>
            </div>

            <div className="inspector-scroll max-h-[calc(100vh-190px)] min-h-[420px] overflow-y-auto p-3.5">
              {phase === "processing" ? (
                <ProcessingSteps activeIndex={activeStageIndex} />
              ) : phase === "complete" && analysis ? (
                <div>
                  <div className="mb-3 rounded-[18px] border border-[var(--line)] bg-[var(--canvas)] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">Overall read</p>
                        <p className="mt-1.5 text-sm font-semibold">{analysis.overall_vibe}</p>
                      </div>
                      <span className="grid size-8 place-items-center rounded-full bg-[#e3eadf] text-[#49714c]">
                        <ShieldCheck size={15} />
                      </span>
                    </div>
                    <p className="mt-3 text-[10px] leading-4 text-[var(--muted)]">Click a garment card or image region. Both views stay synced.</p>
                  </div>

                  <div className="space-y-2.5">
                    {analysis.detected_garments.map((garment) => (
                      <InspectorGarmentCard
                        key={garment.id}
                        garment={garment}
                        sourceImage={imageSource ?? analysis.processed_image_base64}
                        selected={garment.id === selectedId}
                        onSelect={() => setSelectedId(garment.id)}
                      />
                    ))}
                  </div>

                  {selectedGarment && (
                    <p className="mt-3 rounded-xl bg-[var(--selection)] px-3 py-2.5 text-[10px] leading-4 text-[var(--accent)]" aria-live="polite">
                      Selected: <strong>{selectedGarment.label}</strong>
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex min-h-[390px] items-center justify-center text-center">
                  <div className="max-w-[240px]">
                    <span className="mx-auto grid size-11 place-items-center rounded-full bg-[var(--canvas)] text-[var(--muted)]">
                      <CircleDashed size={18} />
                    </span>
                    <h3 className="mt-4 text-sm font-semibold">Nothing detected yet</h3>
                    <p className="mt-2 text-[11px] leading-5 text-[var(--muted)]">Upload a well-lit, full-body outfit photo to populate this inspector.</p>
                    {error && <p role="alert" className="mt-3 text-[10px] font-semibold text-[#8f3830]">{error}</p>}
                  </div>
                </div>
              )}
            </div>
          </aside>
        </div>

        <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4 font-mono text-[8px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
          <p>Frontend prototype · No image leaves your browser</p>
          <p className="flex items-center gap-1.5"><Sparkles size={11} /> Results are simulated</p>
        </footer>
      </div>
    </main>
  );
}
