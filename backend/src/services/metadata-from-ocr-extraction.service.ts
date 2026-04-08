import { FilesMetadataValueKind, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import {
  parseAllowedValuesJson,
  validateMetadataValueForKey,
} from './files-metadata-validation';
import { extractMetadataFromOcrWithGemini } from './pdf-split.service';

export type ExtractMetadataFromOcrHttpError = {
  status: number;
  error: string;
  details?: unknown;
};

/** Apply Gemini extraction and write metadata values; clears pending OCR key list and sets extract status to completed. */
export async function extractAndApplyMetadataFromOcr(params: {
  companyId: string;
  fileId: string;
  metadataKeyIds: string[];
  currentDate?: string;
}): Promise<{ values: Record<string, string> }> {
  const requestedIds = [...new Set(params.metadataKeyIds.map((id) => String(id).trim()).filter(Boolean))];
  if (requestedIds.length === 0) {
    const err: ExtractMetadataFromOcrHttpError = {
      status: 400,
      error: 'metadataKeyIds must contain at least one valid id',
    };
    throw err;
  }

  const dateStr =
    typeof params.currentDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(params.currentDate)
      ? params.currentDate
      : new Date().toISOString().slice(0, 10);

  const file = await prisma.file.findFirst({
    where: { id: params.fileId, company_id: params.companyId },
    select: {
      id: true,
      ocr_status: true,
      ocr_markdown: true,
    },
  });
  if (!file) {
    const err: ExtractMetadataFromOcrHttpError = { status: 404, error: 'File not found' };
    throw err;
  }
  if (file.ocr_status !== 'completed' || !file.ocr_markdown?.trim()) {
    const err: ExtractMetadataFromOcrHttpError = {
      status: 400,
      error: 'OCR must be completed before extracting metadata',
    };
    throw err;
  }

  const dbKeys = await prisma.filesMetadataKey.findMany({
    where: { company_id: params.companyId, id: { in: requestedIds } },
  });
  if (dbKeys.length !== requestedIds.length) {
    const err: ExtractMetadataFromOcrHttpError = {
      status: 400,
      error: 'One or more metadata keys are invalid for this company',
    };
    throw err;
  }
  const byId = new Map(dbKeys.map((k) => [k.id, k]));
  const orderedKeys = requestedIds.map((id) => byId.get(id)!);

  const metadataKeys = orderedKeys.map((k) => ({
    id: k.id,
    name: k.name,
    valueKind: (k.value_kind === FilesMetadataValueKind.predefined_list
      ? 'predefined_list'
      : 'free_text') as 'free_text' | 'predefined_list',
    allowedValues: parseAllowedValuesJson(k.allowed_values),
  }));

  const extracted = await extractMetadataFromOcrWithGemini({
    ocrMarkdown: file.ocr_markdown,
    metadataKeys,
    currentDate: dateStr,
  });

  const companyMetaById = new Map(dbKeys.map((k) => [k.id, k]));
  const applied: Record<string, string> = {};

  for (const keyId of requestedIds) {
    const rawVal = extracted[keyId];
    const strVal = typeof rawVal === 'string' ? rawVal.trim() : '';
    if (!strVal) continue;
    const row = companyMetaById.get(keyId);
    if (!row) continue;
    const check = validateMetadataValueForKey(row, strVal);
    if (!check.ok) {
      const err: ExtractMetadataFromOcrHttpError = {
        status: check.status,
        error: check.error,
        details: check.details,
      };
      throw err;
    }
    const existing = await prisma.filesMetadataValue.findFirst({
      where: { files_id: params.fileId, metadata_id: keyId },
    });
    if (existing) {
      await prisma.filesMetadataValue.update({
        where: { id: existing.id },
        data: { value: strVal },
      });
    } else {
      await prisma.filesMetadataValue.create({
        data: {
          files_id: params.fileId,
          metadata_id: keyId,
          value: strVal,
          company_id: params.companyId,
        },
      });
    }
    applied[keyId] = strVal;
  }

  await prisma.file.update({
    where: { id: params.fileId },
    data: {
      ocr_pending_metadata_key_ids: Prisma.DbNull,
      metadata_ai_extract_status: 'completed',
      metadata_ai_extract_error: null,
    },
  });

  return { values: applied };
}

/** After OCR completes: run pending Gemini extraction if upload requested it. Swallows errors after persisting failed status. */
export async function runPendingMetadataExtractionAfterOcr(fileId: string): Promise<void> {
  const file = await prisma.file.findUnique({
    where: { id: fileId },
    select: {
      id: true,
      company_id: true,
      ocr_markdown: true,
      ocr_status: true,
      ocr_pending_metadata_key_ids: true,
    },
  });
  if (!file?.company_id) return;

  const rawPending = file.ocr_pending_metadata_key_ids;
  const pendingIds = Array.isArray(rawPending)
    ? rawPending.map((id) => String(id).trim()).filter(Boolean)
    : [];
  if (pendingIds.length === 0) return;
  if (file.ocr_status !== 'completed' || !file.ocr_markdown?.trim()) return;

  await prisma.file.update({
    where: { id: fileId },
    data: {
      metadata_ai_extract_status: 'processing',
      metadata_ai_extract_error: null,
    },
  });

  try {
    await extractAndApplyMetadataFromOcr({
      companyId: file.company_id,
      fileId,
      metadataKeyIds: pendingIds,
    });
  } catch (e) {
    const msg = e && typeof e === 'object' && 'error' in e && typeof (e as { error?: string }).error === 'string'
      ? (e as { error: string }).error
      : e instanceof Error
        ? e.message
        : 'Failed to extract metadata';
    await prisma.file.update({
      where: { id: fileId },
      data: {
        ocr_pending_metadata_key_ids: Prisma.DbNull,
        metadata_ai_extract_status: 'failed',
        metadata_ai_extract_error: msg,
      },
    });
    console.error(`runPendingMetadataExtractionAfterOcr failed for ${fileId}:`, e);
  }
}
