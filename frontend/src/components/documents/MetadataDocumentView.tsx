import React, { useState, useEffect, useCallback, useRef, useMemo, Children } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { useNavigate } from "react-router-dom";
import { MetadataValueControl } from "@/components/documents/MetadataValueControl";
import { Progress } from "@/components/ui/progress";
import { useDocumentImportJobs } from "@/contexts/DocumentImportJobsContext";

const MAX_UPLOAD_FILES = 25;

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
  ragie_document_id?: string | null;
  ragie_partition?: string | null;
  ragie_uploaded_at?: string | null;
  ragie_status?: string | null;
  ragie_metadata?: Record<string, unknown> | null;
}

interface OcrViewerData {
  fileName: string;
  markdown: string;
  provider?: string;
  model?: string;
  processedAt?: string;
}

interface MetadataKey {
  id: string;
  name: string;
  value_kind: "free_text" | "predefined_list";
  allowed_values?: unknown;
}

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
  const [isBulkMetadataOpen, setIsBulkMetadataOpen] = useState(false);
  const [bulkEntries, setBulkEntries] = useState<Array<{ key: string; value: string }>>([]);
  const [bulkMode, setBulkMode] = useState<"merge" | "replace">("merge");
  const [previewFile, setPreviewFile] = useState<FileType | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<"document" | "ocr" | "split">("document");
  const [previewOcrData, setPreviewOcrData] = useState<OcrViewerData | null>(null);
  const [previewOcrFileId, setPreviewOcrFileId] = useState<string | null>(null);
  const [previewOcrLoading, setPreviewOcrLoading] = useState(false);
  const [previewOcrError, setPreviewOcrError] = useState<string | null>(null);
  const [filterRows, setFilterRows] = useState<Array<{ key_id: string; value: string }>>([]);
  const [treeSearch, setTreeSearch] = useState("");
  // OCR state
  const [ocrPolling, setOcrPolling] = useState<Record<string, NodeJS.Timeout>>({});
  const [ocrAfterUpload, setOcrAfterUpload] = useState(false);
  const [extractMetadataAfterOcr, setExtractMetadataAfterOcr] = useState(false);
  const [selectedExtractMetadataKeyIds, setSelectedExtractMetadataKeyIds] = useState<string[]>([]);
  // Per-file extract metadata action
  const [extractDialogOpen, setExtractDialogOpen] = useState(false);
  const [extractTargetFile, setExtractTargetFile] = useState<FileType | null>(null);
  const [extractSubmitting, setExtractSubmitting] = useState(false);
  const [extractSelectedKeyIds, setExtractSelectedKeyIds] = useState<string[]>([]);
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
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { startImportJob, setJobBackground, jobs, dismissJob } = useDocumentImportJobs();
  const activeUploadJob = uploadDialogJobId ? jobs.find((j) => j.id === uploadDialogJobId) : undefined;
  const isImportBusy = !!(activeUploadJob && activeUploadJob.phase !== "error");

  const canWriteFiles = canManage || hasWriteAccess;

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
    (rows: Array<{ key_id: string; value: string }>) => {
      const cleaned = rows.filter((r) => r.key_id || r.value.trim());
      const newlyComplete = cleaned
        .filter((r) => r.key_id && r.value.trim())
        .map((r) => ({ key_id: r.key_id, value: r.value.trim() }));
      const draftRows = cleaned.filter((r) => !r.key_id || !r.value.trim());
      setFilterRows(draftRows.length > 0 ? draftRows : []);
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
      await api.post(`/api/companies/${companyId}/documents/extract-metadata-from-ocr`, {
        fileId: extractTargetFile.id,
        metadataKeyIds: extractSelectedKeyIds,
      });
      toast({
        title: String(t("metadataDocuments.extractMetadataSuccessTitle")),
        description: String(t("metadataDocuments.extractMetadataSuccessDescription")),
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

  // Bulk metadata
  const handleBulkMetadata = async () => {
    const entries = bulkEntries.filter((e) => e.key.trim());
    if (entries.length === 0 || selectedFileIds.size === 0) return;
    try {
      await api.post(`/api/companies/${companyId}/documents/bulk-metadata`, {
        file_ids: Array.from(selectedFileIds),
        entries,
        mode: bulkMode,
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

  const handleUploadToRagie = async (file: FileType) => {
    if (file.ragie_document_id) return;
    try {
      await api.post(`/api/companies/${companyId}/documents/${file.id}/ragie/upload`);
      toast({
        title: String(t("metadataDocuments.ragieUploadSuccessTitle")),
        description: String(t("metadataDocuments.ragieUploadSuccessDescription", { name: file.name })),
      });
      fetchFiles();
    } catch (e) {
      toast({
        title: String(t("metadataDocuments.ragieUploadFailedTitle")),
        description: e instanceof Error ? e.message : String(t("metadataDocuments.ragieUploadFailedDescription")),
        variant: "destructive",
      });
    }
  };

  const handleRemoveFromRagie = async (file: FileType) => {
    if (!file.ragie_document_id) return;
    try {
      await api.delete(`/api/companies/${companyId}/documents/${file.id}/ragie`);
      toast({
        title: String(t("metadataDocuments.ragieRemoveSuccessTitle")),
        description: String(t("metadataDocuments.ragieRemoveSuccessDescription", { name: file.name })),
      });
      fetchFiles();
    } catch (e) {
      toast({
        title: String(t("metadataDocuments.ragieRemoveFailedTitle")),
        description: e instanceof Error ? e.message : String(t("metadataDocuments.ragieRemoveFailedDescription")),
        variant: "destructive",
      });
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
    const ids = Array.from(selectedFileIds);
    for (const id of ids) {
      await triggerOcr(id);
    }
  };

  const canPreview = (mimeType: string) =>
    mimeType?.startsWith("image/") || mimeType === "application/pdf";

  const openPreview = (file: FileType, mode: "document" | "ocr" | "split" = "document") => {
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
    if (!previewFile || previewMode === "document" || previewFile.ocr_status !== "completed") return;
    loadPreviewOcr(previewFile);
  }, [loadPreviewOcr, previewFile, previewMode]);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const getFileMetadataDisplay = (file: FileType) => {
    const values = file.metadata_values || [];
    if (values.length === 0) return null;
    return values.map((mv) => `${mv.metadata?.name || "?"}: ${mv.value}`).join(", ");
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
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => {
                    setBulkEntries([{ key: "", value: "" }]);
                    setIsBulkMetadataOpen(true);
                  }}
                >
                  <Tag className="h-3 w-3 mr-1" />
                  Tag {selectedFileIds.size}
                </Button>
                {ocrEnabled && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={triggerBulkOcr}
                  >
                    <ScanText className="h-3 w-3 mr-1" />
                    Run OCR ({selectedFileIds.size})
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
              onClick={() => setFilterRows([...filterRows, { key_id: "", value: "" }])}
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
                  <Select
                    value={row.key_id}
                    onValueChange={(v) => {
                      const next = [...filterRows];
                      next[i] = { ...next[i], key_id: v };
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
                  <MetadataValueControl
                    className="h-7 w-[140px] text-xs min-w-[140px]"
                    metaKey={metadataKeys.find((k) => k.id === row.key_id)}
                    value={row.value}
                    onChange={(v) => {
                      const next = [...filterRows];
                      next[i] = { ...next[i], value: v };
                      setFilterRows(next);
                      applyFilterRows(next);
                    }}
                    placeholder="Value..."
                  />
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
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Active filter chips */}
        {filters.length > 0 && (
          <div className="px-3 py-1.5 border-b flex flex-wrap items-center gap-1.5 shrink-0">
            <span className="text-xs text-muted-foreground mr-1">Active filters:</span>
            {filters.map((f, i) => {
              const keyName = metadataKeys.find((k) => k.id === f.key_id)?.name || f.key_id;
              return (
                <Badge key={i} variant="secondary" className="text-xs gap-1 pr-1">
                  {f.missing ? `No ${keyName}` : `${keyName}: ${f.value}`}
                  <button
                    className="ml-0.5 hover:text-destructive"
                    onClick={() => {
                      const next = filters.filter((_, j) => j !== i);
                      setFilters(next);
                      setFilterRows((prev) => prev.filter((r) => !r.key_id || !r.value.trim()));
                      if (next.length === 0) setSelectedNodePath([]);
                    }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              );
            })}
            <button
              className="text-xs text-muted-foreground hover:text-foreground ml-1"
              onClick={() => {
                setFilters([]);
                setFilterRows([]);
                setSelectedNodePath([]);
              }}
            >
              Clear all
            </button>
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
          <Table>
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
                <TableHead>Name</TableHead>
                <TableHead>Metadata</TableHead>
                <TableHead>OCR</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right w-28">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.map((file) => {
                const fileWritable = canManage || file.accessLevel === 'write';
                const previewable = canPreview(file.mime_type);
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
                  <TableCell className="font-medium">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <FileIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="truncate">{file.name}</span>
                        {file.ragie_document_id && (
                          <Badge variant="secondary" className="gap-1 text-[10px]">
                            <CheckCircle className="h-3 w-3" />
                            {String(t("metadataDocuments.ragieLinkedBadge"))}
                          </Badge>
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
                    <div className="flex items-center gap-1.5">
                      {getFileMetadataDisplay(file) ? (
                        <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {getFileMetadataDisplay(file)}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground/50">No metadata</span>
                      )}
                      {fileWritable && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            openMetadataDialog(file);
                          }}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
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
                        <DropdownMenuContent align="end" className="min-w-[200px]">
                          <DropdownMenuItem onClick={() => handleDownload(file)}>
                            <Download className="h-4 w-4 mr-2" />
                            {String(t("metadataDocuments.download"))}
                          </DropdownMenuItem>

                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            disabled={!fileWritable || !!file.ragie_document_id}
                            onClick={() => handleUploadToRagie(file)}
                          >
                            <CloudUpload className="h-4 w-4 mr-2" />
                            {String(t("metadataDocuments.ragieUploadAction"))}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            disabled={!fileWritable || !file.ragie_document_id}
                            onClick={() => handleRemoveFromRagie(file)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            {String(t("metadataDocuments.ragieRemoveAction"))}
                          </DropdownMenuItem>

                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            disabled={
                              !ocrEnabled
                              || file.ocr_status === "pending"
                              || file.ocr_status === "processing"
                            }
                            onClick={() => triggerOcr(file.id)}
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
                            onClick={() => openExtractMetadataDialog(file)}
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
                        onCheckedChange={(checked) => setExtractMetadataAfterOcr(!!checked)}
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
            <DialogDescription>Apply metadata to {selectedFileIds.size} selected files.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button variant={bulkMode === "merge" ? "default" : "outline"} size="sm" onClick={() => setBulkMode("merge")}>
                Merge
              </Button>
              <Button variant={bulkMode === "replace" ? "default" : "outline"} size="sm" onClick={() => setBulkMode("replace")}>
                Replace
              </Button>
            </div>
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

      {/* Preview */}
      <Dialog open={!!previewFile} onOpenChange={(open) => !open && setPreviewFile(null)}>
        <DialogContent className="max-w-6xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-3">
              <span className="truncate">{previewFile?.name}</span>
              <div className="flex items-center gap-1">
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
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
