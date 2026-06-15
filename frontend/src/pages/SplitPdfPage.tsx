import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import SplitPdfPageStrip from "@/components/documents/SplitPdfPageStrip";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Loader2,
  CloudUpload,
  ArrowLeft,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  RotateCw,
  Maximize2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { useCompanyId } from "@/hooks/useCompanyId";
import { useAuth } from "@/contexts/AuthContext";
import { usePdfPageLargePreview } from "@/hooks/usePdfPageLargePreview";
import { pollOcrUntilDone } from "@/lib/ocrPoll";

export interface SplitPdfSegment {
  name: string;
  /** Values keyed by `files_metadata_keys.id`. */
  metadata?: Record<string, string>;
  start_page: number;
  end_page: number;
}

interface CompanyMetadataKeyRow {
  id: string;
  name: string | null;
  value_kind: "free_text" | "predefined_list";
  allowed_values?: unknown;
}

interface SplitPdfPreset {
  id: string;
  name: string;
  namingInstructions: string;
  metadataKeyIds: string[];
  createdAt: string;
  updatedAt: string;
}

interface PersonOption {
  id: string;
  full_name: string;
  root_folder_id: string | null;
}

function mergeSegmentMetadata(
  a?: Record<string, string>,
  b?: Record<string, string>,
): Record<string, string> | undefined {
  const merged = { ...b, ...a };
  return Object.keys(merged).length > 0 ? merged : undefined;
}

type Step = "pick" | "ocr" | "configure" | "review";

function sortSegments(segments: SplitPdfSegment[]): SplitPdfSegment[] {
  return [...segments].sort((a, b) => a.start_page - b.start_page);
}

function normalizeNonOverlappingSegments(
  segments: SplitPdfSegment[],
): { segments: SplitPdfSegment[]; hadOverlap: boolean; hadInvalid: boolean } {
  const sorted = [...segments].sort((a, b) => a.start_page - b.start_page || a.end_page - b.end_page);
  const out: SplitPdfSegment[] = [];
  let prevEnd = 0;
  let hadOverlap = false;
  let hadInvalid = false;

  for (const s of sorted) {
    const start0 = Number.isFinite(s.start_page) ? s.start_page : NaN;
    const end0 = Number.isFinite(s.end_page) ? s.end_page : NaN;
    if (!Number.isFinite(start0) || !Number.isFinite(end0)) {
      hadInvalid = true;
      continue;
    }

    let start = Math.max(1, Math.floor(start0));
    let end = Math.max(1, Math.floor(end0));
    if (end < start) {
      hadInvalid = true;
      continue;
    }

    if (start <= prevEnd) {
      hadOverlap = true;
      start = prevEnd + 1;
    }
    if (end < start) {
      // Fully overlapped; drop.
      hadOverlap = true;
      continue;
    }

    out.push({ ...s, start_page: start, end_page: end });
    prevEnd = Math.max(prevEnd, end);
  }

  return { segments: out, hadOverlap, hadInvalid };
}

function segmentIndexForPage(segments: SplitPdfSegment[], page: number): number {
  return segments.findIndex((s) => s.start_page <= page && page <= s.end_page);
}

function splitSegmentsAfterPage(segments: SplitPdfSegment[], page: number): SplitPdfSegment[] | null {
  const sorted = sortSegments(segments);
  const idx = sorted.findIndex((s) => s.start_page <= page && page <= s.end_page);
  if (idx < 0) return null;
  const s = sorted[idx];
  if (page >= s.end_page) return null;
  const left = { ...s, end_page: page };
  const right: SplitPdfSegment = {
    name: `${(s.name || "").trim()} (2)`.trim() || `—`,
    metadata: s.metadata ? { ...s.metadata } : undefined,
    start_page: page + 1,
    end_page: s.end_page,
  };
  return sortSegments([...sorted.slice(0, idx), left, right, ...sorted.slice(idx + 1)]);
}

function mergeSegmentsAtCutAfterPage(segments: SplitPdfSegment[], page: number): SplitPdfSegment[] | null {
  const sorted = sortSegments(segments);
  const i = sorted.findIndex((s, j) => j < sorted.length - 1 && s.end_page === page);
  if (i < 0) return null;
  const a = sorted[i];
  const b = sorted[i + 1];
  const merged: SplitPdfSegment = {
    ...a,
    end_page: b.end_page,
    name: a.name || b.name,
    metadata: mergeSegmentMetadata(a.metadata, b.metadata),
  };
  return sortSegments([...sorted.slice(0, i), merged, ...sorted.slice(i + 2)]);
}

/** Remove page from all segments (creates gaps; those pages are omitted from output PDFs). */
function excludePageFromSegments(segments: SplitPdfSegment[], p: number): SplitPdfSegment[] | null {
  const sorted = sortSegments(segments);
  const idx = sorted.findIndex((s) => s.start_page <= p && p <= s.end_page);
  if (idx < 0) return null;
  const s = sorted[idx];
  const before = sorted.slice(0, idx);
  const after = sorted.slice(idx + 1);

  if (s.start_page === p && s.end_page === p) {
    return sortSegments([...before, ...after]);
  }
  const out: SplitPdfSegment[] = [];
  if (p > s.start_page) {
    out.push({ ...s, end_page: p - 1 });
  }
  if (p < s.end_page) {
    out.push({
      ...s,
      start_page: p + 1,
      end_page: s.end_page,
    });
  }
  return sortSegments([...before, ...out, ...after]);
}

/** Put page back into a segment when it sits in a gap between ranges. */
function includePageInSegments(segments: SplitPdfSegment[], p: number): SplitPdfSegment[] | null {
  if (segmentIndexForPage(segments, p) >= 0) return null;
  const sorted = sortSegments(segments);

  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].end_page === p - 1 && sorted[i + 1].start_page === p + 1) {
      const merged = { ...sorted[i], end_page: sorted[i + 1].end_page };
      return sortSegments([...sorted.slice(0, i), merged, ...sorted.slice(i + 2)]);
    }
  }
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].end_page === p - 1) {
      const next = { ...sorted[i], end_page: p };
      return sortSegments([...sorted.slice(0, i), next, ...sorted.slice(i + 1)]);
    }
  }
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].start_page === p + 1) {
      const next = { ...sorted[i], start_page: p };
      return sortSegments([...sorted.slice(0, i), next, ...sorted.slice(i + 1)]);
    }
  }
  if (sorted.length === 0) {
    return [{ name: "", start_page: p, end_page: p }];
  }
  return null;
}

function removeSegmentAt(segments: SplitPdfSegment[], index: number): SplitPdfSegment[] {
  const sorted = sortSegments(segments);
  if (sorted.length <= 1) return sorted;
  if (index === 0) {
    const a = sorted[0];
    const b = sorted[1];
    return sortSegments([
      {
        ...a,
        end_page: b.end_page,
        name: a.name || b.name,
        metadata: mergeSegmentMetadata(a.metadata, b.metadata),
      },
      ...sorted.slice(2),
    ]);
  }
  const prev = sorted[index - 1];
  const cur = sorted[index];
  return sortSegments([
    ...sorted.slice(0, index - 1),
    {
      ...prev,
      end_page: cur.end_page,
      name: prev.name || cur.name,
      metadata: mergeSegmentMetadata(prev.metadata, cur.metadata),
    },
    ...sorted.slice(index + 1),
  ]);
}

function stepProgress(step: Step): number {
  switch (step) {
    case "pick":
      return 25;
    case "ocr":
      return 50;
    case "configure":
      return 75;
    case "review":
      return 100;
    default:
      return 0;
  }
}

const STEP_ORDER: Step[] = ["pick", "ocr", "configure", "review"];

const PROGRESS_STEP_KEYS = ["progressStep1", "progressStep2", "progressStep3", "progressStep4"] as const;

function stepIndex(step: Step): number {
  return STEP_ORDER.indexOf(step);
}

export default function SplitPdfPage() {
  const companyId = useCompanyId();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useLanguage();
  const { hasPermission } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("pick");
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);
  const [companyMetadataKeys, setCompanyMetadataKeys] = useState<CompanyMetadataKeyRow[]>([]);
  const [metadataKeysLoading, setMetadataKeysLoading] = useState(false);
  const [presets, setPresets] = useState<SplitPdfPreset[]>([]);
  const [presetsLoading, setPresetsLoading] = useState(false);
  const [presetBusy, setPresetBusy] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [presetName, setPresetName] = useState("");
  const [selectedMetadataKeyIds, setSelectedMetadataKeyIds] = useState<string[]>([]);
  const [namingInstructions, setNamingInstructions] = useState("");
  const [segments, setSegments] = useState<SplitPdfSegment[]>([]);
  const [busy, setBusy] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [pdfUrlForThumbs, setPdfUrlForThumbs] = useState<string | null>(null);
  const [pdfUrlLoading, setPdfUrlLoading] = useState(false);
  const [pdfUrlError, setPdfUrlError] = useState(false);
  const [expandedPage, setExpandedPage] = useState<number | null>(null);
  const [expandedPreviewZoom, setExpandedPreviewZoom] = useState(1);
  const [expandedPreviewRotation, setExpandedPreviewRotation] = useState(0);
  /** When true, the uploaded merge PDF is kept after split; when false (default), it is deleted. */
  const [keepOriginalFile, setKeepOriginalFile] = useState(false);
  /** When true (default), each created PDF is queued for OCR like a new upload. */
  const [ocrCreatedFiles, setOcrCreatedFiles] = useState(true);
  const [persons, setPersons] = useState<PersonOption[]>([]);
  const [personsLoading, setPersonsLoading] = useState(false);
  const [selectedPersonId, setSelectedPersonId] = useState("");
  const canManagePresets = hasPermission("documents.manage");

  const goBackToDocuments = useCallback(() => {
    navigate("/documents");
  }, [navigate]);

  const handleStripPageClick = (page: number) => {
    setExpandedPage(page);
  };

  const setSegmentsFromStrip = (next: SplitPdfSegment[]) => {
    setSegments(sortSegments(next));
  };

  const LARGE_PREVIEW_MAX_WIDTH = 1400;
  const { dataUrl: expandedPreviewUrl, loading: expandedPreviewLoading } = usePdfPageLargePreview(
    pdfUrlForThumbs,
    expandedPage ?? 1,
    expandedPage != null && step === "review",
    LARGE_PREVIEW_MAX_WIDTH,
  );

  useEffect(() => {
    setExpandedPreviewZoom(1);
    setExpandedPreviewRotation(0);
  }, [expandedPage]);

  const handleSegmentNameChange = (index: number, value: string) => {
    setSegments((prev) => {
      const next = [...prev];
      const row = { ...next[index], name: value };
      next[index] = row;
      return next;
    });
  };

  const handleSegmentMetadataChange = (index: number, keyId: string, value: string) => {
    setSegments((prev) => {
      const next = [...prev];
      const row = { ...next[index] };
      const meta = { ...(row.metadata || {}) };
      meta[keyId] = value;
      row.metadata = Object.keys(meta).length > 0 ? meta : undefined;
      next[index] = row;
      return next;
    });
  };

  const selectedMetadataKeysOrdered = useMemo(() => {
    return selectedMetadataKeyIds
      .map((id) => companyMetadataKeys.find((k) => k.id === id))
      .filter((k): k is CompanyMetadataKeyRow => Boolean(k));
  }, [selectedMetadataKeyIds, companyMetadataKeys]);

  useEffect(() => {
    if (!companyId || step !== "configure") return;
    let cancelled = false;
    setMetadataKeysLoading(true);
    (async () => {
      try {
        const data = await api.get<CompanyMetadataKeyRow[]>(
          `/api/companies/${companyId}/files-metadata-keys`,
        );
        if (!cancelled) setCompanyMetadataKeys(data || []);
      } catch {
        if (!cancelled) setCompanyMetadataKeys([]);
      } finally {
        if (!cancelled) setMetadataKeysLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, step]);

  useEffect(() => {
    if (!companyId || step !== "configure") return;
    let cancelled = false;
    setPersonsLoading(true);
    void api
      .get<PersonOption[]>(`/api/companies/${companyId}/persons`)
      .then((data) => {
        if (cancelled) return;
        const rows = Array.isArray(data) ? data : [];
        setPersons(rows);
        const fromUrl = searchParams.get("personId");
        if (fromUrl && rows.some((p) => p.id === fromUrl)) {
          setSelectedPersonId(fromUrl);
        }
      })
      .catch(() => {
        if (!cancelled) setPersons([]);
      })
      .finally(() => {
        if (!cancelled) setPersonsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, step, searchParams]);

  const selectedPersonFolderId = useMemo(() => {
    const person = persons.find((p) => p.id === selectedPersonId);
    return person?.root_folder_id ?? null;
  }, [persons, selectedPersonId]);

  const fetchPresets = useCallback(async () => {
    if (!companyId) return;
    setPresetsLoading(true);
    try {
      const data = await api.get<{ presets: SplitPdfPreset[] }>(
        `/api/companies/${companyId}/documents/split-pdf-presets`,
      );
      setPresets(Array.isArray(data?.presets) ? data.presets : []);
    } catch {
      setPresets([]);
    } finally {
      setPresetsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (!companyId || step !== "configure") return;
    void fetchPresets();
  }, [companyId, step, fetchPresets]);

  const applyPresetById = (presetId: string) => {
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return;
    const validKeySet = new Set(companyMetadataKeys.map((k) => k.id));
    const validIds = preset.metadataKeyIds.filter((id) => validKeySet.has(id));
    const missingCount = preset.metadataKeyIds.length - validIds.length;
    setSelectedMetadataKeyIds(validIds);
    setNamingInstructions(preset.namingInstructions);
    setSelectedPresetId(preset.id);
    setPresetName(preset.name);
    if (missingCount > 0) {
      toast({
        title: String(t("splitPdf.presetAppliedWithMissingKeysTitle")),
        description: String(
          t("splitPdf.presetAppliedWithMissingKeysDescription", {
            count: String(missingCount),
          }),
        ),
        variant: "destructive",
      });
    } else {
      toast({ title: String(t("splitPdf.presetApplied")) });
    }
  };

  const resetPresetEditor = () => {
    setSelectedPresetId("");
    setPresetName("");
  };

  const handleCreatePreset = async () => {
    if (!companyId || !canManagePresets || presetBusy) return;
    if (!presetName.trim()) {
      toast({
        title: String(t("splitPdf.error")),
        description: String(t("splitPdf.presetNameRequired")),
        variant: "destructive",
      });
      return;
    }
    if (selectedMetadataKeyIds.length === 0 || !namingInstructions.trim()) {
      toast({
        title: String(t("splitPdf.error")),
        description: String(t("splitPdf.presetConfigRequired")),
        variant: "destructive",
      });
      return;
    }
    setPresetBusy(true);
    try {
      const created = await api.post<SplitPdfPreset>(`/api/companies/${companyId}/documents/split-pdf-presets`, {
        name: presetName.trim(),
        namingInstructions: namingInstructions.trim(),
        metadataKeyIds: selectedMetadataKeyIds,
      });
      await fetchPresets();
      setSelectedPresetId(created.id);
      toast({ title: String(t("splitPdf.presetCreated")) });
    } catch (e) {
      toast({
        title: String(t("splitPdf.error")),
        description: e instanceof Error ? e.message : String(t("splitPdf.presetSaveFailed")),
        variant: "destructive",
      });
    } finally {
      setPresetBusy(false);
    }
  };

  const handleUpdatePreset = async () => {
    if (!companyId || !canManagePresets || presetBusy || !selectedPresetId) return;
    if (!presetName.trim()) {
      toast({
        title: String(t("splitPdf.error")),
        description: String(t("splitPdf.presetNameRequired")),
        variant: "destructive",
      });
      return;
    }
    if (selectedMetadataKeyIds.length === 0 || !namingInstructions.trim()) {
      toast({
        title: String(t("splitPdf.error")),
        description: String(t("splitPdf.presetConfigRequired")),
        variant: "destructive",
      });
      return;
    }
    setPresetBusy(true);
    try {
      await api.patch<SplitPdfPreset>(
        `/api/companies/${companyId}/documents/split-pdf-presets/${selectedPresetId}`,
        {
          name: presetName.trim(),
          namingInstructions: namingInstructions.trim(),
          metadataKeyIds: selectedMetadataKeyIds,
        },
      );
      await fetchPresets();
      toast({ title: String(t("splitPdf.presetUpdated")) });
    } catch (e) {
      toast({
        title: String(t("splitPdf.error")),
        description: e instanceof Error ? e.message : String(t("splitPdf.presetSaveFailed")),
        variant: "destructive",
      });
    } finally {
      setPresetBusy(false);
    }
  };

  const handleDeletePreset = async () => {
    if (!companyId || !canManagePresets || presetBusy || !selectedPresetId) return;
    if (!window.confirm(String(t("splitPdf.presetDeleteConfirm")))) return;
    setPresetBusy(true);
    try {
      await api.delete(`/api/companies/${companyId}/documents/split-pdf-presets/${selectedPresetId}`);
      await fetchPresets();
      resetPresetEditor();
      toast({ title: String(t("splitPdf.presetDeleted")) });
    } catch (e) {
      toast({
        title: String(t("splitPdf.error")),
        description: e instanceof Error ? e.message : String(t("splitPdf.presetDeleteFailed")),
        variant: "destructive",
      });
    } finally {
      setPresetBusy(false);
    }
  };

  const toggleMetadataKey = (id: string, checked: boolean) => {
    setSelectedMetadataKeyIds((prev) => {
      if (checked) return prev.includes(id) ? prev : [...prev, id];
      return prev.filter((x) => x !== id);
    });
  };

  const handleRemoveSegment = (index: number) => {
    setSegments((prev) => removeSegmentAt(prev, index));
  };

  const handleSplitAfterPage = (page: number) => {
    const next = splitSegmentsAfterPage(segments, page);
    if (next) setSegments(next);
  };

  const handleMergeCutAfterPage = (page: number) => {
    const next = mergeSegmentsAtCutAfterPage(segments, page);
    if (next) setSegments(next);
  };

  const togglePageExclude = (page: number) => {
    if (segmentIndexForPage(segments, page) >= 0) {
      const next = excludePageFromSegments(segments, page);
      if (next) setSegments(next);
      return;
    }
    const next = includePageInSegments(segments, page);
    if (next) {
      setSegments(next);
    } else {
      toast({
        title: String(t("splitPdf.error")),
        description: String(t("splitPdf.includePageFailed")),
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (step !== "review" || !fileId) {
      setPdfUrlForThumbs(null);
      setPdfUrlLoading(false);
      setPdfUrlError(false);
      return;
    }
    let cancelled = false;
    setPdfUrlLoading(true);
    setPdfUrlError(false);
    (async () => {
      try {
        const { url } = await api.post<{ url: string }>("/api/files/document-url", {
          fileId,
          download: false,
        });
        const base = (import.meta.env.VITE_API_URL as string) || window.location.origin;
        const full = url.startsWith("http") ? url : `${base.replace(/\/$/, "")}${url}`;
        if (!cancelled) {
          setPdfUrlForThumbs(full);
          setPdfUrlError(false);
        }
      } catch {
        if (!cancelled) {
          setPdfUrlForThumbs(null);
          setPdfUrlError(true);
        }
      } finally {
        if (!cancelled) setPdfUrlLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, fileId]);

  const handleUploadAndOcr = async () => {
    if (!localFile || !companyId) return;
    setBusy(true);
    setOcrError(null);
    try {
      const formData = new FormData();
      formData.append("file", localFile);
      formData.append("ocr", "true");
      const result = await api.postFormData<{ files: Array<{ id: string }> }>(
        `/api/companies/${companyId}/documents/upload`,
        formData,
      );
      const firstId = result.files?.[0]?.id;
      if (!firstId) throw new Error("Upload failed");
      setFileId(firstId);
      setStep("ocr");
      await pollOcrUntilDone(firstId, { timeoutMessage: String(t("splitPdf.ocrTimeout")) });
      setStep("configure");
      toast({ title: String(t("splitPdf.ocrDone")) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload or OCR failed";
      setOcrError(msg);
      toast({ title: String(t("splitPdf.error")), description: msg, variant: "destructive" });
      setStep("pick");
    } finally {
      setBusy(false);
    }
  };

  const handlePropose = async () => {
    if (!fileId || !companyId) return;
    if (selectedMetadataKeyIds.length === 0) {
      toast({
        title: String(t("splitPdf.error")),
        description: String(t("splitPdf.metadataKeysRequired")),
        variant: "destructive",
      });
      return;
    }
    if (!namingInstructions.trim()) {
      toast({
        title: String(t("splitPdf.error")),
        description: String(t("splitPdf.namingRequired")),
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{ segments: SplitPdfSegment[]; pageCount?: number }>(
        `/api/companies/${companyId}/documents/split-pdf/propose`,
        {
          fileId,
          metadataKeyIds: selectedMetadataKeyIds,
          namingInstructions: namingInstructions.trim(),
        },
      );
      setSegments(sortSegments(res.segments));
      const maxFromSegments = Math.max(
        1,
        ...res.segments.map((s) => Math.max(s.start_page, s.end_page)),
      );
      setTotalPages(typeof res.pageCount === "number" && res.pageCount > 0 ? res.pageCount : maxFromSegments);
      setExpandedPage(null);
      setStep("review");
    } catch (e) {
      toast({
        title: String(t("splitPdf.proposeFailed")),
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleApply = async () => {
    if (!fileId || segments.length === 0 || !companyId) return;
    setBusy(true);
    try {
      const normalized = normalizeNonOverlappingSegments(segments);
      if (normalized.hadInvalid || normalized.hadOverlap) {
        setSegments(normalized.segments);
      }
      if (normalized.segments.length === 0) {
        toast({
          title: String(t("splitPdf.applyFailed")),
          description: String(t("splitPdf.noValidSegmentsToCreate")),
          variant: "destructive",
        });
        return;
      }
      if (normalized.hadOverlap) {
        toast({
          title: String(t("splitPdf.segmentsAdjustedTitle")),
          description: String(t("splitPdf.segmentsAdjustedOverlap")),
        });
      } else if (normalized.hadInvalid) {
        toast({
          title: String(t("splitPdf.segmentsAdjustedTitle")),
          description: String(t("splitPdf.segmentsAdjustedInvalid")),
        });
      }

      const applyResult = await api.post<{ warningCode?: string; ocrQueued?: boolean }>(
        `/api/companies/${companyId}/documents/split-pdf/apply`,
        {
          fileId,
          segments: normalized.segments,
          keepOriginalFile,
          ocrCreatedFiles,
          ...(selectedPersonFolderId ? { folderId: selectedPersonFolderId } : {}),
        },
      );
      const ocrNote =
        applyResult.ocrQueued === true ? String(t("splitPdf.createdOcrQueued")) : undefined;
      if (applyResult.warningCode === "original_remove_failed") {
        toast({
          title: String(t("splitPdf.created")),
          description: [String(t("splitPdf.originalRemoveFailed")), ocrNote].filter(Boolean).join(" "),
        });
      } else if (ocrNote) {
        toast({ title: String(t("splitPdf.created")), description: ocrNote });
      } else {
        toast({ title: String(t("splitPdf.created")) });
      }
      navigate("/documents");
    } catch (e) {
      toast({
        title: String(t("splitPdf.applyFailed")),
        description: e instanceof Error ? e.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  if (!companyId) {
    return (
      <div className="px-4 pt-4 pb-8 max-w-3xl mx-auto">
        <p className="text-sm text-muted-foreground">{String(t("splitPdf.noCompany"))}</p>
        <Button variant="outline" className="mt-4" onClick={goBackToDocuments}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          {String(t("splitPdf.backToDocuments"))}
        </Button>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-8 flex flex-col min-h-[calc(100vh-3.5rem)] max-w-[min(96rem,calc(100vw-2rem))] mx-auto w-full">
      <div className="shrink-0 space-y-4 mb-6">
        <Button variant="ghost" size="sm" className="-ml-2 w-fit" onClick={goBackToDocuments}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          {String(t("splitPdf.backToDocuments"))}
        </Button>

        <div>
          <h1 className="text-2xl font-bold tracking-tight">{String(t("splitPdf.title"))}</h1>
          <p className="text-sm text-muted-foreground mt-1">{String(t("splitPdf.description"))}</p>
        </div>

        <div className="space-y-2">
          <Progress value={stepProgress(step)} className="h-2" />
          <div className="flex flex-wrap gap-x-2 gap-y-1 justify-between text-xs text-muted-foreground">
            {STEP_ORDER.map((s, i) => (
              <span
                key={s}
                className={cn(
                  "tabular-nums",
                  stepIndex(step) === i && "text-foreground font-medium",
                  stepIndex(step) > i && "text-foreground/80",
                )}
              >
                {i + 1}. {String(t(`splitPdf.${PROGRESS_STEP_KEYS[i]}`))}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col gap-6">
        {step === "pick" && (
          <div className="space-y-3 max-w-2xl">
            <Label>{String(t("splitPdf.selectPdf"))}</Label>
            <label className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-10 cursor-pointer hover:bg-muted/40 transition-colors">
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  setLocalFile(f && f.type === "application/pdf" ? f : null);
                }}
              />
              <CloudUpload className="h-10 w-10 text-muted-foreground mb-3" />
              <span className="text-sm text-muted-foreground">
                {localFile ? localFile.name : String(t("splitPdf.dropHint"))}
              </span>
            </label>
            {ocrError && <p className="text-sm text-destructive">{ocrError}</p>}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="outline" onClick={goBackToDocuments} disabled={busy}>
                {String(t("splitPdf.cancel"))}
              </Button>
              <Button onClick={handleUploadAndOcr} disabled={!localFile || busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : String(t("splitPdf.continue"))}
              </Button>
            </div>
          </div>
        )}

        {step === "ocr" && (
          <div className="flex flex-col items-center justify-center py-16 gap-4 flex-1">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">{String(t("splitPdf.runningOcr"))}</p>
          </div>
        )}

        {step === "configure" && (
          <div className="space-y-6 max-w-3xl flex-1 flex flex-col">
            <div>
              <Label>{String(t("splitPdf.personLabel"))}</Label>
              <p className="text-sm text-muted-foreground mt-1">{String(t("splitPdf.personHint"))}</p>
              {personsLoading ? (
                <p className="text-sm text-muted-foreground mt-2 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {String(t("splitPdf.personsLoading"))}
                </p>
              ) : (
                <select
                  value={selectedPersonId}
                  onChange={(e) => setSelectedPersonId(e.target.value)}
                  className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm"
                  disabled={busy || persons.length === 0}
                >
                  <option value="">{String(t("splitPdf.personSelectPlaceholder"))}</option>
                  {persons.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.full_name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <Label>{String(t("splitPdf.presetsLabel"))}</Label>
              <p className="text-sm text-muted-foreground mt-1">{String(t("splitPdf.presetsHint"))}</p>
              {presetsLoading && (
                <p className="text-sm text-muted-foreground mt-2 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {String(t("splitPdf.presetsLoading"))}
                </p>
              )}
              {!presetsLoading && (
                <div className="mt-3 space-y-3 rounded-lg border bg-muted/20 p-3">
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={selectedPresetId}
                      onChange={(e) => {
                        const nextId = e.target.value;
                        setSelectedPresetId(nextId);
                        const selected = presets.find((p) => p.id === nextId);
                        setPresetName(selected?.name ?? "");
                      }}
                      className="h-10 rounded-md border bg-background px-3 text-sm min-w-[14rem] flex-1"
                      disabled={busy || presets.length === 0}
                    >
                      <option value="">{String(t("splitPdf.presetSelectPlaceholder"))}</option>
                      {presets.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => applyPresetById(selectedPresetId)}
                      disabled={busy || !selectedPresetId}
                    >
                      {String(t("splitPdf.presetApply"))}
                    </Button>
                  </div>
                  {!presetsLoading && presets.length === 0 && (
                    <p className="text-xs text-muted-foreground">{String(t("splitPdf.presetsEmpty"))}</p>
                  )}
                  {canManagePresets && (
                    <div className="space-y-2">
                      <Input
                        value={presetName}
                        onChange={(e) => setPresetName(e.target.value)}
                        placeholder={String(t("splitPdf.presetNamePlaceholder"))}
                        disabled={busy || presetBusy}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          type="button"
                          onClick={handleCreatePreset}
                          disabled={busy || presetBusy}
                        >
                          {presetBusy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            String(t("splitPdf.presetSaveNew"))
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          type="button"
                          onClick={handleUpdatePreset}
                          disabled={busy || presetBusy || !selectedPresetId}
                        >
                          {String(t("splitPdf.presetUpdate"))}
                        </Button>
                        <Button
                          variant="outline"
                          type="button"
                          onClick={handleDeletePreset}
                          disabled={busy || presetBusy || !selectedPresetId}
                        >
                          {String(t("splitPdf.presetDelete"))}
                        </Button>
                        <Button
                          variant="ghost"
                          type="button"
                          onClick={resetPresetEditor}
                          disabled={busy || presetBusy}
                        >
                          {String(t("splitPdf.presetClearSelection"))}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div>
              <Label>{String(t("splitPdf.metadataKeysLabel"))}</Label>
              <p className="text-sm text-muted-foreground mt-1">{String(t("splitPdf.metadataKeysHint"))}</p>
              {metadataKeysLoading && (
                <p className="text-sm text-muted-foreground mt-2 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {String(t("splitPdf.metadataKeysLoading"))}
                </p>
              )}
              {!metadataKeysLoading && companyMetadataKeys.length === 0 && (
                <p className="text-sm text-muted-foreground mt-2">{String(t("splitPdf.metadataKeysEmpty"))}</p>
              )}
              {!metadataKeysLoading && companyMetadataKeys.length > 0 && (
                <div className="mt-3 space-y-2 rounded-lg border bg-muted/20 p-3 max-h-[min(280px,50vh)] overflow-y-auto">
                  {companyMetadataKeys.map((k) => {
                    const label = (k.name && k.name.trim()) || String(t("splitPdf.metadataKeyUnnamed"));
                    const predefined =
                      k.value_kind === "predefined_list" && Array.isArray(k.allowed_values)
                        ? (k.allowed_values as unknown[]).filter((x): x is string => typeof x === "string")
                        : [];
                    return (
                      <label
                        key={k.id}
                        className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-muted/40"
                      >
                        <Checkbox
                          checked={selectedMetadataKeyIds.includes(k.id)}
                          onCheckedChange={(c) => toggleMetadataKey(k.id, c === true)}
                          className="mt-0.5"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="text-sm font-medium leading-tight block">{label}</span>
                          {predefined.length > 0 && (
                            <span className="text-xs text-muted-foreground block mt-0.5">
                              {String(t("splitPdf.metadataPredefinedOptions"))}: {predefined.join(", ")}
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
            <div>
              <Label>{String(t("splitPdf.namingRules"))}</Label>
              <Textarea
                className="mt-1.5 min-h-[160px] font-mono text-sm"
                placeholder={String(t("splitPdf.namingRulesPlaceholder"))}
                value={namingInstructions}
                onChange={(e) => setNamingInstructions(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2 mt-auto pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setStep("pick");
                  setFileId(null);
                  setLocalFile(null);
                  setOcrError(null);
                }}
                disabled={busy}
              >
                {String(t("splitPdf.back"))}
              </Button>
              <Button
                onClick={handlePropose}
                disabled={
                  busy ||
                  metadataKeysLoading ||
                  companyMetadataKeys.length === 0 ||
                  selectedMetadataKeyIds.length === 0
                }
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : String(t("splitPdf.suggest"))}
              </Button>
            </div>
          </div>
        )}

        {step === "review" && (
          <>
            <div className="flex flex-col gap-4 min-h-0 flex-1">
              <p className="text-sm text-muted-foreground shrink-0">{String(t("splitPdf.reviewHint"))}</p>
              {pdfUrlLoading && (
                <p className="text-xs text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {String(t("splitPdf.thumbsLoading"))}
                </p>
              )}
              {pdfUrlError && (
                <p className="text-xs text-destructive">{String(t("splitPdf.thumbsError"))}</p>
              )}
              <div className="w-full min-h-0 flex-1 shrink-0">
                <SplitPdfPageStrip
                  totalPages={totalPages}
                  segments={segments}
                  onSegmentsChange={setSegmentsFromStrip}
                  onPageClick={handleStripPageClick}
                  pdfUrl={!pdfUrlLoading && !pdfUrlError ? pdfUrlForThumbs : null}
                  selectedPage={expandedPage}
                  metadataKeys={selectedMetadataKeysOrdered}
                  onSegmentNameChange={handleSegmentNameChange}
                  onSegmentMetadataChange={handleSegmentMetadataChange}
                  onRemoveSegment={handleRemoveSegment}
                  onSplitAfterPage={handleSplitAfterPage}
                  onMergeCutAfterPage={handleMergeCutAfterPage}
                  onTogglePageExclude={togglePageExclude}
                />
              </div>
              <div className="flex flex-wrap items-start gap-x-6 gap-y-3 pt-2 border-t shrink-0">
                <div className="flex flex-col gap-3 min-w-0 flex-1 basis-[min(100%,20rem)]">
                  <div className="flex items-center gap-2 min-w-0">
                    <Switch
                      id="split-pdf-keep-original"
                      checked={keepOriginalFile}
                      onCheckedChange={(c) => setKeepOriginalFile(c === true)}
                      disabled={busy}
                      aria-describedby="split-pdf-keep-original-desc"
                    />
                    <div className="min-w-0">
                      <Label htmlFor="split-pdf-keep-original" className="text-sm font-normal cursor-pointer">
                        {String(t("splitPdf.keepOriginalFile"))}
                      </Label>
                      <p id="split-pdf-keep-original-desc" className="text-xs text-muted-foreground">
                        {String(t("splitPdf.keepOriginalFileHint"))}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    <Switch
                      id="split-pdf-ocr-created"
                      checked={ocrCreatedFiles}
                      onCheckedChange={(c) => setOcrCreatedFiles(c === true)}
                      disabled={busy}
                      aria-describedby="split-pdf-ocr-created-desc"
                    />
                    <div className="min-w-0">
                      <Label htmlFor="split-pdf-ocr-created" className="text-sm font-normal cursor-pointer">
                        {String(t("splitPdf.ocrCreatedFiles"))}
                      </Label>
                      <p id="split-pdf-ocr-created-desc" className="text-xs text-muted-foreground">
                        {String(t("splitPdf.ocrCreatedFilesHint"))}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0 min-w-[12rem] sm:ml-auto sm:justify-end">
                  <Button variant="outline" onClick={() => setStep("configure")} disabled={busy}>
                    {String(t("splitPdf.back"))}
                  </Button>
                  <Button onClick={handleApply} disabled={busy || segments.length === 0}>
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : String(t("splitPdf.createFiles"))}
                  </Button>
                </div>
              </div>
            </div>

            <Dialog open={expandedPage != null} onOpenChange={(open) => !open && setExpandedPage(null)}>
              <DialogContent className="max-w-[min(96vw,calc(100vw-1rem))] w-full max-h-[min(96vh,900px)] h-[min(96vh,900px)] p-0 gap-0 flex flex-col overflow-hidden">
                <DialogHeader className="sr-only">
                  <DialogTitle>
                    {expandedPage != null
                      ? String(t("splitPdf.pageExpandedTitle", { page: String(expandedPage) }))
                      : ""}
                  </DialogTitle>
                  <DialogDescription>{String(t("splitPdf.pageExpandedDescription"))}</DialogDescription>
                </DialogHeader>
                {expandedPage != null && (
                  <>
                    <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-3 py-2 shrink-0">
                      <span className="text-sm font-medium tabular-nums pr-2">
                        {String(t("splitPdf.pageExpandedTitle", { page: String(expandedPage) }))}
                      </span>
                      <div className="flex flex-1 flex-wrap items-center justify-end gap-2 min-w-0">
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            title={String(t("splitPdf.previewZoomOut"))}
                            aria-label={String(t("splitPdf.previewZoomOut"))}
                            onClick={() =>
                              setExpandedPreviewZoom((z) => Math.max(0.25, Math.round((z - 0.25) * 100) / 100))
                            }
                          >
                            <ZoomOut className="h-4 w-4" />
                          </Button>
                          <div className="flex w-[min(160px,28vw)] items-center gap-2 px-1">
                            <Slider
                              min={25}
                              max={400}
                              step={5}
                              value={[Math.round(expandedPreviewZoom * 100)]}
                              onValueChange={(v) =>
                                setExpandedPreviewZoom((v[0] ?? 100) / 100)
                              }
                              aria-label={String(t("splitPdf.previewZoom"))}
                            />
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            title={String(t("splitPdf.previewZoomIn"))}
                            aria-label={String(t("splitPdf.previewZoomIn"))}
                            onClick={() =>
                              setExpandedPreviewZoom((z) => Math.min(4, Math.round((z + 0.25) * 100) / 100))
                            }
                          >
                            <ZoomIn className="h-4 w-4" />
                          </Button>
                          <span className="text-xs tabular-nums text-muted-foreground w-10 text-right">
                            {Math.round(expandedPreviewZoom * 100)}%
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            title={String(t("splitPdf.previewRotateLeft"))}
                            aria-label={String(t("splitPdf.previewRotateLeft"))}
                            onClick={() => setExpandedPreviewRotation((r) => (r - 90 + 360) % 360)}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            title={String(t("splitPdf.previewRotateRight"))}
                            aria-label={String(t("splitPdf.previewRotateRight"))}
                            onClick={() => setExpandedPreviewRotation((r) => (r + 90) % 360)}
                          >
                            <RotateCw className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            title={String(t("splitPdf.previewResetView"))}
                            aria-label={String(t("splitPdf.previewResetView"))}
                            onClick={() => {
                              setExpandedPreviewZoom(1);
                              setExpandedPreviewRotation(0);
                            }}
                          >
                            <Maximize2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 min-h-0 overflow-auto bg-muted/20">
                      <div className="flex min-h-full min-w-full items-center justify-center p-4">
                        {expandedPreviewLoading && (
                          <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground">
                            <Loader2 className="h-8 w-8 animate-spin" />
                          </div>
                        )}
                        {!expandedPreviewLoading && expandedPreviewUrl && (
                          <div
                            className="flex items-center justify-center"
                            style={{
                              transform: `rotate(${expandedPreviewRotation}deg) scale(${expandedPreviewZoom})`,
                              transformOrigin: "center center",
                            }}
                          >
                            <img
                              src={expandedPreviewUrl}
                              alt=""
                              className={cn(
                                "max-h-[min(calc(96vh-10rem),840px)] w-auto max-w-[min(92vw,56rem)] object-contain select-none",
                                segmentIndexForPage(segments, expandedPage) < 0 && "opacity-55 grayscale",
                              )}
                              draggable={false}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </DialogContent>
            </Dialog>
          </>
        )}
      </div>
    </div>
  );
}
