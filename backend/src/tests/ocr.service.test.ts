import { processDocumentOcr } from '../services/ocr.service';
import { prisma } from '../lib/prisma';

// Mock Prisma
jest.mock('../lib/prisma', () => ({
  prisma: {
    file: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

// Mock storage service
const mockDownloadFile = jest.fn();
const mockGetFileStat = jest.fn();
jest.mock('../services/storage.service', () => ({
  storageService: {
    downloadFile: (...args: any[]) => mockDownloadFile(...args),
    getDocumentsBucket: () => 'documents',
    getFileStat: (...args: any[]) => mockGetFileStat(...args),
  },
}));

// Mock OCR provider
const mockProcess = jest.fn();
jest.mock('../services/ocr/index', () => ({
  getOcrProvider: () => ({
    name: 'mistral',
    process: mockProcess,
  }),
}));

describe('processDocumentOcr', () => {
  const mockFile = {
    id: 'file-1',
    name: 'test.pdf',
    storage_path: 'companies/c1/123_test.pdf',
    mime_type: 'application/pdf',
    size_bytes: BigInt(1024),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.file.findUnique as jest.Mock).mockResolvedValue(mockFile);
    (prisma.file.update as jest.Mock).mockResolvedValue({});
    mockGetFileStat.mockResolvedValue({ size: 1024 });
  });

  it('should process a document successfully', async () => {
    const { Readable } = require('stream');
    const stream = new Readable();
    stream.push(Buffer.from('fake-pdf'));
    stream.push(null);
    mockDownloadFile.mockResolvedValue(stream);

    mockProcess.mockResolvedValue({
      markdown: '# Extracted text',
      pagesProcessed: 1,
      provider: 'mistral',
      model: 'mistral-ocr-latest',
    });

    await processDocumentOcr('file-1');

    // Should set status to processing first
    expect(prisma.file.update).toHaveBeenCalledWith({
      where: { id: 'file-1' },
      data: { ocr_status: 'processing' },
    });

    // Should set completed with results
    expect(prisma.file.update).toHaveBeenLastCalledWith({
      where: { id: 'file-1' },
      data: expect.objectContaining({
        ocr_status: 'completed',
        ocr_markdown: '# Extracted text',
        ocr_provider: 'mistral',
        ocr_model: 'mistral-ocr-latest',
        ocr_error: null,
      }),
    });
  });

  it('should fail for unsupported mime type', async () => {
    (prisma.file.findUnique as jest.Mock).mockResolvedValue({
      ...mockFile,
      mime_type: 'text/plain',
    });

    await processDocumentOcr('file-1');

    expect(prisma.file.update).toHaveBeenLastCalledWith({
      where: { id: 'file-1' },
      data: expect.objectContaining({
        ocr_status: 'failed',
        ocr_error: expect.stringContaining('Unsupported file type'),
      }),
    });
    expect(mockDownloadFile).not.toHaveBeenCalled();
  });

  it('should fail for files exceeding 50 MB', async () => {
    (prisma.file.findUnique as jest.Mock).mockResolvedValue({
      ...mockFile,
      size_bytes: BigInt(51 * 1024 * 1024),
    });

    await processDocumentOcr('file-1');

    expect(prisma.file.update).toHaveBeenLastCalledWith({
      where: { id: 'file-1' },
      data: expect.objectContaining({
        ocr_status: 'failed',
        ocr_error: 'File exceeds 50 MB OCR limit.',
      }),
    });
  });

  it('should fail when file not found', async () => {
    (prisma.file.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(processDocumentOcr('file-nonexistent')).rejects.toThrow('File not found');
  });

  it('should handle provider errors gracefully', async () => {
    const { Readable } = require('stream');
    const stream = new Readable();
    stream.push(Buffer.from('fake-pdf'));
    stream.push(null);
    mockDownloadFile.mockResolvedValue(stream);

    mockProcess.mockRejectedValue(new Error('OCR API returned 500'));

    await processDocumentOcr('file-1');

    expect(prisma.file.update).toHaveBeenLastCalledWith({
      where: { id: 'file-1' },
      data: expect.objectContaining({
        ocr_status: 'failed',
        ocr_error: 'OCR API returned 500',
      }),
    });
  });
});
