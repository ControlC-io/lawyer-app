import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { PermissionGroupSection } from "./PermissionGroupSection";
import type { Role, PermissionGroup } from "@/hooks/useRoles";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import { Loader2, Shield } from "lucide-react";

interface RoleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role?: Role | null;
  permissionGroups: PermissionGroup[];
  onSave: (name: string, description: string, permissions: string[]) => Promise<void>;
}

export function RoleFormDialog({
  open,
  onOpenChange,
  role,
  permissionGroups,
  onSave,
}: RoleFormDialogProps) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const isEditing = !!role;

  useEffect(() => {
    if (role) {
      setName(role.name);
      setDescription(role.description || "");
      setSelectedPermissions(role.permissions.map((p) => p.permission_key));
    } else {
      setName("");
      setDescription("");
      setSelectedPermissions([]);
    }
  }, [role, open]);

  const togglePermission = (key: string) => {
    setSelectedPermissions((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const totalPermissions = permissionGroups.reduce(
    (sum, g) => sum + g.permissions.length,
    0,
  );

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error(t("rbac.roleNameRequired") || "Role name is required");
      return;
    }
    setSaving(true);
    try {
      await onSave(name.trim(), description.trim(), selectedPermissions);
      onOpenChange(false);
      toast.success(
        isEditing
          ? t("rbac.roleUpdated") || "Role updated"
          : t("rbac.roleCreated") || "Role created",
      );
    } catch (err: any) {
      const message = err?.message || (isEditing ? "Failed to update role" : "Failed to create role");
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            {isEditing
              ? t("rbac.editRole") || "Edit Role"
              : t("rbac.createRole") || "Create Role"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          <div className="space-y-2">
            <Label htmlFor="role-name">{t("rbac.roleName") || "Name"}</Label>
            <Input
              id="role-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("rbac.roleNamePlaceholder") || "e.g. Editor, Viewer, Manager"}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role-description">
              {t("rbac.roleDescription") || "Description"}
            </Label>
            <Textarea
              id="role-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("rbac.roleDescriptionPlaceholder") || "What this role is for..."}
              rows={2}
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t("rbac.permissions") || "Permissions"}</Label>
              <p className="text-xs text-muted-foreground">
                {t("rbac.permissionsHint") || "Select the permissions this role grants"}
              </p>
            </div>
            <span className="text-xs font-medium tabular-nums text-muted-foreground">
              {selectedPermissions.length}/{totalPermissions}
            </span>
          </div>

          <ScrollArea className="flex-1 min-h-0 pr-3">
            <div className="space-y-1">
              {permissionGroups.map((group) => (
                <PermissionGroupSection
                  key={group.domain}
                  group={group}
                  selectedPermissions={selectedPermissions}
                  onToggle={togglePermission}
                />
              ))}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("common.cancel") || "Cancel"}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {saving
              ? t("common.saving") || "Saving..."
              : isEditing
                ? t("common.save") || "Save"
                : t("rbac.createRole") || "Create Role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
