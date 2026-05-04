import { prisma } from './prisma';

type WorkflowField = {
  id?: unknown;
  field_type?: unknown;
  parent_item_id?: unknown;
};

export function getWorkflowFields(dataStructure: unknown): WorkflowField[] {
  if (!Array.isArray(dataStructure)) return [];
  return dataStructure.filter((field) => field && typeof field === 'object') as WorkflowField[];
}

export function getWorkflowFieldById(dataStructure: unknown, fieldId: string): WorkflowField | undefined {
  return getWorkflowFields(dataStructure).find((field) => field.id === fieldId);
}

export function isUserField(field: WorkflowField | undefined): boolean {
  return field?.field_type === 'user';
}

export function normalizeUserFieldValue(rawValue: unknown): string | null {
  if (rawValue === null || rawValue === undefined) return null;
  if (typeof rawValue === 'string') {
    const trimmed = rawValue.trim();
    return trimmed || null;
  }
  if (typeof rawValue !== 'object' || Array.isArray(rawValue)) return null;

  const objectValue = rawValue as Record<string, unknown>;
  if (typeof objectValue.id === 'string' && objectValue.id.trim()) return objectValue.id.trim();
  if (typeof objectValue.user_id === 'string' && objectValue.user_id.trim()) return objectValue.user_id.trim();
  if (typeof objectValue.value === 'string' && objectValue.value.trim()) return objectValue.value.trim();
  return null;
}

export async function ensureCompanyUser(companyId: string, userId: string): Promise<boolean> {
  const membership = await prisma.userCompany.findFirst({
    where: { company_id: companyId, user_id: userId },
    select: { user_id: true },
  });
  return !!membership;
}
