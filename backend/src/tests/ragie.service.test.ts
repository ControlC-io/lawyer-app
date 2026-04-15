import { Readable } from 'stream';
import { Ragie } from 'ragie';
import { ragieService } from '../services/ragie.service';
import { storageService } from '../services/storage.service';

jest.mock('../services/storage.service', () => ({
  storageService: {
    getDocumentsBucket: jest.fn(() => 'documents'),
    downloadFile: jest.fn(),
  },
}));

jest.mock('ragie', () => ({
  Ragie: jest.fn(),
}));

describe('ragieService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RAGIE_API_KEY = 'test-ragie-key';
    delete process.env.RAGIE_API_URL;
  });

  it('builds partition and metadata when uploading', async () => {
    const createMock = jest.fn().mockResolvedValue({
      id: 'ragie-doc-1',
      partition: 'company-company-123',
      status: 'pending',
    });
    (Ragie as unknown as jest.Mock).mockImplementation(() => ({
      documents: {
        create: createMock,
        delete: jest.fn(),
      },
    }));
    (storageService.downloadFile as jest.Mock).mockResolvedValue(
      Readable.from([Buffer.from('file-content')]),
    );

    const result = await ragieService.uploadFileDocument({
      companyId: 'Company-123',
      file: {
        id: 'file-123',
        name: 'handbook.pdf',
        mime_type: 'application/pdf',
        created_at: new Date('2026-04-15T12:00:00.000Z'),
        storage_path: 'companies/company-123/flat/1_handbook.pdf',
        metadata_values: [
          { value: 'HR', metadata: { name: 'Department' } },
          { value: 'Policy', metadata: { name: 'Doc Type' } },
        ],
      },
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'handbook.pdf',
        externalId: 'file-123',
        partition: 'company-company-123',
      }),
    );
    expect(createMock.mock.calls[0][0].metadata).toEqual(
      expect.objectContaining({
        floowly_company_id: 'Company-123',
        floowly_file_id: 'file-123',
        floowly_meta_department: 'HR',
        floowly_meta_doc_type: 'Policy',
      }),
    );
    expect(result.documentId).toBe('ragie-doc-1');
    expect(result.partition).toBe('company-company-123');
  });

  it('throws a 503 error when Ragie key is missing', async () => {
    delete process.env.RAGIE_API_KEY;

    await expect(
      ragieService.uploadFileDocument({
        companyId: 'company-1',
        file: {
          id: 'file-1',
          name: 'file.pdf',
          mime_type: 'application/pdf',
          created_at: new Date(),
          storage_path: 'companies/company-1/flat/file.pdf',
          metadata_values: [],
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 503,
      message: 'Ragie API key not configured',
    });
  });
});
