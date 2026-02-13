import { prisma } from './prisma';

/** Resolve the root folder id (ancestor with parent_folder_id = null) for a folder. */
export async function getRootFolderId(folderId: string): Promise<string | null> {
  let currentId: string | null = folderId;
  while (currentId) {
    const folder: { id: string; parent_folder_id: string | null } | null =
      await prisma.folder.findUnique({
        where: { id: currentId },
        select: { id: true, parent_folder_id: true },
      });
    if (!folder) return null;
    if (folder.parent_folder_id == null) return folder.id;
    currentId = folder.parent_folder_id;
  }
  return null;
}

/** Get the list of group ids the user belongs to in the company. */
export async function getUserGroupIdsInCompany(userId: string, companyId: string): Promise<string[]> {
  const memberships = await prisma.profileGroupMember.findMany({
    where: { profile_id: userId, group: { company_id: companyId } },
    select: { group_id: true },
  });
  return memberships.map((m) => m.group_id).filter((id): id is string => id != null);
}

/** Check if the user can access a folder (via its root's permissions). Company admins always can. */
export async function canUserAccessFolder(
  userId: string,
  companyId: string,
  folderId: string,
  isCompanyAdmin: boolean,
  userGroupIds: string[]
): Promise<boolean> {
  const level = await getUserFolderPermissionLevel(userId, companyId, folderId, isCompanyAdmin, userGroupIds);
  return level !== null;
}

/**
 * Get the user's permission level for a folder. Read = list/open/preview/download only; write = read + upload/delete.
 * Company admins get write. Public roots (no permissions) get read. Legacy 'admin' permission_type is treated as write.
 */
export async function getUserFolderPermissionLevel(
  userId: string,
  companyId: string,
  folderId: string,
  isCompanyAdmin: boolean,
  userGroupIds: string[]
): Promise<'read' | 'write' | null> {
  const rootId = await getRootFolderId(folderId);
  if (!rootId) return null;
  if (isCompanyAdmin) return 'write';
  const permissions = await prisma.folderPermission.findMany({
    where: { folder_id: rootId },
    select: { user_id: true, group_id: true, permission_type: true },
  });
  if (permissions.length === 0) return 'read'; // public root: read-only for everyone
  const mine = permissions.filter(
    (p) => p.user_id === userId || (p.group_id != null && userGroupIds.includes(p.group_id))
  );
  if (mine.length === 0) return null;
  const hasWrite = mine.some(
    (p) => p.permission_type === 'write' || p.permission_type === 'admin'
  );
  return hasWrite ? 'write' : 'read';
}
