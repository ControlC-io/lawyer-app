import { Prisma } from '@prisma/client';
import { documentsController } from '../controllers/documents.controller';
import { prisma } from '../lib/prisma';
import { ragieService, RagieServiceError } from '../services/ragie.service';

jest.mock('../lib/prisma', () => ({
  prisma: {
    file: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('../services/ragie.service', () => ({
  ragieService: {
    uploadFileDocument: jest.fn(),
    deleteFileDocument: jest.fn(),
  },
  RagieServiceError: class RagieServiceError extends Error {
    statusCode: number;
    constructor(message: string, statusCode = 500) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));

function createMockRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
}

describe('documentsController Ragie endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uploads a file to Ragie and stores linkage fields', async () => {
    (prisma.file.findFirst as jest.Mock).mockResolvedValue({
      id: 'file-1',
      name: 'kb.pdf',
      mime_type: 'application/pdf',
      created_at: new Date('2026-04-15T12:00:00.000Z'),
      storage_path: 'companies/company-1/flat/kb.pdf',
      ragie_document_id: null,
      metadata_values: [],
    });
    (ragieService.uploadFileDocument as jest.Mock).mockResolvedValue({
      documentId: 'ragie-doc-1',
      partition: 'company-company-1',
      status: 'pending',
      metadata: { floowly_file_id: 'file-1' },
    });

    const req: any = {
      params: { companyId: 'company-1', fileId: 'file-1' },
      user: { id: 'admin-1', super_admin: true },
    };
    const res = createMockRes();

    await documentsController.uploadFileToRagie(req, res);

    expect(ragieService.uploadFileDocument).toHaveBeenCalled();
    expect(prisma.file.update).toHaveBeenCalledWith({
      where: { id: 'file-1' },
      data: expect.objectContaining({
        ragie_document_id: 'ragie-doc-1',
        ragie_partition: 'company-company-1',
        ragie_status: 'pending',
        ragie_metadata: { floowly_file_id: 'file-1' } as Prisma.InputJsonValue,
      }),
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 409 when file is already linked to Ragie', async () => {
    (prisma.file.findFirst as jest.Mock).mockResolvedValue({
      id: 'file-1',
      ragie_document_id: 'ragie-existing',
      metadata_values: [],
    });

    const req: any = {
      params: { companyId: 'company-1', fileId: 'file-1' },
      user: { id: 'admin-1', super_admin: true },
    };
    const res = createMockRes();

    await documentsController.uploadFileToRagie(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(ragieService.uploadFileDocument).not.toHaveBeenCalled();
  });

  it('maps Ragie upload errors to HTTP responses', async () => {
    (prisma.file.findFirst as jest.Mock).mockResolvedValue({
      id: 'file-1',
      name: 'kb.pdf',
      mime_type: 'application/pdf',
      created_at: new Date(),
      storage_path: 'companies/company-1/flat/kb.pdf',
      ragie_document_id: null,
      metadata_values: [],
    });
    (ragieService.uploadFileDocument as jest.Mock).mockRejectedValue(
      new RagieServiceError('Ragie API key not configured', 503),
    );

    const req: any = {
      params: { companyId: 'company-1', fileId: 'file-1' },
      user: { id: 'admin-1', super_admin: true },
    };
    const res = createMockRes();

    await documentsController.uploadFileToRagie(req, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ error: 'Ragie API key not configured' });
  });

  it('removes a linked file from Ragie and clears linkage fields', async () => {
    (prisma.file.findFirst as jest.Mock).mockResolvedValue({
      id: 'file-1',
      ragie_document_id: 'ragie-doc-1',
      ragie_partition: 'company-company-1',
    });

    const req: any = {
      params: { companyId: 'company-1', fileId: 'file-1' },
      user: { id: 'admin-1', super_admin: true },
    };
    const res = createMockRes();

    await documentsController.removeFileFromRagie(req, res);

    expect(ragieService.deleteFileDocument).toHaveBeenCalledWith({
      documentId: 'ragie-doc-1',
      partition: 'company-company-1',
    });
    expect(prisma.file.update).toHaveBeenCalledWith({
      where: { id: 'file-1' },
      data: {
        ragie_document_id: null,
        ragie_partition: null,
        ragie_uploaded_at: null,
        ragie_status: null,
        ragie_metadata: Prisma.JsonNull,
      },
    });
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it('returns 400 when removing a non-linked file', async () => {
    (prisma.file.findFirst as jest.Mock).mockResolvedValue({
      id: 'file-1',
      ragie_document_id: null,
      ragie_partition: null,
    });

    const req: any = {
      params: { companyId: 'company-1', fileId: 'file-1' },
      user: { id: 'admin-1', super_admin: true },
    };
    const res = createMockRes();

    await documentsController.removeFileFromRagie(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(ragieService.deleteFileDocument).not.toHaveBeenCalled();
  });
});
