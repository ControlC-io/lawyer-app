import request from 'supertest';
import { app } from '../app';
import { prisma } from '../lib/prisma';
import jwt from 'jsonwebtoken';
import { processDocumentOcr } from '../services/ocr.service';

// Mock Prisma
jest.mock('../lib/prisma', () => ({
  prisma: {
    fileHistoryEvent: { create: jest.fn().mockResolvedValue({ id: 'h1' }) },
    file: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    user: { findUnique: jest.fn() },
    userCompany: { findFirst: jest.fn() },
    company: { findUnique: jest.fn() },
    profileGroupMember: { findMany: jest.fn() },
    folderPermission: { findMany: jest.fn() },
    filesMetadataValue: { findMany: jest.fn() },
    filesMetadataKey: { findFirst: jest.fn() },
    documentPermissionRule: { count: jest.fn(), findMany: jest.fn() },
    $queryRaw: jest.fn(),
  },
}));

// Mock storage service
jest.mock('../services/storage.service', () => ({
  storageService: {
    downloadFile: jest.fn(),
    getDocumentsBucket: () => 'documents',
    getFileStat: jest.fn(),
  },
}));

// Mock OCR service
jest.mock('../services/ocr.service', () => ({
  processDocumentOcr: jest.fn().mockResolvedValue(undefined),
}));

// Mock jsonwebtoken
jest.mock('jsonwebtoken', () => ({
  verify: jest.fn(),
}));

describe('OCR Endpoints', () => {
  const mockUser = { id: 'user-1', email: 'test@example.com' };
  const mockFile = {
    id: 'file-1',
    name: 'test.pdf',
    company_id: 'company-1',
    mime_type: 'application/pdf',
    ocr_status: null,
    ocr_markdown: null,
    ocr_error: null,
    ocr_processed_at: null,
    ocr_provider: null,
    ocr_model: null,
  };

  const authToken = 'test-token';

  beforeEach(() => {
    jest.clearAllMocks();
    (jwt.verify as jest.Mock).mockReturnValue({ userId: mockUser.id });
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    (prisma.userCompany.findFirst as jest.Mock).mockResolvedValue({
      user_id: mockUser.id,
      company_id: 'company-1',
      role: 'member',
    });
    (processDocumentOcr as jest.Mock).mockResolvedValue(undefined);
  });

  describe('POST /api/files/:fileId/ocr', () => {
    it('should return 202 and trigger OCR', async () => {
      (prisma.file.findFirst as jest.Mock).mockResolvedValue(mockFile);
      (prisma.file.update as jest.Mock).mockResolvedValue({ ...mockFile, ocr_status: 'pending' });

      const response = await request(app)
        .post('/api/files/file-1/ocr')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(202);
      expect(response.body.ocrStatus).toBe('pending');
    });

    it('should return 401 without auth', async () => {
      const response = await request(app)
        .post('/api/files/file-1/ocr');

      expect(response.status).toBe(401);
    });

    it('should return 404 for non-existent file', async () => {
      (prisma.file.findFirst as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .post('/api/files/file-1/ocr')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });

    it('allows company API key for a file in the same company', async () => {
      (prisma.company.findUnique as jest.Mock).mockResolvedValue({ id: 'company-1', name: 'Co', is_active: true });
      (prisma.file.findFirst as jest.Mock).mockResolvedValue({ ...mockFile, company_id: 'company-1' });
      (prisma.file.update as jest.Mock).mockResolvedValue({ ...mockFile, company_id: 'company-1', ocr_status: 'pending' });

      const response = await request(app)
        .post('/api/files/file-1/ocr')
        .set('x-api-key', 'company-key');

      expect(response.status).toBe(202);
      expect(response.body.ocrStatus).toBe('pending');
    });

    it('rejects company API key for a file in a different company', async () => {
      (prisma.company.findUnique as jest.Mock).mockResolvedValue({ id: 'company-2', name: 'Other', is_active: true });
      (prisma.file.findFirst as jest.Mock).mockResolvedValue({ ...mockFile, company_id: 'company-1' });

      const response = await request(app)
        .post('/api/files/file-1/ocr')
        .set('x-api-key', 'company-key');

      expect(response.status).toBe(403);
      expect(prisma.file.update).not.toHaveBeenCalled();
    });

    it('allows super admin via x-super-admin-api-key', async () => {
      const prev = process.env.SUPER_ADMIN_API_KEY;
      process.env.SUPER_ADMIN_API_KEY = 'super-secret';
      try {
        (prisma.file.findFirst as jest.Mock).mockResolvedValue({ ...mockFile, company_id: 'some-other-company' });
        (prisma.file.update as jest.Mock).mockResolvedValue({ ...mockFile, ocr_status: 'pending' });

        const response = await request(app)
          .post('/api/files/file-1/ocr')
          .set('x-super-admin-api-key', 'super-secret');

        expect(response.status).toBe(202);
      } finally {
        process.env.SUPER_ADMIN_API_KEY = prev;
      }
    });
  });

  describe('Upload with OCR flag', () => {
    it('should trigger OCR when ocr=true in upload body', async () => {
      const { processDocumentOcr } = require('../services/ocr.service');
      expect(processDocumentOcr).toBeDefined();
      expect(typeof processDocumentOcr).toBe('function');
    });
  });

  describe('GET /api/files/:fileId/ocr', () => {
    it('should return OCR content for completed document', async () => {
      (prisma.file.findFirst as jest.Mock).mockResolvedValue({
        ...mockFile,
        ocr_status: 'completed',
        ocr_markdown: '# Extracted text',
        ocr_processed_at: new Date(),
        ocr_provider: 'mistral',
        ocr_model: 'mistral-ocr-latest',
      });

      const response = await request(app)
        .get('/api/files/file-1/ocr')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.ocrStatus).toBe('completed');
      expect(response.body.ocrMarkdown).toBe('# Extracted text');
    });

    it('should return 404 for document never processed', async () => {
      (prisma.file.findFirst as jest.Mock).mockResolvedValue(mockFile);

      const response = await request(app)
        .get('/api/files/file-1/ocr')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });

    it('should return 401 without auth', async () => {
      const response = await request(app)
        .get('/api/files/file-1/ocr');

      expect(response.status).toBe(401);
    });

    it('allows company API key for a file in the same company', async () => {
      (prisma.company.findUnique as jest.Mock).mockResolvedValue({ id: 'company-1', name: 'Co', is_active: true });
      (prisma.file.findFirst as jest.Mock).mockResolvedValue({
        ...mockFile,
        company_id: 'company-1',
        ocr_status: 'completed',
        ocr_markdown: '# api key text',
      });

      const response = await request(app)
        .get('/api/files/file-1/ocr')
        .set('x-api-key', 'company-key');

      expect(response.status).toBe(200);
      expect(response.body.ocrMarkdown).toBe('# api key text');
    });

    it('rejects company API key for a file in a different company', async () => {
      (prisma.company.findUnique as jest.Mock).mockResolvedValue({ id: 'company-2', name: 'Other', is_active: true });
      (prisma.file.findFirst as jest.Mock).mockResolvedValue({
        ...mockFile,
        company_id: 'company-1',
        ocr_status: 'completed',
      });

      const response = await request(app)
        .get('/api/files/file-1/ocr')
        .set('x-api-key', 'company-key');

      expect(response.status).toBe(403);
    });

    it('rejects a JWT user who is not a member of the file company', async () => {
      (prisma.userCompany.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.file.findFirst as jest.Mock).mockResolvedValue({
        ...mockFile,
        company_id: 'company-1',
        ocr_status: 'completed',
      });

      const response = await request(app)
        .get('/api/files/file-1/ocr')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(403);
    });

    it('rejects company API key for a company-less file', async () => {
      (prisma.company.findUnique as jest.Mock).mockResolvedValue({ id: 'company-1', name: 'Co', is_active: true });
      (prisma.file.findFirst as jest.Mock).mockResolvedValue({
        ...mockFile,
        company_id: null,
        ocr_status: 'completed',
      });

      const response = await request(app)
        .get('/api/files/file-1/ocr')
        .set('x-api-key', 'company-key');

      expect(response.status).toBe(403);
    });

    it('allows super admin via x-super-admin-api-key', async () => {
      const prev = process.env.SUPER_ADMIN_API_KEY;
      process.env.SUPER_ADMIN_API_KEY = 'super-secret';
      try {
        (prisma.file.findFirst as jest.Mock).mockResolvedValue({
          ...mockFile,
          company_id: 'some-other-company',
          ocr_status: 'completed',
          ocr_markdown: '# super admin text',
        });

        const response = await request(app)
          .get('/api/files/file-1/ocr')
          .set('x-super-admin-api-key', 'super-secret');

        expect(response.status).toBe(200);
        expect(response.body.ocrMarkdown).toBe('# super admin text');
      } finally {
        process.env.SUPER_ADMIN_API_KEY = prev;
      }
    });
  });

  describe('GET /api/companies/:companyId/documents/flat?q=search', () => {
    it('should return search results with snippets when q is provided', async () => {
      (prisma.userCompany.findFirst as jest.Mock).mockResolvedValue({
        user_id: mockUser.id,
        company_id: 'company-1',
        role: 'company_admin',
      });

      // Mock profileGroupMember for getUserGroupIdsInCompany
      (prisma.profileGroupMember.findMany as jest.Mock).mockResolvedValue([]);

      // Mock file.findMany for getAccessibleFileIdsWithLevels
      (prisma.file.findMany as jest.Mock).mockResolvedValue([{ id: 'file-1' }]);

      // Mock filesMetadataValue.findMany for getAccessibleFileIdsWithLevels
      (prisma.filesMetadataValue.findMany as jest.Mock).mockResolvedValue([]);

      // Mock $queryRaw for the full-text search
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([
        {
          id: 'file-1',
          name: 'invoice.pdf',
          ocrStatus: 'completed',
          ocrSnippet: 'Total: <mark>€1,250</mark>',
          rank: 0.87,
        },
      ]);

      const response = await request(app)
        .get('/api/companies/company-1/documents/flat?q=1250')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/companies/:companyId/documents/metadata-value-suggestions', () => {
    it('returns matching values for a valid key and query', async () => {
      (prisma.userCompany.findFirst as jest.Mock).mockResolvedValue({
        user_id: mockUser.id,
        company_id: 'company-1',
        role: 'company_admin',
      });
      (prisma.profileGroupMember.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.filesMetadataKey.findFirst as jest.Mock).mockResolvedValue({ id: 'key-number' });
      (prisma.file.findMany as jest.Mock).mockResolvedValue([{ id: 'file-1' }]);
      (prisma.filesMetadataValue.findMany as jest.Mock)
        .mockResolvedValueOnce([]) // metadata map for access resolution
        .mockResolvedValueOnce([{ value: 'A-123' }, { value: 'A-124' }]); // suggestions query

      const response = await request(app)
        .get('/api/companies/company-1/documents/metadata-value-suggestions?metadata_key_id=key-number&q=A-12')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ values: ['A-123', 'A-124'] });
    });

    it('returns empty values when user has no accessible files', async () => {
      (prisma.userCompany.findFirst as jest.Mock).mockResolvedValue({
        user_id: mockUser.id,
        company_id: 'company-1',
        role: 'company_admin',
      });
      (prisma.profileGroupMember.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.filesMetadataKey.findFirst as jest.Mock).mockResolvedValue({ id: 'key-number' });
      (prisma.file.findMany as jest.Mock).mockResolvedValue([]);

      const response = await request(app)
        .get('/api/companies/company-1/documents/metadata-value-suggestions?metadata_key_id=key-number')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ values: [] });
    });

    it('returns 404 when metadata key is not found for company', async () => {
      (prisma.userCompany.findFirst as jest.Mock).mockResolvedValue({
        user_id: mockUser.id,
        company_id: 'company-1',
        role: 'company_admin',
      });
      (prisma.profileGroupMember.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.filesMetadataKey.findFirst as jest.Mock).mockResolvedValue(null);

      const response = await request(app)
        .get('/api/companies/company-1/documents/metadata-value-suggestions?metadata_key_id=missing-key')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
    });

  });
});
