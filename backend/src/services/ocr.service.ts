import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { storageService } from './storage.service';
import { getOcrProvider } from './ocr/index';
import { runPendingMetadataExtractionAfterOcr } from './metadata-from-ocr-extraction.service';

const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/tiff',
  'image/webp',
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

function hasPendingMetadataExtract(pending: unknown): boolean {
  return Array.isArray(pending) && pending.length > 0;
}

export async function processDocumentOcr(fileId: string): Promise<void> {
  const file = await prisma.file.findUnique({
    where: { id: fileId },
    select: {
      id: true,
      name: true,
      storage_path: true,
      mime_type: true,
      size_bytes: true,
      ocr_pending_metadata_key_ids: true,
    },
  });

  if (!file) throw new Error('File not found');

  const pendingExtract = hasPendingMetadataExtract(file.ocr_pending_metadata_key_ids);

  // Check mime type
  if (!file.mime_type || !SUPPORTED_MIME_TYPES.includes(file.mime_type)) {
    await prisma.file.update({
      where: { id: fileId },
      data: {
        ocr_status: 'failed',
        ocr_error: `Unsupported file type: ${file.mime_type || 'unknown'}. Supported: PDF, PNG, JPG, TIFF, WebP.`,
        ...(pendingExtract
          ? {
              ocr_pending_metadata_key_ids: Prisma.DbNull,
              metadata_ai_extract_status: 'failed',
              metadata_ai_extract_error: 'OCR skipped: unsupported file type',
            }
          : {}),
      },
    });
    return;
  }

  // Check file size
  const sizeBytes = file.size_bytes ? Number(file.size_bytes) : 0;
  if (sizeBytes > MAX_FILE_SIZE) {
    await prisma.file.update({
      where: { id: fileId },
      data: {
        ocr_status: 'failed',
        ocr_error: 'File exceeds 50 MB OCR limit.',
        ...(pendingExtract
          ? {
              ocr_pending_metadata_key_ids: Prisma.DbNull,
              metadata_ai_extract_status: 'failed',
              metadata_ai_extract_error: 'OCR skipped: file too large',
            }
          : {}),
      },
    });
    return;
  }

  // Set processing status
  await prisma.file.update({
    where: { id: fileId },
    data: { ocr_status: 'processing' },
  });

  try {
    // Download file from MinIO
    const stream = await storageService.downloadFile(
      storageService.getDocumentsBucket(),
      file.storage_path
    );
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const fileBuffer = Buffer.concat(chunks);

    // Call OCR provider
    const provider = getOcrProvider();
    const result = await provider.process(fileBuffer, file.mime_type, file.name);

    // Update with results
    await prisma.file.update({
      where: { id: fileId },
      data: {
        ocr_status: 'completed',
        ocr_markdown: result.markdown,
        ocr_processed_at: new Date(),
        ocr_provider: result.provider,
        ocr_model: result.model,
        ocr_error: null,
      },
    });

    await runPendingMetadataExtractionAfterOcr(fileId);
  } catch (error) {
    await prisma.file.update({
      where: { id: fileId },
      data: {
        ocr_status: 'failed',
        ocr_error: error instanceof Error ? error.message : 'Unknown OCR error',
        ...(pendingExtract
          ? {
              ocr_pending_metadata_key_ids: Prisma.DbNull,
              metadata_ai_extract_status: 'failed',
              metadata_ai_extract_error: 'OCR failed before metadata extraction could run',
            }
          : {}),
      },
    });
  }
}
