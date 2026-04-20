import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, Eye, EyeOff, RefreshCw, Key, Shield, Building, FileText, Trash2, Plus, Globe, ExternalLink, Upload, Pencil, Palette, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { FileMetadataKey } from "@/components/documents/MetadataValueControl";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useCompanyId } from "@/hooks/useCompanyId";
import { useLanguage } from "@/contexts/LanguageContext";
import { PORTAL_LANGUAGES, PORTAL_LANGUAGE_FLAGS, PORTAL_LANGUAGE_LABELS, type PortalLanguageCode } from "@/lib/portalLanguages";

interface Company {
  id: string;
  name: string;
  api_key: string;
  created_at: string;
  slug?: string | null;
  logo_url?: string | null;
  internal_logo_url?: string | null;
  internal_primary_color?: string | null;
  portal_description?: string | null;
  portal_primary_color?: string | null;
  portal_enabled?: boolean;
  portal_default_language?: PortalLanguageCode;
  portal_enabled_languages?: PortalLanguageCode[];
}

interface PortalTranslationRow {
  id: string;
  workflow_id: string;
  workflow_name: string;
  section: string;
  path: string;
  label: string;
  source_text: string;
  translations: Record<string, string>;
}

interface PortalTranslationsResponse {
  supported_languages: PortalLanguageCode[];
  enabled_languages: PortalLanguageCode[];
  default_language: PortalLanguageCode;
  rows: PortalTranslationRow[];
}

function getPortalTranslationLabel(label: string): string {
  // Keep meaningful label text, but hide trailing internal UUID suffixes.
  return label.replace(
    /\s+\([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\)$/i,
    "",
  );
}

export default function OrganizationSettings() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const companyId = useCompanyId();
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [showApiKey, setShowApiKey] = useState(false);
  const [regeneratingKey, setRegeneratingKey] = useState(false);

  const [metadataKeys, setMetadataKeys] = useState<FileMetadataKey[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyKind, setNewKeyKind] = useState<"free_text" | "predefined_list">("free_text");
  const [newKeyOptions, setNewKeyOptions] = useState("");
  const [creatingKey, setCreatingKey] = useState(false);
  const [editKeyOpen, setEditKeyOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<FileMetadataKey | null>(null);
  const [editKeyName, setEditKeyName] = useState("");
  const [editKeyKind, setEditKeyKind] = useState<"free_text" | "predefined_list">("free_text");
  const [editKeyOptions, setEditKeyOptions] = useState("");
  const [savingKeyEdit, setSavingKeyEdit] = useState(false);

  // Portal settings state
  const [portalEnabled, setPortalEnabled] = useState(false);
  const [portalSlug, setPortalSlug] = useState("");
  const [portalLogoUrl, setPortalLogoUrl] = useState("");
  const [portalDescription, setPortalDescription] = useState("");
  const [portalPrimaryColor, setPortalPrimaryColor] = useState("#3B82F6");
  const [portalDefaultLanguage, setPortalDefaultLanguage] = useState<PortalLanguageCode>("en");
  const [portalEnabledLanguages, setPortalEnabledLanguages] = useState<PortalLanguageCode[]>(["en"]);
  const [portalTranslationRows, setPortalTranslationRows] = useState<PortalTranslationRow[]>([]);
  const [loadingTranslations, setLoadingTranslations] = useState(false);
  const [savingTranslations, setSavingTranslations] = useState(false);
  const [translationSaveError, setTranslationSaveError] = useState<string | null>(null);
  const [savingPortal, setSavingPortal] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [removingLogo, setRemovingLogo] = useState(false);
  const [showLogoUrlInput, setShowLogoUrlInput] = useState(false);
  const [logoVersion, setLogoVersion] = useState(0);
  const logoFileInputRef = useRef<HTMLInputElement>(null);

  // Internal branding state
  const [brandingLogoUrl, setBrandingLogoUrl] = useState("");
  const [brandingPrimaryColor, setBrandingPrimaryColor] = useState("#3B82F6");
  const [showBrandingLogoUrlInput, setShowBrandingLogoUrlInput] = useState(false);
  const [brandingLogoVersion, setBrandingLogoVersion] = useState(0);
  const [brandingLogoPreviewUrl, setBrandingLogoPreviewUrl] = useState("");
  const [savingBranding, setSavingBranding] = useState(false);
  const [uploadingBrandingLogo, setUploadingBrandingLogo] = useState(false);
  const [removingBrandingLogo, setRemovingBrandingLogo] = useState(false);
  const brandingLogoFileInputRef = useRef<HTMLInputElement>(null);
  const brandingLogoObjectUrlRef = useRef<string | null>(null);
  const portalTranslationRowsRef = useRef<PortalTranslationRow[]>([]);
  const translationAutosaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const translationSaveInFlightRef = useRef(false);
  const translationSaveQueuedRef = useRef(false);
  const translationDirtyRef = useRef(false);

  useEffect(() => {
    if (companyId) {
      fetchCompanyData();
      fetchMetadataKeys();
    }
  }, [companyId]);

  const fetchCompanyData = async () => {
    try {
      const data = await api.get<Company>(`/api/companies/${companyId}`);
      setCompany(data);
      // Sync portal state
      setPortalEnabled(data.portal_enabled ?? false);
      setPortalSlug(data.slug ?? "");
      setPortalLogoUrl(data.logo_url ?? "");
      setPortalDescription(data.portal_description ?? "");
      setPortalPrimaryColor(data.portal_primary_color ?? "#3B82F6");
      const nextEnabledLanguages = Array.isArray(data.portal_enabled_languages) && data.portal_enabled_languages.length > 0
        ? data.portal_enabled_languages
        : ["en"];
      setPortalEnabledLanguages(nextEnabledLanguages);
      setPortalDefaultLanguage(
        nextEnabledLanguages.includes(data.portal_default_language as PortalLanguageCode)
          ? (data.portal_default_language as PortalLanguageCode)
          : nextEnabledLanguages[0]
      );
      setBrandingLogoUrl(data.internal_logo_url ?? "");
      setBrandingPrimaryColor(data.internal_primary_color ?? "#3B82F6");
    } catch (error) {
      console.error("Error fetching company data:", error);
      toast.error(t("organizationSettings.failedToLoadOrganization"));
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} ${t("organizationSettings.copiedToClipboard")}`);
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
      toast.error(t("organizationSettings.failedToCopyToClipboard"));
    }
  };

  const regenerateApiKey = async () => {
    if (!confirm(t("organizationSettings.regenerateConfirm"))) {
      return;
    }
    setRegeneratingKey(true);
    try {
      const updated = await api.patch<Company>(`/api/companies/${companyId}`, {
        regenerate_api_key: true,
      });
      if (updated?.api_key) setCompany((c) => (c ? { ...c, api_key: updated.api_key } : null));
      toast.success(t("organizationSettings.apiKeyRegenerated"));
    } catch (error) {
      console.error("Error regenerating API key:", error);
      toast.error(t("organizationSettings.failedToRegenerateApiKey"));
    } finally {
      setRegeneratingKey(false);
    }
  };

  const handleDownloadApiDocs = async () => {
    try {
      const response = await fetch("/docs/openapi.json");
      if (!response.ok) {
        throw new Error("Failed to fetch API documentation");
      }
      const json = await response.json();
      const normalizedSpec = {
        ...json,
        info: {
          ...(json?.info ?? {}),
          title: "PicoBello API",
        },
        // Ensure external tools import the intended default base URL.
        servers: [
          { url: "https://go.picobello.app/api" },
          ...(Array.isArray(json?.servers) ? json.servers.slice(1) : []),
        ],
      };
      const blob = new Blob([JSON.stringify(normalizedSpec, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "picobello-api-documentation.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("API documentation downloaded");
    } catch (error) {
      console.error("Error downloading API documentation:", error);
      toast.error("Failed to download API documentation");
    }
  };

  const fetchMetadataKeys = async () => {
    try {
      const data = await api.get<FileMetadataKey[]>(`/api/companies/${companyId}/files-metadata-keys`);
      setMetadataKeys(data || []);
    } catch (error) {
      console.error("Error fetching metadata keys:", error);
      toast.error(t("organizationSettings.failedToLoadMetadataKeys"));
    }
  };

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return;
    if (newKeyKind === "predefined_list") {
      const opts = newKeyOptions.split("\n").map((s) => s.trim()).filter(Boolean);
      if (opts.length === 0) {
        toast.error(t("organizationSettings.predefinedListNeedsOption"));
        return;
      }
    }
    setCreatingKey(true);
    try {
      const allowed_values =
        newKeyKind === "predefined_list"
          ? newKeyOptions.split("\n").map((s) => s.trim()).filter(Boolean)
          : [];
      await api.post(`/api/companies/${companyId}/files-metadata-keys`, {
        name: newKeyName.trim(),
        value_kind: newKeyKind,
        allowed_values,
      });
      toast.success(t("organizationSettings.metadataKeyCreated"));
      setNewKeyName("");
      setNewKeyKind("free_text");
      setNewKeyOptions("");
      fetchMetadataKeys();
    } catch (error) {
      console.error("Error creating metadata key:", error);
      toast.error(t("organizationSettings.failedToCreateMetadataKey"));
    } finally {
      setCreatingKey(false);
    }
  };

  const openEditKey = (key: FileMetadataKey) => {
    setEditingKey(key);
    setEditKeyName(key.name ?? "");
    setEditKeyKind(key.value_kind === "predefined_list" ? "predefined_list" : "free_text");
    const raw = key.allowed_values;
    const lines = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
    setEditKeyOptions(lines.join("\n"));
    setEditKeyOpen(true);
  };

  const handleSaveKeyEdit = async () => {
    if (!editingKey || !editKeyName.trim()) return;
    if (editKeyKind === "predefined_list") {
      const opts = editKeyOptions.split("\n").map((s) => s.trim()).filter(Boolean);
      if (opts.length === 0) {
        toast.error(t("organizationSettings.predefinedListNeedsOption"));
        return;
      }
    }
    setSavingKeyEdit(true);
    try {
      const allowed_values =
        editKeyKind === "predefined_list"
          ? editKeyOptions.split("\n").map((s) => s.trim()).filter(Boolean)
          : [];
      await api.patch(`/api/companies/${companyId}/files-metadata-keys/${editingKey.id}`, {
        name: editKeyName.trim(),
        value_kind: editKeyKind,
        allowed_values,
      });
      toast.success(t("organizationSettings.metadataKeyUpdated"));
      setEditKeyOpen(false);
      setEditingKey(null);
      fetchMetadataKeys();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "";
      if (
        msg.includes("Cannot remove") ||
        msg.includes("Cannot apply") ||
        msg.includes("Conflict")
      ) {
        toast.error(t("organizationSettings.metadataKeyConflict"));
      } else {
        console.error("Error updating metadata key:", error);
        toast.error(t("organizationSettings.failedToUpdateMetadataKey"));
      }
    } finally {
      setSavingKeyEdit(false);
    }
  };

  const handleDeleteKey = async (id: string) => {
    if (!confirm(t("organizationSettings.deleteKeyConfirm"))) {
      return;
    }
    try {
      await api.delete(`/api/companies/${companyId}/files-metadata-keys/${id}`);
      toast.success(t("organizationSettings.metadataKeyDeleted"));
      fetchMetadataKeys();
    } catch (error) {
      console.error("Error deleting metadata key:", error);
      toast.error(t("organizationSettings.failedToDeleteMetadataKey"));
    }
  };

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  };

  // Don't send logo_url or clear_logo_upload when the current value is our API-served upload path
  // (GET returns /api/portal/{id6}_{slug}/logo). Sending that back would clear the real upload and break the logo.
  const isPortalLogoApiPath = (url: string) =>
    typeof url === "string" && url.trim().startsWith("/api/portal/") && url.trim().endsWith("/logo");
  const isInternalLogoApiPath = (url: string) =>
    typeof url === "string" &&
    /^\/api\/companies\/[a-zA-Z0-9-]+\/internal-logo$/.test(url.trim());
  const isSignedStorageUrl = (url: string) =>
    typeof url === "string" && /X-Amz-Signature|X-Amz-Algorithm|X-Amz-Credential/i.test(url);
  const resolveMediaUrl = (url: string) =>
    url?.startsWith("/")
      ? `${(import.meta.env.VITE_API_URL as string) || ""}${url}`
      : url;

  const fetchPortalTranslations = async () => {
    if (!companyId || !portalEnabled) {
      translationDirtyRef.current = false;
      translationSaveQueuedRef.current = false;
      setTranslationSaveError(null);
      setPortalTranslationRows([]);
      return;
    }
    setLoadingTranslations(true);
    try {
      const data = await api.get<PortalTranslationsResponse>(`/api/companies/${companyId}/portal/translations`);
      translationDirtyRef.current = false;
      translationSaveQueuedRef.current = false;
      setTranslationSaveError(null);
      setPortalTranslationRows(data.rows || []);
      setPortalEnabledLanguages(data.enabled_languages?.length ? data.enabled_languages : ["en"]);
      setPortalDefaultLanguage(data.default_language || "en");
    } catch (error) {
      console.error("Error fetching portal translations:", error);
      toast.error("Failed to load portal translations");
    } finally {
      setLoadingTranslations(false);
    }
  };

  useEffect(() => {
    if (!companyId) return;
    fetchPortalTranslations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, portalEnabled]);

  useEffect(() => {
    portalTranslationRowsRef.current = portalTranslationRows;
  }, [portalTranslationRows]);

  useEffect(() => {
    return () => {
      if (translationAutosaveTimeoutRef.current) {
        clearTimeout(translationAutosaveTimeoutRef.current);
      }
    };
  }, []);

  const flushPortalTranslationAutosave = async () => {
    if (!companyId || !portalEnabled || !translationDirtyRef.current) return;

    if (translationSaveInFlightRef.current) {
      translationSaveQueuedRef.current = true;
      return;
    }

    translationSaveInFlightRef.current = true;
    setSavingTranslations(true);
    setTranslationSaveError(null);

    try {
      const rowsToSave = portalTranslationRowsRef.current.map((row) => ({
        workflow_id: row.workflow_id,
        path: row.path,
        translations: row.translations,
      }));

      await api.put(`/api/companies/${companyId}/portal/translations`, {
        rows: rowsToSave,
      });

      translationDirtyRef.current = false;
    } catch (error: any) {
      setTranslationSaveError(error?.message || "Failed to autosave portal translations");
    } finally {
      setSavingTranslations(false);
      translationSaveInFlightRef.current = false;
      if (translationSaveQueuedRef.current || translationDirtyRef.current) {
        translationSaveQueuedRef.current = false;
        schedulePortalTranslationAutosave(250);
      }
    }
  };

  const schedulePortalTranslationAutosave = (delayMs = 700) => {
    if (translationAutosaveTimeoutRef.current) {
      clearTimeout(translationAutosaveTimeoutRef.current);
    }

    translationAutosaveTimeoutRef.current = setTimeout(() => {
      void flushPortalTranslationAutosave();
    }, delayMs);
  };

  const togglePortalLanguage = (languageCode: PortalLanguageCode, checked: boolean) => {
    setPortalEnabledLanguages((current) => {
      if (checked) {
        if (current.includes(languageCode)) return current;
        return [...current, languageCode];
      }
      const next = current.filter((lang) => lang !== languageCode);
      const safeNext = next.length > 0 ? next : ["en"];
      if (!safeNext.includes(portalDefaultLanguage)) {
        setPortalDefaultLanguage(safeNext[0]);
      }
      return safeNext;
    });
  };

  const updateTranslationCell = (rowId: string, languageCode: PortalLanguageCode, value: string) => {
    setPortalTranslationRows((rows) =>
      rows.map((row) => row.id === rowId
        ? {
            ...row,
            translations: {
              ...row.translations,
              [languageCode]: value,
            },
          }
        : row
      )
    );
    translationDirtyRef.current = true;
    translationSaveQueuedRef.current = true;
    setTranslationSaveError(null);
    schedulePortalTranslationAutosave();
  };

  const handleSavePortal = async () => {
    setSavingPortal(true);
    try {
      const payload: Record<string, unknown> = {
        portal_enabled: portalEnabled,
        slug: portalSlug || null,
        portal_description: portalDescription || null,
        portal_primary_color: portalPrimaryColor || null,
        portal_default_language: portalDefaultLanguage,
        portal_enabled_languages: portalEnabledLanguages,
      };
      const logoValue = portalLogoUrl?.trim() || null;
      if (logoValue != null && !isPortalLogoApiPath(logoValue)) {
        payload.logo_url = logoValue;
        payload.clear_logo_upload = true;
      }
      const updated = await api.patch<Company>(`/api/companies/${companyId}`, payload);
      setCompany((c) => (c ? { ...c, ...updated } : null));
      setPortalLogoUrl(updated.logo_url ?? "");
      toast.success(t("portal.settingsSaved"));
    } catch (error: any) {
      toast.error(error.message || t("portal.failedToSave"));
    } finally {
      setSavingPortal(false);
    }
  };

  const logoPreviewBase =
    portalLogoUrl?.startsWith("/")
      ? `${(import.meta.env.VITE_API_URL as string) || ""}${portalLogoUrl}`
      : portalLogoUrl;
  const logoPreviewSrc =
    logoPreviewBase != null && logoPreviewBase !== ""
      ? `${logoPreviewBase}${logoPreviewBase.includes("?") ? "&" : "?"}v=${logoVersion}`
      : "";

  const handleLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !companyId) return;
    setUploadingLogo(true);
    e.target.value = "";
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.postFormData<{ logo_url: string }>(
        `/api/companies/${companyId}/portal-logo`,
        formData
      );
      setPortalLogoUrl(res.logo_url);
      setLogoVersion((v) => v + 1);
      await fetchCompanyData();
      toast.success(t("portal.settingsSaved"));
    } catch (err: any) {
      toast.error(err.message || t("portal.logoUploadError"));
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (!companyId) return;
    setRemovingLogo(true);
    try {
      await api.delete(`/api/companies/${companyId}/portal-logo`);
      setPortalLogoUrl("");
      await fetchCompanyData();
      toast.success(t("portal.settingsSaved"));
    } catch (err: any) {
      toast.error(err.message || t("portal.failedToSave"));
    } finally {
      setRemovingLogo(false);
    }
  };

  const revokeBrandingLogoObjectUrl = () => {
    if (brandingLogoObjectUrlRef.current) {
      URL.revokeObjectURL(brandingLogoObjectUrlRef.current);
      brandingLogoObjectUrlRef.current = null;
    }
  };

  const setBrandingPreviewFromRawUrl = async (rawUrl: string) => {
    const value = rawUrl?.trim() ?? "";
    if (!value) {
      revokeBrandingLogoObjectUrl();
      setBrandingLogoPreviewUrl("");
      return;
    }
    if (isInternalLogoApiPath(value)) {
      try {
        const blob = await api.getBlob(value);
        revokeBrandingLogoObjectUrl();
        const objectUrl = URL.createObjectURL(blob);
        brandingLogoObjectUrlRef.current = objectUrl;
        setBrandingLogoPreviewUrl(objectUrl);
        return;
      } catch {
        revokeBrandingLogoObjectUrl();
        setBrandingLogoPreviewUrl("");
        return;
      }
    }
    revokeBrandingLogoObjectUrl();
    setBrandingLogoPreviewUrl(resolveMediaUrl(value));
  };

  const brandingLogoPreviewSrc =
    brandingLogoPreviewUrl && brandingLogoPreviewUrl.trim() !== ""
      ? (brandingLogoPreviewUrl.startsWith("blob:")
          ? brandingLogoPreviewUrl
          : `${brandingLogoPreviewUrl}${brandingLogoPreviewUrl.includes("?") ? "&" : "?"}v=${brandingLogoVersion}`)
      : "";

  const handleSaveBranding = async () => {
    if (!companyId) return;
    setSavingBranding(true);
    try {
      const payload: Record<string, unknown> = {
        internal_primary_color: brandingPrimaryColor || null,
      };
      const logoValue = brandingLogoUrl?.trim() || null;
      if (logoValue != null && !isSignedStorageUrl(logoValue) && !isInternalLogoApiPath(logoValue)) {
        payload.internal_logo_url = logoValue;
        payload.clear_internal_logo_upload = true;
      }
      if (logoValue == null) {
        payload.internal_logo_url = null;
        payload.clear_internal_logo_upload = true;
      }
      const updated = await api.patch<Company>(`/api/companies/${companyId}`, payload);
      setCompany((c) => (c ? { ...c, ...updated } : null));
      setBrandingLogoUrl(updated.internal_logo_url ?? "");
      await setBrandingPreviewFromRawUrl(updated.internal_logo_url ?? "");
      setBrandingPrimaryColor(updated.internal_primary_color ?? "#3B82F6");
      toast.success(t("organizationSettings.branding.saved"));
    } catch (error: any) {
      toast.error(error.message || t("organizationSettings.branding.saveError"));
    } finally {
      setSavingBranding(false);
    }
  };

  const handleBrandingLogoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !companyId) return;
    setUploadingBrandingLogo(true);
    e.target.value = "";
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.postFormData<{ internal_logo_url: string }>(
        `/api/companies/${companyId}/internal-logo`,
        formData
      );
      setBrandingLogoUrl(res.internal_logo_url);
      await setBrandingPreviewFromRawUrl(res.internal_logo_url);
      setBrandingLogoVersion((v) => v + 1);
      await fetchCompanyData();
      toast.success(t("organizationSettings.branding.saved"));
    } catch (err: any) {
      toast.error(err.message || t("organizationSettings.branding.logoUploadError"));
    } finally {
      setUploadingBrandingLogo(false);
    }
  };

  const handleRemoveBrandingLogo = async () => {
    if (!companyId) return;
    setRemovingBrandingLogo(true);
    try {
      await api.delete(`/api/companies/${companyId}/internal-logo`);
      setBrandingLogoUrl("");
      setBrandingLogoPreviewUrl("");
      revokeBrandingLogoObjectUrl();
      await fetchCompanyData();
      toast.success(t("organizationSettings.branding.saved"));
    } catch (err: any) {
      toast.error(err.message || t("organizationSettings.branding.saveError"));
    } finally {
      setRemovingBrandingLogo(false);
    }
  };

  useEffect(() => {
    setBrandingPreviewFromRawUrl(brandingLogoUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandingLogoUrl]);

  useEffect(() => {
    return () => {
      revokeBrandingLogoObjectUrl();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const portalUrl =
    company && portalSlug
      ? `${window.location.origin}/portal/${company.id.slice(0, 6)}_${portalSlug}`
      : "";

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">{t("organizationSettings.loadingSettings")}</div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">{t("organizationSettings.organizationNotFound")}</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("organizationSettings.title")}</h1>
          <p className="text-muted-foreground mt-1">
            {t("organizationSettings.subtitle")}
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate(-1)}>
          {t("common.back")}
        </Button>
      </div>

      <Tabs defaultValue="api" className="space-y-6">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-2 md:grid-cols-5">
          <TabsTrigger value="api">{t("organizationSettings.tabs.api")}</TabsTrigger>
          <TabsTrigger value="mcp">{t("organizationSettings.tabs.mcp")}</TabsTrigger>
          <TabsTrigger value="metadata">{t("organizationSettings.tabs.metadata")}</TabsTrigger>
          <TabsTrigger value="portal">{t("organizationSettings.tabs.portal")}</TabsTrigger>
          <TabsTrigger value="branding">{t("organizationSettings.tabs.branding")}</TabsTrigger>
        </TabsList>

        <TabsContent value="api" className="space-y-6 mt-0">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Supabase Credentials */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  {t("organizationSettings.apiAuthentication")}
                </CardTitle>
                <CardDescription>
                  {t("organizationSettings.apiAuthDesc")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <Shield className="h-4 w-4" />
                  <AlertDescription>
                    {t("organizationSettings.credentialsSafe")}
                  </AlertDescription>
                </Alert>

                <div className="space-y-2">
                  <Label htmlFor="api-base-url">{t("organizationSettings.baseApiUrl")}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="api-base-url"
                      value={import.meta.env.VITE_API_URL ?? ""}
                      disabled
                      className="bg-muted font-mono text-sm"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        copyToClipboard(import.meta.env.VITE_API_URL ?? "", t("organizationSettings.baseApiUrl"))
                      }
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* API Key Management */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  {t("organizationSettings.companyApiKey")}
                </CardTitle>
                <CardDescription>
                  {t("organizationSettings.companyApiKeyDesc")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <Shield className="h-4 w-4" />
                  <AlertDescription>
                    {t("organizationSettings.keepApiKeySecure")}
                  </AlertDescription>
                </Alert>

                <div className="space-y-2">
                  <Label htmlFor="api-key">{t("organizationSettings.companyApiKey")}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="api-key"
                      type={showApiKey ? "text" : "password"}
                      value={company.api_key}
                      disabled
                      className="bg-muted font-mono text-sm"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowApiKey(!showApiKey)}
                    >
                      {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(company.api_key, t("organizationSettings.companyApiKey"))}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <Button
                    variant="destructive"
                    onClick={regenerateApiKey}
                    disabled={regeneratingKey}
                    className="w-full"
                  >
                    {regeneratingKey ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        {t("organizationSettings.regenerating")}
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        {t("organizationSettings.regenerateApiKey")}
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* API Usage Instructions */}
          <Card>
            <CardHeader>
              <CardTitle>{t("organizationSettings.apiUsage")}</CardTitle>
              <CardDescription>
                {t("organizationSettings.apiUsageDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>{t("organizationSettings.endpointUrl")}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={`${import.meta.env.VITE_API_URL ?? ""}/api/workflows/{workflow_id}/trigger`}
                    disabled
                    className="bg-muted font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(`${import.meta.env.VITE_API_URL ?? ""}/api/workflows/{workflow_id}/trigger`, t("organizationSettings.endpointUrl"))}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t("organizationSettings.exampleCurlRequest")}</Label>
                <Textarea
                  value={`curl -X POST ${import.meta.env.VITE_API_URL ?? ""}/api/workflows/YOUR_WORKFLOW_ID/trigger \\
  -H "x-api-key: ${company?.api_key ?? ""}" \\
  -H "Content-Type: application/json" \\
  -d '{"data": {"customer_name": "John Doe", "order_amount": 150.00}}'`}
                  disabled
                  className="bg-muted font-mono text-xs h-40"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(`curl -X POST ${import.meta.env.VITE_API_URL ?? ""}/api/workflows/YOUR_WORKFLOW_ID/trigger -H "x-api-key: ${company?.api_key ?? ""}" -H "Content-Type: application/json" -d '{"data": {"customer_name": "John Doe", "order_amount": 150.00}}'`, t("organizationSettings.copyExample"))}
                >
                  <Copy className="h-4 w-4 mr-2" />
                  {t("organizationSettings.copyExample")}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                API Documentation
              </CardTitle>
              <CardDescription>
                Download the complete OpenAPI/Swagger specification for the Picobello API
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex-1">
                  <p className="mb-2 text-sm text-muted-foreground">
                    The API documentation includes detailed information about all API endpoints including:
                  </p>
                  <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                    <li>Workflow triggering and execution management</li>
                    <li>Decision making and step completion</li>
                    <li>Execution data updates and retrieval</li>
                    <li>User information and utility functions</li>
                    <li>AI-powered workflow creation and audio transcription</li>
                  </ul>
                </div>
                <Button variant="outline" onClick={handleDownloadApiDocs} className="md:ml-4">
                  <Download className="h-4 w-4 mr-2" />
                  Download OpenAPI Spec
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mcp" className="space-y-6 mt-0">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {t("organizationSettings.mcp.title")}
              </CardTitle>
              <CardDescription>
                {t("organizationSettings.mcp.description")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <h3 className="text-sm font-medium">{t("organizationSettings.mcp.whatIsTitle")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("organizationSettings.mcp.whatIsBody")}
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-medium">{t("organizationSettings.mcp.howToUseTitle")}</h3>
                <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
                  <li>{t("organizationSettings.mcp.step1")}</li>
                  <li>{t("organizationSettings.mcp.step2")}</li>
                  <li>{t("organizationSettings.mcp.step3")}</li>
                </ul>
              </div>

              <Alert>
                <Shield className="h-4 w-4" />
                <AlertDescription>
                  {t("organizationSettings.mcp.securityNote")}
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="metadata" className="space-y-6 mt-0">
          {/* Organization Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="h-5 w-5" />
                {t("organizationSettings.organizationInformation")}
              </CardTitle>
              <CardDescription>
                {t("organizationSettings.organizationInfoDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="org-name">{t("organizationSettings.organizationName")}</Label>
                <Input
                  id="org-name"
                  value={company.name}
                  disabled
                  className="bg-muted"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-id">{t("organizationSettings.organizationId")}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="org-id"
                    value={company.id}
                    disabled
                    className="bg-muted font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(company.id, t("organizationSettings.organizationId"))}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("organizationSettings.created")}</Label>
                <p className="text-sm text-muted-foreground pt-2">
                  {new Date(company.created_at).toLocaleDateString()}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* File Metadata Keys */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {t("organizationSettings.fileMetadataKeys")}
              </CardTitle>
              <CardDescription>
                {t("organizationSettings.fileMetadataKeysDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3 p-3 border rounded-md bg-muted/30">
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    placeholder={t("organizationSettings.newKeyNamePlaceholder")}
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleCreateKey();
                      }
                    }}
                    className="flex-1"
                  />
                  <Select
                    value={newKeyKind}
                    onValueChange={(v: "free_text" | "predefined_list") => setNewKeyKind(v)}
                  >
                    <SelectTrigger className="w-full sm:w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="free_text">{t("organizationSettings.metadataTypeFreeText")}</SelectItem>
                      <SelectItem value="predefined_list">{t("organizationSettings.metadataTypePredefined")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {newKeyKind === "predefined_list" && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{t("organizationSettings.predefinedOptionsLabel")}</Label>
                    <Textarea
                      value={newKeyOptions}
                      onChange={(e) => setNewKeyOptions(e.target.value)}
                      placeholder={t("organizationSettings.predefinedOptionsPlaceholder")}
                      rows={4}
                      className="font-mono text-sm"
                    />
                  </div>
                )}
                <Button
                  onClick={handleCreateKey}
                  disabled={creatingKey || !newKeyName.trim()}
                  className="w-full sm:w-auto"
                >
                  {creatingKey ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                  {t("organizationSettings.addMetadataKey")}
                </Button>
              </div>

              <div className="space-y-2">
                {metadataKeys.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {t("organizationSettings.noMetadataKeysDefined")}
                  </p>
                )}
                {metadataKeys.map((key) => (
                  <div key={key.id} className="flex items-center justify-between gap-2 p-2 border rounded-md bg-muted/50">
                    <div className="min-w-0 flex flex-col gap-0.5">
                      <span className="text-sm font-medium truncate">{key.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {key.value_kind === "predefined_list"
                          ? t("organizationSettings.metadataTypePredefined")
                          : t("organizationSettings.metadataTypeFreeText")}
                      </span>
                    </div>
                    <div className="flex items-center shrink-0 gap-1">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEditKey(key)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeleteKey(key.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <Dialog open={editKeyOpen} onOpenChange={setEditKeyOpen}>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>{t("organizationSettings.editMetadataKey")}</DialogTitle>
                    <DialogDescription>{t("organizationSettings.editMetadataKeyDesc")}</DialogDescription>
                  </DialogHeader>
                  {editingKey && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>{t("common.name")}</Label>
                        <Input value={editKeyName} onChange={(e) => setEditKeyName(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label>{t("common.type")}</Label>
                        <Select
                          value={editKeyKind}
                          onValueChange={(v: "free_text" | "predefined_list") => setEditKeyKind(v)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="free_text">{t("organizationSettings.metadataTypeFreeText")}</SelectItem>
                            <SelectItem value="predefined_list">{t("organizationSettings.metadataTypePredefined")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {editKeyKind === "predefined_list" && (
                        <div className="space-y-2">
                          <Label>{t("organizationSettings.predefinedOptionsLabel")}</Label>
                          <Textarea
                            value={editKeyOptions}
                            onChange={(e) => setEditKeyOptions(e.target.value)}
                            placeholder={t("organizationSettings.predefinedOptionsPlaceholder")}
                            rows={6}
                            className="font-mono text-sm"
                          />
                        </div>
                      )}
                    </div>
                  )}
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setEditKeyOpen(false)}>
                      {t("common.cancel")}
                    </Button>
                    <Button onClick={handleSaveKeyEdit} disabled={savingKeyEdit || !editKeyName.trim()}>
                      {savingKeyEdit ? <RefreshCw className="h-4 w-4 animate-spin" /> : null}
                      {t("common.save")}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="portal" className="space-y-6 mt-0">
          {/* Public Portal Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                {t("portal.settingsTitle")}
              </CardTitle>
              <CardDescription>
                {t("portal.settingsDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Enable toggle */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>{t("portal.enablePortal")}</Label>
                  <p className="text-sm text-muted-foreground">{t("portal.enablePortalDesc")}</p>
                </div>
                <Switch checked={portalEnabled} onCheckedChange={setPortalEnabled} />
              </div>

              {portalEnabled && (
                <>
                  <Separator />

                  {/* Slug */}
                  <div className="space-y-2">
                    <Label htmlFor="portal-slug">{t("portal.portalUrl")}</Label>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-muted-foreground whitespace-nowrap">{window.location.origin}/portal/</span>
                      {company && (
                        <span className="text-sm text-muted-foreground font-mono whitespace-nowrap">
                          {company.id.slice(0, 6)}_
                        </span>
                      )}
                      <Input
                        id="portal-slug"
                        value={portalSlug}
                        onChange={(e) => setPortalSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                        placeholder="my-company"
                        className="font-mono"
                      />
                      {company && !portalSlug && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPortalSlug(generateSlug(company.name))}
                        >
                          {t("portal.generate")}
                        </Button>
                      )}
                    </div>
                    {portalUrl && (
                      <div className="flex items-center gap-2 mt-1">
                        <a
                          href={portalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                        >
                          {portalUrl}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => copyToClipboard(portalUrl, t("portal.portalUrl"))}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Logo: upload or URL */}
                  <div className="space-y-2">
                    <Label>{t("portal.logoUrl")}</Label>
                    <div className="flex flex-wrap items-center gap-3">
                      <input
                        ref={logoFileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/svg+xml,image/webp"
                        className="sr-only"
                        disabled={uploadingLogo || !portalSlug?.trim()}
                        onChange={handleLogoFileChange}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={uploadingLogo || !portalSlug?.trim()}
                        onClick={() => logoFileInputRef.current?.click()}
                      >
                        {uploadingLogo ? (
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4 mr-2" />
                        )}
                        {t("portal.uploadLogo")}
                      </Button>
                      {portalLogoUrl && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={removingLogo}
                          onClick={handleRemoveLogo}
                        >
                          {removingLogo ? <RefreshCw className="h-4 w-4 animate-spin" /> : t("portal.removeLogo")}
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{t("portal.uploadLogoDesc")}</p>
                    {!portalSlug?.trim() && (
                      <p className="text-xs text-amber-600 dark:text-amber-500">
                        {t("portal.logoUploadError")}
                      </p>
                    )}
                    {portalLogoUrl && (
                      <div className="mt-2">
                        <img
                          src={logoPreviewSrc ? logoPreviewSrc : undefined}
                          alt="Logo preview"
                          className="h-12 w-12 object-contain rounded border"
                          onError={(e) => (e.currentTarget.style.display = "none")}
                        />
                      </div>
                    )}
                    <div className="pt-1">
                      <button
                        type="button"
                        className="text-sm text-muted-foreground hover:underline"
                        onClick={() => setShowLogoUrlInput((v) => !v)}
                      >
                        {t("portal.orUseUrl")}
                      </button>
                      {showLogoUrlInput && (
                        <div className="mt-2 flex flex-col gap-2">
                          <Input
                            id="portal-logo-url"
                            value={portalLogoUrl}
                            onChange={(e) => setPortalLogoUrl(e.target.value)}
                            placeholder="https://example.com/logo.png"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Description */}
                  <div className="space-y-2">
                    <Label htmlFor="portal-description">{t("portal.description")}</Label>
                    <Textarea
                      id="portal-description"
                      value={portalDescription}
                      onChange={(e) => setPortalDescription(e.target.value)}
                      placeholder={t("portal.descriptionPlaceholder")}
                      rows={3}
                    />
                  </div>

                  <div className="space-y-3">
                    <Label>Portal languages</Label>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {PORTAL_LANGUAGES.map((language) => {
                        const isSelected = portalEnabledLanguages.includes(language.code);
                        return (
                          <label
                            key={language.code}
                            className={`group flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 text-sm transition-colors ${isSelected
                              ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                              : "border-border bg-card hover:border-primary/40 hover:bg-accent/30"
                              }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(event) => togglePortalLanguage(language.code, event.target.checked)}
                              className="h-4 w-4 shrink-0 accent-primary"
                            />
                            <span className="text-lg leading-none">{PORTAL_LANGUAGE_FLAGS[language.code]}</span>
                            <span className="flex min-w-0 flex-col">
                              <span className="font-medium text-foreground">{language.label}</span>
                              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                {language.code}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="portal-default-language">Default language</Label>
                      <Select
                        value={portalDefaultLanguage}
                        onValueChange={(value: PortalLanguageCode) => setPortalDefaultLanguage(value)}
                      >
                        <SelectTrigger id="portal-default-language" className="w-full md:w-[260px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {portalEnabledLanguages.map((languageCode) => (
                            <SelectItem key={languageCode} value={languageCode}>
                              {PORTAL_LANGUAGE_LABELS[languageCode]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Primary Color */}
                  <div className="space-y-2">
                    <Label htmlFor="portal-color">{t("portal.primaryColor")}</Label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        id="portal-color"
                        value={portalPrimaryColor}
                        onChange={(e) => setPortalPrimaryColor(e.target.value)}
                        className="h-12 w-12 rounded border cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <Label>Form translations</Label>
                        <p className="text-xs text-muted-foreground">
                          Auto-generated from all portal-enabled forms.
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={fetchPortalTranslations}
                        disabled={loadingTranslations}
                      >
                        {loadingTranslations ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Refresh"}
                      </Button>
                    </div>
                    <div className="max-h-[420px] overflow-auto border rounded-md">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-background z-10">
                          <tr className="border-b">
                            <th className="text-left p-2 min-w-[220px]">Field</th>
                            <th className="text-left p-2 min-w-[200px]">Source</th>
                            {portalEnabledLanguages.map((languageCode) => (
                              <th key={languageCode} className="text-left p-2 min-w-[180px]">
                                {PORTAL_LANGUAGE_LABELS[languageCode]}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {portalTranslationRows.length === 0 ? (
                            <tr>
                              <td colSpan={2 + portalEnabledLanguages.length} className="p-4 text-center text-muted-foreground">
                                {loadingTranslations ? "Loading translations..." : "No translatable fields found in portal-enabled workflows."}
                              </td>
                            </tr>
                          ) : (
                            portalTranslationRows.map((row) => (
                              <tr key={row.id} className="border-b align-top">
                                <td className="p-2">
                                  <div className="font-medium">{getPortalTranslationLabel(row.label)}</div>
                                  <div className="text-xs text-muted-foreground">{row.workflow_name}</div>
                                </td>
                                <td className="p-2 text-muted-foreground">{row.source_text || "-"}</td>
                                {portalEnabledLanguages.map((languageCode) => (
                                  <td key={`${row.id}:${languageCode}`} className="p-2">
                                    <Input
                                      value={row.translations?.[languageCode] || ""}
                                      onChange={(event) => updateTranslationCell(row.id, languageCode, event.target.value)}
                                      placeholder={row.source_text || "Translation"}
                                    />
                                  </td>
                                ))}
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-muted-foreground" aria-live="polite">
                      {translationSaveError
                        ? translationSaveError
                        : savingTranslations
                          ? "Saving translations..."
                          : "Changes are autosaved."}
                    </p>
                  </div>

                  <div className="pt-2">
                    <Button onClick={handleSavePortal} disabled={savingPortal}>
                      {savingPortal ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          {t("common.saving")}
                        </>
                      ) : (
                        t("portal.saveSettings")
                      )}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="branding" className="space-y-6 mt-0">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5" />
                {t("organizationSettings.branding.title")}
              </CardTitle>
              <CardDescription>{t("organizationSettings.branding.description")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>{t("organizationSettings.branding.logoLabel")}</Label>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    ref={brandingLogoFileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    className="sr-only"
                    disabled={uploadingBrandingLogo}
                    onChange={handleBrandingLogoFileChange}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={uploadingBrandingLogo}
                    onClick={() => brandingLogoFileInputRef.current?.click()}
                  >
                    {uploadingBrandingLogo ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    {t("organizationSettings.branding.uploadLogo")}
                  </Button>
                  {brandingLogoUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={removingBrandingLogo}
                      onClick={handleRemoveBrandingLogo}
                    >
                      {removingBrandingLogo ? <RefreshCw className="h-4 w-4 animate-spin" /> : t("organizationSettings.branding.removeLogo")}
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{t("organizationSettings.branding.uploadLogoDesc")}</p>
                {brandingLogoUrl && (
                  <div className="mt-2">
                    <img
                      src={brandingLogoPreviewSrc || undefined}
                      alt={t("organizationSettings.branding.logoPreview")}
                      className="h-12 w-12 object-contain rounded border"
                      onError={(e) => (e.currentTarget.style.display = "none")}
                    />
                  </div>
                )}
                <div className="pt-1">
                  <button
                    type="button"
                    className="text-sm text-muted-foreground hover:underline"
                    onClick={() => setShowBrandingLogoUrlInput((v) => !v)}
                  >
                    {t("organizationSettings.branding.useLogoUrl")}
                  </button>
                  {showBrandingLogoUrlInput && (
                    <div className="mt-2 flex flex-col gap-2">
                      <Input
                        id="internal-logo-url"
                        value={brandingLogoUrl}
                        onChange={(e) => setBrandingLogoUrl(e.target.value)}
                        placeholder="https://example.com/logo.png"
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="branding-color">{t("organizationSettings.branding.primaryColor")}</Label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    id="branding-color"
                    value={brandingPrimaryColor}
                    onChange={(e) => setBrandingPrimaryColor(e.target.value)}
                    className="h-12 w-12 rounded border cursor-pointer"
                  />
                </div>
              </div>

              <Card className="border-dashed">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">{t("organizationSettings.branding.previewTitle")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3">
                    {brandingLogoPreviewSrc ? (
                      <img
                        src={brandingLogoPreviewSrc}
                        alt={t("organizationSettings.branding.logoPreview")}
                        className="h-10 w-10 rounded border bg-background object-contain"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded border bg-muted flex items-center justify-center text-xs text-muted-foreground">
                        {t("organizationSettings.branding.logoPreviewEmpty")}
                      </div>
                    )}
                    <div className="text-sm">
                      <div className="font-medium">{company.name}</div>
                      <div className="text-muted-foreground">{t("organizationSettings.branding.previewSubtitle")}</div>
                    </div>
                  </div>
                  <Button
                    type="button"
                    style={{ backgroundColor: brandingPrimaryColor, borderColor: brandingPrimaryColor }}
                    className="text-white hover:opacity-90"
                  >
                    {t("organizationSettings.branding.previewButton")}
                  </Button>
                </CardContent>
              </Card>

              <div className="pt-2">
                <Button onClick={handleSaveBranding} disabled={savingBranding}>
                  {savingBranding ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      {t("common.saving")}
                    </>
                  ) : (
                    t("organizationSettings.branding.saveSettings")
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div >
  );
}
