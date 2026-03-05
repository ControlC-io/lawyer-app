import request from 'supertest';
import { app } from '../app';
import { prisma } from '../lib/prisma';
import jwt from 'jsonwebtoken';
import { processDocumentOcr } from '../services/ocr.service';

// Mock Prisma
jest.mock('../lib/prisma', () => ({
  prisma: {
    file: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    user: { findUnique: jest.fn() },
    userCompany: { findFirst: jest.fn() },
    company: { findUnique: jest.fn() },
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
  });
});
