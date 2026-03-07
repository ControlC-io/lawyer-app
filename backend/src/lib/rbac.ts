import { Response, NextFunction } from 'express';
import { AuthRequest, ALL_COMPANIES } from '../middleware/auth';
import { prisma } from './prisma';

/**
 * Complete permission catalogue.
 * Each key maps to a domain and action from the RBAC spec.
 */
export const PERMISSIONS = {
  // 4.1 Executions
  EXECUTIONS_CREATE_VIEW: 'executions.create_view',
  EXECUTIONS_DELETE_OWN: 'executions.delete_own',
  // 4.2 Workflows
  WORKFLOWS_MANAGE: 'workflows.manage',
  // 4.3 Execution Data
  EXECUTION_DATA_VIEW: 'execution_data.view',
  // 4.4 Data (Tables)
  DATA_MANAGE_STRUCTURE: 'data.manage_structure',
  DATA_MANAGE_DATA: 'data.manage_data',
  DATA_VIEW: 'data.view',
  // 4.5 Global Variables
  VARIABLES_VIEW: 'variables.view',
  VARIABLES_MANAGE: 'variables.manage',
  // 4.6 Documents
  DOCUMENTS_VIEW: 'documents.view',
  DOCUMENTS_MANAGE: 'documents.manage',
  // 4.7 API Configuration
  API_CONFIG_MANAGE: 'api_config.manage',
  // 4.8 Users & Groups
  USERS_GROUPS_MANAGE: 'users_groups.manage',
  // 4.9 Organisation Settings
  ORG_SETTINGS_MANAGE: 'org_settings.manage',
  // 4.10 Usage
  USAGE_VIEW: 'usage.view',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSION_KEYS: PermissionKey[] = Object.values(PERMISSIONS);

/**
 * Permission catalogue grouped by domain for UI rendering.
 */
export const PERMISSION_GROUPS = [
  {
    domain: 'Executions',
    permissions: [
      { key: PERMISSIONS.EXECUTIONS_CREATE_VIEW, label: 'Create & View Executions', description: 'Start new executions and view existing ones (workflow-level filters still apply)' },
      { key: PERMISSIONS.EXECUTIONS_DELETE_OWN, label: 'Delete Own Executions', description: 'Delete executions that the user personally initiated' },
    ],
  },
  {
    domain: 'Workflows',
    permissions: [
      { key: PERMISSIONS.WORKFLOWS_MANAGE, label: 'Manage Workflows', description: 'Create, edit, and delete workflow definitions' },
    ],
  },
  {
    domain: 'Execution Data',
    permissions: [
      { key: PERMISSIONS.EXECUTION_DATA_VIEW, label: 'View Execution Data', description: 'Read data payloads and outputs from workflow executions' },
    ],
  },
  {
    domain: 'Data (Tables)',
    permissions: [
      { key: PERMISSIONS.DATA_MANAGE_STRUCTURE, label: 'Manage Table Structure', description: 'Create, modify, and delete tables and columns' },
      { key: PERMISSIONS.DATA_MANAGE_DATA, label: 'Manage Table Data', description: 'Insert, update, and delete rows within tables' },
      { key: PERMISSIONS.DATA_VIEW, label: 'View Table Data', description: 'Read data within tables' },
    ],
  },
  {
    domain: 'Global Variables',
    permissions: [
      { key: PERMISSIONS.VARIABLES_VIEW, label: 'View Global Variables', description: 'Read names and values of global variables' },
      { key: PERMISSIONS.VARIABLES_MANAGE, label: 'Manage Global Variables', description: 'Create, edit, and delete global variables (implies view)' },
    ],
  },
  {
    domain: 'Documents',
    permissions: [
      { key: PERMISSIONS.DOCUMENTS_VIEW, label: 'View Documents', description: 'Access the documents page — file-level read/write is controlled by document permission rules' },
      { key: PERMISSIONS.DOCUMENTS_MANAGE, label: 'Manage Documents', description: 'Manage metadata keys and document access rules' },
    ],
  },
  {
    domain: 'API Configuration',
    permissions: [
      { key: PERMISSIONS.API_CONFIG_MANAGE, label: 'Manage API Configuration', description: 'Create, edit, and delete API configurations' },
    ],
  },
  {
    domain: 'Users & Groups',
    permissions: [
      { key: PERMISSIONS.USERS_GROUPS_MANAGE, label: 'Manage Users & Groups', description: 'Invite users, assign roles, manage groups' },
    ],
  },
  {
    domain: 'Organisation Settings',
    permissions: [
      { key: PERMISSIONS.ORG_SETTINGS_MANAGE, label: 'Manage Organisation Settings', description: 'Edit organisation-level configuration' },
    ],
  },
  {
    domain: 'Usage',
    permissions: [
      { key: PERMISSIONS.USAGE_VIEW, label: 'View Usage', description: 'View usage dashboards and metrics' },
    ],
  },
];

/**
 * Check if a user has a specific permission in a company.
 * Admin users always return true. Members without a custom role return false.
 */
export async function hasPermission(
  userId: string,
  companyId: string,
  permissionKey: string,
): Promise<boolean> {
  const userCompany = await prisma.userCompany.findFirst({
    where: { user_id: userId, company_id: companyId },
    include: {
      custom_role: {
        include: { permissions: true },
      },
    },
  });

  if (!userCompany) return false;

  // Admin bypasses all permission checks
  if (userCompany.role === 'company_admin') return true;

  // Member without custom role has no extra permissions
  if (!userCompany.custom_role) return false;

  // Check if the custom role has the requested permission
  return userCompany.custom_role.permissions.some(
    (p: { permission_key: string }) => p.permission_key === permissionKey,
  );
}

/**
 * Get all permission keys for a user in a company.
 * Admin users get ["*"]. Members without custom role get [].
 */
export async function getUserPermissions(
  userId: string,
  companyId: string,
): Promise<string[]> {
  const userCompany = await prisma.userCompany.findFirst({
    where: { user_id: userId, company_id: companyId },
    include: {
      custom_role: {
        include: { permissions: true },
      },
    },
  });

  if (!userCompany) return [];
  if (userCompany.role === 'company_admin') return ['*'];
  if (!userCompany.custom_role) return [];

  return userCompany.custom_role.permissions.map((p: { permission_key: string }) => p.permission_key);
}

/**
 * Express middleware factory: require a specific permission.
 * Handles company access check + permission check in one step.
 * API key requests are treated as company-admin for their own company only.
 * Super admin requests bypass permission checks.
 */
export function requirePermission(permissionKey: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const companyId = req.params.companyId;
    if (!companyId) {
      return res.status(400).json({ error: 'Bad Request', details: 'Missing companyId parameter' });
    }

    // Super admin with 'all' or specific company bypasses all checks
    if (req.user?.super_admin) {
      return next();
    }

    if (companyId === ALL_COMPANIES) {
      return res.status(403).json({ error: 'Forbidden', details: 'companyId=all is reserved for super admin' });
    }

    // API key auth = company-admin equivalent, scoped to the authenticated company.
    if (req.company && !req.user) {
      if (req.company.id !== companyId) {
        return res.status(403).json({ error: 'Forbidden', details: 'API key is not valid for this company' });
      }
      return next();
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized', details: 'Authentication required' });
    }

    const allowed = await hasPermission(userId, companyId, permissionKey);
    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden', details: 'Insufficient permissions' });
    }

    next();
  };
}

/**
 * Log an auditable action.
 */
export async function logAudit(
  companyId: string,
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  details?: Record<string, unknown>,
) {
  await prisma.auditLog.create({
    data: {
      company_id: companyId,
      actor_id: actorId,
      action,
      target_type: targetType,
      target_id: targetId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      details: details ? (details as any) : undefined,
    },
  });
}

/**
 * Seed system roles (Admin and Member) for a company.
 * Should be called immediately after a new company is created.
 * Uses upsert to safely handle idempotent calls.
 */
export async function seedSystemRolesForCompany(companyId: string) {
  // Create Admin system role if not exists
  await prisma.role.upsert({
    where: { company_id_name: { company_id: companyId, name: 'Admin' } },
    update: {},
    create: {
      name: 'Admin',
      description: 'Full access to all features and data',
      company_id: companyId,
      is_system: true,
    },
  });

  // Create Member system role if not exists
  await prisma.role.upsert({
    where: { company_id_name: { company_id: companyId, name: 'Member' } },
    update: {},
    create: {
      name: 'Member',
      description: 'Default role with limited baseline access',
      company_id: companyId,
      is_system: true,
    },
  });
}
