import { prisma } from '../lib/prisma';
import { storageService } from './storage.service';

function parsePositiveInteger(value: string | undefined, fallbackValue: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallbackValue;
  const rounded = Math.round(parsed);
  return rounded > 0 ? rounded : fallbackValue;
}

let archivePurgeWorkerTimer: NodeJS.Timeout | null = null;

export const archivePurgeService = {
  getCutoffDate(): Date {
    const retentionDays = parsePositiveInteger(process.env.ARCHIVE_RETENTION_DAYS, 30);
    return new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  },

  getBatchSize(): number {
    return parsePositiveInteger(process.env.ARCHIVE_PURGE_BATCH_SIZE, 100);
  },

  async purgeFilesByIds(fileIds: string[]): Promise<number> {
    if (fileIds.length === 0) return 0;

    const files = await prisma.file.findMany({
      where: { id: { in: fileIds } },
      select: { id: true, storage_path: true },
    });
    if (files.length === 0) return 0;

    const resolvedFileIds = files.map((file) => file.id);
    const bucket = storageService.getDocumentsBucket();

    for (const file of files) {
      try {
        await storageService.deleteFile(bucket, file.storage_path);
      } catch {
        // Object may already be missing; keep DB cleanup moving.
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.fileHistoryEvent.deleteMany({ where: { file_id: { in: resolvedFileIds } } });
      await tx.filesMetadataValue.deleteMany({ where: { files_id: { in: resolvedFileIds } } });
      await tx.file.deleteMany({ where: { id: { in: resolvedFileIds } } });
    });

    return resolvedFileIds.length;
  },

  async purgeArchivedFiles(cutoff: Date, batchSize: number): Promise<number> {
    const files = await prisma.file.findMany({
      where: {
        is_archived: true,
        archived_datetime: { lte: cutoff },
      },
      select: { id: true },
      orderBy: { archived_datetime: 'asc' },
      take: batchSize,
    });
    if (files.length === 0) return 0;

    const fileIds = files.map((file) => file.id);
    return this.purgeFilesByIds(fileIds);
  },

  async processArchivePurgeOnce(): Promise<{ files: number }> {
    const cutoff = this.getCutoffDate();
    const batchSize = this.getBatchSize();
    const files = await this.purgeArchivedFiles(cutoff, batchSize);
    return { files };
  },

  startWorker(): void {
    if (archivePurgeWorkerTimer) return;
    const pollMs = parsePositiveInteger(process.env.ARCHIVE_PURGE_POLL_MS, 24 * 60 * 60 * 1000);
    archivePurgeWorkerTimer = setInterval(() => {
      this.processArchivePurgeOnce()
        .then((result) => {
          if (result.files > 0) {
            console.log('[archive-purge] Purged archived files:', result.files);
          }
        })
        .catch((error) => {
          console.error('[archive-purge] Worker iteration failed:', error);
        });
    }, pollMs);
  },

  stopWorker(): void {
    if (!archivePurgeWorkerTimer) return;
    clearInterval(archivePurgeWorkerTimer);
    archivePurgeWorkerTimer = null;
  },
};
