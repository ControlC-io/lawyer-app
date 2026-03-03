import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { useCompanyId } from "@/hooks/useCompanyId";
import { toast } from "sonner";

interface RolePermission {
  permission_key: string;
}

export interface Role {
  id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  created_at: string;
  permissions: RolePermission[];
  _count: { users: number };
}

interface PermissionInfo {
  key: string;
  label: string;
  description: string;
}

export interface PermissionGroup {
  domain: string;
  permissions: PermissionInfo[];
}

export function useRoles() {
  const companyId = useCompanyId();
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissionGroups, setPermissionGroups] = useState<PermissionGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRoles = useCallback(async () => {
    if (!companyId) return;
    try {
      const data = await api.get<Role[]>(`/api/companies/${companyId}/roles`);
      setRoles(data || []);
    } catch {
      toast.error("Failed to fetch roles");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  const fetchPermissionGroups = useCallback(async () => {
    if (!companyId) return;
    try {
      const data = await api.get<PermissionGroup[]>(`/api/companies/${companyId}/permission-catalogue`);
      setPermissionGroups(data || []);
    } catch {
      // Silent fail — catalogue is static fallback
    }
  }, [companyId]);

  useEffect(() => {
    fetchRoles();
    fetchPermissionGroups();
  }, [fetchRoles, fetchPermissionGroups]);

  const createRole = async (name: string, description: string, permissions: string[]) => {
    if (!companyId) return;
    const role = await api.post<Role>(`/api/companies/${companyId}/roles`, {
      name,
      description,
      permissions,
    });
    await fetchRoles();
    return role;
  };

  const updateRole = async (roleId: string, data: { name?: string; description?: string; permissions?: string[] }) => {
    if (!companyId) return;
    await api.patch(`/api/companies/${companyId}/roles/${roleId}`, data);
    await fetchRoles();
  };

  const deleteRole = async (roleId: string) => {
    if (!companyId) return;
    await api.delete(`/api/companies/${companyId}/roles/${roleId}`);
    await fetchRoles();
  };

  const assignUserRole = async (userId: string, role: string, customRoleId?: string | null) => {
    if (!companyId) return;
    await api.patch(`/api/companies/${companyId}/users/${userId}/role`, {
      role,
      custom_role_id: customRoleId || null,
    });
  };

  return {
    roles,
    permissionGroups,
    loading,
    fetchRoles,
    createRole,
    updateRole,
    deleteRole,
    assignUserRole,
  };
}
