import { FilesMetadataValueKind } from '@prisma/client';
import {
  extractAndApplyMetadataFromOcr,
  parsePendingMetadataExtractConfig,
} from '../services/metadata-from-ocr-extraction.service';
import { prisma } from '../lib/prisma';
import { extractMetadataFromOcrWithGemini, proposeFileNameFromOcrWithGemini } from '../services/pdf-split.service';

jest.mock('../lib/prisma', () => ({
  prisma: {
    file: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    filesMetadataKey: {
      findMany: jest.fn(),
    },
    filesMetadataValue: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    fileHistoryEvent: {
      create: jest.fn().mockResolvedValue({ id: 'h1' }),
    },
  },
}));

jest.mock('../services/pdf-split.service', () => ({
  extractMetadataFromOcrWithGemini: jest.fn(),
  proposeFileNameFromOcrWithGemini: jest.fn(),
}));

describe('extractAndApplyMetadataFromOcr', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.filesMetadataValue.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.file.findFirst as jest.Mock).mockResolvedValue({
      id: 'file-1',
      name: 'original-file.PDF',
      ocr_status: 'completed',
      ocr_markdown: '#Page 1 over 1\nInvoice 123',
    });
    (prisma.filesMetadataKey.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'key-1',
        name: 'Invoice Number',
        value_kind: FilesMetadataValueKind.free_text,
        allowed_values: [],
      },
    ]);
    (extractMetadataFromOcrWithGemini as jest.Mock).mockResolvedValue({
      'key-1': 'INV-123',
    });
    (prisma.filesMetadataValue.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.filesMetadataValue.create as jest.Mock).mockResolvedValue({ id: 'mv-1' });
    (prisma.file.update as jest.Mock).mockResolvedValue({ id: 'file-1' });
  });

  it('keeps original name when no rename instructions are provided', async () => {
    const result = await extractAndApplyMetadataFromOcr({
      companyId: 'company-1',
      fileId: 'file-1',
      metadataKeyIds: ['key-1'],
      currentDate: '2026-04-23',
    });

    expect(proposeFileNameFromOcrWithGemini).not.toHaveBeenCalled();
    expect(prisma.file.update).toHaveBeenCalledWith({
      where: { id: 'file-1' },
      data: expect.objectContaining({
        metadata_ai_extract_status: 'completed',
      }),
    });
    const updateCall = (prisma.file.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.name).toBeUndefined();
    expect(result.renamedTo).toBeUndefined();
  });

  it('renames file when rename instructions are provided and preserves extension', async () => {
    (proposeFileNameFromOcrWithGemini as jest.Mock).mockResolvedValue('Invoice 123 - ACME.pdf');

    const result = await extractAndApplyMetadataFromOcr({
      companyId: 'company-1',
      fileId: 'file-1',
      metadataKeyIds: ['key-1'],
      renameInstructions: 'Use invoice number and supplier',
      currentDate: '2026-04-23',
    });

    expect(proposeFileNameFromOcrWithGemini).toHaveBeenCalledTimes(1);
    expect(prisma.file.update).toHaveBeenCalledWith({
      where: { id: 'file-1' },
      data: expect.objectContaining({
        name: 'Invoice 123 - ACME.PDF',
      }),
    });
    expect(result.renamedTo).toBe('Invoice 123 - ACME.PDF');
  });

  it('does not rename file when rename instructions are empty/whitespace', async () => {
    const result = await extractAndApplyMetadataFromOcr({
      companyId: 'company-1',
      fileId: 'file-1',
      metadataKeyIds: ['key-1'],
      renameInstructions: '   ',
      currentDate: '2026-04-23',
    });

    expect(proposeFileNameFromOcrWithGemini).not.toHaveBeenCalled();
    const updateCall = (prisma.file.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.name).toBeUndefined();
    expect(result.renamedTo).toBeUndefined();
  });
});

describe('parsePendingMetadataExtractConfig', () => {
  it('parses legacy array format', () => {
    const parsed = parsePendingMetadataExtractConfig(['meta-1', ' meta-2 ']);
    expect(parsed).toEqual({ metadataKeyIds: ['meta-1', 'meta-2'] });
  });

  it('parses object format with optional rename instructions', () => {
    const parsed = parsePendingMetadataExtractConfig({
      metadataKeyIds: ['meta-1', ''],
      renameInstructions: ' rename by invoice ',
    });
    expect(parsed).toEqual({
      metadataKeyIds: ['meta-1'],
      renameInstructions: 'rename by invoice',
    });
  });
});
