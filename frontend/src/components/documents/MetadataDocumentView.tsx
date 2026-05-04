import React, { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo, Children } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  File as FileIcon,
  Upload,
  ChevronRight,
  ChevronDown,
  Trash2,
  Download,
  Edit,
  Settings,
  FolderTree,
  X,
  GripVertical,
  Tag,
  Filter,
  Search,
  CloudUpload,
  Clock,
  Loader2,
  CheckCircle,
  XCircle,
  FileSearch,
  ScanText,
  Copy,
  ChevronsDownUp,
  ChevronsUpDown,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronUp,
  Scissors,
  MoreHorizontal,
  History,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { useNavigate } from "react-router-dom";
import { MetadataValueControl } from "@/components/documents/MetadataValueControl";
import { MetadataFreeTextFilterCombobox } from "@/components/documents/MetadataFreeTextFilterCombobox";
import { Progress } from "@/components/ui/progress";
import { useDocumentImportJobs } from "@/contexts/DocumentImportJobsContext";
import { useAuth } from "@/contexts/AuthContext";
import { getTagColors, type TagColorSet } from "@/lib/tagColors";

const MAX_UPLOAD_FILES = 25;
const METADATA_BADGE_GAP_PX = 4;

function lightenHexColor(hexColor: string, amount: number): string {
  const hex = hexColor.replace("#", "");
  if (hex.length !== 6) return hexColor;
  const toHex = (value: number) => value.toString(16).padStart(2, "0");
  const mixWithWhite = (channel: number) => Math.min(255, Math.round(channel + (255 - channel) * amount));
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `#${toHex(mixWithWhite(r))}${toHex(mixWithWhite(g))}${toHex(mixWithWhite(b))}`;
}

interface FileType {
  id: string;
  name: string;
  folder_id: string | null;
  storage_path: string;
  size_bytes: number;
  mime_type: string;
  created_at: string;
  accessLevel?: 'read' | 'write';
  metadata_values?: Array<{
    value: string;
    metadata?: { id: string; name: string };
  }>;
  ocr_status?: string | null;
  ocr_error?: string | null;
  ocr_processed_at?: string | null;
  ocrSnippet?: string;
}

function getFileMetadataDisplayEntries(file: FileType): Array<{ key: string; value: string }> {
  const rows = file.metadata_values || [];
  if (rows.length === 0) return [];
  return rows
    .map((mv) => ({
      key: (mv.metadata?.name || "").trim(),
      value: mv.value?.trim() || "",
    }))
    .filter((e) => e.value);
}

function splitFileName(fileName: string): { baseName: string; extension: string } {
  const trimmed = fileName.trim();
  const dot = trimmed.lastIndexOf(".");
  if (dot <= 0 || dot === trimmed.length - 1) {
    return { baseName: trimmed, extension: "" };
  }
  return {
    baseName: trimmed.slice(0, dot),
    extension: trimmed.slice(dot),
  };
}

interface OcrViewerData {
  fileName: string;
  markdown: string;
  provider?: string;
  model?: string;
  processedAt?: string;
}

interface FileHistoryApiEvent {
  id: string;
  eventType: string;
  createdAt: string;
  actor: { id: string; email: string; fullName: string | null } | null;
  details: unknown;
}

interface MetadataKey {
  id: string;
  name: string;
  value_kind: "free_text" | "predefined_list";
  allowed_values?: unknown;
}

type FilterRow = {
  key_id: string;
  values: string[];
};

interface TreeNode {
  id: string;
  name: string;
  type: "folder" | "file";
  children?: TreeNode[];
  fileCount?: number;
  keyName?: string;
  isUncategorized?: boolean;
}

interface Props {
  companyId: string;
  canManage?: boolean;
}

function nodeDirectlyMatches(node: TreeNode, query: string): boolean {
  if (!query) return false;
  const q = query.toLowerCase();
  return node.name.toLowerCase().includes(q) || (node.keyName?.toLowerCase().includes(q) ?? false);
}

function OcrStatusBadge({ file }: { file: FileType }) {
  if (!file.ocr_status) return null;
  switch (file.ocr_status) {
    case 'pending':
      return <Badge variant="secondary" className="gap-1 text-xs"><Clock className="h-3 w-3" />Pending</Badge>;
    case 'processing':
      return <Badge variant="secondary" className="gap-1 text-xs bg-blue-50 text-blue-700"><Loader2 className="h-3 w-3 animate-spin" />Processing</Badge>;
    case 'completed':
      return <Badge variant="secondary" className="gap-1 text-xs bg-green-50 text-green-700"><CheckCircle className="h-3 w-3" />OCR</Badge>;
    case 'failed':
      return (
        <Badge variant="destructive" className="gap-1 text-xs" title={file.ocr_error || 'OCR failed'}>
          <XCircle className="h-3 w-3" />Failed
        </Badge>
      );
    default:
      return null;
  }
}

/** Key/value line for metadata tooltips: bold label, readable value. */
function FileMetadataTooltipRow({ metadataKey, value }: { metadataKey: string; value: string }) {
  const label = metadataKey.trim();
  if (!label) {
    return <p className="m-0 text-sm leading-snug break-words">{value}</p>;
  }
  return (
    <p className="m-0 text-sm leading-snug break-words">
      <span className="font-semibold text-foreground">{label}</span>
      <span className="text-muted-foreground font-normal" aria-hidden>
        {": "}
      </span>
      <span className="font-normal text-foreground">{value}</span>
    </p>
  );
}

function FileRowMetadataBadges({
  fileId,
  entries,
  metadataTagColors,
}: {
  fileId: string;
  entries: Array<{ key: string; value: string }>;
  metadataTagColors: TagColorSet | null;
}) {
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  const containerRef = useRef<HTMLDivElement>(null);
  const measureRowRef = useRef<HTMLDivElement>(null);
  const plusProbeTextRef = useRef<HTMLSpanElement>(null);
  const plusProbeWrapRef = useRef<HTMLDivElement>(null);

  const [fitCount, setFitCount] = useState(entries.length);

  const badgeOutlineClass = metadataTagColors
    ? "min-w-0 max-w-[180px] shrink truncate text-[10px] font-normal px-1.5 py-0 h-5 border"
    : "min-w-0 max-w-[180px] shrink truncate text-[10px] font-normal px-1.5 py-0 h-5 border bg-primary/10 text-primary border-primary/20";

  const badgeStyle = metadataTagColors
    ? {
        backgroundColor: lightenHexColor(metadataTagColors.bg, 0.2),
        color: metadataTagColors.text,
        borderColor: metadataTagColors.dot,
      }
    : undefined;

  const entriesFingerprint = entries.map((e) => `${e.key}\u0000${e.value}`).join("\u0001");

  const recalc = useCallback(() => {
    const currentEntries = entriesRef.current;
    const n = currentEntries.length;
    if (n === 0) {
      setFitCount(0);
      return;
    }

    const measureRow = measureRowRef.current;
    const container = containerRef.current;
    if (!measureRow || !container) {
      setFitCount(n);
      return;
    }

    const badgeNodes = measureRow.querySelectorAll<HTMLElement>("[data-metadata-measure='badge']");
    if (badgeNodes.length !== n) {
      setFitCount(n);
      return;
    }

    const widths = Array.from(badgeNodes).map((el) => el.getBoundingClientRect().width);

    const plusWidthByHidden = new Map<number, number>();
    const plusTextEl = plusProbeTextRef.current;
    const plusWrapEl = plusProbeWrapRef.current;
    if (plusTextEl && plusWrapEl) {
      for (let h = 1; h <= n; h++) {
        plusTextEl.textContent = `+${h}`;
        plusWidthByHidden.set(h, plusWrapEl.getBoundingClientRect().width);
      }
      plusTextEl.textContent = "+1";
    } else {
      for (let h = 1; h <= n; h++) {
        plusWidthByHidden.set(h, 36);
      }
    }

    const W = container.getBoundingClientRect().width;
    if (!W) {
      setFitCount(n);
      return;
    }

    const EPS = 1;
    let best = 0;
    for (let k = 0; k <= n; k++) {
      let total = 0;
      if (k > 0) {
        for (let i = 0; i < k; i++) {
          total += widths[i];
          if (i < k - 1) total += METADATA_BADGE_GAP_PX;
        }
      }
      if (k < n) {
        const hidden = n - k;
        total += (k > 0 ? METADATA_BADGE_GAP_PX : 0) + (plusWidthByHidden.get(hidden) ?? 36);
      }
      if (total <= W + EPS) best = k;
    }
    setFitCount(best);
  }, []);

  useLayoutEffect(() => {
    recalc();
  }, [recalc, entriesFingerprint]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => recalc());
    ro.observe(el);
    return () => ro.disconnect();
  }, [recalc]);

  const n = entries.length;
  const safeFit = Math.min(fitCount, n);
  const visibleEntries = entries.slice(0, safeFit);
  const hiddenCount = n - safeFit;

  return (
    <>
      <div
        ref={measureRowRef}
        className="pointer-events-none fixed left-[-10000px] top-0 z-[-1] flex flex-nowrap items-center gap-1 opacity-0"
        aria-hidden
      >
        {entries.map((e, i) => (
          <Badge
            key={`measure-${fileId}-${i}`}
            data-metadata-measure="badge"
            variant="outline"
            className={badgeOutlineClass}
            style={badgeStyle}
          >
            <span className="min-w-0 max-w-full truncate">{e.value}</span>
          </Badge>
        ))}
        <div ref={plusProbeWrapRef} className="inline-flex shrink-0">
          <Badge variant="outline" className="text-[10px] font-normal px-1.5 py-0 h-5 border">
            <span ref={plusProbeTextRef}>+1</span>
          </Badge>
        </div>
      </div>
      <div ref={containerRef} className="min-w-0 w-full max-w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex min-w-0 flex-nowrap items-center gap-1 overflow-hidden">
          {visibleEntries.map(({ key, value }, index) => (
            <Tooltip key={`${fileId}-metadata-${index}`}>
              <TooltipTrigger asChild>
                <Badge
                  variant="outline"
                  className={badgeOutlineClass}
                  style={badgeStyle}
                >
                  <span className="min-w-0 max-w-full truncate">{value}</span>
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[420px] break-words">
                <FileMetadataTooltipRow metadataKey={key} value={value} />
              </TooltipContent>
            </Tooltip>
          ))}
          {hiddenCount > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="shrink-0 text-[10px] font-normal px-1.5 py-0 h-5 border">
                  +{hiddenCount}
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top" align="start" className="w-[420px] max-w-[90vw]">
                <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                  {entries.map(({ key, value }, index) => (
                    <div key={`${fileId}-all-metadata-${index}`}>
                      <FileMetadataTooltipRow metadataKey={key} value={value} />
                    </div>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </>
  );
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createHighlightComponents(regex: RegExp, activeIndex: number) {
  const counter = { current: 0 };

  function highlightString(text: string): React.ReactNode {
    const parts = text.split(regex);
    if (parts.length <= 1) return text;
    return parts.map((part, i) => {
      if (i % 2 === 0) return part;
      const matchIndex = counter.current++;
      return (
        <mark
          key={`hl-${matchIndex}`}
          data-match-index={matchIndex}
          className={`rounded-sm px-0.5 ${matchIndex === activeIndex ? "bg-yellow-400 ring-2 ring-yellow-500" : "bg-yellow-200/70 dark:bg-yellow-500/30"}`}
        >
          {part}
        </mark>
      );
    });
  }

  function processChildren(children: React.ReactNode): React.ReactNode {
    return Children.map(children, (child) => {
      if (typeof child === "string") return highlightString(child);
      if (typeof child === "number") return highlightString(String(child));
      return child;
    });
  }

  const wrap = (Tag: string) =>
    function HighlightWrap({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) {
      return React.createElement(Tag, { ...props, children: processChildren(children) });
    };

  return {
    p: wrap("p"), li: wrap("li"), td: wrap("td"), th: wrap("th"),
    h1: wrap("h1"), h2: wrap("h2"), h3: wrap("h3"), h4: wrap("h4"), h5: wrap("h5"), h6: wrap("h6"),
    strong: wrap("strong"), em: wrap("em"), a: wrap("a"), blockquote: wrap("blockquote"),
    code: wrap("code"),
  };
}

export default function MetadataDocumentView({ companyId, canManage = false }: Props) {
  const [files, setFiles] = useState<FileType[]>([]);
  const [totalFileCount, setTotalFileCount] = useState(0);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [keyOrder, setKeyOrder] = useState<Array<{ id: string; name: string }>>([]);
  const [metadataKeys, setMetadataKeys] = useState<MetadataKey[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [selectedNodePath, setSelectedNodePath] = useState<Array<{ key: string; value: string; missing?: boolean }>>([]);
  const [filters, setFilters] = useState<Array<{ key_id: string; value?: string; missing?: boolean }>>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [isTreeOpen, setIsTreeOpen] = useState(true);
  const [isTreeConfigOpen, setIsTreeConfigOpen] = useState(false);
  const [configKeyOrder, setConfigKeyOrder] = useState<string[]>([]);
  const [hideKeyLabels, setHideKeyLabels] = useState(false);
  const [configHideKeyLabels, setConfigHideKeyLabels] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadMetadata, setUploadMetadata] = useState<Array<{ key_id: string; value: string }>>([]);
  const [uploadDialogJobId, setUploadDialogJobId] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [hasWriteAccess, setHasWriteAccess] = useState(false);
  const [isMetadataDialogOpen, setIsMetadataDialogOpen] = useState(false);
  const [editingFile, setEditingFile] = useState<FileType | null>(null);
  const [metadataEntries, setMetadataEntries] = useState<Array<{ key: string; value: string }>>([]);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameTargetFile, setRenameTargetFile] = useState<FileType | null>(null);
  const [renameBaseName, setRenameBaseName] = useState("");
  const [renameSubmitting, setRenameSubmitting] = useState(false);
  const [isBulkMetadataOpen, setIsBulkMetadataOpen] = useState(false);
  const [bulkEntries, setBulkEntries] = useState<Array<{ key: string; value: string }>>([]);
  const [isBulkExtractDialogOpen, setIsBulkExtractDialogOpen] = useState(false);
  const [bulkExtractSubmitting, setBulkExtractSubmitting] = useState(false);
  const [bulkExtractSelectedKeyIds, setBulkExtractSelectedKeyIds] = useState<string[]>([]);
  const [bulkExtractRenameInstructions, setBulkExtractRenameInstructions] = useState("");
  const [previewFile, setPreviewFile] = useState<FileType | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"document" | "ocr" | "split" | "history">("document");
  const [previewOcrData, setPreviewOcrData] = useState<OcrViewerData | null>(null);
  const [previewOcrFileId, setPreviewOcrFileId] = useState<string | null>(null);
  const [previewOcrLoading, setPreviewOcrLoading] = useState(false);
  const [previewOcrError, setPreviewOcrError] = useState<string | null>(null);
  const [previewHistoryEvents, setPreviewHistoryEvents] = useState<FileHistoryApiEvent[]>([]);
  const [previewHistoryLoading, setPreviewHistoryLoading] = useState(false);
  const [previewHistoryError, setPreviewHistoryError] = useState<string | null>(null);
  const [filterRows, setFilterRows] = useState<FilterRow[]>([]);
  const [treeSearch, setTreeSearch] = useState("");
  // OCR state
  const [ocrPolling, setOcrPolling] = useState<Record<string, NodeJS.Timeout>>({});
  const [ocrAfterUpload, setOcrAfterUpload] = useState(false);
  const [extractMetadataAfterOcr, setExtractMetadataAfterOcr] = useState(false);
  const [selectedExtractMetadataKeyIds, setSelectedExtractMetadataKeyIds] = useState<string[]>([]);
  const [extractRenameInstructionsAfterUpload, setExtractRenameInstructionsAfterUpload] = useState("");
  // Per-file extract metadata action
  const [extractDialogOpen, setExtractDialogOpen] = useState(false);
  const [extractTargetFile, setExtractTargetFile] = useState<FileType | null>(null);
  const [extractSubmitting, setExtractSubmitting] = useState(false);
  const [extractSelectedKeyIds, setExtractSelectedKeyIds] = useState<string[]>([]);
  const [extractRenameInstructions, setExtractRenameInstructions] = useState("");
  const [ocrEnabled, setOcrEnabled] = useState(false);
  const [geminiConfigured, setGeminiConfigured] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [ocrSearch, setOcrSearch] = useState("");
  const [ocrActiveMatch, setOcrActiveMatch] = useState(0);
  const ocrContentRef = useRef<HTMLDivElement>(null);
  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchActive, setSearchActive] = useState(false);
  const { toast } = useToast();
  const { t, language } = useLanguage();
  const { companyBranding } = useAuth();
  const navigate = useNavigate();
  const { startImportJob, setJobBackground, jobs, dismissJob } = useDocumentImportJobs();
  const activeUploadJob = uploadDialogJobId ? jobs.find((j) => j.id === uploadDialogJobId) : undefined;
  const isImportBusy = !!(activeUploadJob && activeUploadJob.phase !== "error");
  const metadataTagColors = companyBranding?.internal_primary_color
    ? getTagColors(companyBranding.internal_primary_color)
    : null;

  const canWriteFiles = canManage || hasWriteAccess;
  const selectedOcrEligibleFileIds = useMemo(() => {
    const eligibleIds: string[] = [];
    for (const file of files) {
      if (selectedFileIds.has(file.id) && !file.ocr_status) {
        eligibleIds.push(file.id);
      }
    }
    return eligibleIds;
  }, [files, selectedFileIds]);
  const selectedOcrEligibleCount = selectedOcrEligibleFileIds.length;
  const selectedAiExtractEligibleFiles = useMemo(
    () => files.filter((file) => selectedFileIds.has(file.id) && file.ocr_status === "completed"),
    [files, selectedFileIds],
  );
  const selectedAiExtractEligibleCount = selectedAiExtractEligibleFiles.length;

  // OCR viewer search: count matches and build regex
  const ocrSearchRegex = useMemo(() => {
    if (!ocrSearch.trim()) return null;
    try { return new RegExp(`(${escapeRegExp(ocrSearch.trim())})`, "gi"); } catch { return null; }
  }, [ocrSearch]);

  const ocrMatchCount = useMemo(() => {
    if (!ocrSearchRegex || !previewOcrData?.markdown) return 0;
    const matches = previewOcrData.markdown.match(ocrSearchRegex);
    return matches ? matches.length : 0;
  }, [ocrSearchRegex, previewOcrData?.markdown]);

  // Reset active match when search changes
  useEffect(() => {
    setOcrActiveMatch(0);
  }, [ocrSearch]);

  // Scroll to active match
  useEffect(() => {
    if (ocrMatchCount === 0 || !ocrContentRef.current) return;
    const marks = ocrContentRef.current.querySelectorAll(`mark[data-match-index="${ocrActiveMatch}"]`);
    if (marks.length > 0) {
      marks[0].scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [ocrActiveMatch, ocrMatchCount]);

  // Check OCR availability on mount
  useEffect(() => {
    api.get<{ ocr: { enabled: boolean }; pdfSplit?: { geminiConfigured: boolean } }>('/api/health').then(data => {
      setOcrEnabled(data?.ocr?.enabled ?? false);
      setGeminiConfigured(data?.pdfSplit?.geminiConfigured ?? false);
    }).catch(() => {});
  }, []);

  const splitPdfToolbar = useMemo(() => {
    const disabled = !ocrEnabled || !geminiConfigured;
    let title: string | undefined;
    if (disabled) {
      if (!ocrEnabled && !geminiConfigured) {
        title = String(t("splitPdf.missingOcrAndGemini"));
      } else if (!ocrEnabled) {
        title = String(t("splitPdf.missingOcr"));
      } else {
        title = String(t("splitPdf.missingGemini"));
      }
    }
    return { disabled, title };
  }, [ocrEnabled, geminiConfigured, t]);

  // Debounce search query
  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  // Clean up OCR polling on unmount
  useEffect(() => {
    return () => {
      Object.values(ocrPolling).forEach(clearInterval);
    };
  }, [ocrPolling]);

  const fetchMetadataKeys = useCallback(async () => {
    const data = await api.get<MetadataKey[]>(`/api/companies/${companyId}/files-metadata-keys`);
    setMetadataKeys(data || []);
  }, [companyId]);

  const fetchTree = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{
        tree: TreeNode[];
        keyOrder: Array<{ id: string; name: string }>;
        totalFiles: number;
        hide_key_labels?: boolean;
      }>(`/api/companies/${companyId}/documents/tree`);
      setTree(data.tree || []);
      setKeyOrder(data.keyOrder || []);
      setTotalFileCount(data.totalFiles ?? 0);
      setHideKeyLabels(Boolean(data.hide_key_labels));
    } catch {
      toast({ title: "Error", description: "Failed to load document tree", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [companyId, toast]);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.length > 0) params.set('filters', JSON.stringify(filters));
      if (debouncedSearch.trim()) params.set('q', debouncedSearch.trim());
      const queryString = params.toString() ? `?${params.toString()}` : '';
      const data = await api.get<{ files: FileType[]; hasWriteAccess: boolean; searchActive?: boolean }>(`/api/companies/${companyId}/documents/flat${queryString}`);
      setFiles(data?.files || []);
      setHasWriteAccess(data?.hasWriteAccess || false);
      setSearchActive(data?.searchActive || false);
    } catch {
      toast({ title: "Error", description: "Failed to load files", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [companyId, filters, debouncedSearch, toast]);

  useEffect(() => {
    fetchMetadataKeys();
    fetchTree();
  }, [fetchMetadataKeys, fetchTree]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // Auto-start polling for files with in-progress OCR
  useEffect(() => {
    for (const file of files) {
      if ((file.ocr_status === 'pending' || file.ocr_status === 'processing') && !ocrPolling[file.id]) {
        startOcrPolling(file.id);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  // Preview URL generation
  useEffect(() => {
    if (!previewFile) { setPreviewUrl(null); return; }
    const generate = async () => {
      try {
        const { url } = await api.post<{ url: string }>("/api/files/document-url", { fileId: previewFile.id, download: false });
        const base = (import.meta.env.VITE_API_URL as string) || window.location.origin;
        setPreviewUrl(url.startsWith("http") ? url : `${base.replace(/\/$/, "")}${url}`);
      } catch { setPreviewUrl(null); }
    };
    generate();
  }, [previewFile]);

  useEffect(() => {
    if (!previewFile) {
      setPreviewMode("document");
      setPreviewOcrData(null);
      setPreviewOcrFileId(null);
      setPreviewOcrError(null);
      setPreviewOcrLoading(false);
      setOcrSearch("");
    }
  }, [previewFile]);

  const applyFilterRows = useCallback(
    (rows: FilterRow[]) => {
      const cleaned = rows
        .map((row) => ({
          key_id: row.key_id,
          values: Array.from(
            new Set(
              row.values
                .map((value) => value.trim())
                .filter(Boolean),
            ),
          ),
        }))
        .filter((row) => row.key_id || row.values.length > 0);
      const newlyComplete = cleaned.flatMap((row) =>
        row.key_id ? row.values.map((value) => ({ key_id: row.key_id, value })) : [],
      );
      setFilterRows(cleaned.length > 0 ? cleaned : []);
      setFilters((prev) => {
        const keyIdsReplaced = new Set(newlyComplete.map((r) => r.key_id));
        const prevKept = prev.filter(
          (f) => !f.key_id || !keyIdsReplaced.has(f.key_id)
        );
        const merged = [...prevKept, ...newlyComplete];
        if (merged.length === 0) {
          queueMicrotask(() => setSelectedNodePath([]));
        }
        return merged;
      });
    },
    []
  );

  const nodeMatchesSearch = useCallback(
    (node: TreeNode, query: string): boolean => {
      if (!query) return false;
      const q = query.toLowerCase();
      if (node.name.toLowerCase().includes(q)) return true;
      if (node.keyName?.toLowerCase().includes(q)) return true;
      return node.children?.some((c) => nodeMatchesSearch(c, q)) || false;
    },
    []
  );

  useEffect(() => {
    if (!treeSearch.trim()) return;
    const toExpand = new Set<string>();
    const walk = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        if (node.children?.some((c) => nodeMatchesSearch(c, treeSearch))) {
          toExpand.add(node.id);
        }
        if (node.children) walk(node.children);
      }
    };
    walk(tree);
    if (toExpand.size > 0) {
      setExpandedNodes((prev) => new Set([...prev, ...toExpand]));
    }
  }, [treeSearch, tree, nodeMatchesSearch]);

  const toggleNode = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const collectAllFolderIds = useCallback((nodes: TreeNode[]): string[] => {
    const ids: string[] = [];
    const walk = (list: TreeNode[]) => {
      for (const n of list) {
        if (n.type === "folder") {
          ids.push(n.id);
          if (n.children) walk(n.children);
        }
      }
    };
    walk(nodes);
    return ids;
  }, []);

  const isAllExpanded = tree.length > 0 && collectAllFolderIds(tree).every((id) => expandedNodes.has(id));

  const toggleExpandAll = () => {
    if (isAllExpanded) {
      setExpandedNodes(new Set());
    } else {
      setExpandedNodes(new Set(collectAllFolderIds(tree)));
    }
  };

  const navigateToNode = (path: Array<{ key: string; value: string; missing?: boolean }>) => {
    setSelectedNodePath(path);
    const newFilters = path.map((p) =>
      p.missing ? { key_id: p.key, missing: true as const } : { key_id: p.key, value: p.value }
    );
    setFilters(newFilters);
    setFilterRows([]);
    setSelectedFileIds(new Set());
  };

  const clearNavigation = () => {
    setSelectedNodePath([]);
    setFilters([]);
    setFilterRows([]);
    setSelectedFileIds(new Set());
  };

  const handleToggleSelectAll = () => {
    if (selectedFileIds.size === files.length) {
      setSelectedFileIds(new Set());
    } else {
      setSelectedFileIds(new Set(files.map((f) => f.id)));
    }
  };

  const handleToggleSelect = (fileId: string) => {
    setSelectedFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  };

  // Tree config
  const openTreeConfig = async () => {
    try {
      const config = await api.get<{ key_order: string[]; hide_key_labels?: boolean }>(
        `/api/companies/${companyId}/documents/tree-config`
      );
      setConfigKeyOrder(config.key_order || []);
      setConfigHideKeyLabels(Boolean(config.hide_key_labels));
    } catch {
      setConfigKeyOrder([]);
      setConfigHideKeyLabels(false);
    }
    setIsTreeConfigOpen(true);
  };

  const saveTreeConfig = async () => {
    try {
      await api.put(`/api/companies/${companyId}/documents/tree-config`, {
        key_order: configKeyOrder,
        hide_key_labels: configHideKeyLabels,
      });
      toast({ title: "Success", description: "Tree view configuration saved" });
      setIsTreeConfigOpen(false);
      fetchTree();
    } catch {
      toast({ title: "Error", description: "Failed to save tree configuration", variant: "destructive" });
    }
  };

  const moveKeyUp = (index: number) => {
    if (index === 0) return;
    const next = [...configKeyOrder];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    setConfigKeyOrder(next);
  };

  const moveKeyDown = (index: number) => {
    if (index >= configKeyOrder.length - 1) return;
    const next = [...configKeyOrder];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    setConfigKeyOrder(next);
  };

  const toggleKeyInConfig = (keyId: string) => {
    setConfigKeyOrder((prev) => {
      if (prev.includes(keyId)) return prev.filter((k) => k !== keyId);
      return [...prev, keyId];
    });
  };

  const addFilesToUpload = useCallback((incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    setUploadFiles((prev) => {
      const next = [...prev];
      for (const f of arr) {
        if (next.length >= MAX_UPLOAD_FILES) break;
        next.push(f);
      }
      return next;
    });
  }, []);

  const toggleExtractMetadataKey = (id: string, checked: boolean) => {
    setSelectedExtractMetadataKeyIds((prev) => {
      if (checked) return prev.includes(id) ? prev : [...prev, id];
      return prev.filter((x) => x !== id);
    });
  };

  const toggleExtractKeyForFile = (id: string, checked: boolean) => {
    setExtractSelectedKeyIds((prev) => {
      if (checked) return prev.includes(id) ? prev : [...prev, id];
      return prev.filter((x) => x !== id);
    });
  };

  const openExtractMetadataDialog = (file: FileType) => {
    setExtractTargetFile(file);
    setExtractSelectedKeyIds([]);
    setExtractDialogOpen(true);
  };

  const submitExtractMetadata = async () => {
    if (!extractTargetFile) return;
    if (extractSelectedKeyIds.length === 0) {
      toast({
        title: String(t("splitPdf.error")),
        description: String(t("splitPdf.metadataKeysRequired")),
        variant: "destructive",
      });
      return;
    }

    setExtractSubmitting(true);
    try {
      const response = await api.post<{ values: Record<string, string>; renamedTo?: string }>(
        `/api/companies/${companyId}/documents/extract-metadata-from-ocr`,
        {
        fileId: extractTargetFile.id,
        metadataKeyIds: extractSelectedKeyIds,
        renameInstructions: extractRenameInstructions.trim() || undefined,
        },
      );
      toast({
        title: String(t("metadataDocuments.extractMetadataSuccessTitle")),
        description: response.renamedTo
          ? String(t("metadataDocuments.extractMetadataSuccessDescriptionWithRename", { name: response.renamedTo }))
          : String(t("metadataDocuments.extractMetadataSuccessDescription")),
      });
      setExtractDialogOpen(false);
      setExtractTargetFile(null);
      setExtractSelectedKeyIds([]);
      await fetchFiles();
      fetchTree();
    } catch (e: unknown) {
      toast({
        title: String(t("splitPdf.error")),
        description: e instanceof Error ? e.message : String(t("metadataDocuments.extractMetadataFailed")),
        variant: "destructive",
      });
    } finally {
      setExtractSubmitting(false);
    }
  };

  // Upload
  const handleUpload = () => {
    if (uploadFiles.length === 0) return;
    if (ocrAfterUpload && extractMetadataAfterOcr && geminiConfigured && selectedExtractMetadataKeyIds.length === 0) {
      toast({
        title: String(t("splitPdf.error")),
        description: String(t("splitPdf.metadataKeysRequired")),
        variant: "destructive",
      });
      return;
    }
    const formData = new FormData();
    for (const f of uploadFiles) {
      formData.append("file", f);
    }
    if (uploadMetadata.length > 0) {
      formData.append("metadata", JSON.stringify(uploadMetadata));
    }
    if (ocrAfterUpload) {
      formData.append("ocr", "true");
      if (extractMetadataAfterOcr && geminiConfigured && selectedExtractMetadataKeyIds.length > 0) {
        formData.append("extractMetadataKeyIds", JSON.stringify(selectedExtractMetadataKeyIds));
        if (extractRenameInstructionsAfterUpload.trim()) {
          formData.append("extractMetadataRenameInstructions", extractRenameInstructionsAfterUpload.trim());
        }
      }
    }
    const wantsExtract =
      ocrAfterUpload && extractMetadataAfterOcr && geminiConfigured && selectedExtractMetadataKeyIds.length > 0;

    const jobId = startImportJob({
      companyId,
      formData,
      ocrAfterUpload,
      wantsExtract,
      onSuccess: async () => {
        setUploadFiles([]);
        setUploadMetadata([]);
        setOcrAfterUpload(false);
        setExtractMetadataAfterOcr(false);
        setSelectedExtractMetadataKeyIds([]);
        setExtractRenameInstructionsAfterUpload("");
        setUploadDialogJobId(null);
        setIsUploadOpen(false);
        await fetchFiles();
        fetchTree();
      },
    });
    setUploadDialogJobId(jobId);
  };

  // Metadata editing
  const openMetadataDialog = (file: FileType) => {
    setEditingFile(file);
    const entries = (file.metadata_values || []).map((mv) => ({
      key: mv.metadata?.name || "",
      value: mv.value,
    }));
    setMetadataEntries(entries.length > 0 ? entries : [{ key: "", value: "" }]);
    setIsMetadataDialogOpen(true);
  };

  const saveMetadata = async () => {
    if (!editingFile) return;
    try {
      const entries = metadataEntries.filter((e) => e.key.trim());
      await api.put(`/api/companies/${companyId}/files/${editingFile.id}/metadata`, { entries });
      toast({ title: "Success", description: "Metadata updated" });
      setIsMetadataDialogOpen(false);
      fetchFiles();
      fetchTree();
    } catch {
      toast({ title: "Error", description: "Failed to update metadata", variant: "destructive" });
    }
  };

  const openRenameDialog = (file: FileType) => {
    const { baseName } = splitFileName(file.name);
    setRenameTargetFile(file);
    setRenameBaseName(baseName);
    setRenameDialogOpen(true);
  };

  const handleRenameFile = async () => {
    if (!renameTargetFile) return;
    const nextBase = renameBaseName.trim();
    if (!nextBase) {
      toast({
        title: String(t("splitPdf.error")),
        description: String(t("metadataDocuments.renameValidationRequired")),
        variant: "destructive",
      });
      return;
    }

    setRenameSubmitting(true);
    try {
      const result = await api.patch<{ name: string }>(
        `/api/companies/${companyId}/documents/files/${renameTargetFile.id}/rename`,
        { name: nextBase },
      );
      const nextName = result?.name || renameTargetFile.name;
      setFiles((prev) => prev.map((f) => (f.id === renameTargetFile.id ? { ...f, name: nextName } : f)));
      if (previewFile?.id === renameTargetFile.id) {
        setPreviewFile({ ...renameTargetFile, name: nextName });
      }
      if (editingFile?.id === renameTargetFile.id) {
        setEditingFile({ ...renameTargetFile, name: nextName });
      }
      toast({
        title: String(t("metadataDocuments.renameSuccessTitle")),
        description: String(t("metadataDocuments.renameSuccessDescription", { name: nextName })),
      });
      setRenameDialogOpen(false);
    } catch {
      toast({
        title: String(t("splitPdf.error")),
        description: String(t("metadataDocuments.renameFailed")),
        variant: "destructive",
      });
    } finally {
      setRenameSubmitting(false);
    }
  };

  // Bulk metadata
  const handleBulkMetadata = async () => {
    const entries = bulkEntries.filter((e) => e.key.trim());
    if (entries.length === 0 || selectedFileIds.size === 0) return;
    try {
      await api.post(`/api/companies/${companyId}/documents/bulk-metadata`, {
        file_ids: Array.from(selectedFileIds),
        entries,
      });
      toast({ title: "Success", description: `Metadata updated for ${selectedFileIds.size} files` });
      setIsBulkMetadataOpen(false);
      setBulkEntries([]);
      setSelectedFileIds(new Set());
      fetchFiles();
      fetchTree();
    } catch {
      toast({ title: "Error", description: "Failed to update metadata", variant: "destructive" });
    }
  };

  const toggleBulkExtractKey = (id: string, checked: boolean) => {
    setBulkExtractSelectedKeyIds((prev) => {
      if (checked) return prev.includes(id) ? prev : [...prev, id];
      return prev.filter((x) => x !== id);
    });
  };

  const openBulkExtractMetadataDialog = () => {
    setBulkExtractSelectedKeyIds([]);
    setBulkExtractRenameInstructions("");
    setBulkExtractSubmitting(false);
    setIsBulkExtractDialogOpen(true);
  };

  const handleBulkExtractMetadata = async () => {
    if (bulkExtractSelectedKeyIds.length === 0) {
      toast({
        title: String(t("splitPdf.error")),
        description: String(t("splitPdf.metadataKeysRequired")),
        variant: "destructive",
      });
      return;
    }
    const totalSelected = selectedFileIds.size;
    if (totalSelected === 0) return;
    if (selectedAiExtractEligibleFiles.length === 0) {
      toast({
        title: String(t("splitPdf.error")),
        description: String(t("metadataDocuments.bulkExtractNoOcrEligible")),
        variant: "destructive",
      });
      return;
    }

    setBulkExtractSubmitting(true);
    try {
      const settled = await Promise.allSettled(
        selectedAiExtractEligibleFiles.map((file) =>
          api.post(`/api/companies/${companyId}/documents/extract-metadata-from-ocr`, {
            fileId: file.id,
            metadataKeyIds: bulkExtractSelectedKeyIds,
            renameInstructions: bulkExtractRenameInstructions.trim() || undefined,
          }),
        ),
      );
      const succeeded = settled.filter((result) => result.status === "fulfilled").length;
      const failed = settled.length - succeeded;
      const skipped = totalSelected - selectedAiExtractEligibleFiles.length;

      if (failed === 0) {
        toast({
          title: String(t("metadataDocuments.extractMetadataSuccessTitle")),
          description: String(
            t("metadataDocuments.bulkExtractSuccessDescription", {
              success: String(succeeded),
              skipped: String(skipped),
            }),
          ),
        });
      } else if (succeeded === 0) {
        toast({
          title: String(t("splitPdf.error")),
          description: String(t("metadataDocuments.bulkExtractFailedDescription")),
          variant: "destructive",
        });
      } else {
        toast({
          title: String(t("metadataDocuments.bulkExtractPartialTitle")),
          description: String(
            t("metadataDocuments.bulkExtractPartialDescription", {
              success: String(succeeded),
              failed: String(failed),
              skipped: String(skipped),
            }),
          ),
          variant: "destructive",
        });
      }

      setIsBulkExtractDialogOpen(false);
      setBulkExtractSelectedKeyIds([]);
      setBulkExtractRenameInstructions("");
      setSelectedFileIds(new Set());
      await fetchFiles();
      fetchTree();
    } finally {
      setBulkExtractSubmitting(false);
    }
  };

  // Download
  const handleDownload = async (file: FileType) => {
    try {
      const { url } = await api.post<{ url: string }>("/api/files/document-url", { fileId: file.id, download: true });
      const base = (import.meta.env.VITE_API_URL as string) || window.location.origin;
      const fullUrl = url.startsWith("http") ? url : `${base.replace(/\/$/, "")}${url}`;
      const a = document.createElement("a");
      a.href = fullUrl;
      a.download = file.name;
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      toast({ title: "Error", description: "Failed to download file", variant: "destructive" });
    }
  };

  // Delete
  const handleDelete = async (fileId: string) => {
    try {
      await api.delete(`/api/companies/${companyId}/files/${fileId}`);
      toast({ title: "Success", description: "File deleted" });
      fetchFiles();
      fetchTree();
    } catch {
      toast({ title: "Error", description: "Failed to delete file", variant: "destructive" });
    }
  };

  const confirmDeleteSelected = async () => {
    const ids = Array.from(selectedFileIds);
    if (ids.length === 0) {
      setBulkDeleteOpen(false);
      return;
    }
    setBulkDeleteOpen(false);
    setOcrPolling((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        if (next[id]) {
          clearInterval(next[id]);
          delete next[id];
        }
      }
      return next;
    });
    const results = await Promise.allSettled(
      ids.map((id) => api.delete(`/api/companies/${companyId}/files/${id}`))
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    const succeeded = results.length - failed;
    if (failed === 0) {
      toast({
        title: "Success",
        description: String(t("metadataDocuments.deleteSelectedSuccess", { count: String(succeeded) })),
      });
    } else if (succeeded === 0) {
      toast({
        title: "Error",
        description: String(t("metadataDocuments.deleteSelectedFailed")),
        variant: "destructive",
      });
    } else {
      toast({
        title: "Error",
        description: String(
          t("metadataDocuments.deleteSelectedPartial", { success: String(succeeded), fail: String(failed) })
        ),
        variant: "destructive",
      });
    }
    setSelectedFileIds(new Set());
    fetchFiles();
    fetchTree();
  };

  // Start polling OCR status for a file (no API trigger, just polling)
  const startOcrPolling = (fileId: string) => {
    setOcrPolling(prev => {
      // Already polling this file
      if (prev[fileId]) return prev;

      const interval = setInterval(async () => {
        try {
          const result = await api.get<{ ocrStatus: string }>(`/api/files/${fileId}/ocr`);
          if (result.ocrStatus === 'completed' || result.ocrStatus === 'failed') {
            clearInterval(interval);
            setOcrPolling(p => { const next = { ...p }; delete next[fileId]; return next; });
            fetchFiles();
          } else {
            setFiles(p => p.map(f => f.id === fileId ? { ...f, ocr_status: result.ocrStatus } : f));
          }
        } catch {
          clearInterval(interval);
          setOcrPolling(p => { const next = { ...p }; delete next[fileId]; return next; });
        }
      }, 2000);

      return { ...prev, [fileId]: interval };
    });
  };

  // OCR trigger + polling
  const triggerOcr = async (fileId: string) => {
    try {
      await api.post(`/api/files/${fileId}/ocr`);
      startOcrPolling(fileId);
    } catch {
      toast({ title: "Error", description: "Failed to trigger OCR", variant: "destructive" });
    }
  };

  // Bulk OCR
  const triggerBulkOcr = async () => {
    const ids = selectedOcrEligibleFileIds;
    if (ids.length === 0) return;
    for (const id of ids) {
      await triggerOcr(id);
    }
  };

  const canPreview = (mimeType: string) =>
    mimeType?.startsWith("image/") || mimeType === "application/pdf";

  const openPreview = (file: FileType, mode: "document" | "ocr" | "split" | "history" = "document") => {
    if (!canPreview(file.mime_type)) return;
    setPreviewFile(file);
    setPreviewMode(mode);
  };

  const loadPreviewOcr = useCallback(async (file: FileType) => {
    if (previewOcrLoading) return;
    if (previewOcrData && previewOcrFileId === file.id) return;
    setPreviewOcrLoading(true);
    setPreviewOcrError(null);
    try {
      const result = await api.get<{ ocrMarkdown: string; ocrProvider: string; ocrModel: string; ocrProcessedAt: string }>(`/api/files/${file.id}/ocr`);
      setPreviewOcrData({
        fileName: file.name,
        markdown: result.ocrMarkdown,
        provider: result.ocrProvider,
        model: result.ocrModel,
        processedAt: result.ocrProcessedAt,
      });
      setPreviewOcrFileId(file.id);
    } catch {
      setPreviewOcrError("Failed to load OCR content");
    } finally {
      setPreviewOcrLoading(false);
    }
  }, [previewOcrData, previewOcrFileId, previewOcrLoading]);

  useEffect(() => {
    if (!previewFile || previewMode === "document" || previewMode === "history" || previewFile.ocr_status !== "completed") return;
    loadPreviewOcr(previewFile);
  }, [loadPreviewOcr, previewFile, previewMode]);

  useEffect(() => {
    if (!previewFile || previewMode !== "history" || !companyId) return;
    let cancelled = false;
    setPreviewHistoryLoading(true);
    setPreviewHistoryError(null);
    void (async () => {
      try {
        const data = await api.get<{ events: FileHistoryApiEvent[] }>(
          `/api/companies/${companyId}/files/${previewFile.id}/history`,
        );
        if (!cancelled) {
          setPreviewHistoryEvents(data.events ?? []);
        }
      } catch {
        if (!cancelled) {
          setPreviewHistoryError(String(t("metadataDocuments.historyError")));
          setPreviewHistoryEvents([]);
        }
      } finally {
        if (!cancelled) setPreviewHistoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [previewFile, previewMode, companyId, t]);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  // Render tree node recursively
  const renderTreeNode = (
    node: TreeNode,
    depth: number,
    parentPath: Array<{ key: string; value: string }>
  ): React.ReactNode => {
    if (node.type === "file") return null; // Files shown in main area

    const isExpanded = expandedNodes.has(node.id);
    const currentKeyId = keyOrder[depth]?.id;
    // Uncategorized nodes add a "missing" filter for their key
    const currentPath = currentKeyId
      ? node.isUncategorized
        ? [...parentPath, { key: currentKeyId, value: node.name, missing: true }]
        : [...parentPath, { key: currentKeyId, value: node.name }]
      : parentPath;
    const isSelected =
      selectedNodePath.length > 0 &&
      selectedNodePath.length === currentPath.length &&
      selectedNodePath.every((p, i) => currentPath[i]?.key === p.key && currentPath[i]?.value === p.value);

    const hasChildFolders = node.children?.some((c) => c.type === "folder");

    const isMatch = treeSearch ? nodeDirectlyMatches(node, treeSearch) : false;
    const hasMatchingDescendant = treeSearch ? nodeMatchesSearch(node, treeSearch) : false;
    const isDimmed = treeSearch && !isMatch && !hasMatchingDescendant;

    return (
      <div key={node.id}>
        <button
          className={`w-full flex min-w-0 items-center gap-1.5 px-2 py-1.5 text-sm hover:bg-muted/60 rounded-md transition-colors ${
            isSelected ? "bg-primary/10 text-primary font-medium" : ""
          } ${isMatch ? "bg-yellow-500/10 font-medium" : ""} ${isDimmed ? "opacity-30" : ""}`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => {
            toggleNode(node.id);
            navigateToNode(currentPath);
          }}
        >
          {hasChildFolders ? (
            isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )
          ) : (
            <span className="w-3.5 shrink-0" />
          )}
          <FolderTree className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          {node.fileCount != null && (
            <Badge variant="secondary" className="shrink-0 px-1 py-0 text-[10px] h-4 tabular-nums">
              {node.fileCount}
            </Badge>
          )}
          <span className="min-w-0 flex-1 truncate text-left">
            {node.isUncategorized ? (
              <span className="italic text-muted-foreground">
                {hideKeyLabels
                  ? String(t("metadataDocuments.treeUncategorizedShort"))
                  : String(
                      t("metadataDocuments.treeUncategorized", {
                        keyName: node.keyName || String(t("metadataDocuments.treeValueFallback")),
                      })
                    )}
              </span>
            ) : (
              <>
                {!hideKeyLabels && node.keyName && (
                  <span className="text-muted-foreground">{node.keyName}: </span>
                )}
                {node.name}
              </>
            )}
          </span>
        </button>
        {isExpanded &&
          node.children
            ?.filter((c) => c.type === "folder")
            .map((child) => renderTreeNode(child, depth + 1, currentPath))}
      </div>
    );
  };

  const renderPreviewDocumentPane = (heightClass = "h-[70vh]") => {
    if (!previewFile) return null;
    if (!previewUrl) {
      return <div className="flex items-center justify-center h-[40vh] text-muted-foreground">Loading preview...</div>;
    }
    if (previewFile.mime_type?.startsWith("image/")) {
      return <img src={previewUrl} alt={previewFile.name} className="w-full h-auto" />;
    }
    if (previewFile.mime_type === "application/pdf") {
      return <iframe src={previewUrl} className={`w-full ${heightClass}`} title={previewFile.name} />;
    }
    return <div className="text-sm text-muted-foreground">Preview unavailable for this file type.</div>;
  };

  const renderPreviewHistoryPane = () => {
    if (!previewFile) return null;
    const locale = language === "fr" ? "fr-FR" : "en-US";
    const eventTitle = (eventType: string) => {
      const key = `metadataDocuments.historyEvent.${eventType}`;
      const label = t(key);
      if (typeof label === "string" && label !== key) return label;
      return eventType;
    };
    if (previewHistoryLoading) {
      return (
        <div className="flex items-center justify-center h-[70vh] text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          {String(t("metadataDocuments.historyLoading"))}
        </div>
      );
    }
    if (previewHistoryError) {
      return (
        <div className="flex items-center justify-center h-[70vh] text-destructive text-sm px-4 text-center">
          {previewHistoryError}
        </div>
      );
    }
    if (previewHistoryEvents.length === 0) {
      return (
        <div className="flex items-center justify-center h-[70vh] text-muted-foreground text-sm px-4 text-center">
          {String(t("metadataDocuments.historyEmpty"))}
        </div>
      );
    }
    return (
      <ScrollArea className="h-[70vh] pr-3">
        <div className="space-y-0 border rounded-md">
          {previewHistoryEvents.map((ev) => {
            const actorLabel = ev.actor
              ? (ev.actor.fullName?.trim() || ev.actor.email)
              : String(t("metadataDocuments.historyActorSystem"));
            const detailsRaw = ev.details;
            const hasDetails =
              detailsRaw !== null &&
              detailsRaw !== undefined &&
              typeof detailsRaw === "object" &&
              !Array.isArray(detailsRaw) &&
              Object.keys(detailsRaw as object).length > 0;
            return (
              <div key={ev.id} className="border-b last:border-b-0 px-4 py-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="font-medium">{eventTitle(ev.eventType)}</span>
                  <time className="text-xs text-muted-foreground tabular-nums shrink-0">
                    {new Date(ev.createdAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}
                  </time>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{actorLabel}</p>
                {hasDetails && (
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground select-none">
                      {String(t("metadataDocuments.historyDetails"))}
                    </summary>
                    <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted/50 p-2 text-[11px] leading-snug whitespace-pre-wrap break-all">
                      {JSON.stringify(detailsRaw, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    );
  };

  const renderPreviewOcrPane = () => {
    if (!previewFile) return null;

    if (previewFile.ocr_status !== "completed") {
      return (
        <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-muted-foreground">OCR is not available for this document yet.</p>
          {ocrEnabled && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => triggerOcr(previewFile.id)}
              disabled={previewFile.ocr_status === "pending" || previewFile.ocr_status === "processing"}
            >
              <ScanText className="h-3.5 w-3.5 mr-1.5" />
              {String(
                t(
                  previewFile.ocr_status === "completed"
                    ? "metadataDocuments.rerunOcr"
                    : "metadataDocuments.runOcr",
                ),
              )}
            </Button>
          )}
        </div>
      );
    }

    if (previewOcrLoading) {
      return <div className="flex items-center justify-center h-full min-h-[320px] text-muted-foreground">Loading OCR...</div>;
    }

    if (previewOcrError) {
      return <div className="flex items-center justify-center h-full min-h-[320px] text-destructive">{previewOcrError}</div>;
    }

    if (!previewOcrData) return null;

    return (
      <div className="h-full min-h-0 flex flex-col gap-3 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {previewOcrData.provider && (
            <Badge variant="secondary" className="text-xs">{previewOcrData.provider}{previewOcrData.model ? ` / ${previewOcrData.model}` : ''}</Badge>
          )}
          {previewOcrData.processedAt && (
            <span>Processed: {new Date(previewOcrData.processedAt).toLocaleString()}</span>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => {
              navigator.clipboard.writeText(previewOcrData.markdown);
              toast({ title: "Copied", description: "Raw Markdown copied to clipboard" });
            }}
          >
            <Copy className="h-3 w-3 mr-1" />
            Copy raw Markdown
          </Button>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="h-8 text-xs pl-7 pr-7"
              placeholder="Search in document..."
              value={ocrSearch}
              onChange={(e) => setOcrSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && ocrMatchCount > 0) {
                  setOcrActiveMatch((prev) => (e.shiftKey ? (prev - 1 + ocrMatchCount) % ocrMatchCount : (prev + 1) % ocrMatchCount));
                }
              }}
            />
            {ocrSearch && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setOcrSearch("")}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          {ocrSearch.trim() && (
            <div className="flex items-center gap-0.5 shrink-0">
              <span className="text-xs text-muted-foreground tabular-nums w-16 text-center">
                {ocrMatchCount === 0 ? "No results" : `${ocrActiveMatch + 1}/${ocrMatchCount}`}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={ocrMatchCount === 0}
                onClick={() => setOcrActiveMatch((prev) => (prev - 1 + ocrMatchCount) % ocrMatchCount)}
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                disabled={ocrMatchCount === 0}
                onClick={() => setOcrActiveMatch((prev) => (prev + 1) % ocrMatchCount)}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
        <ScrollArea className="flex-1 min-h-0" horizontal>
          <div ref={ocrContentRef} className="ocr-document text-sm text-foreground px-1">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkBreaks]}
              components={ocrSearchRegex ? createHighlightComponents(ocrSearchRegex, ocrActiveMatch) : undefined}
            >
              {previewOcrData.markdown}
            </ReactMarkdown>
          </div>
        </ScrollArea>
      </div>
    );
  };

  return (
    <div className="flex gap-3 h-full min-w-0 overflow-hidden">
      {/* Sidebar: Virtual Tree */}
      {isTreeOpen ? (
        <div className="w-72 shrink-0 border rounded-lg bg-card flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <span className="text-sm font-medium">Document Tree</span>
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={toggleExpandAll}
                title={isAllExpanded ? "Collapse all" : "Expand all"}
                disabled={tree.length === 0}
              >
                {isAllExpanded ? (
                  <ChevronsDownUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronsUpDown className="h-3.5 w-3.5" />
                )}
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={openTreeConfig} title="Configure tree view">
                <Settings className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsTreeOpen(false)} title="Hide tree panel">
                <PanelLeftClose className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          {/* Tree Search */}
          <div className="px-2 py-1.5 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="h-7 text-xs pl-7 pr-7"
                placeholder="Search tree..."
                value={treeSearch}
                onChange={(e) => setTreeSearch(e.target.value)}
              />
              {treeSearch && (
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setTreeSearch("")}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-1">
              <button
                className={`w-full flex min-w-0 items-center gap-1.5 px-2 py-1.5 text-sm hover:bg-muted/60 rounded-md transition-colors ${
                  selectedNodePath.length === 0 ? "bg-primary/10 text-primary font-medium" : ""
                }`}
                onClick={clearNavigation}
              >
                <FolderTree className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-left">All Documents</span>
                <Badge variant="secondary" className="shrink-0 text-[10px] px-1.5 py-0 h-4">
                  {totalFileCount}
                </Badge>
              </button>
              {tree.map((node) => renderTreeNode(node, 0, []))}
            </div>
          </ScrollArea>
        </div>
      ) : (
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0 self-start"
          onClick={() => setIsTreeOpen(true)}
          title="Show tree panel"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </Button>
      )}

      {/* Main Content */}
      <div className="flex-1 border rounded-lg bg-card flex flex-col min-w-0 overflow-hidden">
        {/* Header: breadcrumbs + actions */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b shrink-0">
          <div className="flex items-center gap-1 min-w-0 text-sm">
            {selectedNodePath.length > 0 ? (
              <>
                <button onClick={clearNavigation} className="text-muted-foreground hover:text-foreground shrink-0">
                  All
                </button>
                {selectedNodePath.map((p, i) => {
                  const keyName = metadataKeys.find((k) => k.id === p.key)?.name || p.key;
                  return (
                    <span key={i} className="flex items-center gap-1 shrink-0">
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      {p.missing ? (
                        <span className="font-medium italic text-muted-foreground">No {keyName}</span>
                      ) : (
                        <>
                          <span className="text-muted-foreground">{keyName}:</span>
                          <span className="font-medium">{p.value}</span>
                        </>
                      )}
                    </span>
                  );
                })}
              </>
            ) : filters.length > 0 ? (
              <span className="text-muted-foreground">
                {files.length} result{files.length !== 1 ? "s" : ""} matching filters
              </span>
            ) : (
              <span className="text-muted-foreground">{files.length} document{files.length !== 1 ? "s" : ""}</span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canWriteFiles && selectedFileIds.size > 0 && (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                    >
                      <Tag className="h-3 w-3 mr-1" />
                      Metadata {selectedFileIds.size}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-[220px]">
                    <DropdownMenuItem
                      onClick={() => {
                        setBulkEntries([{ key: "", value: "" }]);
                        setIsBulkMetadataOpen(true);
                      }}
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      {String(t("metadataDocuments.bulkManualMetadataAction"))}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!geminiConfigured}
                      onClick={openBulkExtractMetadataDialog}
                    >
                      <FileSearch className="h-4 w-4 mr-2" />
                      {String(t("metadataDocuments.bulkAiExtractAction"))}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                {ocrEnabled && selectedOcrEligibleCount > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={triggerBulkOcr}
                  >
                    <ScanText className="h-3 w-3 mr-1" />
                    Run OCR ({selectedOcrEligibleCount})
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="destructive"
                  className="h-7 text-xs"
                  onClick={() => setBulkDeleteOpen(true)}
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  {String(t("metadataDocuments.deleteSelected"))} ({selectedFileIds.size})
                </Button>
              </>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => setFilterRows([...filterRows, { key_id: "", values: [] }])}
            >
              <Filter className="h-3 w-3 mr-1" />
              Add Filter
            </Button>
            {canWriteFiles && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                disabled={splitPdfToolbar.disabled}
                title={splitPdfToolbar.title}
                onClick={() => navigate("/documents/split-pdf")}
              >
                <Scissors className="h-3 w-3 mr-1" />
                {String(t("splitPdf.title"))}
              </Button>
            )}
            {canWriteFiles && (
              <Button size="sm" className="h-7 text-xs" onClick={() => setIsUploadOpen(true)}>
                <Upload className="h-3 w-3 mr-1" />
                Upload
              </Button>
            )}
          </div>
        </div>

        {/* Filter row inputs */}
        {filterRows.length > 0 && (
          <div className="px-3 py-2 border-b space-y-2 shrink-0">
            <div className="flex flex-wrap gap-2">
              {filterRows.map((row, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  {(() => {
                    const rowMetaKey = metadataKeys.find((k) => k.id === row.key_id);
                    const isFreeText = rowMetaKey?.value_kind === "free_text";
                    return (
                      <>
                  <Select
                    value={row.key_id}
                    onValueChange={(v) => {
                      const next = [...filterRows];
                      next[i] = { ...next[i], key_id: v, values: [] };
                      setFilterRows(next);
                      applyFilterRows(next);
                    }}
                  >
                    <SelectTrigger className="h-7 w-[140px] text-xs">
                      <SelectValue placeholder="Select key" />
                    </SelectTrigger>
                    <SelectContent>
                      {metadataKeys.map((k) => (
                        <SelectItem key={k.id} value={k.id}>
                          {k.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                        {isFreeText ? (
                          <MetadataFreeTextFilterCombobox
                            companyId={companyId}
                            metadataKeyId={row.key_id}
                            selectedValues={row.values}
                            onChange={(values) => {
                              const next = [...filterRows];
                              next[i] = { ...next[i], values };
                              setFilterRows(next);
                              applyFilterRows(next);
                            }}
                            triggerClassName="h-7 w-[140px] text-xs min-w-[140px]"
                            placeholder={String(t("metadataDocuments.filterValuePlaceholder"))}
                            searchPlaceholder={String(t("metadataDocuments.filterSearchValuesPlaceholder"))}
                            emptyLabel={String(t("metadataDocuments.filterNoValuesFound"))}
                            loadingLabel={String(t("metadataDocuments.filterValuesLoading"))}
                            clearLabel={String(t("metadataDocuments.filterClearSelection"))}
                          />
                        ) : (
                          <MetadataValueControl
                            className="h-7 w-[140px] text-xs min-w-[140px]"
                            metaKey={rowMetaKey}
                            value={row.values[0] ?? ""}
                            onChange={(v) => {
                              const next = [...filterRows];
                              next[i] = { ...next[i], values: v ? [v] : [] };
                              setFilterRows(next);
                              applyFilterRows(next);
                            }}
                            placeholder={String(t("metadataDocuments.filterValuePlaceholder"))}
                          />
                        )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => {
                      const next = filterRows.filter((_, j) => j !== i);
                      setFilterRows(next);
                      applyFilterRows(next);
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                      </>
                    );
                  })()}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search bar */}
        <div className="px-3 py-2 border-b shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search document content..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
            {searchQuery && (
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setSearchQuery("")}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* File list */}
        <div className="flex-1 overflow-auto [&_>div]:overflow-visible">
          <TooltipProvider delayDuration={200}>
          <Table className="w-full min-w-0 table-fixed">
            <TableHeader>
              <TableRow>
                {canWriteFiles && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={files.length > 0 && selectedFileIds.size === files.length}
                      onCheckedChange={handleToggleSelectAll}
                    />
                  </TableHead>
                )}
                <TableHead className="min-w-0 w-[45%]">Name</TableHead>
                <TableHead className="w-24 whitespace-nowrap">OCR</TableHead>
                <TableHead className="w-24 whitespace-nowrap">Size</TableHead>
                <TableHead className="w-28 whitespace-nowrap">Created</TableHead>
                <TableHead className="w-28 whitespace-nowrap text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.map((file) => {
                const fileWritable = canManage || file.accessLevel === 'write';
                const previewable = canPreview(file.mime_type);
                const metadataEntries = getFileMetadataDisplayEntries(file);
                return (
                <TableRow
                  key={file.id}
                  className={previewable ? "cursor-pointer" : undefined}
                  onClick={() => {
                    if (previewable) {
                      openPreview(file);
                    }
                  }}
                >
                  {canWriteFiles && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedFileIds.has(file.id)}
                        onCheckedChange={() => handleToggleSelect(file.id)}
                        disabled={!fileWritable}
                      />
                    </TableCell>
                  )}
                  <TableCell className="min-w-0 font-medium">
                    <div className="flex w-full min-w-0 max-w-full flex-col gap-0.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 truncate">{file.name}</span>
                      </div>
                      <div className="flex w-full min-w-0 items-center gap-1.5">
                        {metadataEntries.length > 0 ? (
                          <div className="min-w-0 w-0 flex-1 basis-0">
                            <FileRowMetadataBadges
                              key={file.id}
                              fileId={file.id}
                              entries={metadataEntries}
                              metadataTagColors={metadataTagColors}
                            />
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">No metadata</span>
                        )}
                        {fileWritable && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              openMetadataDialog(file);
                            }}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                      {searchActive && file.ocrSnippet && (
                        <div className="flex items-center gap-1 ml-6">
                          <FileSearch className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="text-xs text-muted-foreground">Matched in OCR content</span>
                        </div>
                      )}
                      {searchActive && file.ocrSnippet && (
                        <div
                          className="ml-6 text-xs text-muted-foreground line-clamp-2 [&_mark]:bg-yellow-200 [&_mark]:text-yellow-900 [&_mark]:px-0.5 [&_mark]:rounded-sm"
                          dangerouslySetInnerHTML={{ __html: file.ocrSnippet }}
                        />
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <OcrStatusBadge file={file} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatFileSize(file.size_bytes)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(file.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-0.5 justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title={String(t("common.moreActions"))}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="min-w-[200px]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(file);
                            }}
                          >
                            <Download className="h-4 w-4 mr-2" />
                            {String(t("metadataDocuments.download"))}
                          </DropdownMenuItem>

                          {fileWritable && (
                            <DropdownMenuItem
                              onClick={(e) => {
                                e.stopPropagation();
                                openRenameDialog(file);
                              }}
                            >
                              <Edit className="h-4 w-4 mr-2" />
                              {String(t("metadataDocuments.rename"))}
                            </DropdownMenuItem>
                          )}

                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            disabled={
                              !ocrEnabled
                              || file.ocr_status === "pending"
                              || file.ocr_status === "processing"
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              triggerOcr(file.id);
                            }}
                          >
                            <ScanText className="h-4 w-4 mr-2" />
                            {String(
                              t(
                                file.ocr_status === "completed"
                                  ? "metadataDocuments.rerunOcr"
                                  : "metadataDocuments.runOcr",
                              ),
                            )}
                          </DropdownMenuItem>

                          <DropdownMenuSeparator />

                          <DropdownMenuItem
                            disabled={file.ocr_status !== "completed" || !geminiConfigured}
                            onClick={(e) => {
                              e.stopPropagation();
                              openExtractMetadataDialog(file);
                            }}
                          >
                            <Tag className="h-4 w-4 mr-2" />
                            {String(t("metadataDocuments.extractMetadata"))}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>

                      {fileWritable && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title={String(t("data.delete"))}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(file.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
                );
              })}
              {files.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={canWriteFiles ? 7 : 6} className="text-center text-muted-foreground py-12">
                    {filters.length > 0 ? "No files match the current filters" : "No documents yet. Upload your first file."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </TooltipProvider>
        </div>
      </div>

      {/* ─── Dialogs ─── */}

      {/* Extract metadata from OCR */}
      <Dialog
        open={extractDialogOpen}
        onOpenChange={(open) => {
          setExtractDialogOpen(open);
          if (!open) {
            setExtractTargetFile(null);
            setExtractSelectedKeyIds([]);
            setExtractRenameInstructions("");
            setExtractSubmitting(false);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{String(t("metadataDocuments.extractMetadataDialogTitle"))}</DialogTitle>
            <DialogDescription>
              {extractTargetFile
                ? String(t("metadataDocuments.extractMetadataDialogDescription", { name: extractTargetFile.name }))
                : String(t("metadataDocuments.extractMetadataDialogDescriptionNoFile"))}
            </DialogDescription>
          </DialogHeader>

          {!geminiConfigured && (
            <p className="text-xs text-muted-foreground">{String(t("splitPdf.missingGemini"))}</p>
          )}

          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">
              {String(t("splitPdf.metadataKeysLabel"))}
            </Label>
            {metadataKeys.length === 0 ? (
              <p className="text-xs text-muted-foreground">{String(t("splitPdf.metadataKeysEmpty"))}</p>
            ) : (
              <ScrollArea className="h-[min(240px,35vh)] rounded-lg border bg-muted/20">
                <div className="p-2 space-y-1">
                  {metadataKeys.map((k) => {
                    const label = (k.name && k.name.trim()) || String(t("splitPdf.metadataKeyUnnamed"));
                    const predefined =
                      k.value_kind === "predefined_list" && Array.isArray(k.allowed_values)
                        ? (k.allowed_values as unknown[]).filter((x): x is string => typeof x === "string")
                        : [];
                    return (
                      <label
                        key={k.id}
                        className="flex cursor-pointer items-start gap-2 rounded-md p-1.5 hover:bg-muted/40"
                      >
                        <Checkbox
                          checked={extractSelectedKeyIds.includes(k.id)}
                          onCheckedChange={(c) => toggleExtractKeyForFile(k.id, c === true)}
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
              </ScrollArea>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="extract-rename-instructions" className="text-xs font-medium text-muted-foreground">
              {String(t("metadataDocuments.extractMetadataRenameInstructionsLabel"))}
            </Label>
            <Textarea
              id="extract-rename-instructions"
              value={extractRenameInstructions}
              onChange={(event) => setExtractRenameInstructions(event.target.value)}
              placeholder={String(t("metadataDocuments.extractMetadataRenameInstructionsPlaceholder"))}
              className="min-h-[96px]"
            />
            <p className="text-xs text-muted-foreground">
              {String(t("metadataDocuments.extractMetadataRenameInstructionsHelp"))}
            </p>
          </div>

          <div className="flex gap-2 pt-2 border-t">
            <Button variant="outline" className="flex-1" onClick={() => setExtractDialogOpen(false)}>
              {String(t("common.cancel"))}
            </Button>
            <Button
              className="flex-1"
              disabled={extractSubmitting || extractSelectedKeyIds.length === 0 || !geminiConfigured}
              onClick={() => void submitExtractMetadata()}
            >
              {extractSubmitting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Tag className="h-4 w-4 mr-2" />
              )}
              {String(t("metadataDocuments.extractMetadataButton"))}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Tree Config */}
      <Dialog open={isTreeConfigOpen} onOpenChange={setIsTreeConfigOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Configure Tree View</DialogTitle>
            <DialogDescription>Choose and order metadata keys to create your virtual folder hierarchy.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Active keys (drag to reorder)</Label>
              <div className="mt-2 space-y-1">
                {configKeyOrder.map((keyId, index) => {
                  const key = metadataKeys.find((k) => k.id === keyId);
                  return (
                    <div key={keyId} className="flex items-center gap-2 px-3 py-2 rounded-md border bg-card">
                      <GripVertical className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1 text-sm">{key?.name || keyId}</span>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveKeyUp(index)} disabled={index === 0}>
                          <ChevronRight className="h-3 w-3 -rotate-90" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveKeyDown(index)} disabled={index >= configKeyOrder.length - 1}>
                          <ChevronRight className="h-3 w-3 rotate-90" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => toggleKeyInConfig(keyId)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
                {configKeyOrder.length === 0 && (
                  <p className="text-sm text-muted-foreground py-3 text-center">No keys selected. Files will be shown flat.</p>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2.5">
              <div className="min-w-0 space-y-0.5">
                <Label htmlFor="tree-hide-key-labels" className="text-sm font-medium leading-none cursor-pointer">
                  {String(t("metadataDocuments.treeHideKeyLabels"))}
                </Label>
                <p className="text-xs text-muted-foreground">{String(t("metadataDocuments.treeHideKeyLabelsHint"))}</p>
              </div>
              <Switch
                id="tree-hide-key-labels"
                checked={configHideKeyLabels}
                onCheckedChange={setConfigHideKeyLabels}
              />
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Available keys</Label>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {metadataKeys
                  .filter((k) => !configKeyOrder.includes(k.id))
                  .map((key) => (
                    <Button key={key.id} variant="outline" size="sm" className="h-7 text-xs" onClick={() => toggleKeyInConfig(key.id)}>
                      + {key.name}
                    </Button>
                  ))}
                {metadataKeys.filter((k) => !configKeyOrder.includes(k.id)).length === 0 && (
                  <p className="text-xs text-muted-foreground">All keys are in use.</p>
                )}
              </div>
            </div>
            <Button onClick={saveTreeConfig} className="w-full">Save Configuration</Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{String(t("metadataDocuments.deleteSelectedTitle"))}</AlertDialogTitle>
            <AlertDialogDescription>
              {String(t("metadataDocuments.deleteSelectedDescription", { count: String(selectedFileIds.size) }))}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{String(t("data.cancel"))}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void confirmDeleteSelected()}
            >
              {String(t("data.delete"))}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Upload */}
      <Dialog open={isUploadOpen} onOpenChange={(open) => {
        setIsUploadOpen(open);
        if (!open) {
          setUploadDialogJobId((prev) => {
            if (prev) setJobBackground(prev);
            return null;
          });
          setUploadFiles([]);
          setUploadMetadata([]);
          setIsDragOver(false);
          setOcrAfterUpload(false);
          setExtractMetadataAfterOcr(false);
          setSelectedExtractMetadataKeyIds([]);
        }
      }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{String(t("metadataDocuments.uploadTitle"))}</DialogTitle>
            <DialogDescription>{String(t("metadataDocuments.uploadDescription"))}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 min-w-0">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) addFilesToUpload(e.target.files);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
            />

            <div
              className={`
                  relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed
                  px-4 py-6 transition-all duration-200
                  ${isImportBusy ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  ${isDragOver
                    ? "border-primary bg-primary/5 scale-[1.01]"
                    : "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/30"
                  }
                `}
              onClick={() => !isImportBusy && fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragOver(false);
                if (e.dataTransfer.files?.length) addFilesToUpload(e.dataTransfer.files);
              }}
            >
              <div className={`rounded-full p-3 transition-colors duration-200 ${isDragOver ? "bg-primary/10" : "bg-muted"}`}>
                <CloudUpload className={`h-6 w-6 transition-colors duration-200 ${isDragOver ? "text-primary" : "text-muted-foreground"}`} />
              </div>
              <div className="text-center px-2">
                <p className="text-sm font-medium">
                  {isDragOver ? String(t("metadataDocuments.uploadDropActive")) : String(t("metadataDocuments.uploadDropHint"))}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {String(t("metadataDocuments.uploadMaxFilesHint", { max: String(MAX_UPLOAD_FILES) }))}
                </p>
              </div>
            </div>

            {uploadFiles.length > 0 && (
              <div className="space-y-2 rounded-lg border bg-muted/30 p-2 max-h-[min(220px,40vh)] overflow-y-auto">
                {uploadFiles.map((f, idx) => (
                  <div key={`${f.name}-${f.size}-${idx}`} className="flex items-center gap-2 rounded-md bg-background/80 px-2 py-1.5">
                    <FileIcon className="h-4 w-4 shrink-0 text-primary" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{f.name}</p>
                      <p className="text-xs text-muted-foreground">{formatFileSize(f.size)}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setUploadFiles((prev) => prev.filter((_, i) => i !== idx));
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Metadata */}
            <div>
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Metadata (optional)</Label>
              <div className="mt-2 space-y-2">
                {uploadMetadata.map((entry, i) => (
                  <div key={i} className="flex gap-2">
                    <Select value={entry.key_id} onValueChange={(v) => {
                      const next = [...uploadMetadata];
                      next[i].key_id = v;
                      setUploadMetadata(next);
                    }}>
                      <SelectTrigger className="h-8 flex-1"><SelectValue placeholder="Key" /></SelectTrigger>
                      <SelectContent>
                        {metadataKeys.map((k) => <SelectItem key={k.id} value={k.id}>{k.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <MetadataValueControl
                      className="h-8 flex-1"
                      metaKey={metadataKeys.find((k) => k.id === entry.key_id)}
                      value={entry.value}
                      onChange={(v) => {
                        const next = [...uploadMetadata];
                        next[i].value = v;
                        setUploadMetadata(next);
                      }}
                      placeholder="Value"
                    />
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setUploadMetadata(uploadMetadata.filter((_, j) => j !== i))}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setUploadMetadata([...uploadMetadata, { key_id: "", value: "" }])}>
                  <Tag className="h-3 w-3 mr-1.5" />
                  Add metadata
                </Button>
              </div>
            </div>

            {ocrEnabled && (
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="ocr-upload"
                    disabled={isImportBusy}
                    checked={ocrAfterUpload}
                    onCheckedChange={(checked) => {
                      const on = !!checked;
                      setOcrAfterUpload(on);
                      if (!on) {
                        setExtractMetadataAfterOcr(false);
                        setSelectedExtractMetadataKeyIds([]);
                        setExtractRenameInstructionsAfterUpload("");
                      }
                    }}
                  />
                  <Label htmlFor="ocr-upload" className="text-sm">{String(t("metadataDocuments.uploadRunOcr"))}</Label>
                </div>

                {ocrAfterUpload && !geminiConfigured && (
                  <p className="text-xs text-muted-foreground">{String(t("splitPdf.missingGemini"))}</p>
                )}

                {ocrAfterUpload && geminiConfigured && (
                  <div className="space-y-2 pl-1 border-l-2 border-muted ml-1">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="ocr-extract-metadata"
                        disabled={isImportBusy}
                        checked={extractMetadataAfterOcr}
                        onCheckedChange={(checked) => {
                          const enabled = !!checked;
                          setExtractMetadataAfterOcr(enabled);
                          if (!enabled) {
                            setExtractRenameInstructionsAfterUpload("");
                          }
                        }}
                      />
                      <Label htmlFor="ocr-extract-metadata" className="text-sm">{String(t("metadataDocuments.uploadExtractMetadataAi"))}</Label>
                    </div>
                    <p className="text-xs text-muted-foreground pl-6">{String(t("metadataDocuments.uploadExtractMetadataHint"))}</p>

                    {extractMetadataAfterOcr && (
                      <div className="pl-6 space-y-2">
                        <Label className="text-xs font-medium text-muted-foreground">{String(t("splitPdf.metadataKeysLabel"))}</Label>
                        {metadataKeys.length === 0 ? (
                          <p className="text-xs text-muted-foreground">{String(t("splitPdf.metadataKeysEmpty"))}</p>
                        ) : (
                          <div className="space-y-1 rounded-lg border bg-muted/20 p-2 max-h-[min(200px,30vh)] overflow-y-auto">
                            {metadataKeys.map((k) => {
                              const label = (k.name && k.name.trim()) || String(t("splitPdf.metadataKeyUnnamed"));
                              const predefined =
                                k.value_kind === "predefined_list" && Array.isArray(k.allowed_values)
                                  ? (k.allowed_values as unknown[]).filter((x): x is string => typeof x === "string")
                                  : [];
                              return (
                                <label
                                  key={k.id}
                                  className="flex cursor-pointer items-start gap-2 rounded-md p-1.5 hover:bg-muted/40"
                                >
                                  <Checkbox
                                    checked={selectedExtractMetadataKeyIds.includes(k.id)}
                                    onCheckedChange={(c) => toggleExtractMetadataKey(k.id, c === true)}
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

                        <div className="space-y-2 pt-1">
                          <Label htmlFor="upload-extract-rename-instructions" className="text-xs font-medium text-muted-foreground">
                            {String(t("metadataDocuments.extractMetadataRenameInstructionsLabel"))}
                          </Label>
                          <Textarea
                            id="upload-extract-rename-instructions"
                            value={extractRenameInstructionsAfterUpload}
                            onChange={(event) => setExtractRenameInstructionsAfterUpload(event.target.value)}
                            placeholder={String(t("metadataDocuments.extractMetadataRenameInstructionsPlaceholder"))}
                            className="min-h-[88px]"
                          />
                          <p className="text-xs text-muted-foreground">
                            {String(t("metadataDocuments.extractMetadataRenameInstructionsHelp"))}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeUploadJob && isImportBusy && (
              <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                <Progress value={activeUploadJob.totalPercent} />
                <p className="text-xs text-muted-foreground">
                  {String(t(activeUploadJob.stepLabelKey as "metadataDocuments.importStepUploading"))}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    if (uploadDialogJobId) setJobBackground(uploadDialogJobId);
                    setUploadDialogJobId(null);
                    setIsUploadOpen(false);
                  }}
                >
                  {String(t("metadataDocuments.importContinueBackground"))}
                </Button>
              </div>
            )}

            {activeUploadJob?.phase === "error" && (
              <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-xs text-destructive">{activeUploadJob.error}</p>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  onClick={() => {
                    if (uploadDialogJobId) dismissJob(uploadDialogJobId);
                    setUploadDialogJobId(null);
                  }}
                >
                  {String(t("common.close"))}
                </Button>
              </div>
            )}

            {(!activeUploadJob || activeUploadJob.phase === "error") && (
              <Button
                onClick={() => handleUpload()}
                disabled={
                  uploadFiles.length === 0
                  || isImportBusy
                  || (ocrAfterUpload && extractMetadataAfterOcr && geminiConfigured && selectedExtractMetadataKeyIds.length === 0)
                }
                className="w-full"
              >
                <Upload className="h-4 w-4 mr-2" />
                {String(t("metadataDocuments.uploadButton"))}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Rename file */}
      <Dialog
        open={renameDialogOpen}
        onOpenChange={(open) => {
          setRenameDialogOpen(open);
          if (!open) {
            setRenameTargetFile(null);
            setRenameBaseName("");
            setRenameSubmitting(false);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{String(t("metadataDocuments.renameDialogTitle"))}</DialogTitle>
            <DialogDescription>
              {renameTargetFile
                ? String(t("metadataDocuments.renameDialogDescription", { name: renameTargetFile.name }))
                : String(t("metadataDocuments.renameDialogDescriptionNoFile"))}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="rename-file-base">{String(t("metadataDocuments.renameFieldLabel"))}</Label>
            <div className="flex items-center gap-2">
              <Input
                id="rename-file-base"
                value={renameBaseName}
                onChange={(e) => setRenameBaseName(e.target.value)}
                placeholder={String(t("metadataDocuments.renameFieldPlaceholder"))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleRenameFile();
                  }
                }}
                autoFocus
              />
              {renameTargetFile && (
                <span className="shrink-0 text-sm text-muted-foreground">
                  {splitFileName(renameTargetFile.name).extension || String(t("metadataDocuments.renameNoExtension"))}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{String(t("metadataDocuments.renameHelp"))}</p>
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setRenameDialogOpen(false)}
              disabled={renameSubmitting}
            >
              {String(t("common.cancel"))}
            </Button>
            <Button className="flex-1" onClick={handleRenameFile} disabled={renameSubmitting}>
              {renameSubmitting ? String(t("common.loading")) : String(t("metadataDocuments.renameSubmit"))}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Metadata Editor */}
      <Dialog open={isMetadataDialogOpen} onOpenChange={setIsMetadataDialogOpen}>
        <DialogContent className="max-w-lg [overflow:clip]">
          <DialogHeader>
            <DialogTitle>Edit Metadata</DialogTitle>
            <DialogDescription>Manage metadata for {editingFile?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[50vh] overflow-auto p-1 -m-1">
            {metadataEntries.map((entry, i) => (
              <div key={i} className="flex gap-2 min-w-0">
                <Select value={entry.key} onValueChange={(v) => {
                  const next = [...metadataEntries];
                  next[i].key = v;
                  setMetadataEntries(next);
                }}>
                  <SelectTrigger className="h-9 flex-1 min-w-0 focus:ring-offset-0"><SelectValue placeholder="Key" /></SelectTrigger>
                  <SelectContent>
                    {metadataKeys.map((k) => <SelectItem key={k.id} value={k.name}>{k.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <MetadataValueControl
                  className="h-9 flex-1 min-w-0 focus:ring-offset-0 focus-visible:ring-offset-0"
                  metaKey={metadataKeys.find((k) => k.name === entry.key)}
                  value={entry.value}
                  onChange={(v) => {
                    const next = [...metadataEntries];
                    next[i].value = v;
                    setMetadataEntries(next);
                  }}
                  placeholder="Value"
                />
                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => setMetadataEntries(metadataEntries.filter((_, j) => j !== i))}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-2 border-t">
            <Button variant="outline" className="flex-1" onClick={() => setMetadataEntries([...metadataEntries, { key: "", value: "" }])}>
              Add Entry
            </Button>
            <Button className="flex-1" onClick={saveMetadata}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Metadata */}
      <Dialog open={isBulkMetadataOpen} onOpenChange={setIsBulkMetadataOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Bulk Assign Metadata</DialogTitle>
            <DialogDescription>
              Apply metadata updates to {selectedFileIds.size} selected files. Any metadata keys not listed below will remain unchanged.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              {bulkEntries.map((entry, i) => (
                <div key={i} className="flex gap-2">
                  <Select value={entry.key} onValueChange={(v) => {
                    const next = [...bulkEntries];
                    next[i].key = v;
                    setBulkEntries(next);
                  }}>
                    <SelectTrigger className="h-9 flex-1"><SelectValue placeholder="Key" /></SelectTrigger>
                    <SelectContent>
                      {metadataKeys.map((k) => <SelectItem key={k.id} value={k.name}>{k.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <MetadataValueControl
                    className="h-9 flex-1"
                    metaKey={metadataKeys.find((k) => k.name === entry.key)}
                    value={entry.value}
                    onChange={(v) => {
                      const next = [...bulkEntries];
                      next[i].value = v;
                      setBulkEntries(next);
                    }}
                    placeholder="Value"
                  />
                  <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setBulkEntries(bulkEntries.filter((_, j) => j !== i))}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setBulkEntries([...bulkEntries, { key: "", value: "" }])}>
                + Add entry
              </Button>
            </div>
            <Button onClick={handleBulkMetadata} className="w-full" disabled={bulkEntries.filter((e) => e.key.trim()).length === 0}>
              Apply to {selectedFileIds.size} files
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Extract Metadata from OCR */}
      <Dialog
        open={isBulkExtractDialogOpen}
        onOpenChange={(open) => {
          setIsBulkExtractDialogOpen(open);
          if (!open) {
            setBulkExtractSubmitting(false);
            setBulkExtractSelectedKeyIds([]);
            setBulkExtractRenameInstructions("");
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{String(t("metadataDocuments.bulkExtractDialogTitle"))}</DialogTitle>
            <DialogDescription>
              {String(
                t("metadataDocuments.bulkExtractDialogDescription", {
                  selected: String(selectedFileIds.size),
                  eligible: String(selectedAiExtractEligibleCount),
                }),
              )}
            </DialogDescription>
          </DialogHeader>

          {!geminiConfigured && (
            <p className="text-xs text-muted-foreground">{String(t("splitPdf.missingGemini"))}</p>
          )}

          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">
              {String(t("splitPdf.metadataKeysLabel"))}
            </Label>
            {metadataKeys.length === 0 ? (
              <p className="text-xs text-muted-foreground">{String(t("splitPdf.metadataKeysEmpty"))}</p>
            ) : (
              <ScrollArea className="h-[min(240px,35vh)] rounded-lg border bg-muted/20">
                <div className="p-2 space-y-1">
                  {metadataKeys.map((k) => {
                    const label = (k.name && k.name.trim()) || String(t("splitPdf.metadataKeyUnnamed"));
                    const predefined =
                      k.value_kind === "predefined_list" && Array.isArray(k.allowed_values)
                        ? (k.allowed_values as unknown[]).filter((x): x is string => typeof x === "string")
                        : [];
                    return (
                      <label
                        key={k.id}
                        className="flex cursor-pointer items-start gap-2 rounded-md p-1.5 hover:bg-muted/40"
                      >
                        <Checkbox
                          checked={bulkExtractSelectedKeyIds.includes(k.id)}
                          onCheckedChange={(checked) => toggleBulkExtractKey(k.id, checked === true)}
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
              </ScrollArea>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="bulk-extract-rename-instructions" className="text-xs font-medium text-muted-foreground">
              {String(t("metadataDocuments.extractMetadataRenameInstructionsLabel"))}
            </Label>
            <Textarea
              id="bulk-extract-rename-instructions"
              value={bulkExtractRenameInstructions}
              onChange={(event) => setBulkExtractRenameInstructions(event.target.value)}
              placeholder={String(t("metadataDocuments.extractMetadataRenameInstructionsPlaceholder"))}
              className="min-h-[96px]"
            />
            <p className="text-xs text-muted-foreground">
              {String(t("metadataDocuments.extractMetadataRenameInstructionsHelp"))}
            </p>
          </div>

          <div className="flex gap-2 pt-2 border-t">
            <Button variant="outline" className="flex-1" onClick={() => setIsBulkExtractDialogOpen(false)}>
              {String(t("common.cancel"))}
            </Button>
            <Button
              className="flex-1"
              disabled={
                bulkExtractSubmitting
                || bulkExtractSelectedKeyIds.length === 0
                || !geminiConfigured
                || selectedAiExtractEligibleCount === 0
              }
              onClick={() => void handleBulkExtractMetadata()}
            >
              {bulkExtractSubmitting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Tag className="h-4 w-4 mr-2" />
              )}
              {String(t("metadataDocuments.bulkAiExtractSubmit"))}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview */}
      <Dialog
        open={!!previewFile}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewFile(null);
            setPreviewMode("document");
            setPreviewHistoryEvents([]);
            setPreviewHistoryError(null);
            setPreviewHistoryLoading(false);
          }
        }}
      >
        <DialogContent className="max-w-6xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-3">
              <span className="truncate">{previewFile?.name}</span>
              <div className="flex flex-wrap items-center justify-end gap-1">
                <Button
                  size="sm"
                  variant={previewMode === "document" ? "default" : "outline"}
                  className="h-7 text-xs"
                  onClick={() => setPreviewMode("document")}
                >
                  {String(t("metadataDocuments.viewerModeDocument"))}
                </Button>
                <Button
                  size="sm"
                  variant={previewMode === "ocr" ? "default" : "outline"}
                  className="h-7 text-xs"
                  onClick={() => setPreviewMode("ocr")}
                >
                  {String(t("metadataDocuments.viewerModeOcr"))}
                </Button>
                <Button
                  size="sm"
                  variant={previewMode === "split" ? "default" : "outline"}
                  className="h-7 text-xs"
                  onClick={() => setPreviewMode("split")}
                >
                  {String(t("metadataDocuments.viewerModeSplit"))}
                </Button>
                <Button
                  size="sm"
                  variant={previewMode === "history" ? "default" : "outline"}
                  className="h-7 text-xs"
                  onClick={() => setPreviewMode("history")}
                >
                  <History className="h-3 w-3 sm:mr-1" />
                  <span className="hidden sm:inline">{String(t("metadataDocuments.viewerModeHistory"))}</span>
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-hidden">
            {previewMode === "document" && (
              <div className="overflow-auto max-h-[70vh]">
                {renderPreviewDocumentPane()}
              </div>
            )}
            {previewMode === "ocr" && (
              <div className="h-[70vh] overflow-hidden">
                {renderPreviewOcrPane()}
              </div>
            )}
            {previewMode === "split" && (
              <div className="h-[70vh] grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div className="border rounded-md overflow-auto">
                  {renderPreviewDocumentPane("h-[68vh]")}
                </div>
                <div className="border rounded-md p-3 overflow-hidden">
                  {renderPreviewOcrPane()}
                </div>
              </div>
            )}
            {previewMode === "history" && (
              <div className="max-h-[70vh] overflow-hidden">
                {renderPreviewHistoryPane()}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
