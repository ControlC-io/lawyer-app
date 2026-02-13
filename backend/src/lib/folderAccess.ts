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
  const rootId = await getRootFolderId(folderId);
  if (!rootId) return false;
  if (isCompanyAdmin) return true;
  const permissions = await prisma.folderPermission.findMany({
    where: { folder_id: rootId },
    select: { user_id: true, group_id: true },
  });
  if (permissions.length === 0) return true; // public root
  return permissions.some(
    (p) => p.user_id === userId || (p.group_id != null && userGroupIds.includes(p.group_id))
  );
}
