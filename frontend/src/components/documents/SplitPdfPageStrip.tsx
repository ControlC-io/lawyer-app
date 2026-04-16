import React, { useEffect, useMemo, useRef, useState } from "react";
import { MetadataValueControl } from "@/components/documents/MetadataValueControl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Ban, Loader2, RotateCcw, Scissors } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  THUMB_WIDTH_DEFAULT,
  usePdfPageThumbnails,
} from "@/hooks/usePdfPageThumbnails";

export interface SplitPdfSegmentRow {
  name: string;
  metadata?: Record<string, string>;
  start_page: number;
  end_page: number;
}

export interface SplitPdfMetadataKeyRow {
  id: string;
  name: string | null;
  value_kind: "free_text" | "predefined_list";
  allowed_values?: unknown;
}

const PAGE_COLORS = [
  "ring-sky-500/80 dark:ring-sky-400/70",
  "ring-amber-500/80 dark:ring-amber-400/70",
  "ring-emerald-500/80 dark:ring-emerald-400/70",
  "ring-violet-500/80 dark:ring-violet-400/70",
  "ring-rose-500/80 dark:ring-rose-400/70",
  "ring-orange-500/80 dark:ring-orange-400/70",
  "ring-cyan-500/80 dark:ring-cyan-400/70",
  "ring-lime-500/80 dark:ring-lime-400/70",
];

const PAGE_BG = [
  "bg-sky-200/90 dark:bg-sky-900/50",
  "bg-amber-200/90 dark:bg-amber-900/50",
  "bg-emerald-200/90 dark:bg-emerald-900/50",
  "bg-violet-200/90 dark:bg-violet-900/50",
  "bg-rose-200/90 dark:bg-rose-900/50",
  "bg-orange-200/90 dark:bg-orange-900/50",
  "bg-cyan-200/90 dark:bg-cyan-900/50",
  "bg-lime-200/90 dark:bg-lime-900/50",
];

function inclusiveRange(a: number, b: number): number[] {
  if (a > b) return [];
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

function segmentIndexForPage(segments: SplitPdfSegmentRow[], page: number): number {
  return segments.findIndex((s) => s.start_page <= page && page <= s.end_page);
}

function cutAfterPage(segments: SplitPdfSegmentRow[], page: number): boolean {
  return segments.some((s, i) => i < segments.length - 1 && s.end_page === page);
}

function canSplitAfterPage(segments: SplitPdfSegmentRow[], page: number): boolean {
  const idx = segmentIndexForPage(segments, page);
  if (idx < 0) return false;
  return segments[idx].end_page > page;
}

type LayoutBlock =
  | { type: "segment"; segIndex: number; segment: SplitPdfSegmentRow }
  | { type: "gap"; pages: number[] };

function extractedMetadataEntries(
  segment: SplitPdfSegmentRow,
  keys: SplitPdfMetadataKeyRow[],
  unnamedLabel: string,
): { id: string; label: string; value: string; metaKey: SplitPdfMetadataKeyRow | null }[] {
  const meta = segment.metadata ?? {};
  const out: { id: string; label: string; value: string; metaKey: SplitPdfMetadataKeyRow | null }[] = [];
  const seen = new Set<string>();
  const keyById = new Map(keys.map((k) => [k.id, k] as const));
  for (const mk of keys) {
    const v = (meta[mk.id] ?? "").trim();
    if (!v) continue;
    seen.add(mk.id);
    out.push({
      id: mk.id,
      label: (mk.name && mk.name.trim()) || unnamedLabel,
      value: meta[mk.id] ?? "",
      metaKey: mk,
    });
  }
  for (const [id, raw] of Object.entries(meta)) {
    if (seen.has(id)) continue;
    const v = String(raw ?? "").trim();
    if (!v) continue;
    out.push({ id, label: id, value: String(raw), metaKey: keyById.get(id) ?? null });
  }
  return out;
}

function buildLayoutBlocks(segments: SplitPdfSegmentRow[], totalPages: number): LayoutBlock[] {
  const sorted = [...segments].sort((a, b) => a.start_page - b.start_page);
  const blocks: LayoutBlock[] = [];
  let cur = 1;
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    if (cur < s.start_page) {
      const gapPages = inclusiveRange(cur, s.start_page - 1);
      if (gapPages.length) blocks.push({ type: "gap", pages: gapPages });
    }
    blocks.push({ type: "segment", segIndex: i, segment: s });
    cur = s.end_page + 1;
  }
  if (cur <= totalPages) {
    const gapPages = inclusiveRange(cur, totalPages);
    if (gapPages.length) blocks.push({ type: "gap", pages: gapPages });
  }
  return blocks;
}

interface Props {
  totalPages: number;
  segments: SplitPdfSegmentRow[];
  onSegmentsChange: (next: SplitPdfSegmentRow[]) => void;
  onPageClick: (page: number) => void;
  pdfUrl?: string | null;
  selectedPage?: number | null;
  metadataKeys: SplitPdfMetadataKeyRow[];
  onSegmentNameChange: (index: number, value: string) => void;
  onSegmentMetadataChange: (index: number, keyId: string, value: string) => void;
  onRemoveSegment: (index: number) => void;
  onSplitAfterPage: (page: number) => void;
  onMergeCutAfterPage: (page: number) => void;
  onTogglePageExclude: (page: number) => void;
}

export default function SplitPdfPageStrip({
  totalPages,
  segments,
  onSegmentsChange,
  onPageClick,
  pdfUrl = null,
  selectedPage = null,
  metadataKeys,
  onSegmentNameChange,
  onSegmentMetadataChange,
  onRemoveSegment,
  onSplitAfterPage,
  onMergeCutAfterPage,
  onTogglePageExclude,
}: Props) {
  const { t } = useLanguage();

  type ThumbPreset = "small" | "medium" | "large";
  const [thumbPreset, setThumbPreset] = useState<ThumbPreset>("medium");
  const [thumbSize, setThumbSize] = useState<number>(THUMB_WIDTH_DEFAULT);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const [stripWidth, setStripWidth] = useState<number>(0);

  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width ?? 0;
      setStripWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const desiredThumbSize = useMemo(() => {
    if (thumbPreset === "small") return 96;
    if (thumbPreset === "medium") return 144;

    // Large: aim for ~half the available page width (within clamp in hook).
    // Quantize to reduce thumbnail re-render churn during resizing.
    const raw = Math.max(0, Math.floor(stripWidth * 0.5) - 64);
    const step = 16;
    return Math.round(raw / step) * step;
  }, [thumbPreset, stripWidth]);

  useEffect(() => {
    const next = desiredThumbSize || THUMB_WIDTH_DEFAULT;
    setThumbSize(next);
  }, [desiredThumbSize]);

  const { thumbnails, loading: thumbsLoading, error: thumbsError, thumbWidth } = usePdfPageThumbnails(
    pdfUrl && totalPages > 0 ? pdfUrl : null,
    pdfUrl && totalPages > 0 ? totalPages : 0,
    thumbSize,
  );

  const layoutBlocks = useMemo(
    () => buildLayoutBlocks(segments, totalPages),
    [segments, totalPages],
  );

  const showVisualStrip = totalPages > 0 && pdfUrl && !thumbsError;
  const showFallbackBar = totalPages > 0 && (!pdfUrl || thumbsError);

  const renderBetweenPages = (p: number) => {
    if (p >= totalPages) return null;
    return (
      <div
        className="flex w-full shrink-0 flex-col items-center gap-1.5 py-1.5 px-1"
        style={{ maxWidth: thumbWidth + 48 }}
      >
        {cutAfterPage(segments, p) ? (
          <>
            <div className="flex w-full flex-row items-center justify-center gap-2" aria-hidden>
              <div className="h-px flex-1 border-t border-dashed border-amber-600/70 dark:border-amber-400/60" />
              <div className="flex shrink-0 flex-col items-center rounded-md border border-dashed border-amber-600/50 bg-amber-500/10 px-2 py-1 dark:bg-amber-500/15">
                <Scissors className="h-4 w-4 text-amber-700 dark:text-amber-300" strokeWidth={2} />
              </div>
              <div className="h-px flex-1 border-t border-dashed border-amber-600/70 dark:border-amber-400/60" />
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 text-[10px] px-2"
              onClick={() => onMergeCutAfterPage(p)}
            >
              {String(t("splitPdf.mergeCut"))}
            </Button>
          </>
        ) : (
          canSplitAfterPage(segments, p) && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 text-[10px] px-2"
              onClick={() => onSplitAfterPage(p)}
            >
              {String(t("splitPdf.splitHere"))}
            </Button>
          )
        )}
      </div>
    );
  };

  function PageThumbColumnBlock({ page: p }: { page: number }) {
    const segIx = segmentIndexForPage(segments, p);
    const ring = segIx >= 0 ? PAGE_COLORS[segIx % PAGE_COLORS.length] : "ring-muted-foreground/40";
    const src = thumbnails[p];
    const isSelected = selectedPage === p;
    const excluded = segIx < 0;

    return (
      <div className="flex flex-col items-center w-full">
        <div
          className="relative flex flex-col items-center shrink-0 w-full"
          style={{ maxWidth: thumbWidth + 24 }}
        >
          <button
            type="button"
            title={String(t("splitPdf.goToPage", { page: String(p) }))}
            className={cn(
              "relative overflow-hidden rounded-md bg-background shadow-sm transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "ring-2 ring-offset-2 ring-offset-background",
              ring,
              isSelected && "ring-primary ring-offset-primary/30",
              excluded && "opacity-70 grayscale",
            )}
            style={{ width: thumbWidth }}
            onClick={() => onPageClick(p)}
          >
            {src ? (
              <img
                src={src}
                alt=""
                className="block w-full h-auto select-none pointer-events-none"
                draggable={false}
              />
            ) : (
              <div
                className="flex w-full aspect-[210/297] items-center justify-center bg-muted animate-pulse"
                style={{ minHeight: Math.round((thumbWidth * 297) / 210) }}
              >
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/60" />
              </div>
            )}
            <span className="absolute bottom-1 right-1 rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums shadow-sm">
              {p}
            </span>
            {excluded && (
              <span className="absolute bottom-7 left-1 right-1 rounded bg-black/70 px-1 py-0.5 text-[9px] font-medium text-center text-white">
                {String(t("splitPdf.pageExcludedBadge"))}
              </span>
            )}
          </button>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="absolute top-0 left-0 z-10 h-7 w-7 rounded-full border bg-background/95 shadow-sm"
            title={
              excluded ? String(t("splitPdf.includePage")) : String(t("splitPdf.excludePage"))
            }
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onTogglePageExclude(p);
            }}
          >
            {excluded ? <RotateCcw className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
          </Button>
        </div>
        {renderBetweenPages(p)}
      </div>
    );
  }

  return (
    <div ref={stripRef} className="space-y-3">
      <p className="text-xs font-medium text-muted-foreground">{String(t("splitPdf.pageStrip"))}</p>

      {showVisualStrip && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4 rounded-lg border bg-muted/30 px-3 py-2.5">
          <Label className="text-xs text-muted-foreground shrink-0">
            {String(t("splitPdf.previewSize"))}
          </Label>
          <div className="flex flex-1 items-center gap-3 min-w-0 max-w-md">
            <ToggleGroup
              type="single"
              value={thumbPreset}
              onValueChange={(v) => {
                if (!v) return;
                setThumbPreset(v as ThumbPreset);
              }}
              variant="outline"
              size="sm"
              className="flex-1 justify-start"
              aria-label={String(t("splitPdf.previewSize"))}
            >
              <ToggleGroupItem value="small" aria-label={String(t("splitPdf.previewSizeSmall"))}>
                {String(t("splitPdf.previewSizeSmall"))}
              </ToggleGroupItem>
              <ToggleGroupItem value="medium" aria-label={String(t("splitPdf.previewSizeMedium"))}>
                {String(t("splitPdf.previewSizeMedium"))}
              </ToggleGroupItem>
              <ToggleGroupItem value="large" aria-label={String(t("splitPdf.previewSizeLarge"))}>
                {String(t("splitPdf.previewSizeLarge"))}
              </ToggleGroupItem>
            </ToggleGroup>
            {thumbsLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />}
          </div>
        </div>
      )}

      <div className="space-y-6">
        {showVisualStrip &&
          layoutBlocks.map((block, blockIdx) => (
            <div
              key={`${block.type}-${blockIdx}-${block.type === "segment" ? block.segment.start_page : block.pages[0] ?? "g"}`}
              className="flex flex-col gap-3 lg:flex-row lg:items-stretch lg:gap-6 rounded-lg border bg-card/40 p-3 sm:p-4"
            >
              <div
                className="flex shrink-0 flex-col items-center gap-0 overflow-y-auto max-h-[min(70vh,560px)] rounded-md border bg-muted/20 p-2 scrollbar-thin [scrollbar-width:thin] lg:w-[min(280px,42vw)]"
                style={{
                  minWidth: thumbPreset === "large" ? thumbWidth + 48 : Math.min(280, thumbWidth + 48),
                  width: thumbPreset === "large" ? thumbWidth + 48 : undefined,
                }}
              >
                {block.type === "segment" && segments.length > 1 && (
                  <div className="flex w-full shrink-0 justify-end pb-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[10px] text-destructive hover:text-destructive"
                      onClick={() => onRemoveSegment(block.segIndex)}
                    >
                      {String(t("splitPdf.removeSegment"))}
                    </Button>
                  </div>
                )}
                {block.type === "segment"
                  ? inclusiveRange(block.segment.start_page, block.segment.end_page).map((p) => (
                      <PageThumbColumnBlock key={p} page={p} />
                    ))
                  : block.pages.map((p) => <PageThumbColumnBlock key={p} page={p} />)}
              </div>

              <div className="min-w-0 flex-1 flex flex-col lg:border-l lg:border-border/60 lg:pl-6 pt-1 lg:pt-0">
                {block.type === "segment" ? (
                  <div className="space-y-3 lg:sticky lg:top-0 lg:self-start w-full">
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        {String(t("splitPdf.documentName"))}
                      </Label>
                      <Input
                        className="h-9 text-sm mt-1"
                        placeholder={String(t("splitPdf.colName"))}
                        value={block.segment.name}
                        onChange={(e) => onSegmentNameChange(block.segIndex, e.target.value)}
                      />
                    </div>
                    {extractedMetadataEntries(
                      block.segment,
                      metadataKeys,
                      String(t("splitPdf.metadataKeyUnnamed")),
                    ).map(({ id, label, value, metaKey }) => (
                      <div key={id}>
                        <Label className="text-xs text-muted-foreground">{label}</Label>
                        <MetadataValueControl
                          metaKey={metaKey}
                          value={value}
                          onChange={(v) => onSegmentMetadataChange(block.segIndex, id, v)}
                          className="mt-1 w-full"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2 rounded-md border border-dashed bg-muted/25 p-3 lg:sticky lg:top-0 lg:self-start">
                    <p className="text-xs font-medium text-muted-foreground">
                      {String(t("splitPdf.gapBlockTitle"))}
                    </p>
                    <p className="text-sm text-muted-foreground">{String(t("splitPdf.gapBlockHint"))}</p>
                    {segments.length === 0 && (
                      <p className="text-sm text-muted-foreground pt-1">{String(t("splitPdf.noSegments"))}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}

        {showFallbackBar && (
          <div className="rounded-lg border bg-muted/20 p-3">
            <p className="text-xs text-muted-foreground mb-2">{String(t("splitPdf.fallbackStripHint"))}</p>
            <div className="flex flex-col max-h-48 w-full max-w-[140px] rounded-md border bg-background overflow-y-auto overflow-x-hidden mx-auto">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
                const segIx = segmentIndexForPage(segments, p);
                const color = segIx >= 0 ? PAGE_BG[segIx % PAGE_BG.length] : "bg-muted";
                return (
                  <button
                    key={p}
                    type="button"
                    title={String(t("splitPdf.goToPage", { page: String(p) }))}
                    className={cn(
                      "min-h-[8px] w-full shrink-0 border-b border-border/60 last:border-b-0 transition-opacity hover:opacity-90",
                      color,
                    )}
                    onClick={() => onPageClick(p)}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
