"use client";

import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { Download, HardDrive, LoaderCircle, ShieldCheck, Upload } from "lucide-react";
import { blobToDataUrl, dataUrlToBlob } from "@/lib/storage/image-compressor";
import {
  deleteGarmentBlobs,
  getGarmentBlob,
  getStorageEstimate,
  isGarmentStorageAvailable,
  isStoragePersisted,
  listGarmentBlobIds,
  requestPersistentStorage,
  saveGarmentBlob,
  trackPendingGarmentUpload,
  untrackPendingGarmentUploads,
} from "@/lib/storage/image-store";
import { getItemBlobId, isClosetItem, useCloset } from "@/providers/ClosetProvider";
import type { ClosetItem } from "@/types/closet";

const BACKUP_FORMAT = "threadline-closet-backup";
const BACKUP_VERSION = 1;
const MAX_BACKUP_BYTES = 250 * 1024 * 1024;

interface ClosetBackupFile {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  items: ClosetItem[];
  /** Photo data URLs keyed by IndexedDB photo id. Only ever stored in this file. */
  media: Record<string, string>;
}

interface StorageStats {
  photoCount: number;
  usageBytes: number | null;
  quotaBytes: number | null;
  persisted: boolean;
}

interface ClosetBackupPanelProps {
  onMessage: (message: string) => void;
}

function formatMegabytes(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  return megabytes >= 100 ? `${Math.round(megabytes)} MB` : `${megabytes.toFixed(1)} MB`;
}

function backupFileName(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `closet-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`;
}

function parseBackup(value: unknown): ClosetBackupFile {
  if (!value || typeof value !== "object") throw new Error("That file is not a closet backup.");
  const backup = value as Partial<ClosetBackupFile>;
  if (backup.format !== BACKUP_FORMAT) throw new Error("That file is not a closet backup.");
  if (backup.version !== BACKUP_VERSION) throw new Error("This backup was made by a newer version and cannot be imported.");
  if (!Array.isArray(backup.items)) throw new Error("The backup has no closet items.");

  const media: Record<string, string> = {};
  if (backup.media && typeof backup.media === "object") {
    for (const [id, dataUrl] of Object.entries(backup.media)) {
      if (typeof dataUrl === "string" && dataUrl.startsWith("data:image/")) media[id] = dataUrl;
    }
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: typeof backup.exportedAt === "string" ? backup.exportedAt : "",
    items: backup.items.filter(isClosetItem),
    media,
  };
}

function downloadJson(fileName: string, data: unknown): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoke after the click has been handed to the browser's download manager.
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function ClosetBackupPanel({ onMessage }: ClosetBackupPanelProps) {
  const { items, importItems } = useCloset();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statsVersion, setStatsVersion] = useState(0);

  const itemCount = items.length;

  useEffect(() => {
    let cancelled = false;
    Promise.all([listGarmentBlobIds(), getStorageEstimate(), isStoragePersisted()])
      .then(([photoIds, estimate, persisted]) => {
        if (cancelled) return;
        setStats({
          photoCount: photoIds.length,
          usageBytes: estimate?.usageBytes ?? null,
          quotaBytes: estimate?.quotaBytes ?? null,
          persisted,
        });
      })
      .catch(() => {
        if (!cancelled) setStats({ photoCount: 0, usageBytes: null, quotaBytes: null, persisted: false });
      });
    return () => {
      cancelled = true;
    };
    // Item count changes whenever photos are added or removed.
  }, [itemCount, statsVersion]);

  const exportCloset = async () => {
    setBusy("export");
    setError(null);
    try {
      const media: Record<string, string> = {};
      let missing = 0;
      for (const item of items) {
        const blobId = getItemBlobId(item);
        if (!blobId) continue;
        const blob = await getGarmentBlob(blobId);
        if (blob) media[blobId] = await blobToDataUrl(blob);
        else missing += 1;
      }

      const backup: ClosetBackupFile = {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        items,
        media,
      };
      downloadJson(backupFileName(), backup);
      onMessage(
        `Exported ${items.length} ${items.length === 1 ? "item" : "items"} and ${Object.keys(media).length} photos.`
          + (missing > 0 ? ` ${missing} photos were missing on this device and were skipped.` : ""),
      );
    } catch {
      setError("The backup could not be created. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const importCloset = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setBusy("import");
    setError(null);
    const writtenIds: string[] = [];
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error("That backup is too large to import.");
      let parsed: unknown;
      try {
        parsed = JSON.parse(await file.text());
      } catch {
        throw new Error("That file is not valid JSON.");
      }
      const backup = parseBackup(parsed);

      // Photos are written before items are added, and marked pending, so the
      // closet never shows an item whose photo is still on its way in.
      const existingIds = new Set(items.map((item) => item.id));
      const existingPhotos = new Set(await listGarmentBlobIds());
      // Photos written back for items already in the closet whose photo went missing.
      const repairedIds = new Set<string>();
      if (Object.keys(backup.media).length > 0 && !isGarmentStorageAvailable()) {
        throw new Error("Photo storage is unavailable in this browser, so photos cannot be restored.");
      }
      for (const item of backup.items) {
        const blobId = getItemBlobId(item);
        const dataUrl = blobId ? backup.media[blobId] : undefined;
        if (!blobId || !dataUrl || existingPhotos.has(blobId)) continue;
        trackPendingGarmentUpload(blobId);
        await saveGarmentBlob(blobId, dataUrlToBlob(dataUrl));
        writtenIds.push(blobId);
        existingPhotos.add(blobId);
        if (existingIds.has(item.id)) repairedIds.add(blobId);
      }

      const added = importItems(backup.items);
      const addedPhotoIds = new Set(added.flatMap((item) => getItemBlobId(item) ?? []));
      // A photo written for an item that was then skipped as a duplicate is an orphan.
      const unusedIds = writtenIds.filter((id) => !addedPhotoIds.has(id) && !repairedIds.has(id));
      await deleteGarmentBlobs(unusedIds);
      untrackPendingGarmentUploads(writtenIds);
      void requestPersistentStorage();

      const skipped = backup.items.length - added.length;
      const repaired = repairedIds.size;
      onMessage(
        `Imported ${added.length} ${added.length === 1 ? "item" : "items"}`
          + (skipped > 0 ? `, skipped ${skipped} already in your closet` : "")
          + (repaired > 0 ? `, and restored ${repaired} missing ${repaired === 1 ? "photo" : "photos"}` : "")
          + ".",
      );
    } catch (caughtError) {
      untrackPendingGarmentUploads(writtenIds);
      setError(caughtError instanceof Error ? caughtError.message : "That backup could not be imported.");
    } finally {
      setBusy(null);
      setStatsVersion((version) => version + 1);
    }
  };

  return (
    <section
      aria-labelledby={`${inputId}-heading`}
      className="mt-6 flex flex-col gap-3 rounded-[20px] border border-[var(--line)] bg-[var(--panel)] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--canvas)] text-[var(--muted)]">
          <HardDrive size={15} />
        </span>
        <div className="min-w-0">
          <h2 id={`${inputId}-heading`} className="section-label">Backup &amp; storage</h2>
          <p className="mt-0.5 text-[10px] leading-4 text-[var(--muted)]" aria-live="polite">
            {itemCount} {itemCount === 1 ? "item" : "items"}
            {stats ? ` · ${stats.photoCount} ${stats.photoCount === 1 ? "photo" : "photos"} on this device` : ""}
            {stats?.usageBytes != null ? ` · ${formatMegabytes(stats.usageBytes)} used` : ""}
            {stats?.quotaBytes ? ` of ${formatMegabytes(stats.quotaBytes)}` : ""}
            {stats?.persisted && (
              <span className="ml-1.5 inline-flex items-center gap-1 text-[#315d3b]">
                <ShieldCheck size={11} /> Protected from cleanup
              </span>
            )}
          </p>
          {error && <p role="alert" className="mt-1 text-[10px] font-medium text-[#a63f37]">{error}</p>}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void exportCloset()}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line-strong)] px-3.5 py-2 text-[10px] font-semibold text-[var(--ink)] transition-colors hover:border-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-50"
        >
          {busy === "export" ? <LoaderCircle size={12} className="animate-spin" /> : <Download size={12} />} Export closet
        </button>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="application/json,.json"
          onChange={(event) => void importCloset(event)}
          className="sr-only"
          tabIndex={-1}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line-strong)] px-3.5 py-2 text-[10px] font-semibold text-[var(--ink)] transition-colors hover:border-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-50"
        >
          {busy === "import" ? <LoaderCircle size={12} className="animate-spin" /> : <Upload size={12} />} Import backup
        </button>
      </div>
    </section>
  );
}
