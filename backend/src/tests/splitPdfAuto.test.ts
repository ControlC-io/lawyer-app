import jwt from 'jsonwebtoken';
import request from 'supertest';
import { app } from '../app';
import { prisma } from '../lib/prisma';

jest.mock('../lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    userCompany: { findFirst: jest.fn() },
    documentType: { findMany: jest.fn() },
    filesMetadataKey: { findMany: jest.fn(), findFirst: jest.fn() },
    file: { create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    filesMetadataValue: { create: jest.fn(), deleteMany: jest.fn() },
    fileHistoryEvent: { create: jest.fn() },
  },
}));

jest.mock('../services/storage.service', () => ({
  storageService: {
    getDocumentsBucket: jest.fn(() => 'documents'),
    uploadFile: jest.fn(async () => undefined),
    deleteFile: jest.fn(async () => undefined),
  },
}));

jest.mock('../services/ocr.service', () => ({
  runOcrAndGetMarkdown: jest.fn(async () => '#Page 1 over 2\nHello'),
  processDocumentOcr: jest.fn(async () => undefined),
}));

jest.mock('../services/pdf-split.service', () => ({
  getPdfPageCount: jest.fn(async () => 2),
  proposeSplitWithGemini: jest.fn(async () => [
    {
      name: 'Part A',
      document_type_id: 'type-1',
      metadata: { 'meta-1': 'x' },
      start_page: 1,
      end_page: 1,
    },
    {
      name: 'Part B',
      document_type_id: 'type-1',
      metadata: { 'meta-1': 'y' },
      start_page: 2,
      end_page: 2,
    },
  ]),
  validateSegments: jest.fn((segments: any) => segments),
  applyPdfSplit: jest.fn(async () => [
    { buffer: Buffer.from('pdf-a'), suggestedFileName: 'Part A.pdf' },
    { buffer: Buffer.from('pdf-b'), suggestedFileName: 'Part B.pdf' },
  ]),
}));

describe('Split PDF Auto endpoint', () => {
  const companyId = 'company-123';
  const userId = 'user-123';
  const prismaMock = prisma as any;
  let permissionKeys: string[] = [];
  let token = '';

  const mockDocumentType = {
    id: 'type-1',
    name: 'Invoices',
    naming_instructions: 'Use invoice number',
    metadata_key_ids: ['meta-1'],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'test-secret';
    permissionKeys = [];
    token = jwt.sign({ userId }, process.env.JWT_SECRET);

    const pdfSplit = require('../services/pdf-split.service');
    (pdfSplit.getPdfPageCount as jest.Mock).mockResolvedValue(2);
    (pdfSplit.proposeSplitWithGemini as jest.Mock).mockResolvedValue([
      { name: 'Part A', document_type_id: 'type-1', metadata: { 'meta-1': 'x' }, start_page: 1, end_page: 1 },
      { name: 'Part B', document_type_id: 'type-1', metadata: { 'meta-1': 'y' }, start_page: 2, end_page: 2 },
    ]);
    (pdfSplit.validateSegments as jest.Mock).mockImplementation((segments: any) => segments);
    (pdfSplit.applyPdfSplit as jest.Mock).mockResolvedValue([
      { buffer: Buffer.from('pdf-a'), suggestedFileName: 'Part A.pdf' },
      { buffer: Buffer.from('pdf-b'), suggestedFileName: 'Part B.pdf' },
    ]);

    const ocr = require('../services/ocr.service');
    (ocr.runOcrAndGetMarkdown as jest.Mock).mockResolvedValue('#Page 1 over 2\nHello');
    (ocr.processDocumentOcr as jest.Mock).mockResolvedValue(undefined);

    (prismaMock.user.findUnique as jest.Mock).mockResolvedValue({
      id: userId,
      email: 'user@example.com',
      profile: { admin_role: { super_admin: false } },
    });

    (prismaMock.userCompany.findFirst as jest.Mock).mockImplementation(() =>
      Promise.resolve({
        user_id: userId,
        company_id: companyId,
        role: 'company_admin',
        custom_role: {
          permissions: permissionKeys.map((permission_key) => ({ permission_key })),
        },
      }),
    );

    (prismaMock.fileHistoryEvent.create as jest.Mock).mockResolvedValue({});
    (prismaMock.filesMetadataKey.findFirst as jest.Mock).mockResolvedValue(null);
  });

  it('rejects non-PDF upload', async () => {
    permissionKeys = ['documents.view'];
    (prismaMock.documentType.findMany as jest.Mock).mockResolvedValue([mockDocumentType]);
    (prismaMock.filesMetadataKey.findMany as jest.Mock).mockResolvedValue([]);

    const response = await request(app)
      .post(`/api/companies/${companyId}/documents/split-pdf/auto`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('not a pdf'), { filename: 'file.txt' });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('PDF');
  });

  it('returns 400 when no document types are configured', async () => {
    permissionKeys = ['documents.view'];
    (prismaMock.documentType.findMany as jest.Mock).mockResolvedValue([]);

    const response = await request(app)
      .post(`/api/companies/${companyId}/documents/split-pdf/auto`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('%PDF-1.4'), { filename: 'file.pdf' });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('document type');
  });

  it('creates split files and deletes original by default', async () => {
    permissionKeys = ['documents.view'];
    (prismaMock.documentType.findMany as jest.Mock).mockResolvedValue([mockDocumentType]);
    (prismaMock.filesMetadataKey.findMany as jest.Mock).mockResolvedValue([
      { id: 'meta-1', name: 'Kind', value_kind: 'free_text', allowed_values: null },
    ]);

    (prismaMock.file.create as jest.Mock)
      .mockResolvedValueOnce({ id: 'source-1', storage_path: 'companies/company-123/flat/source.pdf' })
      .mockResolvedValueOnce({ id: 'out-1', name: 'Part A.pdf' })
      .mockResolvedValueOnce({ id: 'out-2', name: 'Part B.pdf' });

    const response = await request(app)
      .post(`/api/companies/${companyId}/documents/split-pdf/auto`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('%PDF-1.4'), { filename: 'file.pdf' });

    expect(response.status).toBe(201);
    expect(response.body.created).toHaveLength(2);
    expect(response.body.removedOriginal).toBe(true);
    expect(response.body.ocrQueued).toBe(true);
    expect(response.body.pageCount).toBe(2);
    expect(response.body.sourceFileId).toBe('source-1');

    expect(prismaMock.file.delete).toHaveBeenCalledWith({ where: { id: 'source-1' } });
    expect(prismaMock.filesMetadataValue.create).toHaveBeenCalled();
  });
});
