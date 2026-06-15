import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, RefreshCw, Building, Upload, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useCompanyId } from "@/hooks/useCompanyId";
import { useLanguage } from "@/contexts/LanguageContext";

interface Company {
  id: string;
  name: string;
  created_at: string;
  internal_logo_url?: string | null;
  internal_primary_color?: string | null;
}

export default function OrganizationSettings() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const companyId = useCompanyId();
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    if (companyId) {
      void fetchCompanyData();
    }
  }, [companyId]);

  const fetchCompanyData = async () => {
    try {
      const data = await api.get<Company>(`/api/companies/${companyId}`);
      setCompany(data);
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

  const isInternalLogoApiPath = (url: string) =>
    typeof url === "string" &&
    /^\/api\/companies\/[a-zA-Z0-9-]+\/internal-logo$/.test(url.trim());
  const isSignedStorageUrl = (url: string) =>
    typeof url === "string" && /X-Amz-Signature|X-Amz-Algorithm|X-Amz-Credential/i.test(url);
  const resolveMediaUrl = (url: string) =>
    url?.startsWith("/")
      ? `${(import.meta.env.VITE_API_URL as string) || ""}${url}`
      : url;

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
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : t("organizationSettings.branding.saveError");
      toast.error(msg);
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("organizationSettings.branding.logoUploadError");
      toast.error(msg);
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("organizationSettings.branding.saveError");
      toast.error(msg);
    } finally {
      setRemovingBrandingLogo(false);
    }
  };

  useEffect(() => {
    void setBrandingPreviewFromRawUrl(brandingLogoUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brandingLogoUrl]);

  useEffect(() => {
    return () => {
      revokeBrandingLogoObjectUrl();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          <p className="text-muted-foreground mt-1">{t("organizationSettings.subtitle")}</p>
        </div>
        <Button variant="outline" onClick={() => navigate(-1)}>
          {t("common.back")}
        </Button>
      </div>

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="grid h-auto w-full grid-cols-1 gap-2 md:grid-cols-2">
          <TabsTrigger value="general">{t("organizationSettings.tabs.general")}</TabsTrigger>
          <TabsTrigger value="branding">{t("organizationSettings.tabs.branding")}</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6 mt-0">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="h-5 w-5" />
                {t("organizationSettings.organizationInformation")}
              </CardTitle>
              <CardDescription>{t("organizationSettings.organizationInfoDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="org-name">{t("organizationSettings.organizationName")}</Label>
                <Input id="org-name" value={company.name} disabled className="bg-muted" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-id">{t("organizationSettings.organizationId")}</Label>
                <div className="flex items-center gap-2">
                  <Input id="org-id" value={company.id} disabled className="bg-muted font-mono text-sm" />
                  <Button variant="outline" size="sm" onClick={() => copyToClipboard(company.id, t("organizationSettings.organizationId"))}>
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
                  <Button type="button" variant="outline" disabled={uploadingBrandingLogo} onClick={() => brandingLogoFileInputRef.current?.click()}>
                    {uploadingBrandingLogo ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                    {t("organizationSettings.branding.uploadLogo")}
                  </Button>
                  {brandingLogoUrl && (
                    <Button type="button" variant="ghost" size="sm" disabled={removingBrandingLogo} onClick={handleRemoveBrandingLogo}>
                      {removingBrandingLogo ? <RefreshCw className="h-4 w-4 animate-spin" /> : t("organizationSettings.branding.removeLogo")}
                    </Button>
                  )}
                </div>
                {brandingLogoUrl && (
                  <img
                    src={brandingLogoPreviewSrc || undefined}
                    alt={t("organizationSettings.branding.logoPreview")}
                    className="h-12 w-12 object-contain rounded border mt-2"
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                  />
                )}
                <button type="button" className="text-sm text-muted-foreground hover:underline" onClick={() => setShowBrandingLogoUrlInput((v) => !v)}>
                  {t("organizationSettings.branding.useLogoUrl")}
                </button>
                {showBrandingLogoUrlInput && (
                  <Input
                    value={brandingLogoUrl}
                    onChange={(e) => setBrandingLogoUrl(e.target.value)}
                    placeholder="https://example.com/logo.png"
                    className="mt-2"
                  />
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="branding-color">{t("organizationSettings.branding.primaryColor")}</Label>
                <input
                  type="color"
                  id="branding-color"
                  value={brandingPrimaryColor}
                  onChange={(e) => setBrandingPrimaryColor(e.target.value)}
                  className="h-12 w-12 rounded border cursor-pointer"
                />
              </div>

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
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
