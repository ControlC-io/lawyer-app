import type { File as DbFile } from '@prisma/client';
import { Ragie } from 'ragie';
import * as ragieErrors from 'ragie/models/errors';
import { storageService } from './storage.service';

type RagieMetadataValue = string | number | boolean | Array<string>;

type FileWithMetadata = Pick<DbFile, 'id' | 'name' | 'mime_type' | 'created_at' | 'storage_path'> & {
  metadata_values?: Array<{
    value: string;
    metadata?: {
      name: string | null;
    } | null;
  }>;
};

export class RagieServiceError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = 'RagieServiceError';
    this.statusCode = statusCode;
  }
}

function ensureConfigured(): string {
  const apiKey = process.env.RAGIE_API_KEY?.trim();
  if (!apiKey) {
    throw new RagieServiceError('Ragie API key not configured', 503);
  }
  return apiKey;
}

function getClient(): Ragie {
  const auth = ensureConfigured();
  const serverURL = process.env.RAGIE_API_URL?.trim() || undefined;
  return new Ragie({ auth, ...(serverURL ? { serverURL } : {}) });
}

function toCompanyPartition(companyId: string): string {
  const normalized = companyId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  return `company-${normalized}`.replace(/-+/g, '-');
}

function metadataKeyToSafeToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '') || 'key';
}

function buildDocumentMetadata(companyId: string, file: FileWithMetadata): Record<string, RagieMetadataValue> {
  const metadata: Record<string, RagieMetadataValue> = {
    floowly_source: 'floowly',
    floowly_company_id: companyId,
    floowly_file_id: file.id,
    floowly_document_name: file.name,
    floowly_uploaded_at: file.created_at.toISOString(),
  };

  if (file.mime_type) {
    metadata.floowly_mime_type = file.mime_type;
  }

  const grouped: Record<string, Array<string>> = {};
  for (const entry of file.metadata_values ?? []) {
    const rawKey = entry.metadata?.name?.trim();
    const rawValue = entry.value?.trim();
    if (!rawKey || !rawValue) continue;
    const safeKey = `floowly_meta_${metadataKeyToSafeToken(rawKey)}`;
    if (!grouped[safeKey]) grouped[safeKey] = [];
    if (!grouped[safeKey].includes(rawValue)) grouped[safeKey].push(rawValue);
  }

  for (const [key, values] of Object.entries(grouped)) {
    if (values.length === 1) {
      metadata[key] = values[0];
    } else if (values.length > 1) {
      metadata[key] = values;
    }
  }

  return metadata;
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function errorMessageFromBody(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { detail?: string; error?: string; message?: string };
    return parsed.detail || parsed.error || parsed.message || null;
  } catch {
    return null;
  }
}

function normalizeRagieError(error: unknown): never {
  if (error instanceof RagieServiceError) {
    throw error;
  }

  if (error instanceof ragieErrors.RagieError) {
    const providerMessage = errorMessageFromBody(error.body);
    throw new RagieServiceError(providerMessage || error.message || 'Ragie request failed', error.statusCode || 502);
  }

  const message = error instanceof Error ? error.message : 'Unknown Ragie error';
  throw new RagieServiceError(message, 500);
}

export const ragieService = {
  getCompanyPartition(companyId: string): string {
    return toCompanyPartition(companyId);
  },

  isConfigured(): boolean {
    return Boolean(process.env.RAGIE_API_KEY?.trim());
  },

  async uploadFileDocument(params: {
    companyId: string;
    file: FileWithMetadata;
  }): Promise<{
    documentId: string;
    partition: string;
    status: string;
    metadata: Record<string, RagieMetadataValue>;
  }> {
    const { companyId, file } = params;

    try {
      const client = getClient();
      const partition = toCompanyPartition(companyId);
      const metadata = buildDocumentMetadata(companyId, file);

      const bucket = storageService.getDocumentsBucket();
      const fileStream = await storageService.downloadFile(bucket, file.storage_path);
      const fileBuffer = await streamToBuffer(fileStream);

      const created = await client.documents.create({
        file: {
          fileName: file.name,
          content: fileBuffer,
        },
        name: file.name,
        externalId: file.id,
        partition,
        metadata,
      });

      return {
        documentId: created.id,
        partition: created.partition || partition,
        status: created.status || 'pending',
        metadata,
      };
    } catch (error) {
      normalizeRagieError(error);
    }
  },

  async deleteFileDocument(params: { documentId: string; partition?: string | null }): Promise<void> {
    const { documentId, partition } = params;

    try {
      const client = getClient();
      await client.documents.delete({
        documentId,
        partition: partition ?? undefined,
      });
    } catch (error) {
      normalizeRagieError(error);
    }
  },
};
