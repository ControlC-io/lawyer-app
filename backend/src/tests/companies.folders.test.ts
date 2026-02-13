import request from 'supertest';
import { app } from '../app';
import { prisma } from '../lib/prisma';
import * as folderAccess from '../lib/folderAccess';

jest.mock('../lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    userCompany: { findFirst: jest.fn() },
    folder: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    folderPermission: {
      findMany: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    profileGroupMember: { findMany: jest.fn() },
    file: { findMany: jest.fn(), findFirst: jest.fn(), delete: jest.fn() },
    filesMetadataValue: { findMany: jest.fn() },
  },
}));

jest.mock('jsonwebtoken', () => ({ verify: jest.fn() }));

const mockDeleteFile = jest.fn().mockResolvedValue(undefined);
jest.mock('../services/storage.service', () => ({
  storageService: {
    getDocumentsBucket: () => 'documents',
    deleteFile: (...args: unknown[]) => mockDeleteFile(...args),
  },
}));

jest.mock('../lib/folderAccess', () => ({
  canUserAccessFolder: jest.fn(),
  getUserFolderPermissionLevel: jest.fn(),
  getUserGroupIdsInCompany: jest.fn(),
}));

describe('Companies folders and folder permissions', () => {
  const jwt = require('jsonwebtoken');
  const companyId = 'company-123';
  const folderId = 'folder-root-1';
  const authHeader = { Authorization: 'Bearer token' };

  beforeEach(() => {
    jest.clearAllMocks();
    jwt.verify.mockReturnValue({ userId: 'user-1' });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'admin@example.com',
      profile: {},
    });
    (prisma.userCompany.findFirst as jest.Mock).mockResolvedValue({
      id: 'uc-1',
      role: 'company_admin',
    });
    (folderAccess.getUserGroupIdsInCompany as jest.Mock).mockResolvedValue([]);
    (folderAccess.canUserAccessFolder as jest.Mock).mockResolvedValue(true);
    (folderAccess.getUserFolderPermissionLevel as jest.Mock).mockResolvedValue('write');
  });

  describe('GET /api/companies/:companyId/folders', () => {
    it('returns 401 when no JWT', async () => {
      const res = await request(app)
        .get(`/api/companies/${companyId}/folders`)
        .query({ parent_folder_id: '' });
      expect(res.status).toBe(401);
    });

    it('returns 200 and folder list when user has access', async () => {
      (prisma.folder.findMany as jest.Mock).mockResolvedValue([
        { id: folderId, name: 'Root 1', parent_folder_id: null, company_id: companyId, created_at: new Date() },
      ]);
      const res = await request(app)
        .get(`/api/companies/${companyId}/folders`)
        .set(authHeader)
        .query({ parent_folder_id: '' });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Root 1');
    });

    it('returns 403 when user cannot access parent folder', async () => {
      (folderAccess.canUserAccessFolder as jest.Mock).mockResolvedValue(false);
      (prisma.folder.findFirst as jest.Mock).mockResolvedValue({
        id: 'parent-1',
        company_id: companyId,
      });
      const res = await request(app)
        .get(`/api/companies/${companyId}/folders`)
        .set(authHeader)
        .query({ parent_folder_id: 'parent-1' });
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/access/i);
    });
  });

  describe('GET /api/companies/:companyId/folders/:folderId', () => {
    it('returns 404 when user has no access to folder', async () => {
      (prisma.folder.findFirst as jest.Mock).mockResolvedValue({
        id: folderId,
        name: 'Secret',
        company_id: companyId,
        parent_folder_id: null,
        created_at: new Date(),
      });
      (folderAccess.canUserAccessFolder as jest.Mock).mockResolvedValue(false);
      const res = await request(app)
        .get(`/api/companies/${companyId}/folders/${folderId}`)
        .set(authHeader);
      expect(res.status).toBe(404);
      expect(res.body.error).toMatch(/not found/i);
    });

    it('returns 200 when user has access', async () => {
      (prisma.folder.findFirst as jest.Mock).mockResolvedValue({
        id: folderId,
        name: 'My Folder',
        company_id: companyId,
        parent_folder_id: null,
        created_at: new Date(),
      });
      const res = await request(app)
        .get(`/api/companies/${companyId}/folders/${folderId}`)
        .set(authHeader);
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('My Folder');
    });
  });

  describe('GET /api/companies/:companyId/folders/:folderId/permissions', () => {
    it('returns 401 when no JWT', async () => {
      const res = await request(app)
        .get(`/api/companies/${companyId}/folders/${folderId}/permissions`);
      expect(res.status).toBe(401);
    });

    it('returns 403 when user is not company admin', async () => {
      (prisma.userCompany.findFirst as jest.Mock).mockResolvedValue({
        id: 'uc-1',
        role: 'user',
      });
      const res = await request(app)
        .get(`/api/companies/${companyId}/folders/${folderId}/permissions`)
        .set(authHeader);
      expect(res.status).toBe(403);
    });

    it('returns 200 and permission list for root folder', async () => {
      (prisma.folder.findFirst as jest.Mock).mockResolvedValue({
        id: folderId,
        parent_folder_id: null,
      });
      (prisma.folderPermission.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'perm-1',
          folder_id: folderId,
          user_id: 'user-2',
          group_id: null,
          permission_type: 'read',
          user: { id: 'user-2', email: 'u2@example.com', full_name: 'User 2' },
          group: null,
        },
      ]);
      const res = await request(app)
        .get(`/api/companies/${companyId}/folders/${folderId}/permissions`)
        .set(authHeader);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body[0].permission_type).toBe('read');
    });

    it('returns 400 when folder is not root', async () => {
      (prisma.folder.findFirst as jest.Mock).mockResolvedValue({
        id: folderId,
        parent_folder_id: 'parent-1',
      });
      const res = await request(app)
        .get(`/api/companies/${companyId}/folders/${folderId}/permissions`)
        .set(authHeader);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/root folders/i);
    });
  });

  describe('POST /api/companies/:companyId/folders/:folderId/permissions', () => {
    it('returns 400 when neither user_id nor group_id provided', async () => {
      (prisma.folder.findFirst as jest.Mock).mockResolvedValue({
        id: folderId,
        parent_folder_id: null,
      });
      const res = await request(app)
        .post(`/api/companies/${companyId}/folders/${folderId}/permissions`)
        .set(authHeader)
        .send({ permission_type: 'read' });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/user_id|group_id/i);
    });

    it('returns 201 when adding group permission', async () => {
      (prisma.folder.findFirst as jest.Mock).mockResolvedValue({
        id: folderId,
        parent_folder_id: null,
      });
      (prisma.folderPermission.create as jest.Mock).mockResolvedValue({
        id: 'perm-new',
        folder_id: folderId,
        group_id: 'group-1',
        user_id: null,
        permission_type: 'read',
        group: { id: 'group-1', name: 'Team A' },
        user: null,
      });
      const res = await request(app)
        .post(`/api/companies/${companyId}/folders/${folderId}/permissions`)
        .set(authHeader)
        .send({ group_id: 'group-1', permission_type: 'read' });
      expect(res.status).toBe(201);
      expect(prisma.folderPermission.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            folder_id: folderId,
            company_id: companyId,
            group_id: 'group-1',
            user_id: null,
            permission_type: 'read',
          }),
        })
      );
    });
  });

  describe('DELETE /api/companies/:companyId/folders/:folderId/permissions/:permissionId', () => {
    it('returns 204 when permission deleted', async () => {
      (prisma.folder.findFirst as jest.Mock).mockResolvedValue({
        id: folderId,
        parent_folder_id: null,
      });
      (prisma.folderPermission.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });
      const res = await request(app)
        .delete(`/api/companies/${companyId}/folders/${folderId}/permissions/perm-1`)
        .set(authHeader);
      expect(res.status).toBe(204);
    });

    it('returns 404 when permission not found', async () => {
      (prisma.folder.findFirst as jest.Mock).mockResolvedValue({
        id: folderId,
        parent_folder_id: null,
      });
      (prisma.folderPermission.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });
      const res = await request(app)
        .delete(`/api/companies/${companyId}/folders/${folderId}/permissions/perm-missing`)
        .set(authHeader);
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/companies/:companyId/files', () => {
    it('returns 403 when user cannot access folder', async () => {
      (folderAccess.canUserAccessFolder as jest.Mock).mockResolvedValue(false);
      const res = await request(app)
        .get(`/api/companies/${companyId}/files`)
        .set(authHeader)
        .query({ folder_id: folderId });
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/access/i);
    });

    it('returns 200 and filters files by folder access when using ids', async () => {
      (prisma.file.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'file-1',
          folder_id: folderId,
          name: 'f1',
          company_id: companyId,
          storage_path: '/path',
          size_bytes: 100,
          mime_type: 'text/plain',
          created_at: new Date(),
          metadata_values: [],
        },
      ]);
      const res = await request(app)
        .get(`/api/companies/${companyId}/files`)
        .set(authHeader)
        .query({ ids: 'file-1' });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /api/companies/:companyId/files/by-metadata', () => {
    it('returns 200 and fileIds array (only in accessible folders)', async () => {
      (prisma.filesMetadataValue.findMany as jest.Mock).mockResolvedValue([
        { files_id: 'file-1' },
      ]);
      (prisma.file.findMany as jest.Mock).mockResolvedValue([
        { id: 'file-1', folder_id: folderId },
      ]);
      const res = await request(app)
        .get(`/api/companies/${companyId}/files/by-metadata`)
        .set(authHeader)
        .query({ metadata_id: 'key-1' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('fileIds');
      expect(Array.isArray(res.body.fileIds)).toBe(true);
    });

    it('returns 400 when metadata_id missing', async () => {
      const res = await request(app)
        .get(`/api/companies/${companyId}/files/by-metadata`)
        .set(authHeader);
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/companies/:companyId/folders/:folderId/upload', () => {
    it('returns 403 when user has only read permission', async () => {
      (folderAccess.getUserFolderPermissionLevel as jest.Mock).mockResolvedValue('read');
      (prisma.folder.findFirst as jest.Mock).mockResolvedValue({
        id: folderId,
        company_id: companyId,
      });
      const res = await request(app)
        .post(`/api/companies/${companyId}/folders/${folderId}/upload`)
        .set(authHeader)
        .attach('file', Buffer.from('test'), 'test.txt');
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/[Ww]rite permission/);
    });
  });

  describe('DELETE /api/companies/:companyId/files/:fileId', () => {
    it('returns 403 when user has only read permission', async () => {
      (folderAccess.getUserFolderPermissionLevel as jest.Mock).mockResolvedValue('read');
      (prisma.file.findFirst as jest.Mock).mockResolvedValue({
        id: 'file-1',
        folder_id: folderId,
        company_id: companyId,
        storage_path: 'companies/c1/f1/x',
      });
      const res = await request(app)
        .delete(`/api/companies/${companyId}/files/file-1`)
        .set(authHeader);
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/[Ww]rite permission/);
    });

    it('returns 204 when user has write permission', async () => {
      (folderAccess.getUserFolderPermissionLevel as jest.Mock).mockResolvedValue('write');
      (prisma.file.findFirst as jest.Mock).mockResolvedValue({
        id: 'file-1',
        folder_id: folderId,
        company_id: companyId,
        storage_path: 'companies/c1/f1/x',
      });
      (prisma.file.delete as jest.Mock).mockResolvedValue({});
      const res = await request(app)
        .delete(`/api/companies/${companyId}/files/file-1`)
        .set(authHeader);
      expect(res.status).toBe(204);
    });
  });
});
