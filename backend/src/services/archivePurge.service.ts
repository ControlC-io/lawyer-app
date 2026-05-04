import { prisma } from '../lib/prisma';
import { storageService } from './storage.service';

function parsePositiveInteger(value: string | undefined, fallbackValue: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallbackValue;
  const rounded = Math.round(parsed);
  return rounded > 0 ? rounded : fallbackValue;
}

let archivePurgeWorkerTimer: NodeJS.Timeout | null = null;

export interface PurgeWorkflowsResult {
  purged: string[];
  blocked: string[];
}

export const archivePurgeService = {
  getCutoffDate(): Date {
    const retentionDays = parsePositiveInteger(process.env.ARCHIVE_RETENTION_DAYS, 30);
    return new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  },

  getBatchSize(): number {
    return parsePositiveInteger(process.env.ARCHIVE_PURGE_BATCH_SIZE, 100);
  },

  /**
   * Permanently delete the supplied execution ids and their dependent rows.
   * Caller is responsible for ensuring the executions are archived; no extra
   * filtering is applied here so the call can be reused by both the periodic
   * purge worker and the admin bulk-delete endpoint.
   */
  async purgeExecutionsByIds(executionIds: string[]): Promise<number> {
    if (executionIds.length === 0) return 0;

    await prisma.$transaction(async (tx) => {
      await tx.workflowExecutionLog.deleteMany({ where: { execution_id: { in: executionIds } } });
      await tx.workflowExecutionData.deleteMany({ where: { execution_id: { in: executionIds } } });
      await tx.agentUsage.deleteMany({ where: { workflow_execution_id: { in: executionIds } } });
      await tx.workflowExecutionStep.deleteMany({ where: { execution_id: { in: executionIds } } });
      await tx.workflowExecution.deleteMany({ where: { id: { in: executionIds } } });
    });

    return executionIds.length;
  },

  /**
   * Permanently delete the supplied workflow ids along with their archived
   * executions. Workflows that still have at least one non-archived execution
   * are returned in `blocked` and left untouched, mirroring the safety check
   * applied by the scheduled purge worker.
   */
  async purgeWorkflowsByIds(workflowIds: string[]): Promise<PurgeWorkflowsResult> {
    if (workflowIds.length === 0) {
      return { purged: [], blocked: [] };
    }

    const workflowsWithActiveExecutions = await prisma.workflowExecution.findMany({
      where: { workflow_id: { in: workflowIds }, is_archived: false },
      select: { workflow_id: true },
      distinct: ['workflow_id'],
    });
    const blockedWorkflowIds = new Set(workflowsWithActiveExecutions.map((row) => row.workflow_id));
    const purgeWorkflowIds = workflowIds.filter((workflowId) => !blockedWorkflowIds.has(workflowId));

    if (purgeWorkflowIds.length === 0) {
      return { purged: [], blocked: Array.from(blockedWorkflowIds) };
    }

    const archivedExecutions = await prisma.workflowExecution.findMany({
      where: { workflow_id: { in: purgeWorkflowIds }, is_archived: true },
      select: { id: true },
    });
    const executionIds = archivedExecutions.map((row) => row.id);

    await prisma.$transaction(async (tx) => {
      if (executionIds.length > 0) {
        await tx.workflowExecutionLog.deleteMany({ where: { execution_id: { in: executionIds } } });
        await tx.workflowExecutionData.deleteMany({ where: { execution_id: { in: executionIds } } });
        await tx.agentUsage.deleteMany({ where: { workflow_execution_id: { in: executionIds } } });
        await tx.workflowExecutionStep.deleteMany({ where: { execution_id: { in: executionIds } } });
        await tx.workflowExecution.deleteMany({ where: { id: { in: executionIds } } });
      }

      await tx.workflowConnection.deleteMany({ where: { workflow_id: { in: purgeWorkflowIds } } });
      await tx.workflowStep.deleteMany({ where: { workflow_id: { in: purgeWorkflowIds } } });
      await tx.workflowStatus.deleteMany({ where: { workflow_id: { in: purgeWorkflowIds } } });
      await tx.workflowFile.deleteMany({ where: { workflow_id: { in: purgeWorkflowIds } } });
      await tx.workflowPermission.deleteMany({ where: { workflow_id: { in: purgeWorkflowIds } } });
      await tx.workflow.deleteMany({ where: { id: { in: purgeWorkflowIds } } });
    });

    return { purged: purgeWorkflowIds, blocked: Array.from(blockedWorkflowIds) };
  },

  /**
   * Permanently delete the supplied agent configuration ids and their
   * dependent permission/usage rows.
   */
  async purgeAgentConfigurationsByIds(configIds: string[]): Promise<number> {
    if (configIds.length === 0) return 0;

    await prisma.$transaction(async (tx) => {
      await tx.agentPermission.deleteMany({ where: { agent_configuration_id: { in: configIds } } });
      await tx.agentUsage.deleteMany({ where: { agent_id: { in: configIds } } });
      await tx.agentConfiguration.deleteMany({ where: { id: { in: configIds } } });
    });

    return configIds.length;
  },

  /**
   * Permanently delete the supplied file ids: removes the storage objects
   * (best-effort) and the related `workflowFile` / `filesMetadataValue` rows.
   */
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
      await tx.workflowFile.deleteMany({ where: { file_id: { in: resolvedFileIds } } });
      await tx.filesMetadataValue.deleteMany({ where: { files_id: { in: resolvedFileIds } } });
      await tx.file.deleteMany({ where: { id: { in: resolvedFileIds } } });
    });

    return resolvedFileIds.length;
  },

  async purgeArchivedExecutions(cutoff: Date, batchSize: number): Promise<number> {
    const executions = await prisma.workflowExecution.findMany({
      where: {
        is_archived: true,
        archived_datetime: { lte: cutoff },
      },
      select: { id: true },
      orderBy: { archived_datetime: 'asc' },
      take: batchSize,
    });

    if (executions.length === 0) return 0;
    const executionIds = executions.map((execution) => execution.id);
    return this.purgeExecutionsByIds(executionIds);
  },

  async purgeArchivedWorkflows(cutoff: Date, batchSize: number): Promise<number> {
    const workflows = await prisma.workflow.findMany({
      where: {
        is_archived: true,
        archived_datetime: { lte: cutoff },
      },
      select: { id: true },
      orderBy: { archived_datetime: 'asc' },
      take: batchSize,
    });
    if (workflows.length === 0) return 0;

    const workflowIds = workflows.map((workflow) => workflow.id);
    const { purged } = await this.purgeWorkflowsByIds(workflowIds);
    return purged.length;
  },

  async purgeArchivedAgentConfigurations(cutoff: Date, batchSize: number): Promise<number> {
    const configs = await prisma.agentConfiguration.findMany({
      where: {
        is_archived: true,
        archived_datetime: { lte: cutoff },
      },
      select: { id: true },
      orderBy: { archived_datetime: 'asc' },
      take: batchSize,
    });

    if (configs.length === 0) return 0;
    const configIds = configs.map((config) => config.id);
    return this.purgeAgentConfigurationsByIds(configIds);
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

  async processArchivePurgeOnce(): Promise<{ executions: number; workflows: number; agentConfigurations: number; files: number }> {
    const cutoff = this.getCutoffDate();
    const batchSize = this.getBatchSize();

    const executions = await this.purgeArchivedExecutions(cutoff, batchSize);
    const workflows = await this.purgeArchivedWorkflows(cutoff, batchSize);
    const agentConfigurations = await this.purgeArchivedAgentConfigurations(cutoff, batchSize);
    const files = await this.purgeArchivedFiles(cutoff, batchSize);

    return { executions, workflows, agentConfigurations, files };
  },

  startWorker(): void {
    if (archivePurgeWorkerTimer) return;
    const pollMs = parsePositiveInteger(process.env.ARCHIVE_PURGE_POLL_MS, 24 * 60 * 60 * 1000);
    archivePurgeWorkerTimer = setInterval(() => {
      this.processArchivePurgeOnce()
        .then((result) => {
          const totalPurged = result.executions + result.workflows + result.agentConfigurations + result.files;
          if (totalPurged > 0) {
            console.log('[archive-purge] Purged archived rows:', result);
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
