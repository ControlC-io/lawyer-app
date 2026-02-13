import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Folder, File, Upload, FolderPlus, ChevronRight, Home, Trash2, Eye, Download, Edit, Shield, UserPlus, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useCompanyId } from "@/hooks/useCompanyId";

interface FolderType {
  id: string;
  name: string;
  parent_folder_id: string | null;
  created_at: string;
}

interface FileType {
  id: string;
  name: string;
  folder_id: string;
  storage_path: string;
  size_bytes: number;
  mime_type: string;
  created_at: string;
  metadata: any;
}

interface Group {
  id: string;
  name: string;
}

interface Profile {
  id: string;
  full_name: string | null;
  email: string;
}

interface FolderPermissionItem {
  id: string;
  folder_id: string;
  user_id: string | null;
  group_id: string | null;
  permission_type: string;
  user?: { id: string; email: string; full_name: string | null } | null;
  group?: { id: string; name: string } | null;
}

export default function DocumentManagement() {
  const companyId = useCompanyId();
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [files, setFiles] = useState<FileType[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<FolderType[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [isUploadFileOpen, setIsUploadFileOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewFile, setPreviewFile] = useState<FileType | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewSignedUrl, setPreviewSignedUrl] = useState<string | null>(null);
  const [filters, setFilters] = useState<Array<{ key: string; value: string }>>([]);
  const [currentFilterKey, setCurrentFilterKey] = useState("");
  const [currentFilterValue, setCurrentFilterValue] = useState("");
  const [availableMetadataKeys, setAvailableMetadataKeys] = useState<Array<{ id: string; name: string }>>([]);
  const [availableMetadataValues, setAvailableMetadataValues] = useState<string[]>([]);
  const [isMetadataDialogOpen, setIsMetadataDialogOpen] = useState(false);
  const [selectedFileForMetadata, setSelectedFileForMetadata] = useState<FileType | null>(null);
  const [metadataEntries, setMetadataEntries] = useState<Array<{ key: string; value: string }>>([]);
  const [folderForPermissions, setFolderForPermissions] = useState<FolderType | null>(null);
  const [folderPermissionsList, setFolderPermissionsList] = useState<FolderPermissionItem[]>([]);
  const [isPermissionsDialogOpen, setIsPermissionsDialogOpen] = useState(false);
  const [newPermType, setNewPermType] = useState<"user" | "group">("group");
  const [newPermEntityId, setNewPermEntityId] = useState("");
  const [newPermLevel, setNewPermLevel] = useState<"read" | "write">("read");
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchUsers();
    fetchGroups();
    fetchMetadataKeys();
  }, [companyId]);

  useEffect(() => {
    if (currentFilterKey) {
      fetchMetadataValues(currentFilterKey);
    } else {
      setAvailableMetadataValues([]);
    }
  }, [currentFilterKey, companyId]);

  useEffect(() => {
    fetchFoldersAndFiles();
  }, [currentFolderId, companyId, filters]);

  // Generate document URL for preview (proxy through backend so it works without MinIO public URL)
  useEffect(() => {
    const generatePreviewUrl = async () => {
      if (previewFile && isPreviewOpen) {
        try {
          const { url } = await api.post<{ url: string }>("/api/files/document-url", {
            fileId: previewFile.id,
            download: false,
          });
          const base = (import.meta.env.VITE_API_URL as string) || window.location.origin;
          setPreviewSignedUrl(url.startsWith("http") ? url : `${base.replace(/\/$/, "")}${url}`);
        } catch (error) {
          console.error("Error generating document URL for preview:", error);
          setPreviewSignedUrl(null);
        }
      } else {
        setPreviewSignedUrl(null);
      }
    };

    generatePreviewUrl();
  }, [previewFile, isPreviewOpen]);

  const fetchUsers = async () => {
    if (!companyId) return;
    try {
      const data = await api.get<Array<{ id: string; full_name: string | null; email: string }>>(
        `/api/companies/${companyId}/users`
      );
      setUsers(data || []);
    } catch {
      toast({ title: "Error", description: "Failed to fetch users", variant: "destructive" });
    }
  };

  const fetchGroups = async () => {
    if (!companyId) return;
    try {
      const data = await api.get<Group[]>(`/api/companies/${companyId}/groups`);
      setGroups(data || []);
    } catch {
      toast({ title: "Error", description: "Failed to fetch groups", variant: "destructive" });
    }
  };

  const openPermissionsDialog = async (folder: FolderType) => {
    if (!companyId) return;
    setFolderForPermissions(folder);
    setIsPermissionsDialogOpen(true);
    setFolderPermissionsList([]);
    setNewPermEntityId("");
    setPermissionsLoading(true);
    try {
      const list = await api.get<FolderPermissionItem[]>(
        `/api/companies/${companyId}/folders/${folder.id}/permissions`
      );
      setFolderPermissionsList(list || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load permissions";
      toast({ title: "Error", description: msg, variant: "destructive" });
      setIsPermissionsDialogOpen(false);
    } finally {
      setPermissionsLoading(false);
    }
  };

  const fetchFolderPermissions = async () => {
    if (!companyId || !folderForPermissions) return;
    try {
      const list = await api.get<FolderPermissionItem[]>(
        `/api/companies/${companyId}/folders/${folderForPermissions.id}/permissions`
      );
      setFolderPermissionsList(list || []);
    } catch {
      toast({ title: "Error", description: "Failed to refresh permissions", variant: "destructive" });
    }
  };

  const handleAddFolderPermission = async () => {
    if (!companyId || !folderForPermissions) return;
    const body = newPermType === "user"
      ? { user_id: newPermEntityId, permission_type: newPermLevel }
      : { group_id: newPermEntityId, permission_type: newPermLevel };
    if (!body.user_id && !body.group_id) {
      toast({ title: "Select a user or group", variant: "destructive" });
      return;
    }
    try {
      await api.post(
        `/api/companies/${companyId}/folders/${folderForPermissions.id}/permissions`,
        body
      );
      toast({ title: "Success", description: "Permission added" });
      setNewPermEntityId("");
      fetchFolderPermissions();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to add permission";
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
  };

  const handleRemoveFolderPermission = async (permissionId: string) => {
    if (!companyId || !folderForPermissions) return;
    try {
      await api.delete(
        `/api/companies/${companyId}/folders/${folderForPermissions.id}/permissions/${permissionId}`
      );
      toast({ title: "Success", description: "Permission removed" });
      fetchFolderPermissions();
    } catch {
      toast({ title: "Error", description: "Failed to remove permission", variant: "destructive" });
    }
  };

  const fetchMetadataKeys = async () => {
    if (!companyId) return;
    const data = await api.get<Array<{ id: string; name: string }>>(
      `/api/companies/${companyId}/files-metadata-keys`
    );
    setAvailableMetadataKeys(data || []);
  };

  const fetchMetadataValues = async (keyId: string) => {
    if (!companyId) return;
    const fileIdsRes = await api.get<{ fileIds: string[] }>(
      `/api/companies/${companyId}/files/by-metadata?metadata_id=${encodeURIComponent(keyId)}`
    );
    const fileIds = fileIdsRes?.fileIds ?? [];
    if (fileIds.length === 0) {
      setAvailableMetadataValues([]);
      return;
    }
    const files = await api.get<
      Array<{ metadata_values?: Array<{ value: string; metadata?: { id: string } }> }>
    >(`/api/companies/${companyId}/files?ids=${fileIds.join(",")}`);
    const values = new Set<string>();
    (files || []).forEach((f) => {
      f.metadata_values?.forEach((mv) => {
        if (mv.metadata?.id === keyId) values.add(mv.value);
      });
    });
    setAvailableMetadataValues(Array.from(values).sort());
  };

  const fetchFoldersAndFiles = async () => {
    if (!companyId) {
      setFolders([]);
      setFiles([]);
      setBreadcrumb([]);
      return;
    }

    let foldersData: FolderType[] = [];
    if (filters.length === 0) {
      const parentParam = currentFolderId ?? "";
      foldersData = await api.get<FolderType[]>(
        `/api/companies/${companyId}/folders?parent_folder_id=${encodeURIComponent(parentParam)}`
      );
    }

    let fileIdsParam: string | undefined;
    if (filters.length > 0) {
      const fileIdSets: Set<string>[] = [];
      for (const filter of filters) {
        const url = filter.value
          ? `/api/companies/${companyId}/files/by-metadata?metadata_id=${encodeURIComponent(filter.key)}&value=${encodeURIComponent(filter.value)}`
          : `/api/companies/${companyId}/files/by-metadata?metadata_id=${encodeURIComponent(filter.key)}`;
        const res = await api.get<{ fileIds: string[] }>(url);
        fileIdSets.push(new Set(res?.fileIds ?? []));
      }
      if (fileIdSets.length > 0) {
        let intersection = fileIdSets[0];
        for (let i = 1; i < fileIdSets.length; i++) {
          intersection = new Set([...intersection].filter((x) => fileIdSets[i].has(x)));
        }
        const fileIds = Array.from(intersection);
        if (fileIds.length === 0) {
          setFiles([]);
          setFolders([]);
          setBreadcrumb([]);
          return;
        }
        fileIdsParam = fileIds.join(",");
      }
    }

    const folderParam = filters.length === 0 ? (currentFolderId ?? "") : undefined;
    const filesUrl =
      fileIdsParam != null
        ? `/api/companies/${companyId}/files?ids=${encodeURIComponent(fileIdsParam)}`
        : `/api/companies/${companyId}/files?folder_id=${encodeURIComponent(folderParam ?? "")}`;
    const filesData = await api.get<Array<FileType & { metadata_values?: Array<{ value: string; metadata?: { name: string } }> }>>(
      filesUrl
    );

    const transformedFiles = (filesData ?? []).map((file) => {
      const metadataMap: Record<string, string> = {};
      file.metadata_values?.forEach((mv) => {
        if (mv.metadata?.name) metadataMap[mv.metadata.name] = mv.value;
      });
      const { metadata_values, ...rest } = file;
      return { ...rest, metadata: metadataMap } as FileType;
    });

    setFolders(foldersData);
    setFiles(transformedFiles);

    if (filters.length === 0 && currentFolderId) {
      await updateBreadcrumb(currentFolderId);
    } else {
      setBreadcrumb([]);
    }
  };

  const updateBreadcrumb = async (folderId: string) => {
    const path: FolderType[] = [];
    let currentId: string | null = folderId;

    while (currentId && companyId) {
      const folder = await api.get<FolderType>(
        `/api/companies/${companyId}/folders/${currentId}`
      ).catch(() => null);
      if (!folder) break;
      path.unshift(folder);
      currentId = folder.parent_folder_id;
    }

    setBreadcrumb(path);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      toast({ title: "Error", description: "Folder name is required", variant: "destructive" });
      return;
    }

    if (!companyId) {
      toast({ title: "Error", description: "Company not set", variant: "destructive" });
      return;
    }

    await api.post(`/api/companies/${companyId}/folders`, {
      name: newFolderName.trim(),
      parent_folder_id: currentFolderId ?? null,
    });

    toast({ title: "Success", description: "Folder created successfully" });
    setNewFolderName("");
    setIsCreateFolderOpen(false);
    fetchFoldersAndFiles();
  };

  const handleUploadFile = async () => {
    if (!selectedFile) {
      toast({ title: "Error", description: "Please select a file", variant: "destructive" });
      return;
    }

    if (!companyId) {
      toast({ title: "Error", description: "Company not set", variant: "destructive" });
      return;
    }

    try {
      // Sanitize file name to handle special characters safely for storage
      // Supabase Storage doesn't accept URL-encoded characters or many special chars, so we sanitize aggressively
      let sanitizedFileName = selectedFile.name
        .normalize('NFD') // Decompose accented characters (è -> e + `)
        .replace(/[\u0300-\u036f]/g, '') // Remove combining diacritical marks
        .replace(/[<>:"/\\|?*\x00-\x1f,;=+&%$#@!~`{}[\]()]/g, '_') // Replace all special chars with underscore
        .replace(/\s+/g, '_') // Replace spaces with underscores
        .replace(/_{2,}/g, '_') // Replace multiple underscores with single
        .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores
      
      // Fallback if name becomes empty
      if (!sanitizedFileName || sanitizedFileName.length === 0) {
        sanitizedFileName = 'file';
      }
      if (!currentFolderId) {
        toast({ title: "Error", description: "Please open or create a folder first to upload files.", variant: "destructive" });
        return;
      }
      const formData = new FormData();
      formData.append("file", selectedFile);
      await api.postFormData(
        `/api/companies/${companyId}/folders/${currentFolderId}/upload`,
        formData
      );

      toast({ title: "Success", description: "File uploaded successfully" });
      setSelectedFile(null);
      setIsUploadFileOpen(false);
      fetchFoldersAndFiles();
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to upload file", variant: "destructive" });
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    try {
      await api.delete(`/api/companies/${companyId}/folders/${folderId}`);
      toast({ title: "Success", description: "Folder deleted successfully" });
      fetchFoldersAndFiles();
    } catch {
      toast({ title: "Error", description: "Failed to delete folder", variant: "destructive" });
    }
  };

  const handleDeleteFile = async (fileId: string, _storagePath: string) => {
    try {
      await api.delete(`/api/companies/${companyId}/files/${fileId}`);
      toast({ title: "Success", description: "File deleted successfully" });
      fetchFoldersAndFiles();
    } catch (error: unknown) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to delete file", variant: "destructive" });
    }
  };

  const handlePreview = (file: FileType) => {
    setPreviewFile(file);
    setIsPreviewOpen(true);
  };

  const handleDownload = async (file: FileType) => {
    try {
      const { url } = await api.post<{ url: string }>("/api/files/document-url", {
        fileId: file.id,
        download: true,
      });
      const base = (import.meta.env.VITE_API_URL as string) || window.location.origin;
      const fullUrl = url.startsWith("http") ? url : `${base.replace(/\/$/, "")}${url}`;
      const a = document.createElement("a");
      a.href = fullUrl;
      a.download = file.name;
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast({ title: "Success", description: "File downloaded successfully" });
    } catch (error: unknown) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to download file", variant: "destructive" });
    }
  };

  const handleOpenMetadataDialog = (file: FileType) => {
    setSelectedFileForMetadata(file);
    // Convert metadata object to array of key-value pairs
    const entries = file.metadata
      ? Object.entries(file.metadata).map(([key, value]) => ({
        key,
        value: typeof value === 'string' ? value : JSON.stringify(value)
      }))
      : [];
    setMetadataEntries(entries);
    setIsMetadataDialogOpen(true);
  };

  const handleAddMetadataEntry = () => {
    setMetadataEntries([...metadataEntries, { key: "", value: "" }]);
  };

  const handleRemoveMetadataEntry = (index: number) => {
    setMetadataEntries(metadataEntries.filter((_, i) => i !== index));
  };

  const handleMetadataEntryChange = (index: number, field: 'key' | 'value', value: string) => {
    const updated = [...metadataEntries];
    updated[index][field] = value;
    setMetadataEntries(updated);
  };

  const handleSaveMetadata = async () => {
    if (!selectedFileForMetadata || !companyId) return;

    try {
      const newEntries = metadataEntries
        .filter((entry) => entry.key.trim() !== "")
        .map((entry) => ({ key: entry.key.trim(), value: entry.value }));
      await api.put(
        `/api/companies/${companyId}/files/${selectedFileForMetadata.id}/metadata`,
        { entries: newEntries }
      );
      const createdKeys = newEntries
        .filter((e) => !availableMetadataKeys.some((k) => k.name === e.key))
        .map((k) => ({ id: "", name: k.key }));
      if (createdKeys.length) setAvailableMetadataKeys((prev) => [...prev, ...createdKeys]);
      toast({ title: "Success", description: "Metadata updated successfully" });
      setIsMetadataDialogOpen(false);
      fetchFoldersAndFiles();
    } catch (error: unknown) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to update metadata", variant: "destructive" });
    }
  };

  const getMetadataCount = (metadata: any) => {
    if (!metadata || typeof metadata !== 'object') return 0;
    return Object.keys(metadata).length;
  };


  const canPreview = (mimeType: string) => {
    return mimeType?.startsWith('image/') || mimeType === 'application/pdf';
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Document Management</h1>
          <p className="text-muted-foreground">Manage folders and files</p>
        </div>
        <div className="flex gap-2">
          {companyId && filters.length === 0 && (
            <>
              <Dialog open={isCreateFolderOpen} onOpenChange={setIsCreateFolderOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <FolderPlus className="h-4 w-4 mr-2" />
                    New Folder
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New Folder</DialogTitle>
                    <DialogDescription>Create a new folder in the current location</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="folder-name">Folder Name</Label>
                      <Input
                        id="folder-name"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        placeholder="Enter folder name"
                      />
                    </div>
                    <Button onClick={handleCreateFolder} className="w-full">Create Folder</Button>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={isUploadFileOpen} onOpenChange={setIsUploadFileOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Upload className="h-4 w-4 mr-2" />
                    Upload File
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Upload File</DialogTitle>
                    <DialogDescription>Upload a file to the current folder</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="file-upload">Select File</Label>
                      <Input
                        id="file-upload"
                        type="file"
                        onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                      />
                    </div>
                    <Button onClick={handleUploadFile} className="w-full">Upload</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </div>

      {/* Metadata Filter (only when company selected) */}
      {companyId && (
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <Label htmlFor="meta-key" className="text-xs mb-1 block">Metadata Key</Label>
              <Select
                value={currentFilterKey}
                onValueChange={(value) => {
                  setCurrentFilterKey(value);
                  setCurrentFilterValue(""); // Reset value when key changes
                }}
              >
                <SelectTrigger id="meta-key" className="h-8">
                  <SelectValue placeholder="Select key" />
                </SelectTrigger>
                <SelectContent>
                  {availableMetadataKeys.map((key) => (
                    <SelectItem key={key.id} value={key.id}>
                      {key.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label htmlFor="meta-value" className="text-xs mb-1 block">Metadata Value</Label>
              <Select
                value={currentFilterValue}
                onValueChange={setCurrentFilterValue}
                disabled={!currentFilterKey}
              >
                <SelectTrigger id="meta-value" className="h-8">
                  <SelectValue placeholder="Select value" />
                </SelectTrigger>
                <SelectContent>
                  {availableMetadataValues.map((val) => (
                    <SelectItem key={val} value={val}>
                      {val}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              onClick={() => {
                if (currentFilterKey) {
                  setFilters([...filters, { key: currentFilterKey, value: currentFilterValue }]);
                  setCurrentFilterKey("");
                  setCurrentFilterValue("");
                }
              }}
              disabled={!currentFilterKey}
              className="h-8"
            >
              Add Filter
            </Button>
          </div>

          {filters.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2 border-t">
              {filters.map((filter, index) => {
                const keyName = availableMetadataKeys.find(k => k.id === filter.key)?.name || filter.key;
                return (
                  <div key={index} className="flex items-center gap-1 bg-secondary text-secondary-foreground px-2 py-1 rounded text-xs">
                    <span>{keyName}: {filter.value || "(Any)"}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 ml-1 hover:bg-destructive/20"
                      onClick={() => {
                        const newFilters = [...filters];
                        newFilters.splice(index, 1);
                        setFilters(newFilters);
                      }}
                    >
                      <span className="sr-only">Remove</span>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-3 w-3"
                      >
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                      </svg>
                    </Button>
                  </div>
                );
              })}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFilters([])}
                className="h-6 text-xs ml-auto"
              >
                Clear All
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* Breadcrumb or Search Indicator (only when company selected) */}
      {companyId && (
      <div className="flex items-center gap-2 text-sm">
        {filters.length === 0 ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentFolderId(null)}
              className="h-8"
            >
              <Home className="h-4 w-4" />
            </Button>
            {breadcrumb.map((folder, index) => (
              <div key={folder.id} className="flex items-center gap-2">
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentFolderId(folder.id)}
                  className="h-8"
                >
                  {folder.name}
                </Button>
              </div>
            ))}
          </>
        ) : (
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="font-medium text-foreground">Search Results</span>
            <span>&bull;</span>
            <span>Global search across all folders</span>
          </div>
        )}
      </div>
      )}

      {/* No company selected */}
      {!companyId && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Folder className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No company selected</h3>
            <p className="text-muted-foreground max-w-md">
              Document management is scoped to a company. Select a company from the switcher in the header to see folders and files, or create a folder and upload documents.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Folders and Files List */}
      {companyId && (
      <Card>
        <CardHeader>
          <CardTitle>{filters.length > 0 ? "Search Results" : "Contents"}</CardTitle>
          <CardDescription>
            {filters.length > 0
              ? "Files matching selected metadata filters"
              : "Folders and files in this location"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Metadata</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {folders.map((folder) => (
                <TableRow
                  key={folder.id}
                  className="cursor-pointer hover:bg-muted"
                  onClick={() => setCurrentFolderId(folder.id)}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <Folder className="h-4 w-4 text-blue-500" />
                      {folder.name}
                    </div>
                  </TableCell>
                  <TableCell>Folder</TableCell>
                  <TableCell>—</TableCell>
                  <TableCell>—</TableCell>
                  <TableCell>{new Date(folder.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end items-center">
                      {currentFolderId === null && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            openPermissionsDialog(folder);
                          }}
                          title="Manage access"
                          className="text-muted-foreground hover:text-primary"
                        >
                          <Shield className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteFolder(folder.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {files.map((file) => (
                <TableRow key={file.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <File className="h-4 w-4 text-gray-500" />
                      {file.name}
                    </div>
                  </TableCell>
                  <TableCell>File</TableCell>
                  <TableCell>{formatFileSize(file.size_bytes)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getMetadataCount(file.metadata) > 0 ? (
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                          {getMetadataCount(file.metadata)} {getMetadataCount(file.metadata) === 1 ? 'key' : 'keys'}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">No metadata</span>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenMetadataDialog(file)}
                        title="Edit metadata"
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>{new Date(file.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      {canPreview(file.mime_type) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handlePreview(file)}
                          title="Preview"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDownload(file)}
                        title="Download"
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteFile(file.id, file.storage_path)}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {folders.length === 0 && files.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {filters.length > 0
                      ? "No matching files found"
                      : currentFolderId
                        ? "This folder is empty"
                        : "No folders yet. Create a folder above to organize and upload documents."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      )}

      {/* Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{previewFile?.name}</DialogTitle>
          </DialogHeader>
          <div className="overflow-auto max-h-[70vh]">
            {previewFile && previewSignedUrl && (
              <>
                {previewFile.mime_type?.startsWith('image/') && (
                  <img
                    src={previewSignedUrl}
                    alt={previewFile.name}
                    className="w-full h-auto"
                  />
                )}
                {previewFile.mime_type === 'application/pdf' && (
                  <iframe
                    src={previewSignedUrl}
                    className="w-full h-[70vh]"
                    title={previewFile.name}
                  />
                )}
              </>
            )}
            {previewFile && !previewSignedUrl && (
              <div className="flex items-center justify-center h-[70vh] text-muted-foreground">
                Loading preview...
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Metadata Editor Dialog */}
      <Dialog open={isMetadataDialogOpen} onOpenChange={setIsMetadataDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Edit Metadata</DialogTitle>
            <DialogDescription>
              Manage metadata key-value pairs for {selectedFileForMetadata?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 overflow-auto max-h-[60vh]">
            {metadataEntries.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                No metadata entries. Click "Add Entry" to create one.
              </div>
            ) : (
              <div className="space-y-3">
                {metadataEntries.map((entry, index) => (
                  <div key={index} className="flex gap-2 items-start">
                    <div className="flex-1">
                      <Label htmlFor={`key-${index}`} className="text-xs">Key</Label>
                      <Select
                        value={entry.key}
                        onValueChange={(value) => handleMetadataEntryChange(index, 'key', value)}
                      >
                        <SelectTrigger id={`key-${index}`} className="h-9">
                          <SelectValue placeholder="Select key" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableMetadataKeys.map((key) => (
                            <SelectItem key={key.id} value={key.name}>
                              {key.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1">
                      <Label htmlFor={`value-${index}`} className="text-xs">Value</Label>
                      <Input
                        id={`value-${index}`}
                        value={entry.value}
                        onChange={(e) => handleMetadataEntryChange(index, 'value', e.target.value)}
                        placeholder="e.g. 12345"
                        className="h-9"
                      />
                    </div>
                    <div className="pt-5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveMetadataEntry(index)}
                        title="Remove entry"
                        className="h-9"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2 pt-4 border-t">
            <Button variant="outline" onClick={handleAddMetadataEntry} className="flex-1">
              Add Entry
            </Button>
            <Button onClick={handleSaveMetadata} className="flex-1">
              Save Metadata
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Folder permissions (root folders only) */}
      <Dialog open={isPermissionsDialogOpen} onOpenChange={setIsPermissionsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Folder access
            </DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">{folderForPermissions?.name}</span>
              {" — "}
              Root folders are public by default. Add users or groups below to grant explicit access.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            {permissionsLoading ? (
              <div className="py-8 text-center text-muted-foreground text-sm">Loading permissions…</div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Current access</Label>
                  {folderPermissionsList.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-3 rounded-lg bg-muted/50 border border-dashed border-border text-center">
                      No restrictions — folder is public to everyone in the company.
                    </p>
                  ) : (
                    <ul className="rounded-lg border bg-card divide-y">
                      {folderPermissionsList.map((perm) => {
                        const label = perm.user
                          ? (perm.user.full_name || perm.user.email)
                          : perm.group
                            ? perm.group.name
                          : "—";
                        const sub = perm.user ? perm.user.email : "Group";
                        return (
                          <li key={perm.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                            <div className="flex items-center gap-2 min-w-0">
                              {perm.user ? (
                                <UserPlus className="h-4 w-4 text-muted-foreground shrink-0" />
                              ) : (
                                <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                              )}
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{label}</p>
                                <p className="text-xs text-muted-foreground truncate">{sub}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge variant="secondary" className="capitalize font-normal">
                                {perm.permission_type}
                              </Badge>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={() => handleRemoveFolderPermission(perm.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Grant access</Label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant={newPermType === "group" ? "default" : "outline"}
                      size="sm"
                      onClick={() => { setNewPermType("group"); setNewPermEntityId(""); }}
                    >
                      <Users className="h-3.5 w-3 mr-1.5" />
                      Group
                    </Button>
                    <Button
                      type="button"
                      variant={newPermType === "user" ? "default" : "outline"}
                      size="sm"
                      onClick={() => { setNewPermType("user"); setNewPermEntityId(""); }}
                    >
                      <UserPlus className="h-3.5 w-3 mr-1.5" />
                      User
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <Label htmlFor="perm-entity" className="text-xs">Select {newPermType === "group" ? "group" : "user"}</Label>
                      <Select value={newPermEntityId} onValueChange={setNewPermEntityId}>
                        <SelectTrigger id="perm-entity" className="mt-1">
                          <SelectValue placeholder={newPermType === "group" ? "Choose a group…" : "Choose a user…"} />
                        </SelectTrigger>
                        <SelectContent>
                          {newPermType === "group"
                            ? groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)
                            : users.map((u) => (
                                <SelectItem key={u.id} value={u.id}>
                                  {u.full_name || u.email}
                                </SelectItem>
                              ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="perm-level" className="text-xs">Access level</Label>
                      <Select value={newPermLevel} onValueChange={(v: "read" | "write") => setNewPermLevel(v)}>
                        <SelectTrigger id="perm-level" className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="read">Read — view and download only</SelectItem>
                          <SelectItem value="write">Write — upload and delete</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end">
                      <Button onClick={handleAddFolderPermission} className="w-full" disabled={!newPermEntityId}>
                        Add access
                      </Button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
