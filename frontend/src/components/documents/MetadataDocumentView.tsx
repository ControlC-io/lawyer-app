import React, { useState, useEffect, useCallback, useRef, useMemo, Children } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  Eye,
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
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { useToast } from "@/hooks/use-toast";

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

interface MetadataKey {
  id: string;
  name: string;
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
    function HighlightWrap({ node, inline, ...props }: any) {
      return React.createElement(Tag, { ...props, children: processChildren(props.children) });
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
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadMetadata, setUploadMetadata] = useState<Array<{ key_id: string; value: string }>>([]);
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
  const [filterRows, setFilterRows] = useState<Array<{ key_id: string; value: string }>>([]);
  const [treeSearch, setTreeSearch] = useState("");
  // OCR state
  const [ocrPolling, setOcrPolling] = useState<Record<string, NodeJS.Timeout>>({});
  const [ocrViewerOpen, setOcrViewerOpen] = useState(false);
  const [ocrViewerData, setOcrViewerData] = useState<{ fileName: string; markdown: string; provider?: string; model?: string; processedAt?: string } | null>(null);
  const [ocrAfterUpload, setOcrAfterUpload] = useState(false);
  const [ocrEnabled, setOcrEnabled] = useState(false);
  const [ocrSearch, setOcrSearch] = useState("");
  const [ocrActiveMatch, setOcrActiveMatch] = useState(0);
  const ocrContentRef = useRef<HTMLDivElement>(null);
  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchActive, setSearchActive] = useState(false);
  const { toast } = useToast();

  const canWriteFiles = canManage || hasWriteAccess;

  // OCR viewer search: count matches and build regex
  const ocrSearchRegex = useMemo(() => {
    if (!ocrSearch.trim()) return null;
    try { return new RegExp(`(${escapeRegExp(ocrSearch.trim())})`, "gi"); } catch { return null; }
  }, [ocrSearch]);

  const ocrMatchCount = useMemo(() => {
    if (!ocrSearchRegex || !ocrViewerData?.markdown) return 0;
    const matches = ocrViewerData.markdown.match(ocrSearchRegex);
    return matches ? matches.length : 0;
  }, [ocrSearchRegex, ocrViewerData?.markdown]);

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
    api.get<{ ocr: { enabled: boolean } }>('/health').then(data => {
      setOcrEnabled(data?.ocr?.enabled ?? false);
    }).catch(() => {});
  }, []);

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
      const data = await api.get<{ tree: TreeNode[]; keyOrder: Array<{ id: string; name: string }>; totalFiles: number }>(
        `/api/companies/${companyId}/documents/tree`
      );
      setTree(data.tree || []);
      setKeyOrder(data.keyOrder || []);
      setTotalFileCount(data.totalFiles ?? 0);
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

  const applyFilterRows = useCallback(
    (rows: Array<{ key_id: string; value: string }>) => {
      const cleaned = rows.filter((r) => r.key_id || r.value.trim());
      const validFilters = cleaned
        .filter((r) => r.key_id && r.value.trim())
        .map((r) => ({ key_id: r.key_id, value: r.value.trim() }));
      setFilterRows(cleaned.length > 0 ? cleaned : []);
      setFilters(validFilters);
      if (validFilters.length === 0) setSelectedNodePath([]);
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
    setFilterRows(
      newFilters
        .filter((f) => !f.missing)
        .map((f) => ({ key_id: f.key_id, value: f.value || "" }))
    );
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
      const config = await api.get<{ key_order: string[] }>(`/api/companies/${companyId}/documents/tree-config`);
      setConfigKeyOrder(config.key_order || []);
    } catch {
      setConfigKeyOrder([]);
    }
    setIsTreeConfigOpen(true);
  };

  const saveTreeConfig = async () => {
    try {
      await api.put(`/api/companies/${companyId}/documents/tree-config`, { key_order: configKeyOrder });
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

  // Upload
  const handleUpload = async () => {
    if (!uploadFile) return;
    const formData = new FormData();
    formData.append("file", uploadFile);
    if (uploadMetadata.length > 0) {
      formData.append("metadata", JSON.stringify(uploadMetadata));
    }
    if (ocrAfterUpload) {
      formData.append("ocr", "true");
    }
    try {
      const result = await api.postFormData<{ id: string }>(`/api/companies/${companyId}/documents/upload`, formData);
      toast({ title: "Success", description: "File uploaded" });
      const shouldPollOcr = ocrAfterUpload;
      setUploadFile(null);
      setUploadMetadata([]);
      setIsUploadOpen(false);
      await fetchFiles();
      fetchTree();
      if (shouldPollOcr && result.id) {
        startOcrPolling(result.id);
      }
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Upload failed", variant: "destructive" });
    }
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

  // OCR viewer
  const openOcrViewer = async (file: FileType) => {
    try {
      const result = await api.get<{ ocrMarkdown: string; ocrProvider: string; ocrModel: string; ocrProcessedAt: string }>(`/api/files/${file.id}/ocr`);
      setOcrViewerData({
        fileName: file.name,
        markdown: result.ocrMarkdown,
        provider: result.ocrProvider,
        model: result.ocrModel,
        processedAt: result.ocrProcessedAt,
      });
      setOcrViewerOpen(true);
    } catch {
      toast({ title: "Error", description: "Failed to load OCR content", variant: "destructive" });
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const canPreview = (mimeType: string) =>
    mimeType?.startsWith("image/") || mimeType === "application/pdf";

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
          className={`w-full flex items-center gap-1.5 px-2 py-1.5 text-sm hover:bg-muted/60 rounded-md transition-colors ${
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
          <span className="truncate">
            {node.isUncategorized ? (
              <span className="italic text-muted-foreground">No {node.keyName || "value"}</span>
            ) : (
              <>
                {node.keyName && <span className="text-muted-foreground">{node.keyName}: </span>}
                {node.name}
              </>
            )}
          </span>
          {node.fileCount != null && (
            <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0 h-4">
              {node.fileCount}
            </Badge>
          )}
        </button>
        {isExpanded &&
          node.children
            ?.filter((c) => c.type === "folder")
            .map((child) => renderTreeNode(child, depth + 1, currentPath))}
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
                className={`w-full flex items-center gap-1.5 px-2 py-1.5 text-sm hover:bg-muted/60 rounded-md transition-colors ${
                  selectedNodePath.length === 0 ? "bg-primary/10 text-primary font-medium" : ""
                }`}
                onClick={clearNavigation}
              >
                <FolderTree className="h-3.5 w-3.5 shrink-0" />
                <span>All Documents</span>
                <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0 h-4">
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
                  <Input
                    className="h-7 w-[140px] text-xs"
                    placeholder="Value..."
                    value={row.value}
                    onChange={(e) => {
                      const next = [...filterRows];
                      next[i] = { ...next[i], value: e.target.value };
                      setFilterRows(next);
                    }}
                    onBlur={() => applyFilterRows(filterRows)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") applyFilterRows(filterRows);
                    }}
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
                      setFilterRows(
                        next
                          .filter((f) => !f.missing)
                          .map((f) => ({ key_id: f.key_id, value: f.value || "" }))
                      );
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
                return (
                <TableRow key={file.id}>
                  {canWriteFiles && (
                    <TableCell>
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
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openMetadataDialog(file)}>
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
                      {canPreview(file.mime_type) && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPreviewFile(file)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {file.ocr_status === 'completed' && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="View OCR" onClick={() => openOcrViewer(file)}>
                          <FileSearch className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {ocrEnabled && (!file.ocr_status || file.ocr_status === 'failed') && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Run OCR" onClick={() => triggerOcr(file.id)}>
                          <ScanText className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {ocrEnabled && file.ocr_status === 'completed' && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Re-run OCR" onClick={() => triggerOcr(file.id)}>
                          <ScanText className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDownload(file)}>
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                      {fileWritable && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(file.id)}>
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

      {/* Upload */}
      <Dialog open={isUploadOpen} onOpenChange={(open) => {
        setIsUploadOpen(open);
        if (!open) { setUploadFile(null); setUploadMetadata([]); setIsDragOver(false); setOcrAfterUpload(false); }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
            <DialogDescription>Upload a file and optionally tag it with metadata.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 min-w-0">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                setUploadFile(e.target.files?.[0] || null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
            />

            {/* Drop zone / file preview */}
            {!uploadFile ? (
              <div
                className={`
                  relative flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed
                  px-6 py-8 cursor-pointer transition-all duration-200
                  ${isDragOver
                    ? "border-primary bg-primary/5 scale-[1.01]"
                    : "border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/30"
                  }
                `}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  const droppedFile = e.dataTransfer.files?.[0];
                  if (droppedFile) setUploadFile(droppedFile);
                }}
              >
                <div className={`rounded-full p-3 transition-colors duration-200 ${isDragOver ? "bg-primary/10" : "bg-muted"}`}>
                  <CloudUpload className={`h-6 w-6 transition-colors duration-200 ${isDragOver ? "text-primary" : "text-muted-foreground"}`} />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium">
                    {isDragOver ? "Drop file here" : "Drag & drop a file here"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    or <span className="text-primary underline underline-offset-2">browse from your computer</span>
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-3 overflow-hidden">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10">
                  <FileIcon className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{uploadFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {uploadFile.size < 1024
                      ? `${uploadFile.size} B`
                      : uploadFile.size < 1024 * 1024
                        ? `${(uploadFile.size / 1024).toFixed(1)} KB`
                        : `${(uploadFile.size / (1024 * 1024)).toFixed(1)} MB`}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => setUploadFile(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
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
                    <Input
                      className="h-8 flex-1"
                      placeholder="Value"
                      value={entry.value}
                      onChange={(e) => {
                        const next = [...uploadMetadata];
                        next[i].value = e.target.value;
                        setUploadMetadata(next);
                      }}
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
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="ocr-upload"
                  checked={ocrAfterUpload}
                  onCheckedChange={(checked) => setOcrAfterUpload(!!checked)}
                />
                <Label htmlFor="ocr-upload" className="text-sm">Run OCR after upload</Label>
              </div>
            )}

            <Button onClick={handleUpload} disabled={!uploadFile} className="w-full">
              <Upload className="h-4 w-4 mr-2" />
              Upload
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
                <Input
                  className="h-9 flex-1 min-w-0 focus:ring-offset-0 focus-visible:ring-offset-0"
                  placeholder="Value"
                  value={entry.value}
                  onChange={(e) => {
                    const next = [...metadataEntries];
                    next[i].value = e.target.value;
                    setMetadataEntries(next);
                  }}
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
                  <Input
                    className="h-9 flex-1"
                    placeholder="Value"
                    value={entry.value}
                    onChange={(e) => {
                      const next = [...bulkEntries];
                      next[i].value = e.target.value;
                      setBulkEntries(next);
                    }}
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
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{previewFile?.name}</DialogTitle>
          </DialogHeader>
          <div className="overflow-auto max-h-[70vh]">
            {previewFile && previewUrl && (
              <>
                {previewFile.mime_type?.startsWith("image/") && (
                  <img src={previewUrl} alt={previewFile.name} className="w-full h-auto" />
                )}
                {previewFile.mime_type === "application/pdf" && (
                  <iframe src={previewUrl} className="w-full h-[70vh]" title={previewFile.name} />
                )}
              </>
            )}
            {previewFile && !previewUrl && (
              <div className="flex items-center justify-center h-[40vh] text-muted-foreground">Loading preview...</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* OCR Viewer Sheet */}
      <Sheet open={ocrViewerOpen} onOpenChange={(open) => { setOcrViewerOpen(open); if (!open) setOcrSearch(""); }}>
        <SheetContent className="sm:max-w-2xl w-full flex flex-col">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <FileSearch className="h-4 w-4" />
              {ocrViewerData?.fileName || "OCR Content"}
            </SheetTitle>
          </SheetHeader>
          {ocrViewerData && (
            <div className="flex-1 flex flex-col gap-3 overflow-hidden">
              {/* Metadata */}
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {ocrViewerData.provider && (
                  <Badge variant="secondary" className="text-xs">{ocrViewerData.provider}{ocrViewerData.model ? ` / ${ocrViewerData.model}` : ''}</Badge>
                )}
                {ocrViewerData.processedAt && (
                  <span>Processed: {new Date(ocrViewerData.processedAt).toLocaleString()}</span>
                )}
              </div>
              {/* Actions */}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => {
                    navigator.clipboard.writeText(ocrViewerData.markdown);
                    toast({ title: "Copied", description: "Raw Markdown copied to clipboard" });
                  }}
                >
                  <Copy className="h-3 w-3 mr-1" />
                  Copy raw Markdown
                </Button>
                {ocrEnabled && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => {
                      setOcrViewerOpen(false);
                      // Find matching file from current files list to re-trigger OCR
                      const matchingFile = files.find(f => f.name === ocrViewerData.fileName);
                      if (matchingFile) triggerOcr(matchingFile.id);
                    }}
                  >
                    <ScanText className="h-3 w-3 mr-1" />
                    Re-run OCR
                  </Button>
                )}
              </div>
              {/* Search in content */}
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
              {/* Markdown content */}
              <ScrollArea className="flex-1">
                <div ref={ocrContentRef} className="ocr-document text-sm text-foreground px-1">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkBreaks]}
                    components={ocrSearchRegex ? createHighlightComponents(ocrSearchRegex, ocrActiveMatch) : undefined}
                  >
                    {ocrViewerData.markdown}
                  </ReactMarkdown>
                </div>
              </ScrollArea>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
