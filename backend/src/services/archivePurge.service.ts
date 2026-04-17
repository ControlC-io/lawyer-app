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

    await prisma.$transaction(async (tx) => {
      await tx.workflowExecutionLog.deleteMany({ where: { execution_id: { in: executionIds } } });
      await tx.workflowExecutionData.deleteMany({ where: { execution_id: { in: executionIds } } });
      await tx.agentUsage.deleteMany({ where: { workflow_execution_id: { in: executionIds } } });
      await tx.workflowExecutionStep.deleteMany({ where: { execution_id: { in: executionIds } } });
      await tx.workflowExecution.deleteMany({ where: { id: { in: executionIds } } });
    });

    return executionIds.length;
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
    const workflowsWithActiveExecutions = await prisma.workflowExecution.findMany({
      where: { workflow_id: { in: workflowIds }, is_archived: false },
      select: { workflow_id: true },
      distinct: ['workflow_id'],
    });
    const blockedWorkflowIds = new Set(workflowsWithActiveExecutions.map((row) => row.workflow_id));
    const purgeWorkflowIds = workflowIds.filter((workflowId) => !blockedWorkflowIds.has(workflowId));

    if (purgeWorkflowIds.length === 0) return 0;

    const archivedExecutionIds = await prisma.workflowExecution.findMany({
      where: { workflow_id: { in: purgeWorkflowIds }, is_archived: true },
      select: { id: true },
    });
    const executionIds = archivedExecutionIds.map((row) => row.id);

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

    return purgeWorkflowIds.length;
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

    await prisma.$transaction(async (tx) => {
      await tx.agentPermission.deleteMany({ where: { agent_configuration_id: { in: configIds } } });
      await tx.agentUsage.deleteMany({ where: { agent_id: { in: configIds } } });
      await tx.agentConfiguration.deleteMany({ where: { id: { in: configIds } } });
    });

    return configIds.length;
  },

  async purgeArchivedFiles(cutoff: Date, batchSize: number): Promise<number> {
    const files = await prisma.file.findMany({
      where: {
        is_archived: true,
        archived_datetime: { lte: cutoff },
      },
      select: { id: true, storage_path: true },
      orderBy: { archived_datetime: 'asc' },
      take: batchSize,
    });
    if (files.length === 0) return 0;

    const fileIds = files.map((file) => file.id);
    const bucket = storageService.getDocumentsBucket();

    for (const file of files) {
      try {
        await storageService.deleteFile(bucket, file.storage_path);
      } catch {
        // Object may already be missing; keep DB cleanup moving.
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.workflowFile.deleteMany({ where: { file_id: { in: fileIds } } });
      await tx.filesMetadataValue.deleteMany({ where: { files_id: { in: fileIds } } });
      await tx.file.deleteMany({ where: { id: { in: fileIds } } });
    });

    return fileIds.length;
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
