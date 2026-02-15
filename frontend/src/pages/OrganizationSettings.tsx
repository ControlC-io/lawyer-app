import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, Eye, EyeOff, RefreshCw, Key, Shield, Users, Building, FileText, Trash2, Plus, Globe, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useCompanyId } from "@/hooks/useCompanyId";
import { useLanguage } from "@/contexts/LanguageContext";

interface Company {
  id: string;
  name: string;
  api_key: string;
  created_at: string;
  slug?: string | null;
  logo_url?: string | null;
  portal_description?: string | null;
  portal_primary_color?: string | null;
  portal_enabled?: boolean;
}

interface User {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
}

export default function OrganizationSettings() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const companyId = useCompanyId();
  const [company, setCompany] = useState<Company | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showApiKey, setShowApiKey] = useState(false);
  const [regeneratingKey, setRegeneratingKey] = useState(false);

  const [metadataKeys, setMetadataKeys] = useState<Array<{ id: string; name: string }>>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [creatingKey, setCreatingKey] = useState(false);

  // Portal settings state
  const [portalEnabled, setPortalEnabled] = useState(false);
  const [portalSlug, setPortalSlug] = useState("");
  const [portalLogoUrl, setPortalLogoUrl] = useState("");
  const [portalDescription, setPortalDescription] = useState("");
  const [portalPrimaryColor, setPortalPrimaryColor] = useState("#3B82F6");
  const [savingPortal, setSavingPortal] = useState(false);

  useEffect(() => {
    if (companyId) {
      fetchCompanyData();
      fetchUsers();
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
    } catch (error) {
      console.error("Error fetching company data:", error);
      toast.error(t("organizationSettings.failedToLoadOrganization"));
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const data = await api.get<User[]>(`/api/companies/${companyId}/users`);
      setUsers(data || []);
    } catch (error) {
      console.error("Error fetching users:", error);
      toast.error(t("organizationSettings.failedToLoadUsers"));
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

  const fetchMetadataKeys = async () => {
    try {
      const data = await api.get<{ id: string; name: string }[]>(
        `/api/companies/${companyId}/files-metadata-keys`
      );
      setMetadataKeys(data || []);
    } catch (error) {
      console.error("Error fetching metadata keys:", error);
      toast.error(t("organizationSettings.failedToLoadMetadataKeys"));
    }
  };

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return;
    setCreatingKey(true);
    try {
      await api.post(`/api/companies/${companyId}/files-metadata-keys`, {
        name: newKeyName.trim(),
      });
      toast.success(t("organizationSettings.metadataKeyCreated"));
      setNewKeyName("");
      fetchMetadataKeys();
    } catch (error) {
      console.error("Error creating metadata key:", error);
      toast.error(t("organizationSettings.failedToCreateMetadataKey"));
    } finally {
      setCreatingKey(false);
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

  const handleSavePortal = async () => {
    setSavingPortal(true);
    try {
      const updated = await api.patch<Company>(`/api/companies/${companyId}`, {
        portal_enabled: portalEnabled,
        slug: portalSlug || null,
        logo_url: portalLogoUrl || null,
        portal_description: portalDescription || null,
        portal_primary_color: portalPrimaryColor || null,
      });
      setCompany((c) => (c ? { ...c, ...updated } : null));
      toast.success(t("portal.settingsSaved"));
    } catch (error: any) {
      toast.error(error.message || t("portal.failedToSave"));
    } finally {
      setSavingPortal(false);
    }
  };

  const portalUrl = portalSlug ? `${window.location.origin}/portal/${portalSlug}` : "";

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
          <div className="flex gap-2">
            <Input
              placeholder={t("organizationSettings.newKeyNamePlaceholder")}
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleCreateKey();
                }
              }}
            />
            <Button onClick={handleCreateKey} disabled={creatingKey || !newKeyName.trim()}>
              {creatingKey ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </Button>
          </div>

          <div className="space-y-2">
            {metadataKeys.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                {t("organizationSettings.noMetadataKeysDefined")}
              </p>
            )}
            {metadataKeys.map((key) => (
              <div key={key.id} className="flex items-center justify-between p-2 border rounded-md bg-muted/50">
                <span className="text-sm font-medium">{key.name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDeleteKey(key.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>


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

          <Separator />

          {/* Slug */}
          <div className="space-y-2">
            <Label htmlFor="portal-slug">{t("portal.portalUrl")}</Label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">{window.location.origin}/portal/</span>
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

          {/* Logo URL */}
          <div className="space-y-2">
            <Label htmlFor="portal-logo">{t("portal.logoUrl")}</Label>
            <Input
              id="portal-logo"
              value={portalLogoUrl}
              onChange={(e) => setPortalLogoUrl(e.target.value)}
              placeholder="https://example.com/logo.png"
            />
            {portalLogoUrl && (
              <div className="mt-2">
                <img
                  src={portalLogoUrl}
                  alt="Logo preview"
                  className="h-12 w-12 object-contain rounded border"
                  onError={(e) => (e.currentTarget.style.display = "none")}
                />
              </div>
            )}
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

          {/* Primary Color */}
          <div className="space-y-2">
            <Label htmlFor="portal-color">{t("portal.primaryColor")}</Label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                id="portal-color"
                value={portalPrimaryColor}
                onChange={(e) => setPortalPrimaryColor(e.target.value)}
                className="h-10 w-10 rounded border cursor-pointer"
              />
              <Input
                value={portalPrimaryColor}
                onChange={(e) => setPortalPrimaryColor(e.target.value)}
                placeholder="#3B82F6"
                className="w-32 font-mono"
              />
              <div
                className="h-10 flex-1 rounded border"
                style={{ backgroundColor: portalPrimaryColor }}
              />
            </div>
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
        </CardContent>
      </Card>

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

      {/* Team Members */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t("organizationSettings.teamMembers")}
          </CardTitle>
          <CardDescription>
            {t("organizationSettings.teamMembersDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {users.map((user) => (
              <div key={user.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                    <span className="text-sm font-medium">
                      {(user.full_name || user.email).charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium">{user.full_name || t("organizationSettings.noName")}</p>
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                  </div>
                </div>
                <Badge variant={user.role === 'company_admin' ? 'default' : 'secondary'}>
                  {user.role === 'company_admin' ? t("organizationSettings.admin") : t("organizationSettings.user")}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div >
  );
}
