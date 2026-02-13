import {
  getRootFolderId,
  getUserGroupIdsInCompany,
  canUserAccessFolder,
  getUserFolderPermissionLevel,
} from '../lib/folderAccess';
import { prisma } from '../lib/prisma';

jest.mock('../lib/prisma', () => ({
  prisma: {
    folder: { findUnique: jest.fn() },
    profileGroupMember: { findMany: jest.fn() },
    folderPermission: { findMany: jest.fn() },
  },
}));

describe('folderAccess', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getRootFolderId', () => {
    it('returns folder id when folder is already root', async () => {
      (prisma.folder.findUnique as jest.Mock).mockResolvedValue({
        id: 'root-1',
        parent_folder_id: null,
      });
      const result = await getRootFolderId('root-1');
      expect(result).toBe('root-1');
    });

    it('returns root id when folder has one parent', async () => {
      (prisma.folder.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 'child-1', parent_folder_id: 'root-1' })
        .mockResolvedValueOnce({ id: 'root-1', parent_folder_id: null });
      const result = await getRootFolderId('child-1');
      expect(result).toBe('root-1');
    });

    it('returns null when folder does not exist', async () => {
      (prisma.folder.findUnique as jest.Mock).mockResolvedValue(null);
      const result = await getRootFolderId('missing');
      expect(result).toBeNull();
    });
  });

  describe('getUserGroupIdsInCompany', () => {
    it('returns group ids for user in company', async () => {
      (prisma.profileGroupMember.findMany as jest.Mock).mockResolvedValue([
        { group_id: 'g1' },
        { group_id: 'g2' },
      ]);
      const result = await getUserGroupIdsInCompany('user-1', 'company-1');
      expect(result).toEqual(['g1', 'g2']);
    });

    it('returns empty array when user has no groups', async () => {
      (prisma.profileGroupMember.findMany as jest.Mock).mockResolvedValue([]);
      const result = await getUserGroupIdsInCompany('user-1', 'company-1');
      expect(result).toEqual([]);
    });
  });

  describe('canUserAccessFolder', () => {
    it('returns true when user is company admin', async () => {
      (prisma.folder.findUnique as jest.Mock).mockResolvedValue({
        id: 'folder-1',
        parent_folder_id: null,
      });
      const result = await canUserAccessFolder(
        'user-1',
        'company-1',
        'folder-1',
        true,
        []
      );
      expect(result).toBe(true);
      expect(prisma.folderPermission.findMany).not.toHaveBeenCalled();
    });

    it('returns false when root folder cannot be resolved', async () => {
      (prisma.folder.findUnique as jest.Mock).mockResolvedValue(null);
      const result = await canUserAccessFolder(
        'user-1',
        'company-1',
        'missing',
        false,
        []
      );
      expect(result).toBe(false);
    });

    it('returns true when root has no permissions (public)', async () => {
      (prisma.folder.findUnique as jest.Mock).mockResolvedValue({
        id: 'root-1',
        parent_folder_id: null,
      });
      (prisma.folderPermission.findMany as jest.Mock).mockResolvedValue([]);
      const result = await canUserAccessFolder(
        'user-1',
        'company-1',
        'root-1',
        false,
        []
      );
      expect(result).toBe(true);
    });

    it('returns true when user has direct permission', async () => {
      (prisma.folder.findUnique as jest.Mock).mockResolvedValue({
        id: 'root-1',
        parent_folder_id: null,
      });
      (prisma.folderPermission.findMany as jest.Mock).mockResolvedValue([
        { user_id: 'user-1', group_id: null, permission_type: 'read' },
      ]);
      const result = await canUserAccessFolder(
        'user-1',
        'company-1',
        'root-1',
        false,
        []
      );
      expect(result).toBe(true);
    });

    it('returns true when user has permission via group', async () => {
      (prisma.folder.findUnique as jest.Mock).mockResolvedValue({
        id: 'root-1',
        parent_folder_id: null,
      });
      (prisma.folderPermission.findMany as jest.Mock).mockResolvedValue([
        { user_id: null, group_id: 'group-1', permission_type: 'read' },
      ]);
      const result = await canUserAccessFolder(
        'user-1',
        'company-1',
        'root-1',
        false,
        ['group-1']
      );
      expect(result).toBe(true);
    });

    it('returns false when root has permissions but user has none', async () => {
      (prisma.folder.findUnique as jest.Mock).mockResolvedValue({
        id: 'root-1',
        parent_folder_id: null,
      });
      (prisma.folderPermission.findMany as jest.Mock).mockResolvedValue([
        { user_id: 'other-user', group_id: 'other-group', permission_type: 'read' },
      ]);
      const result = await canUserAccessFolder(
        'user-1',
        'company-1',
        'root-1',
        false,
        []
      );
      expect(result).toBe(false);
    });
  });

  describe('getUserFolderPermissionLevel', () => {
    it('returns write when user is company admin', async () => {
      (prisma.folder.findUnique as jest.Mock).mockResolvedValue({
        id: 'folder-1',
        parent_folder_id: null,
      });
      const result = await getUserFolderPermissionLevel(
        'user-1',
        'company-1',
        'folder-1',
        true,
        []
      );
      expect(result).toBe('write');
    });

    it('returns null when root folder cannot be resolved', async () => {
      (prisma.folder.findUnique as jest.Mock).mockResolvedValue(null);
      const result = await getUserFolderPermissionLevel(
        'user-1',
        'company-1',
        'missing',
        false,
        []
      );
      expect(result).toBeNull();
    });

    it('returns read when root has no permissions (public)', async () => {
      (prisma.folder.findUnique as jest.Mock).mockResolvedValue({
        id: 'root-1',
        parent_folder_id: null,
      });
      (prisma.folderPermission.findMany as jest.Mock).mockResolvedValue([]);
      const result = await getUserFolderPermissionLevel(
        'user-1',
        'company-1',
        'root-1',
        false,
        []
      );
      expect(result).toBe('read');
    });

    it('returns read when user has read permission', async () => {
      (prisma.folder.findUnique as jest.Mock).mockResolvedValue({
        id: 'root-1',
        parent_folder_id: null,
      });
      (prisma.folderPermission.findMany as jest.Mock).mockResolvedValue([
        { user_id: 'user-1', group_id: null, permission_type: 'read' },
      ]);
      const result = await getUserFolderPermissionLevel(
        'user-1',
        'company-1',
        'root-1',
        false,
        []
      );
      expect(result).toBe('read');
    });

    it('returns write when user has write permission', async () => {
      (prisma.folder.findUnique as jest.Mock).mockResolvedValue({
        id: 'root-1',
        parent_folder_id: null,
      });
      (prisma.folderPermission.findMany as jest.Mock).mockResolvedValue([
        { user_id: 'user-1', group_id: null, permission_type: 'write' },
      ]);
      const result = await getUserFolderPermissionLevel(
        'user-1',
        'company-1',
        'root-1',
        false,
        []
      );
      expect(result).toBe('write');
    });

    it('returns write when user has legacy admin permission', async () => {
      (prisma.folder.findUnique as jest.Mock).mockResolvedValue({
        id: 'root-1',
        parent_folder_id: null,
      });
      (prisma.folderPermission.findMany as jest.Mock).mockResolvedValue([
        { user_id: 'user-1', group_id: null, permission_type: 'admin' },
      ]);
      const result = await getUserFolderPermissionLevel(
        'user-1',
        'company-1',
        'root-1',
        false,
        []
      );
      expect(result).toBe('write');
    });

    it('returns null when root has permissions but user has none', async () => {
      (prisma.folder.findUnique as jest.Mock).mockResolvedValue({
        id: 'root-1',
        parent_folder_id: null,
      });
      (prisma.folderPermission.findMany as jest.Mock).mockResolvedValue([
        { user_id: 'other-user', group_id: null, permission_type: 'write' },
      ]);
      const result = await getUserFolderPermissionLevel(
        'user-1',
        'company-1',
        'root-1',
        false,
        []
      );
      expect(result).toBeNull();
    });
  });
});
