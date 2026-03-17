import { useState, useEffect } from "react";
import { Plus, Building2, Copy, Check, UserPlus, Link, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";

interface CompanyListItem {
  id: string;
  name: string;
  is_active?: boolean;
}

interface CreatedCompany {
  id: string;
  name: string;
  created_at: string;
  api_key: string;
  is_active: boolean;
}

interface CompanyDetail {
  id: string;
  name: string;
  created_at: string;
  api_key?: string | null;
  has_api_key?: boolean;
  is_active?: boolean | null;
  slug?: string | null;
  logo_url?: string | null;
  portal_description?: string | null;
  portal_primary_color?: string | null;
  portal_enabled?: boolean;
}

interface CompanyUser {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
}

export default function Companies() {
  const { t } = useLanguage();
  const [companies, setCompanies] = useState<CompanyListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdCompany, setCreatedCompany] = useState<CreatedCompany | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // Company detail sheet (super admin)
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [companyDetail, setCompanyDetail] = useState<CompanyDetail | null>(null);
  const [companyUsers, setCompanyUsers] = useState<CompanyUser[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [detailForm, setDetailForm] = useState({ name: "", is_active: true, slug: "" });
  const [regeneratingKey, setRegeneratingKey] = useState(false);

  // Create user dialog (super admin)
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [createUserEmail, setCreateUserEmail] = useState("");
  const [createUserPassword, setCreateUserPassword] = useState("");
  const [createUserFullName, setCreateUserFullName] = useState("");
  const [createUserRole, setCreateUserRole] = useState<"user" | "company_admin">("user");
  const [creatingUser, setCreatingUser] = useState(false);

  // Add existing user dialog (super admin)
  const [addExistingOpen, setAddExistingOpen] = useState(false);
  const [addExistingEmail, setAddExistingEmail] = useState("");
  const [addExistingRole, setAddExistingRole] = useState<"user" | "company_admin">("user");
  const [addingExisting, setAddingExisting] = useState(false);

  const fetchCompanies = async () => {
    try {
      const list = await api.get<CompanyListItem[]>("/api/companies");
      setCompanies(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load companies");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, []);

  useEffect(() => {
    if (!selectedCompanyId) {
      setCompanyDetail(null);
      setCompanyUsers([]);
      return;
    }
    let cancelled = false;
    setLoadingDetail(true);
    Promise.all([
      api.get<CompanyDetail>(`/api/companies/${selectedCompanyId}`),
      api.get<CompanyUser[]>(`/api/companies/${selectedCompanyId}/users`),
    ])
      .then(([company, users]) => {
        if (!cancelled) {
          setCompanyDetail(company);
          setCompanyUsers(users || []);
          setDetailForm({
            name: company.name,
            is_active: company.is_active ?? true,
            slug: company.slug ?? "",
          });
        }
      })
      .catch((e) => {
        if (!cancelled) toast.error(e instanceof Error ? e.message : "Failed to load company");
      })
      .finally(() => {
        if (!cancelled) setLoadingDetail(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCompanyId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = createName.trim();
    if (!name) {
      toast.error(t("superAdmin.companies.nameRequired"));
      return;
    }
    setCreating(true);
    try {
      const company = await api.post<CreatedCompany>("/api/companies", { name });
      setCreatedCompany(company);
      setCreateName("");
      await fetchCompanies();
      toast.success(t("superAdmin.companies.created"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create company");
    } finally {
      setCreating(false);
    }
  };

  const copyApiKey = () => {
    if (!createdCompany?.api_key) return;
    navigator.clipboard.writeText(createdCompany.api_key);
    setCopiedKey(true);
    toast.success(t("superAdmin.companies.apiKeyCopied"));
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const closeCreateDialog = () => {
    setCreateOpen(false);
    setCreateName("");
    setCreatedCompany(null);
  };

  const handleToggleActive = async (company: CompanyListItem, checked: boolean) => {
    if (typeof company.is_active === "undefined") return;
    try {
      await api.patch(`/api/companies/${company.id}`, { is_active: checked });
      setCompanies((prev) =>
        prev.map((c) => (c.id === company.id ? { ...c, is_active: checked } : c))
      );
      toast.success(
        checked
          ? t("superAdmin.companies.activated")
          : t("superAdmin.companies.deactivated")
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update company");
    }
  };

  const handleSaveDetails = async () => {
    if (!selectedCompanyId || !companyDetail) return;
    setSavingDetails(true);
    try {
      const updated = await api.patch<CompanyDetail>(`/api/companies/${selectedCompanyId}`, {
        name: detailForm.name.trim(),
        is_active: detailForm.is_active,
        slug: detailForm.slug.trim() || null,
      });
      setCompanyDetail((c) => (c ? { ...c, ...updated } : null));
      setCompanies((prev) =>
        prev.map((c) =>
          c.id === selectedCompanyId
            ? { ...c, name: detailForm.name.trim(), is_active: detailForm.is_active }
            : c
        )
      );
      toast.success(t("superAdmin.companies.detailsSaved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingDetails(false);
    }
  };

  const handleRegenerateApiKey = async () => {
    if (!selectedCompanyId || !confirm(t("superAdmin.companies.regenerateConfirm"))) return;
    setRegeneratingKey(true);
    try {
      const updated = await api.patch<CompanyDetail>(`/api/companies/${selectedCompanyId}`, {
        regenerate_api_key: true,
      });
      if (updated?.api_key) setCompanyDetail((c) => (c ? { ...c, api_key: updated.api_key } : null));
      toast.success(t("organizationSettings.apiKeyRegenerated"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to regenerate key");
    } finally {
      setRegeneratingKey(false);
    }
  };

  const handleUserRoleChange = async (userId: string, role: "company_admin" | "user") => {
    if (!selectedCompanyId) return;
    try {
      await api.patch(`/api/companies/${selectedCompanyId}/users/${userId}/role`, { role });
      setCompanyUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role } : u))
      );
      toast.success(t("superAdmin.companies.roleUpdated"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update role");
    }
  };

  const handleRemoveUser = async (userId: string) => {
    if (!selectedCompanyId || !confirm(t("organizationSettings.removeUserConfirm") || "Remove this user from the company?")) return;
    try {
      await api.delete(`/api/companies/${selectedCompanyId}/users/${userId}`);
      setCompanyUsers((prev) => prev.filter((u) => u.id !== userId));
      toast.success(t("superAdmin.companies.userRemoved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove user");
    }
  };

  const handleCreateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompanyId || !createUserEmail.trim() || !createUserPassword) {
      toast.error(t("superAdmin.companies.email") + " / " + t("superAdmin.companies.password") + " required");
      return;
    }
    if (createUserPassword.length < 6) {
      toast.error(t("superAdmin.companies.passwordPlaceholder"));
      return;
    }
    setCreatingUser(true);
    try {
      await api.post(`/api/companies/${selectedCompanyId}/users`, {
        email: createUserEmail.trim().toLowerCase(),
        password: createUserPassword,
        full_name: createUserFullName.trim() || undefined,
        role: createUserRole,
      });
      const users = await api.get<CompanyUser[]>(`/api/companies/${selectedCompanyId}/users`);
      setCompanyUsers(users || []);
      setCreateUserOpen(false);
      setCreateUserEmail("");
      setCreateUserPassword("");
      setCreateUserFullName("");
      setCreateUserRole("user");
      toast.success(t("superAdmin.companies.userCreated"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create user");
    } finally {
      setCreatingUser(false);
    }
  };

  const handleAddExistingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompanyId || !addExistingEmail.trim()) {
      toast.error(t("superAdmin.companies.email") + " required");
      return;
    }
    setAddingExisting(true);
    try {
      await api.post(`/api/companies/${selectedCompanyId}/users/link`, {
        email: addExistingEmail.trim().toLowerCase(),
        role: addExistingRole,
      });
      const users = await api.get<CompanyUser[]>(`/api/companies/${selectedCompanyId}/users`);
      setCompanyUsers(users || []);
      setAddExistingOpen(false);
      setAddExistingEmail("");
      setAddExistingRole("user");
      toast.success(t("superAdmin.companies.userAdded"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add user");
    } finally {
      setAddingExisting(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("superAdmin.companies.title")}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {t("superAdmin.companies.description")}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {t("superAdmin.companies.createCompany")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {t("superAdmin.companies.listTitle")}
          </CardTitle>
          <CardDescription>{t("superAdmin.companies.listDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">{t("superAdmin.companies.loading")}</p>
          ) : companies.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("superAdmin.companies.empty")}</p>
          ) : (
            <ul className="space-y-2">
              {companies.map((c) => (
                <li
                  key={c.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedCompanyId(c.id)}
                  onKeyDown={(e) => e.key === "Enter" && setSelectedCompanyId(c.id)}
                  className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/50 hover:bg-muted cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-medium truncate">{c.name}</span>
                    <span className="text-xs text-muted-foreground font-mono shrink-0 hidden sm:inline">
                      {c.id}
                    </span>
                  </div>
                  {typeof c.is_active === "boolean" ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <Label
                        htmlFor={`company-active-${c.id}`}
                        className="text-xs text-muted-foreground cursor-pointer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {c.is_active
                          ? t("superAdmin.companies.active")
                          : t("superAdmin.companies.inactive")}
                      </Label>
                      <Switch
                        id={`company-active-${c.id}`}
                        checked={c.is_active}
                        onCheckedChange={(checked) => handleToggleActive(c, checked)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Company detail sheet (super admin) */}
      <Sheet open={!!selectedCompanyId} onOpenChange={(open) => !open && setSelectedCompanyId(null)}>
        <SheetContent className="sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{t("superAdmin.companies.details")}</SheetTitle>
            <SheetDescription>
              {companyDetail?.name ?? selectedCompanyId}
            </SheetDescription>
          </SheetHeader>
          {loadingDetail ? (
            <p className="text-muted-foreground text-sm py-4">{t("superAdmin.companies.loading")}</p>
          ) : companyDetail ? (
            <div className="space-y-6 pt-4">
              {/* Company details form */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>{t("superAdmin.companies.companyName")}</Label>
                  <Input
                    value={detailForm.name}
                    onChange={(e) => setDetailForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder={t("superAdmin.companies.companyNamePlaceholder")}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="detail-active"
                    checked={detailForm.is_active}
                    onCheckedChange={(checked) =>
                      setDetailForm((f) => ({ ...f, is_active: checked }))
                    }
                  />
                  <Label htmlFor="detail-active">
                    {detailForm.is_active
                      ? t("superAdmin.companies.active")
                      : t("superAdmin.companies.inactive")}
                  </Label>
                </div>
                <div className="space-y-2">
                  <Label>Portal slug (URL)</Label>
                  <Input
                    value={detailForm.slug}
                    onChange={(e) => setDetailForm((f) => ({ ...f, slug: e.target.value }))}
                    placeholder="acme"
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleSaveDetails} disabled={savingDetails}>
                    {savingDetails ? t("superAdmin.companies.saving") : t("superAdmin.companies.saveDetails")}
                  </Button>
                </div>
              </div>

              {/* API key */}
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <div className="flex justify-between items-center gap-2">
                  <Label className="text-xs text-muted-foreground">
                    {t("superAdmin.companies.apiKeyLabel")}
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={handleRegenerateApiKey}
                    disabled={regeneratingKey}
                  >
                    {t("superAdmin.companies.regenerateApiKey")}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {companyDetail.has_api_key ? "••••••••••••" : "No API key"}
                </p>
              </div>

              {/* Users */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">{t("superAdmin.companies.users")}</h3>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setCreateUserOpen(true)}
                    >
                      <UserPlus className="h-4 w-4 mr-1" />
                      {t("superAdmin.companies.createUser")}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setAddExistingOpen(true)}
                    >
                      <Link className="h-4 w-4 mr-1" />
                      {t("superAdmin.companies.addExistingUser")}
                    </Button>
                  </div>
                </div>
                {companyUsers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("superAdmin.companies.noUsers")}</p>
                ) : (
                  <ul className="space-y-2">
                    {companyUsers.map((u) => (
                      <li
                        key={u.id}
                        className="flex items-center justify-between gap-2 py-2 px-3 rounded-md bg-muted/50"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{u.full_name || u.email}</p>
                          <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                        </div>
                        <Select
                          value={u.role}
                          onValueChange={(v) => handleUserRoleChange(u.id, v as "company_admin" | "user")}
                        >
                          <SelectTrigger className="w-[130px] shrink-0">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="company_admin">
                              {t("superAdmin.companies.companyAdmin")}
                            </SelectItem>
                            <SelectItem value="user">{t("superAdmin.companies.user")}</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="shrink-0 text-destructive hover:text-destructive"
                          onClick={() => handleRemoveUser(u.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Create user dialog */}
      <Dialog open={createUserOpen} onOpenChange={setCreateUserOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("superAdmin.companies.createUserTitle")}</DialogTitle>
            <DialogDescription>{t("superAdmin.companies.createUserDescription")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateUserSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="create-user-email">{t("superAdmin.companies.email")}</Label>
              <Input
                id="create-user-email"
                type="email"
                value={createUserEmail}
                onChange={(e) => setCreateUserEmail(e.target.value)}
                placeholder="user@example.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-user-password">{t("superAdmin.companies.password")}</Label>
              <Input
                id="create-user-password"
                type="password"
                value={createUserPassword}
                onChange={(e) => setCreateUserPassword(e.target.value)}
                placeholder={t("superAdmin.companies.passwordPlaceholder")}
                minLength={6}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-user-fullname">{t("superAdmin.companies.fullName")}</Label>
              <Input
                id="create-user-fullname"
                value={createUserFullName}
                onChange={(e) => setCreateUserFullName(e.target.value)}
                placeholder={t("superAdmin.companies.fullNamePlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("superAdmin.companies.role")}</Label>
              <Select
                value={createUserRole}
                onValueChange={(v) => setCreateUserRole(v as "user" | "company_admin")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">{t("superAdmin.companies.user")}</SelectItem>
                  <SelectItem value="company_admin">{t("superAdmin.companies.companyAdmin")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateUserOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={creatingUser}>
                {creatingUser ? t("superAdmin.companies.creating") : t("superAdmin.companies.create")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add existing user dialog */}
      <Dialog open={addExistingOpen} onOpenChange={setAddExistingOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("superAdmin.companies.addExistingUserTitle")}</DialogTitle>
            <DialogDescription>{t("superAdmin.companies.addExistingUserDescription")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddExistingSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="add-existing-email">{t("superAdmin.companies.email")}</Label>
              <Input
                id="add-existing-email"
                type="email"
                value={addExistingEmail}
                onChange={(e) => setAddExistingEmail(e.target.value)}
                placeholder="user@example.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>{t("superAdmin.companies.role")}</Label>
              <Select
                value={addExistingRole}
                onValueChange={(v) => setAddExistingRole(v as "user" | "company_admin")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">{t("superAdmin.companies.user")}</SelectItem>
                  <SelectItem value="company_admin">{t("superAdmin.companies.companyAdmin")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddExistingOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={addingExisting}>
                {addingExisting ? t("superAdmin.companies.creating") : t("superAdmin.companies.addExistingUser")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={(open) => !open && closeCreateDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("superAdmin.companies.createCompany")}</DialogTitle>
            <DialogDescription>{t("superAdmin.companies.createDescription")}</DialogDescription>
          </DialogHeader>
          {!createdCompany ? (
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="company-name">{t("superAdmin.companies.companyName")}</Label>
                <Input
                  id="company-name"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder={t("superAdmin.companies.companyNamePlaceholder")}
                  autoFocus
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={closeCreateDialog}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={creating}>
                  {creating ? t("superAdmin.companies.creating") : t("superAdmin.companies.create")}
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {t("superAdmin.companies.createdSuccess")}
              </p>
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <div className="flex justify-between items-center gap-2">
                  <Label className="text-xs text-muted-foreground">
                    {t("superAdmin.companies.apiKeyLabel")}
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={copyApiKey}
                    className="shrink-0"
                  >
                    {copiedKey ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <code className="block text-xs font-mono break-all bg-background p-2 rounded border">
                  {createdCompany.api_key}
                </code>
                <p className="text-xs text-amber-600 dark:text-amber-500">
                  {t("superAdmin.companies.apiKeyWarning")}
                </p>
              </div>
              <DialogFooter>
                <Button onClick={closeCreateDialog}>{t("common.close")}</Button>
                <Button variant="outline" onClick={() => setCreatedCompany(null)}>
                  {t("superAdmin.companies.createAnother")}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
