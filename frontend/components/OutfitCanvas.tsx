"use client";

import { useState, type KeyboardEvent } from "react";
import { BoxSelect, Focus, ScanLine } from "lucide-react";
import type { GarmentBox } from "@/types/outfit";

interface OutfitCanvasProps {
  imageSource: string;
  garments: GarmentBox[];
  selectedId: string | null;
  isLoading?: boolean;
  frameLabel?: string;
  onSelect: (garmentId: string) => void;
}

interface ImageDimensions {
  width: number;
  height: number;
}

export function OutfitCanvas({
  imageSource,
  garments,
  selectedId,
  isLoading = false,
  frameLabel = "Normalized frame",
  onSelect,
}: OutfitCanvasProps) {
  const [dimensions, setDimensions] = useState<ImageDimensions>({ width: 1000, height: 1000 });
  const [loadedSource, setLoadedSource] = useState<string | null>(null);
  const isImageReady = loadedSource === imageSource;

  const activate = (event: KeyboardEvent<SVGGElement>, garmentId: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(garmentId);
    }
  };

  const selectedGarment = garments.find((garment) => garment.id === selectedId);

  return (
    <section className="flex min-h-[560px] flex-col overflow-hidden rounded-[24px] border border-[var(--line)] bg-[#dcd7cd] shadow-[0_18px_60px_rgba(31,29,23,0.1)] lg:min-h-[680px]" aria-label="Interactive outfit canvas">
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-black/10 bg-[var(--panel)]/92 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-full border border-[var(--line)] bg-white">
            <Focus size={15} strokeWidth={1.8} />
          </span>
          <div>
            <p className="text-xs font-semibold">{selectedGarment?.label ?? "Outfit canvas"}</p>
            <p className="font-mono text-[9px] uppercase tracking-[0.13em] text-[var(--muted)]">{frameLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="status-pill"><BoxSelect size={12} /> {garments.length} pieces</span>
          <span className="status-pill hidden sm:flex"><ScanLine size={12} /> 0 to 1000</span>
        </div>
      </div>

      <div className="canvas-grid relative flex flex-1 items-center justify-center overflow-hidden p-5 sm:p-8">
        <div className={`relative inline-block max-w-full overflow-hidden rounded-[18px] bg-[#f5f1e8] shadow-[0_22px_70px_rgba(32,29,22,0.22)] transition-opacity duration-300 ${isImageReady ? "opacity-100" : "opacity-0"}`}>
          {/* Dynamic API images need their intrinsic dimensions for exact overlay alignment. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageSource}
            alt="Processed outfit with garment detection overlays"
            className="block max-h-[min(70vh,720px)] max-w-full select-none"
            draggable={false}
            onLoad={(event) => {
              setDimensions({
                width: event.currentTarget.naturalWidth || 1000,
                height: event.currentTarget.naturalHeight || 1000,
              });
              setLoadedSource(imageSource);
            }}
          />

          {isImageReady && garments.length > 0 && (
            <svg
              className="absolute inset-0 size-full"
              viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
              preserveAspectRatio="none"
              aria-label="Detected garment regions"
            >
              {garments.map((garment) => {
                const [ymin, xmin, ymax, xmax] = garment.box_2d;
                const x = (xmin / 1000) * dimensions.width;
                const y = (ymin / 1000) * dimensions.height;
                const width = ((xmax - xmin) / 1000) * dimensions.width;
                const height = ((ymax - ymin) / 1000) * dimensions.height;
                const selected = garment.id === selectedId;

                return (
                  <g
                    key={garment.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Select ${garment.label}`}
                    aria-pressed={selected}
                    className="group cursor-pointer outline-none"
                    onClick={() => onSelect(garment.id)}
                    onKeyDown={(event) => activate(event, garment.id)}
                    onFocus={() => onSelect(garment.id)}
                  >
                    <title>{garment.label}</title>
                    <rect
                      x={x}
                      y={y}
                      width={Math.max(width, 1)}
                      height={Math.max(height, 1)}
                      rx={8}
                      fill={selected ? "rgba(38,69,255,0.12)" : "rgba(255,255,255,0.025)"}
                      stroke={selected ? "#2645ff" : "rgba(255,255,255,0.94)"}
                      strokeWidth={selected ? 4 : 2.5}
                      vectorEffect="non-scaling-stroke"
                      className="transition-[fill,stroke] duration-200 group-hover:fill-[rgba(38,69,255,0.09)] group-hover:stroke-[#2645ff] group-focus:stroke-[#2645ff]"
                    />
                  </g>
                );
              })}
            </svg>
          )}

          {isImageReady &&
            garments.map((garment, index) => {
              const [ymin, xmin] = garment.box_2d;
              const selected = garment.id === selectedId;
              return (
                <button
                  key={`${garment.id}-label`}
                  type="button"
                  onClick={() => onSelect(garment.id)}
                  className={`absolute z-10 max-w-[55%] truncate rounded-t-md px-2 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.09em] text-white shadow-sm transition-colors sm:text-[9px] ${selected ? "bg-[var(--accent)]" : "bg-[var(--ink)]/88 hover:bg-[var(--accent)]"}`}
                  style={{
                    left: `${Math.min(Math.max(xmin / 10, 0), 82)}%`,
                    top: `${Math.max(ymin / 10, 0)}%`,
                    transform: ymin > 35 ? "translateY(-100%)" : "none",
                  }}
                >
                  {String(index + 1).padStart(2, "0")} · {garment.category}
                </button>
              );
            })}

          {isLoading && (
            <div className="absolute inset-0 z-20 overflow-hidden bg-[var(--ink)]/38 backdrop-blur-[2px]">
              <div className="scan-line" />
              <div className="absolute inset-0 grid place-items-center">
                <span className="rounded-full bg-[var(--panel)] px-4 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--ink)] shadow-xl">Mapping garment regions</span>
              </div>
            </div>
          )}
        </div>

        {!isImageReady && (
          <div className="absolute inset-0 grid place-items-center">
            <div className="flex items-center gap-2 text-xs font-medium text-[var(--muted)]">
              <span className="size-2 animate-pulse rounded-full bg-[var(--accent)]" /> Preparing canvas
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
