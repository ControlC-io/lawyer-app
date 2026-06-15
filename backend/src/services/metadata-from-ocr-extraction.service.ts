import { FilesMetadataValueKind, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { appendFileHistoryEvent, FILE_HISTORY_EVENT_TYPE } from '../lib/fileHistory';
import {
  parseAllowedValuesJson,
  validateMetadataValueForKey,
} from './files-metadata-validation';
import { extractMetadataFromOcrWithGemini, proposeFileNameFromOcrWithGemini } from './pdf-split.service';

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
  renameInstructions?: string;
  currentDate?: string;
}): Promise<{ values: Record<string, string>; renamedTo?: string }> {
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
      name: true,
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
  const existingRows = await prisma.filesMetadataValue.findMany({
    where: { files_id: params.fileId, metadata_id: { in: requestedIds } },
    include: { metadata: { select: { id: true, name: true } } },
  });
  const previousByKeyId = new Map(
    existingRows.map((r) => [r.metadata_id, { value: r.value, keyName: r.metadata.name?.trim() || r.metadata_id }]),
  );

  for (const keyId of requestedIds) {
    const rawVal = extracted[keyId];
    const strVal = typeof rawVal === 'string' ? rawVal.trim() : '';
    if (!strVal) continue;
    const row = companyMetaById.get(keyId);
    if (!row) continue;
    const check = validateMetadataValueForKey(row, strVal);
    if (!check.ok) {
      // Gemini returned a value outside the predefined list: skip this key rather than
      // failing the whole file. The field is simply left for the user to fill manually.
      console.warn(
        `[metadata-extract] Skipping out-of-list value for key ${keyId} (file ${params.fileId}): ${JSON.stringify(strVal)}`,
      );
      continue;
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

  const aiChanges: Array<{ key: string; keyId: string; action: 'add' | 'edit'; previous?: string; next: string }> = [];
  for (const keyId of Object.keys(applied)) {
    const strVal = applied[keyId];
    const row = companyMetaById.get(keyId);
    const keyLabel = row?.name?.trim() || keyId;
    const prev = previousByKeyId.get(keyId);
    if (!prev) {
      aiChanges.push({ key: keyLabel, keyId, action: 'add', next: strVal });
    } else if (prev.value !== strVal) {
      aiChanges.push({ key: keyLabel, keyId, action: 'edit', previous: prev.value, next: strVal });
    }
  }

  const trimmedRenameInstructions =
    typeof params.renameInstructions === 'string' ? params.renameInstructions.trim() : '';
  let renamedTo: string | undefined;
  if (trimmedRenameInstructions) {
    const proposedName = await proposeFileNameFromOcrWithGemini({
      ocrMarkdown: file.ocr_markdown,
      currentFileName: file.name,
      renameInstructions: trimmedRenameInstructions,
      currentDate: dateStr,
    });
    const nextName = buildRenamedFileName(file.name, proposedName);
    if (nextName && nextName !== file.name) {
      renamedTo = nextName;
    }
  }

  await prisma.file.update({
    where: { id: params.fileId },
    data: {
      ...(renamedTo ? { name: renamedTo } : {}),
      ocr_pending_metadata_key_ids: Prisma.DbNull,
      metadata_ai_extract_status: 'completed',
      metadata_ai_extract_error: null,
    },
  });

  if (aiChanges.length > 0) {
    await appendFileHistoryEvent({
      companyId: params.companyId,
      fileId: params.fileId,
      eventType: FILE_HISTORY_EVENT_TYPE.METADATA_AI_APPLIED,
      actorId: null,
      details: { changes: aiChanges },
    });
  }
  if (renamedTo) {
    await appendFileHistoryEvent({
      companyId: params.companyId,
      fileId: params.fileId,
      eventType: FILE_HISTORY_EVENT_TYPE.FILE_RENAMED,
      actorId: null,
      details: { from: file.name, to: renamedTo, source: 'metadata_ai' },
    });
  }

  return { values: applied, ...(renamedTo ? { renamedTo } : {}) };
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
  const historyCompanyId = file.company_id;

  const pending = parsePendingMetadataExtractConfig(file.ocr_pending_metadata_key_ids);
  const pendingIds = pending.metadataKeyIds;
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
      renameInstructions: pending.renameInstructions,
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
    await appendFileHistoryEvent({
      companyId: historyCompanyId,
      fileId,
      eventType: FILE_HISTORY_EVENT_TYPE.METADATA_AI_EXTRACT_FAILED,
      actorId: null,
      details: { message: msg },
    });
    console.error(`runPendingMetadataExtractionAfterOcr failed for ${fileId}:`, e);
  }
}

export type PendingMetadataExtractConfig = {
  metadataKeyIds: string[];
  renameInstructions?: string;
};

export function parsePendingMetadataExtractConfig(raw: unknown): PendingMetadataExtractConfig {
  if (Array.isArray(raw)) {
    return {
      metadataKeyIds: raw.map((id) => String(id).trim()).filter(Boolean),
    };
  }
  if (!raw || typeof raw !== 'object') {
    return { metadataKeyIds: [] };
  }
  const obj = raw as { metadataKeyIds?: unknown; renameInstructions?: unknown };
  const metadataKeyIds = Array.isArray(obj.metadataKeyIds)
    ? obj.metadataKeyIds.map((id) => String(id).trim()).filter(Boolean)
    : [];
  const renameInstructions =
    typeof obj.renameInstructions === 'string' && obj.renameInstructions.trim().length > 0
      ? obj.renameInstructions.trim()
      : undefined;
  return {
    metadataKeyIds,
    ...(renameInstructions ? { renameInstructions } : {}),
  };
}

function splitNameAndExtension(fileName: string): { base: string; extension: string } {
  const trimmed = fileName.trim();
  const lastDot = trimmed.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === trimmed.length - 1) {
    return { base: trimmed, extension: '' };
  }
  return {
    base: trimmed.slice(0, lastDot),
    extension: trimmed.slice(lastDot),
  };
}

function sanitizeFileBaseName(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .replace(/^[. ]+/g, '')
    .trim();
}

function stripExistingExtension(candidate: string): string {
  const trimmed = candidate.trim();
  const dot = trimmed.lastIndexOf('.');
  if (dot <= 0) return trimmed;
  return trimmed.slice(0, dot).trim();
}

function buildRenamedFileName(currentName: string, proposedName: string): string | null {
  const { extension } = splitNameAndExtension(currentName);
  const sanitizedBase = sanitizeFileBaseName(stripExistingExtension(proposedName));
  if (!sanitizedBase) return null;
  const nextName = `${sanitizedBase}${extension}`;
  return nextName.trim() || null;
}
