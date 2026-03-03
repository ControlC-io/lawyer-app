import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, Shield, Users } from "lucide-react";
import type { Role } from "@/hooks/useRoles";
import { useLanguage } from "@/contexts/LanguageContext";

interface RoleCardProps {
  role: Role;
  onEdit: (role: Role) => void;
  onDelete: (role: Role) => void;
  canManage: boolean;
}

export function RoleCard({ role, onEdit, onDelete, canManage }: RoleCardProps) {
  const { t } = useLanguage();

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">{role.name}</CardTitle>
          </div>
          <div className="flex items-center gap-1">
            {role.is_system && (
              <Badge variant="secondary" className="text-xs">
                {t("rbac.systemRole") || "System"}
              </Badge>
            )}
            {canManage && !role.is_system && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onEdit(role)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => onDelete(role)}
                  disabled={role._count.users > 0}
                  title={
                    role._count.users > 0
                      ? t("rbac.cannotDeleteAssigned") || "Cannot delete a role with assigned users"
                      : undefined
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {role.description && (
          <p className="text-sm text-muted-foreground mb-3">{role.description}</p>
        )}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Shield className="h-3 w-3" />
            {role.is_system
              ? role.name === "Admin"
                ? "All"
                : "Baseline"
              : role.permissions.length}{" "}
            {t("rbac.permissionsCount") || "permissions"}
          </span>
          <span className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            {role._count.users} {t("rbac.membersCount") || "members"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
