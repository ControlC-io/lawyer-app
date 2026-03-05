import { useState, useEffect, useCallback, useRef } from "react";
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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface FileType {
  id: string;
  name: string;
  folder_id: string | null;
  storage_path: string;
  size_bytes: number;
  mime_type: string;
  created_at: string;
  metadata_values?: Array<{
    value: string;
    metadata?: { id: string; name: string };
  }>;
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
  canManageFiles?: boolean;
}

function nodeDirectlyMatches(node: TreeNode, query: string): boolean {
  if (!query) return false;
  const q = query.toLowerCase();
  return node.name.toLowerCase().includes(q) || (node.keyName?.toLowerCase().includes(q) ?? false);
}

export default function MetadataDocumentView({ companyId, canManageFiles = false }: Props) {
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
  const [isTreeConfigOpen, setIsTreeConfigOpen] = useState(false);
  const [configKeyOrder, setConfigKeyOrder] = useState<string[]>([]);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadMetadata, setUploadMetadata] = useState<Array<{ key_id: string; value: string }>>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
  const { toast } = useToast();

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
      const filtersParam = filters.length > 0 ? `?filters=${encodeURIComponent(JSON.stringify(filters))}` : "";
      const data = await api.get<FileType[]>(`/api/companies/${companyId}/documents/flat${filtersParam}`);
      setFiles(data || []);
    } catch {
      toast({ title: "Error", description: "Failed to load files", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [companyId, filters, toast]);

  useEffect(() => {
    fetchMetadataKeys();
    fetchTree();
  }, [fetchMetadataKeys, fetchTree]);

  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

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
    try {
      await api.postFormData(`/api/companies/${companyId}/documents/upload`, formData);
      toast({ title: "Success", description: "File uploaded" });
      setUploadFile(null);
      setUploadMetadata([]);
      setIsUploadOpen(false);
      fetchFiles();
      fetchTree();
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
      <div className="w-72 shrink-0 border rounded-lg bg-card flex flex-col">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="text-sm font-medium">Document Tree</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={openTreeConfig} title="Configure tree view">
            <Settings className="h-3.5 w-3.5" />
          </Button>
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
            {canManageFiles && selectedFileIds.size > 0 && (
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
            {canManageFiles && (
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

        {/* File list */}
        <div className="flex-1 overflow-auto [&_>div]:overflow-visible">
          <Table>
            <TableHeader>
              <TableRow>
                {canManageFiles && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={files.length > 0 && selectedFileIds.size === files.length}
                      onCheckedChange={handleToggleSelectAll}
                    />
                  </TableHead>
                )}
                <TableHead>Name</TableHead>
                <TableHead>Metadata</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right w-28">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.map((file) => (
                <TableRow key={file.id}>
                  {canManageFiles && (
                    <TableCell>
                      <Checkbox
                        checked={selectedFileIds.has(file.id)}
                        onCheckedChange={() => handleToggleSelect(file.id)}
                      />
                    </TableCell>
                  )}
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <FileIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="truncate">{file.name}</span>
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
                      {canManageFiles && (
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openMetadataDialog(file)}>
                          <Edit className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
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
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDownload(file)}>
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                      {canManageFiles && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(file.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {files.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={canManageFiles ? 6 : 5} className="text-center text-muted-foreground py-12">
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
        if (!open) { setUploadFile(null); setUploadMetadata([]); setIsDragOver(false); }
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

            <Button onClick={handleUpload} disabled={!uploadFile} className="w-full">
              <Upload className="h-4 w-4 mr-2" />
              Upload
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Metadata Editor */}
      <Dialog open={isMetadataDialogOpen} onOpenChange={setIsMetadataDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Metadata</DialogTitle>
            <DialogDescription>Manage metadata for {editingFile?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[50vh] overflow-auto">
            {metadataEntries.map((entry, i) => (
              <div key={i} className="flex gap-2">
                <Select value={entry.key} onValueChange={(v) => {
                  const next = [...metadataEntries];
                  next[i].key = v;
                  setMetadataEntries(next);
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
                    const next = [...metadataEntries];
                    next[i].value = e.target.value;
                    setMetadataEntries(next);
                  }}
                />
                <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setMetadataEntries(metadataEntries.filter((_, j) => j !== i))}>
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
    </div>
  );
}
