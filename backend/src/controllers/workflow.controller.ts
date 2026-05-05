import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, resolveCompanyForRequest } from '../middleware/auth';
import { getDocumentProxyUrl } from '../lib/documentUrl';
import { workflowService } from '../services/workflow.service';
import {
  buildDisplayNameByFieldId,
  buildFieldValuesByName,
  notificationService,
  renderNotificationTemplate,
  type NotificationTemplateContext,
} from '../services/notification.service';
import { emailService, type WorkflowEmailAttachment } from '../services/email.service';
import { storageService } from '../services/storage.service';
import { aiService } from '../services/ai.service';
import { resolvePromptTemplate, type PromptValues } from '../lib/promptTemplate';
import { ensureCompanyUser, isUserField, normalizeUserFieldValue } from '../lib/workflowUserField';
import crypto from 'crypto';
import { Readable } from 'stream';

async function resolveExecutionVisibilityForUser(userId: string, companyId: string) {
  const membership = await prisma.userCompany.findFirst({
    where: { user_id: userId, company_id: companyId },
    select: { role: true },
  });

  if (!membership) return { canAccessCompany: false, isAdmin: false, groupIds: [] as string[] };

  const isAdmin = membership.role === 'company_admin';
  const groupMemberships = await prisma.profileGroupMember.findMany({
    where: { profile_id: userId },
    select: { group_id: true },
  });
  const groupIds = groupMemberships
    .map((membershipRow) => membershipRow.group_id)
    .filter((id): id is string => id !== null);

  return { canAccessCompany: true, isAdmin, groupIds };
}

/**
 * Returns true if the user has *workflow*-level visibility — either via workflow scope
 * (is_public, all_company) or an explicit WorkflowPermission row of type visibility/view.
 *
 * This is the same boolean previously computed inline in getExecutionData. It does NOT
 * include the step-assignment fallback that getExecutionData applies; callers that want
 * step-scoped fallback handle it themselves.
 */
async function hasWorkflowVisibility(params: {
  workflow: { id: string; is_public?: boolean | null; visibility_scope?: string | null };
  userId: string;
  groupIds: string[];
}): Promise<boolean> {
  const { workflow, userId, groupIds } = params;
  const scopeAllowsAll =
    workflow.visibility_scope === 'all_company' || workflow.is_public === true;
  if (scopeAllowsAll) return true;

  const permission = await prisma.workflowPermission.findFirst({
    where: {
      workflow_id: workflow.id,
      permission_type: { in: ['visibility', 'view'] },
      OR: [
        { user_id: userId },
        ...(groupIds.length > 0 ? [{ group_id: { in: groupIds } }] : []),
      ],
    },
    select: { id: true },
  });
  return !!permission;
}

function attachStepCompletionMeta(
  rawStepData: unknown,
  params: {
    startedAt?: Date | null;
    completedAt: Date;
    closedBySource?: 'user' | 'company_api_key' | 'portal' | 'external' | 'system';
    closedByName?: string;
    closedByUserId?: string;
    closedByEmail?: string;
  }
) {
  const stepData =
    rawStepData && typeof rawStepData === 'object' && !Array.isArray(rawStepData)
      ? { ...(rawStepData as Record<string, unknown>) }
      : {};
  const existingMeta =
    stepData._step_meta && typeof stepData._step_meta === 'object' && !Array.isArray(stepData._step_meta)
      ? (stepData._step_meta as Record<string, unknown>)
      : {};

  return {
    ...stepData,
    _step_meta: {
      ...existingMeta,
      opened_at: params.startedAt ? params.startedAt.toISOString() : null,
      closed_at: params.completedAt.toISOString(),
      ...(params.closedBySource ? { closed_by_source: params.closedBySource } : {}),
      ...(params.closedByName ? { closed_by_name: params.closedByName } : {}),
      ...(params.closedByUserId ? { closed_by_user_id: params.closedByUserId } : {}),
      ...(params.closedByEmail ? { closed_by_email: params.closedByEmail } : {}),
    },
  };
}

function getStepClosedByLabel(stepData: unknown): string | null {
  if (!stepData || typeof stepData !== 'object' || Array.isArray(stepData)) return null;

  const typedStepData = stepData as Record<string, unknown>;
  const meta =
    typedStepData._step_meta && typeof typedStepData._step_meta === 'object' && !Array.isArray(typedStepData._step_meta)
      ? (typedStepData._step_meta as Record<string, unknown>)
      : null;

  const closedByName = typeof meta?.closed_by_name === 'string' ? meta.closed_by_name.trim() : '';
  if (closedByName) return closedByName;

  const closedBySource = typeof meta?.closed_by_source === 'string' ? meta.closed_by_source : null;
  if (closedBySource === 'company_api_key') return 'API';
  if (closedBySource === 'portal') return 'public';

  const closedByEmail = typeof meta?.closed_by_email === 'string' ? meta.closed_by_email.trim() : '';
  if (closedByEmail) return closedByEmail;

  const closedByUserId = typeof meta?.closed_by_user_id === 'string' ? meta.closed_by_user_id.trim() : '';
  if (closedByUserId) return closedByUserId;

  // Backward compatibility for rows without _step_meta.
  const submissionType = typeof typedStepData._submission_type === 'string' ? typedStepData._submission_type : null;
  if (submissionType === 'portal') return 'public';

  return null;
}

function getExecutionDataRawValues(
  rows: Array<{ values: unknown }>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  rows.forEach((row) => {
    const rowValues = row?.values && typeof row.values === 'object' && !Array.isArray(row.values)
      ? (row.values as Record<string, unknown>)
      : {};
    Object.entries(rowValues).forEach(([fieldId, fieldValue]) => {
      result[fieldId] = fieldValue;
    });
  });
  return result;
}

function extractTemplateValuesFromRawValues(rawValues: Record<string, unknown>): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  Object.entries(rawValues).forEach(([fieldId, fieldValue]) => {
    if (fieldValue && typeof fieldValue === 'object' && !Array.isArray(fieldValue) && 'value' in (fieldValue as Record<string, unknown>)) {
      snapshot[fieldId] = (fieldValue as Record<string, unknown>).value;
      return;
    }
    snapshot[fieldId] = fieldValue;
  });
  return snapshot;
}

function normalizeEmailArray(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);
}

function normalizeStringArray(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);
}

function collectUserIdsFromUnknown(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectUserIdsFromUnknown(entry));
  }

  const normalized = normalizeUserFieldValue(value);
  return normalized ? [normalized] : [];
}

function safeFileNameFromPath(path: string): string {
  const normalized = path.trim();
  if (!normalized) return 'attachment';
  const segments = normalized.split('/').filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : 'attachment';
}

function collectFileEntriesFromRawField(rawFieldValue: unknown): Array<{ path: string; filename: string }> {
  if (rawFieldValue === null || rawFieldValue === undefined) return [];

  if (typeof rawFieldValue === 'string') {
    const trimmed = rawFieldValue.trim();
    if (!trimmed) return [];
    return [{ path: trimmed, filename: safeFileNameFromPath(trimmed) }];
  }

  if (Array.isArray(rawFieldValue)) {
    return rawFieldValue.flatMap((entry) => collectFileEntriesFromRawField(entry));
  }

  if (typeof rawFieldValue !== 'object') return [];

  const objectValue = rawFieldValue as Record<string, unknown>;
  const rawValue = objectValue.value;
  const rawName = objectValue.original_name;

  if (typeof rawValue === 'string' && rawValue.trim()) {
    const filePath = rawValue.trim();
    const fileName = typeof rawName === 'string' && rawName.trim()
      ? rawName.trim()
      : safeFileNameFromPath(filePath);
    return [{ path: filePath, filename: fileName }];
  }

  if (Array.isArray(rawValue)) {
    if (rawValue.length > 0 && rawValue.every((entry) => typeof entry === 'string')) {
      const names = Array.isArray(rawName) ? rawName : [];
      return rawValue
        .map((entry, index) => {
          const filePath = entry.trim();
          if (!filePath) return null;
          const candidateName = typeof names[index] === 'string' ? names[index].trim() : '';
          return {
            path: filePath,
            filename: candidateName || safeFileNameFromPath(filePath),
          };
        })
        .filter((entry): entry is { path: string; filename: string } => entry !== null);
    }
    return rawValue.flatMap((entry) => collectFileEntriesFromRawField(entry));
  }

  return [];
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => {
      if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk);
      } else {
        chunks.push(Buffer.from(chunk));
      }
    });
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

type WorkflowDataStructureField = {
  id: string;
  name: string;
  field_type: string;
  parent_item_id?: string | null;
};

/**
 * Builds the name-keyed views (`execution_data_array`, `execution_data_mapped`) and the
 * file_signed_urls map for an execution, given its first execution_data record. Pure
 * function: does not mutate inputs and does not call out to storage.
 *
 * Extracted from getExecutionData so searchExecutions can reuse it without duplicating
 * the array-item child-name remapping logic.
 */
function buildMappedExecutionData(
  workflow: { data_structure: unknown },
  executionDataRecord: { values: unknown } | null | undefined
): {
  execution_data_array: Array<Record<string, unknown>>;
  execution_data_mapped: Record<string, unknown>;
  file_signed_urls: Record<string, string>;
} {
  const empty = {
    execution_data_array: [] as Array<Record<string, unknown>>,
    execution_data_mapped: {} as Record<string, unknown>,
    file_signed_urls: {} as Record<string, string>,
  };

  if (!Array.isArray(workflow.data_structure)) return empty;

  const fields = workflow.data_structure as WorkflowDataStructureField[];
  const values = (executionDataRecord?.values && typeof executionDataRecord.values === 'object'
    ? (executionDataRecord.values as Record<string, { value?: unknown }>)
    : {});

  const fileSignedUrls: Record<string, string> = {};
  for (const field of fields) {
    const fieldValue = values[field.id];
    try {
      if (field.field_type === 'file' && fieldValue?.value) {
        fileSignedUrls[field.id] = getDocumentProxyUrl(fieldValue.value as string);
      }
    } catch {
      // Keep response available even when signed URL generation fails.
    }
  }

  const topLevelFields = fields.filter((f) => !f.parent_item_id);

  const childFieldIdToName: Record<string, Record<string, string>> = {};
  for (const field of fields) {
    if (field.field_type === 'array' && !field.parent_item_id) {
      const childFields = fields.filter((f) => f.parent_item_id === field.id);
      childFieldIdToName[field.id] = {};
      for (const childField of childFields) {
        if (childField.id && childField.name) {
          childFieldIdToName[field.id][childField.id] = childField.name;
        }
      }
    }
  }

  const transformArrayItem = (item: unknown, arrayFieldId: string): unknown => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    const idToNameMap = childFieldIdToName[arrayFieldId] || {};
    const transformed: Record<string, unknown> = {};
    const itemRecord = item as Record<string, unknown>;
    if (itemRecord._id) transformed._id = itemRecord._id;
    for (const [key, value] of Object.entries(itemRecord)) {
      if (key === '_id') continue;
      const fieldName = idToNameMap[key];
      transformed[fieldName ?? key] = value;
    }
    return transformed;
  };

  const execution_data_array: Array<Record<string, unknown>> = topLevelFields.map((field) => {
    const fieldValue = values[field.id];
    let processedValue: unknown = fieldValue?.value ?? null;
    if (field.field_type === 'array' && Array.isArray(processedValue)) {
      processedValue = processedValue.map((item) => transformArrayItem(item, field.id));
    }
    const result: Record<string, unknown> = {
      field_id: field.id,
      field_name: field.name,
      field_type: field.field_type,
      value: processedValue,
    };
    if (field.field_type === 'file' && fileSignedUrls[field.id]) {
      result.signed_url = fileSignedUrls[field.id];
    }
    return result;
  });

  const execution_data_mapped: Record<string, unknown> = {};
  for (const field of topLevelFields) {
    const fieldValue = values[field.id];
    let value: unknown = fieldValue?.value ?? null;
    if (field.field_type === 'array' && Array.isArray(value)) {
      value = value.map((item) => transformArrayItem(item, field.id));
    }
    execution_data_mapped[field.name] = value;
    if (field.field_type === 'file' && fileSignedUrls[field.id]) {
      execution_data_mapped[`${field.name}_signed_url`] = fileSignedUrls[field.id];
    }
  }

  return { execution_data_array, execution_data_mapped, file_signed_urls: fileSignedUrls };
}

export const workflowController = {
  /**
   * POST /api/workflows/:workflowId/trigger
   * Trigger a workflow execution via external API (requires api_enabled on workflow).
   */
  async triggerWorkflow(req: AuthRequest, res: Response) {
    try {
      if (!(await resolveCompanyForRequest(req, res))) return;
      const { workflowId } = req.params;
      const { data } = req.body;
      const companyId = req.company!.id;

      if (!workflowId) {
        return res.status(400).json({
          error: 'Missing required fields',
          details: 'workflow_id is required',
        });
      }

      const workflow = await prisma.workflow.findFirst({
        where: { id: workflowId, company_id: companyId, is_archived: false },
        select: { id: true, api_enabled: true },
      });

      if (!workflow) {
        return res.status(404).json({
          error: 'Workflow not found or access denied',
        });
      }

      if (!workflow.api_enabled) {
        return res.status(403).json({
          error: 'This workflow does not allow API triggers',
        });
      }

      const executionId = await workflowService.createExecutionAndStart(companyId, workflowId, {
        data: data || {},
        createdBy: null,
      });

      return res.json({
        success: true,
        execution_id: executionId,
        status: 'started',
      });
    } catch (error) {
      console.error('Error triggering workflow:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  },

  /**
   * POST /api/workflows/executions/:executionId/steps/:stepId/process
   * Process an automatic step (was: process-automatic-step)
   */
  async processAutomaticStep(req: AuthRequest, res: Response) {
    const { executionId, stepId } = req.params;
    let executionStep: any | null = null;
    let workflowStep: any | null = null;
    let shouldAutoCompleteActionStep = false;
    let isEmailActionStep = false;

    try {
      if (!executionId || !stepId) {
        return res.status(400).json({
          error: 'Missing required fields',
          details: 'execution_id and execution_step_id are required',
        });
      }

      // Fetch execution step with workflow step details
      executionStep = await prisma.workflowExecutionStep.findFirst({
        where: {
          id: stepId,
          execution_id: executionId,
        },
        include: {
          step: {
            include: {
              workflow: {
                select: {
                  data_structure: true,
                },
              },
            },
          },
        },
      });

      if (!executionStep) {
        return res.status(404).json({
          error: 'Execution step not found',
        });
      }

      const execution = await prisma.workflowExecution.findFirst({
        where: { id: executionId, is_archived: false },
        select: { company_id: true },
      });
      const executionCompanyId = execution?.company_id;
      if (executionCompanyId && req.user && !req.company?.id && !req.user.super_admin) {
        const userCompany = await prisma.userCompany.findFirst({
          where: { user_id: req.user.id, company_id: executionCompanyId },
        });
        if (!userCompany) {
          return res.status(403).json({ error: 'Access denied to this execution' });
        }
      } else if (req.company?.id && executionCompanyId && req.company.id !== executionCompanyId) {
        return res.status(403).json({ error: 'Company does not match execution' });
      }

      workflowStep = executionStep.step;

      // Check if supported processable step
      const isAutomaticAction =
        workflowStep.step_type === 'action' && workflowStep.action_type === 'automatic';
      const isAgentAction =
        workflowStep.step_type === 'action' && workflowStep.action_type === 'agent';
      const isEmailAction =
        workflowStep.step_type === 'action' && workflowStep.action_type === 'email';
      isEmailActionStep = isEmailAction;
      const isAgentDecision =
        workflowStep.step_type === 'decision' &&
        (workflowStep.decision_node_type === 'Agent' || workflowStep.decision_node_type === 'Agent_Human' ||
          (workflowStep.decision_node_type && workflowStep.decision_node_type.toLowerCase() === 'agent'));

      shouldAutoCompleteActionStep = workflowStep.step_type === 'action' && (isAutomaticAction || isAgentAction || isEmailAction);

      if (!isAutomaticAction && !isAgentDecision && !isAgentAction && !isEmailAction) {
        return res.json({
          success: true,
          message: 'Step is not a processable automatic step, skipping',
        });
      }

      // Extract API configuration
      const config = (workflowStep.config as any) || {};

      if (isEmailAction) {
        const execution = await prisma.workflowExecution.findFirst({
          where: { id: executionId },
          select: { created_by: true },
        });
        const rawExecutionRows = await prisma.workflowExecutionData.findMany({
          where: { execution_id: executionId },
          select: { values: true },
        });
        const rawExecutionData = getExecutionDataRawValues(rawExecutionRows);
        const executionDataSnapshot = extractTemplateValuesFromRawValues(rawExecutionData);
        const emailActionConfig =
          config.email_action && typeof config.email_action === 'object'
            ? (config.email_action as Record<string, unknown>)
            : {};

        const subjectTemplate =
          typeof emailActionConfig.subject_template === 'string'
            ? emailActionConfig.subject_template.trim()
            : '';
        const bodyTemplateHtml =
          typeof emailActionConfig.body_template_html === 'string'
            ? emailActionConfig.body_template_html.trim()
            : '';
        const recipientSources = normalizeStringArray(emailActionConfig.recipient_sources);
        const staticRecipients = normalizeEmailArray(emailActionConfig.static_recipients);
        const userFieldIds = normalizeStringArray(emailActionConfig.user_field_ids);
        const attachmentFieldIds = normalizeStringArray(emailActionConfig.attachment_field_ids);

        const executionLink = `${process.env.APP_URL || 'http://localhost'}/workflows/executions/${executionId}`;
        const displayNameByFieldId = buildDisplayNameByFieldId((executionStep.step as any)?.workflow?.data_structure);
        const templateContext: NotificationTemplateContext = {
          executionLink,
          fieldValuesByName: buildFieldValuesByName(displayNameByFieldId, executionDataSnapshot),
        };

        const renderedSubject = renderNotificationTemplate(subjectTemplate, templateContext).trim();
        const renderedHtml = renderNotificationTemplate(bodyTemplateHtml, templateContext).trim();
        if (!renderedSubject || !renderedHtml) {
          return res.status(400).json({
            success: false,
            error: 'Invalid email action configuration',
            details: 'Rendered subject and body must be non-empty',
          });
        }

        const recipientSet = new Set<string>();
        if (recipientSources.includes('static')) {
          staticRecipients.forEach((email) => recipientSet.add(email.toLowerCase()));
        }

        if (recipientSources.includes('creator') && execution?.created_by) {
          const creatorProfile = await prisma.profile.findUnique({
            where: { id: execution.created_by },
            select: { email: true },
          });
          if (creatorProfile?.email) {
            recipientSet.add(creatorProfile.email.toLowerCase());
          }
        }

        if (recipientSources.includes('user_field') && userFieldIds.length > 0) {
          const userIds = Array.from(
            new Set(userFieldIds.flatMap((fieldId) => collectUserIdsFromUnknown(executionDataSnapshot[fieldId])))
          );

          const validUserIds: string[] = [];
          for (const userId of userIds) {
            if (await ensureCompanyUser(executionStep.company_id!, userId)) {
              validUserIds.push(userId);
            }
          }

          if (validUserIds.length > 0) {
            const profiles = await prisma.profile.findMany({
              where: { id: { in: validUserIds } },
              select: { email: true },
            });
            profiles.forEach((profile) => {
              if (profile.email) {
                recipientSet.add(profile.email.toLowerCase());
              }
            });
          }
        }

        const recipients = Array.from(recipientSet);
        if (recipients.length === 0) {
          return res.status(400).json({
            success: false,
            error: 'No recipients resolved for email action',
          });
        }

        const attachments: WorkflowEmailAttachment[] = [];
        const seenAttachmentKeys = new Set<string>();
        const documentsBucket = storageService.getDocumentsBucket();
        const fallbackBucket = storageService.getBucketName();

        for (const fieldId of attachmentFieldIds) {
          const rawFieldValue = rawExecutionData[fieldId] ?? executionDataSnapshot[fieldId];
          const fileEntries = collectFileEntriesFromRawField(rawFieldValue);

          for (const entry of fileEntries) {
            if (!entry.path) continue;
            const dedupeKey = `${entry.path}:${entry.filename}`;
            if (seenAttachmentKeys.has(dedupeKey)) continue;
            seenAttachmentKeys.add(dedupeKey);

            let stream: Readable;
            try {
              stream = await storageService.downloadFile(documentsBucket, entry.path);
            } catch {
              stream = await storageService.downloadFile(fallbackBucket, entry.path);
            }
            const fileBuffer = await streamToBuffer(stream);
            attachments.push({
              filename: entry.filename || safeFileNameFromPath(entry.path),
              content: fileBuffer.toString('base64'),
              disposition: 'attachment',
            });
          }
        }

        for (const recipient of recipients) {
          await emailService.sendWorkflowActionEmail(recipient, renderedSubject, renderedHtml, {
            text: renderedHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(),
            attachments,
          });
        }

        const completedAt = new Date();
        const stepDataWithMeta = attachStepCompletionMeta(executionDataSnapshot, {
          startedAt: executionStep.started_at,
          completedAt,
          closedBySource: 'system',
          closedByName: 'system',
        });

        await workflowService.cancelReminderForExecutionStep(stepId);
        await prisma.workflowExecutionStep.update({
          where: { id: stepId },
          data: {
            status: 'completed',
            completed_at: completedAt,
            step_data: stepDataWithMeta,
          },
        });

        const triggeredSteps = await workflowService.advanceWorkflow(
          executionId,
          executionStep.step_id,
          executionStep.company_id!
        );
        const latestExecution = await prisma.workflowExecution.findUnique({
          where: { id: executionId },
          select: { status: true },
        });

        return res.json({
          success: true,
          message: 'Email action completed',
          recipients_count: recipients.length,
          attachments_count: attachments.length,
          triggered_steps: triggeredSteps,
          execution_status: latestExecution?.status ?? 'running',
        });
      }

      const hasAgentSource = Boolean(config.agent_id);
      const hasIntegrationSource = Boolean(config.api_configuration_id);
      if (isAgentDecision && hasAgentSource === hasIntegrationSource) {
        return res.status(400).json({
          error: 'Invalid configuration',
          details: 'Agent decision steps must use exactly one webhook source',
        });
      }
      let apiUrl = config.api_url;
      let apiMethod = config.api_method || 'POST';
      let apiHeaders: any[] = [];
      let apiData: any[] = [];
      let agentConfig: { id: string; api_url: string; api_method: string; api_headers: unknown; prompt_template?: string | null } | null = null;

      // Handle agent configuration
      if (config.agent_id) {
        const loaded = await prisma.agentConfiguration.findUnique({
          where: { id: config.agent_id },
        });

        if (!loaded) {
          return res.status(400).json({
            error: 'Invalid configuration',
            details: 'Could not find the agent configuration',
          });
        }
        agentConfig = loaded;
        apiUrl = loaded.api_url;
        apiMethod = loaded.api_method || 'POST';
        apiHeaders = typeof loaded.api_headers === 'string'
          ? JSON.parse(loaded.api_headers as string)
          : (loaded.api_headers || []) as any[];
        apiData = typeof config.api_data === 'string'
          ? JSON.parse(config.api_data)
          : (config.api_data || []);
      } else if (config.api_configuration_id) {
        // Fallback to old API configurations
        const apiConfig = await prisma.apiConfiguration.findUnique({
          where: { id: config.api_configuration_id },
        });

        if (!apiConfig) {
          return res.status(400).json({
            error: 'Invalid configuration',
            details: 'Could not find the API configuration',
          });
        }

        apiUrl = apiConfig.api_url;
        apiMethod = apiConfig.api_method || 'POST';
        apiHeaders = typeof apiConfig.api_headers === 'string'
          ? JSON.parse(apiConfig.api_headers as string)
          : (apiConfig.api_headers || []) as any[];
        apiData = typeof config.api_data === 'string'
          ? JSON.parse(config.api_data)
          : (config.api_data || []);
      } else {
        if (isAgentDecision) {
          return res.status(400).json({
            error: 'Invalid configuration',
            details: 'Agent decision steps cannot use manual webhook configuration',
          });
        }
        // Custom configuration
        apiHeaders = typeof config.api_headers === 'string'
          ? JSON.parse(config.api_headers)
          : (config.api_headers || []);
        apiData = typeof config.api_data === 'string'
          ? JSON.parse(config.api_data)
          : (config.api_data || []);
      }

      if (!apiUrl) {
        return res.status(400).json({
          error: 'Invalid configuration',
          details: 'api_url is required for automatic steps',
        });
      }

      // Append optional step path to base URL (from shared config or agent)
      const stepPath = (config.api_path && String(config.api_path).trim()) || '';
      if (stepPath) {
        const base = apiUrl.replace(/\/+$/, '');
        const pathPart = stepPath.replace(/^\/+/, '');
        apiUrl = pathPart ? `${base}/${pathPart}` : base;
      }

      // Get execution data for bindings
      const executionDataSnapshot = await workflowService.getExecutionDataSnapshot(executionId);

      // Build request body
      let requestBody: any;

      if (isAgentAction && config.agent_id) {
        // Agent action step: send structured payload expected by agent webhook
        const rawDataStructure = (executionStep.step as any)?.workflow?.data_structure;
        const fields = Array.isArray(rawDataStructure) ? rawDataStructure : [];
        const fieldInfoMap: Record<string, { name: string; type: string }> = {};
        // First pass: index all fields by id
        fields.forEach((field: any) => {
          if (field?.id) {
            fieldInfoMap[field.id] = {
              name: field.name || field.id,
              type: field.field_type || field.field_type_new || field.type || 'text',
            };
          }
        });
        // Second pass: prefix child fields with parent array name (e.g. "documents.file")
        fields.forEach((field: any) => {
          if (field?.id && field.parent_item_id) {
            const parent = fieldInfoMap[field.parent_item_id];
            if (parent) {
              fieldInfoMap[field.id].name = `${parent.name}.${field.name || field.id}`;
            }
          }
        });

        const dataToSend = (apiData as any[]).map((item: any) => {
          if (!item?.value || typeof item.value !== 'string' || !item.value.startsWith('{{') || !item.value.endsWith('}}')) {
            return null;
          }
          const fieldId = item.value.slice(2, -2).trim();
          const info = fieldInfoMap[fieldId] || { name: fieldId, type: 'text' };
          const value = executionDataSnapshot[fieldId] ?? null;
          return { key: fieldId, name: info.name, value, type: info.type };
        }).filter(Boolean);

        let dataToUpdateConfig = config.data_to_update;
        if (typeof dataToUpdateConfig === 'string') {
          try {
            dataToUpdateConfig = JSON.parse(dataToUpdateConfig);
          } catch {
            dataToUpdateConfig = [];
          }
        }
        const dataToUpdateList = Array.isArray(dataToUpdateConfig) ? dataToUpdateConfig : [];
        const dataToUpdate = dataToUpdateList.map((item: any) => {
          const fieldId = item?.value;
          if (!fieldId) {
            return { key: null, name: item?.key ?? null, value: null, type: 'text' };
          }
          const info = fieldInfoMap[fieldId] || { name: fieldId, type: 'text' };
          const value = executionDataSnapshot[fieldId] ?? null;
          return { key: fieldId, name: info.name, value, type: info.type };
        });

        requestBody = {
          execution_id: executionId,
          execution_step_id: stepId,
          agent_id: config.agent_id,
          data_to_send: dataToSend,
          data_to_update: dataToUpdate,
        };
        if (agentConfig?.prompt_template && config.prompt_values && typeof config.prompt_values === 'object') {
          const prompt = resolvePromptTemplate(agentConfig.prompt_template, config.prompt_values as PromptValues);
          requestBody.prompt = prompt;
        }
      } else {
        // Non-agent action: resolve bindings and send flat payload
        const resolvedData: Record<string, any> = {};
        apiData.forEach((item: any) => {
          if (item.key) {
            let value = item.value || '';
            if (typeof value === 'string' && value.startsWith('{{') && value.endsWith('}}')) {
              const fieldId = value.slice(2, -2).trim();
              value = executionDataSnapshot[fieldId] ?? '';
            }
            resolvedData[item.key] = value;
          }
        });

        requestBody = {
          execution_id: executionId,
          execution_step_id: stepId,
          ...resolvedData,
        };

        if (isAgentDecision) {
          requestBody.condition = config.condition || '';
          requestBody.outputs = Array.isArray(config.outputs) ? config.outputs : [];
        }
      }

      // Build headers
      const headersObj: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      apiHeaders.forEach((header: any) => {
        if (header.key && header.value) {
          headersObj[header.key] = header.value;
        }
      });

      // Call external API
      const result = await aiService.callAgentEndpoint(apiUrl, apiMethod, headersObj, requestBody);

      // For action steps (automatic + agent), the external tool is expected to call
      // `POST /api/workflows/executions/:executionId/steps/:stepId/complete` later.
      // So we must *not* mark the step as completed here when the dispatch succeeded.
      if (shouldAutoCompleteActionStep) {
        // Dispatch-only: the step is closed by the external tool via the `/complete` endpoint.
        // This endpoint must not mark the step as `completed` or advance the workflow.
        if (!result.success && executionStep?.status === 'running') {
          try {
            const executionDataSnapshot = await workflowService.getExecutionDataSnapshot(executionId);
            await prisma.workflowExecutionStep.update({
              where: { id: stepId },
              data: {
                step_data: {
                  ...executionDataSnapshot,
                  _automation: {
                    dispatch_at: new Date().toISOString(),
                    success: false,
                    response: result.data ?? result.error,
                  },
                },
              },
            });
          } catch (snapshotError) {
            console.error('Failed to persist dispatch error to step_data:', snapshotError);
          }
        }

        return res.json({
          success: result.success,
          message: result.success
            ? 'Action dispatched; waiting for completion callback'
            : 'Action dispatch failed; waiting for completion callback (if any)',
          execution_status: executionStep?.status === 'running' ? 'running' : executionStep?.status,
          response: result.data || result.error,
        });
      }

      return res.json({
        success: result.success,
        message: result.success ? 'API call completed successfully' : 'API call failed',
        response: result.data || result.error,
      });
    } catch (error) {
      console.error('Error processing automatic step:', error);
      // Dispatch-only contract: keep the step open for `/complete` callback.
      if (shouldAutoCompleteActionStep && !isEmailActionStep && executionStep?.status === 'running') {
        try {
          const executionDataSnapshot = await workflowService.getExecutionDataSnapshot(executionId);
          await prisma.workflowExecutionStep.update({
            where: { id: stepId },
            data: {
              step_data: {
                ...executionDataSnapshot,
                _automation: {
                  processed_at: new Date().toISOString(),
                  success: false,
                  error: error instanceof Error ? error.message : 'Unknown error',
                },
              },
            },
          });
          return res.json({
            success: false,
            message: 'Action processing errored; awaiting completion callback',
            execution_status: 'running',
          });
        } catch (completionError) {
          // Fall through to the generic response.
          console.error('Auto-completion after error failed:', completionError);
        }
      }

      return res.status(200).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        warning: 'Workflow continues despite processing error',
      });
    }
  },

  /**
   * POST /api/workflows/executions/:executionId/steps/:stepId/complete
   * Complete a step and advance workflow (was: complete-automatic-step)
   */
  async completeStep(req: AuthRequest, res: Response) {
    try {
      const { executionId, stepId } = req.params;
      const { step_data } = req.body;

      if (!executionId || !stepId) {
        return res.status(400).json({
          error: 'Missing required fields',
          details: 'execution_id and execution_step_id are required',
        });
      }

      // Fetch execution step
      const executionStep = await prisma.workflowExecutionStep.findFirst({
        where: {
          id: stepId,
          execution_id: executionId,
        },
        include: {
          step: true,
        },
      });

      if (!executionStep) {
        return res.status(404).json({ error: 'Execution step not found' });
      }

      // Verify step is running
      if (executionStep.status !== 'running') {
        return res.status(400).json({
          error: 'Invalid step status',
          details: `Step status is ${executionStep.status}, expected running`,
        });
      }

      // Get step data snapshot if not provided
      let finalStepData = step_data;
      if (!finalStepData) {
        finalStepData = await workflowService.getExecutionDataSnapshot(executionId);
      }

      const completedAt = new Date();
      const closedBySource = req.user?.id ? 'user' : req.company?.id ? 'company_api_key' : undefined;
      const finalStepDataWithMeta = attachStepCompletionMeta(finalStepData, {
        startedAt: executionStep.started_at,
        completedAt,
        closedBySource,
        closedByName: req.user?.email ?? (closedBySource === 'company_api_key' ? 'API' : undefined),
        closedByUserId: req.user?.id,
        closedByEmail: req.user?.email,
      });

      // Mark step as completed
      await workflowService.cancelReminderForExecutionStep(stepId);
      await prisma.workflowExecutionStep.update({
        where: { id: stepId },
        data: {
          status: 'completed',
          completed_at: completedAt,
          step_data: finalStepDataWithMeta,
        },
      });

      // Advance workflow
      const triggeredSteps = await workflowService.advanceWorkflow(
        executionId,
        executionStep.step_id,
        executionStep.company_id!
      );

      return res.json({
        success: true,
        message: triggeredSteps.length > 0
          ? 'Step completed and workflow advanced'
          : 'Step completed',
        triggered_steps: triggeredSteps,
        execution_status: triggeredSteps.length > 0 ? 'running' : 'completed',
      });
    } catch (error) {
      console.error('Error completing step:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  /**
   * POST /api/workflows/executions/:executionId/steps/:stepId/decision
   * Make a decision on a decision node (was: make-decision)
   */
  async makeDecision(req: AuthRequest, res: Response) {
    try {
      const { executionId, stepId } = req.params;
      const { decision_choice, decision_reason, decision_comment } = req.body;

      if (!executionId || !stepId || !decision_choice) {
        return res.status(400).json({
          error: 'Missing required fields',
          details: 'execution_id, execution_step_id, and decision_choice are required',
        });
      }

      // Fetch execution step
      const executionStep = await prisma.workflowExecutionStep.findFirst({
        where: {
          id: stepId,
          execution_id: executionId,
        },
        include: {
          step: true,
        },
      });

      if (!executionStep) {
        return res.status(404).json({ error: 'Execution step not found' });
      }

      const workflowStep = executionStep.step;

      // Verify this is a decision step
      if (workflowStep.step_type !== 'decision') {
        return res.status(400).json({
          error: 'Invalid step type',
          details: 'This endpoint can only be used with decision steps',
        });
      }

      // Verify step is running
      if (executionStep.status !== 'running') {
        return res.status(400).json({
          error: 'Invalid step status',
          details: `Step status is ${executionStep.status}, expected running`,
        });
      }

      // Get current data snapshot
      const dataSnapshot = await workflowService.getExecutionDataSnapshot(executionId);

      // Check if this is "Agent_Human" decision
      const isAgentDecisionNode = workflowStep.decision_node_type === 'Agent_Human';

      if (isAgentDecisionNode && decision_choice === 'awaiting_validation') {
        // Store agent decision but keep step running
        const stepDataWithAgentDecision = {
          ...dataSnapshot,
          agent_decision_choice: decision_choice,
          agent_decision_at: new Date().toISOString(),
          agent_decision_reason: decision_reason || null,
        };

        await prisma.workflowExecutionStep.update({
          where: { id: stepId },
          data: {
            step_data: stepDataWithAgentDecision,
          },
        });

        return res.json({
          success: true,
          message: 'Agent decision recorded. Awaiting human validation.',
          agent_decision: decision_choice,
          execution_status: 'running',
          requires_human_validation: true,
        });
      }

      // Regular agent decision - complete immediately
      const stepDataWithComment = {
        ...dataSnapshot,
        decision_comment: decision_comment?.trim() || null,
      };
      const completedAt = new Date();
      const closedBySource = req.user?.id ? 'user' : req.company?.id ? 'company_api_key' : undefined;
      const stepDataWithMeta = attachStepCompletionMeta(stepDataWithComment, {
        startedAt: executionStep.started_at,
        completedAt,
        closedBySource,
        closedByName: req.user?.email ?? (closedBySource === 'company_api_key' ? 'API' : undefined),
        closedByUserId: req.user?.id,
        closedByEmail: req.user?.email,
      });

      await workflowService.cancelReminderForExecutionStep(stepId);
      await prisma.workflowExecutionStep.update({
        where: { id: stepId },
        data: {
          decision_choice,
          status: 'completed',
          completed_at: completedAt,
          step_data: stepDataWithMeta,
        },
      });

      // Advance workflow with decision choice
      const triggeredSteps = await workflowService.advanceWorkflow(
        executionId,
        executionStep.step_id,
        executionStep.company_id!,
        decision_choice
      );

      const execution = await prisma.workflowExecution.findUnique({
        where: { id: executionId },
        select: { status: true },
      });

      return res.json({
        success: true,
        message: 'Decision recorded and workflow advanced',
        decision_choice,
        triggered_steps: triggeredSteps,
        execution_status: execution?.status ?? 'running',
      });
    } catch (error) {
      console.error('Error making decision:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  /**
   * GET /api/workflows/executions/:executionId
   * Get execution data with all related information (was: get-execution-data)
   */
  async getExecutionData(req: AuthRequest, res: Response) {
    try {
      const { executionId } = req.params;
      let companyId = req.company?.id;
      const userId = req.user?.id;
      const isSuperAdmin = !!req.user?.super_admin;
      const includeArchivedParam = String(req.query.includeArchived ?? '').toLowerCase() === 'true';
      const canIncludeArchived = isSuperAdmin || (!!req.company && !req.user);
      const includeArchived = includeArchivedParam && canIncludeArchived;

      if (!executionId) {
        return res.status(400).json({ error: 'missing execution_id' });
      }

      if (!companyId && userId) {
        const execution = await prisma.workflowExecution.findFirst({
          where: {
            id: executionId,
            ...(includeArchived ? {} : { is_archived: false }),
          },
          select: { company_id: true },
        });
        if (!execution?.company_id) {
          return res.status(404).json({ error: 'not found or access denied' });
        }
        // Super admin can access any execution by id without company membership
        if (!isSuperAdmin) {
          const visibility = await resolveExecutionVisibilityForUser(userId, execution.company_id);
          if (!visibility.canAccessCompany) {
            return res.status(403).json({ error: 'Access denied to this execution' });
          }
        }
        companyId = execution.company_id;
      }

      if (!companyId) {
        return res.status(401).json({ error: 'Missing company authorization' });
      }

      // Fetch execution with workflow
      const execution = await prisma.workflowExecution.findFirst({
        where: {
          id: executionId,
          company_id: companyId,
          ...(includeArchived ? {} : { is_archived: false }),
        },
        include: {
          workflow: { include: { connections: true } },
          execution_steps: { include: { step: true }, orderBy: { created_at: 'asc' } },
          execution_data_records: true,
          execution_logs: { orderBy: { created_at: 'asc' } },
          current_step: true,
        },
      });

      if (!execution) {
        return res.status(404).json({ error: 'not found or access denied' });
      }

      if (!isSuperAdmin && userId) {
        const visibility = await resolveExecutionVisibilityForUser(userId, companyId);
        if (!visibility.canAccessCompany) {
          return res.status(403).json({ error: 'Access denied to this execution' });
        }

        const allowedExecutionSteps = execution.execution_steps.filter((executionStep) => (
          executionStep.assigned_to_user_id === userId ||
          (executionStep.assigned_to_group_id && visibility.groupIds.includes(executionStep.assigned_to_group_id))
        ));

        const hasStepAssignmentAccess = allowedExecutionSteps.length > 0;
        const userHasWorkflowVisibility = await hasWorkflowVisibility({
          workflow: {
            id: execution.workflow_id,
            is_public: execution.workflow.is_public,
            visibility_scope: (execution.workflow as any).visibility_scope,
          },
          userId,
          groupIds: visibility.groupIds,
        });

        if (!userHasWorkflowVisibility && !hasStepAssignmentAccess) {
          return res.status(403).json({ error: 'You do not have access to this execution' });
        }

        // With workflow visibility, user can inspect full execution history/steps.
        // Without workflow visibility, keep data scoped to assigned steps only.
        if (!userHasWorkflowVisibility) {
          const allowedExecutionStepIds = new Set(allowedExecutionSteps.map((step) => step.id));
          execution.execution_steps = allowedExecutionSteps;
          execution.execution_logs = execution.execution_logs.filter((log) => (
            log.step_id ? allowedExecutionStepIds.has(log.step_id) : false
          ));

          const currentAssignedStep = allowedExecutionSteps.find((step) => step.status === 'running') ?? allowedExecutionSteps[0];
          const sourceStepData = (currentAssignedStep?.step_data && typeof currentAssignedStep.step_data === 'object')
            ? (currentAssignedStep.step_data as Record<string, unknown>)
            : {};

          const scopedValues = Object.entries(sourceStepData).reduce<Record<string, { value: unknown }>>((acc, [fieldId, value]) => {
            acc[fieldId] = { value };
            return acc;
          }, {});

          if (execution.execution_data_records.length > 0) {
            execution.execution_data_records = execution.execution_data_records.map((record, index) => (
              index === 0 ? { ...record, values: scopedValues as any } : { ...record, values: {} as any }
            ));
          } else {
            execution.execution_data_records = [{
              id: `scoped-${execution.id}`,
              execution_id: execution.id,
              company_id: execution.company_id,
              created_at: execution.created_at,
              updated_at: execution.updated_at,
              values: scopedValues as any,
            } as typeof execution.execution_data_records[number]];
          }
        }
      }

      execution.execution_steps = execution.execution_steps.map((executionStep) => {
        const closedByLabel = getStepClosedByLabel(executionStep.step_data);
        return {
          ...executionStep,
          ...(closedByLabel ? { closed_by_label: closedByLabel } : {}),
        };
      });

      const { execution_data_array, execution_data_mapped, file_signed_urls } =
        buildMappedExecutionData(execution.workflow, execution.execution_data_records[0]);

      if (Object.keys(file_signed_urls).length > 0 && execution.execution_data_records[0]) {
        (execution.execution_data_records[0] as any).file_signed_urls = file_signed_urls;
      }
      (execution as any).execution_data_array = execution_data_array;
      (execution as any).execution_data_mapped = execution_data_mapped;

      return res.json(execution);
    } catch (error) {
      console.error('Error getting execution data:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  /**
   * POST /api/workflows/:workflowId/executions/search
   * Find executions by matching values inside the workflow's data structure.
   * Auth: API Key OR JWT (super admin key accepted via either path).
   */
  async searchExecutions(req: AuthRequest, res: Response) {
    try {
      const { workflowId } = req.params;
      const body = (req.body ?? {}) as {
        filters?: unknown;
        limit?: unknown;
        offset?: unknown;
        includeArchived?: unknown;
      };

      // --- Pagination ---
      const limit = body.limit === undefined ? 50 : Number(body.limit);
      const offset = body.offset === undefined ? 0 : Number(body.offset);
      if (!Number.isInteger(limit) || limit < 1 || limit > 200 ||
          !Number.isInteger(offset) || offset < 0) {
        return res.status(400).json({ error: 'invalid_pagination' });
      }

      // --- Filters shape ---
      const rawFilters = body.filters;
      if (!rawFilters || typeof rawFilters !== 'object' || Array.isArray(rawFilters)) {
        return res.status(400).json({ error: 'invalid_filters' });
      }
      const filterEntries = Object.entries(rawFilters as Record<string, unknown>);
      if (filterEntries.length === 0) {
        return res.status(400).json({ error: 'invalid_filters' });
      }

      // --- Caller-shape detection ---
      const userId = req.user?.id;
      const isSuperAdmin = !!req.user?.super_admin;
      const apiKeyCompanyId = req.company?.id;
      const jwtCompanyId = (req.user as any)?.company_id as string | undefined;

      let companyId: string | undefined = apiKeyCompanyId ?? jwtCompanyId;

      // --- Workflow lookup ---
      // Super admin and JWT users (who never have company_id on req.user) look up by workflowId
      // alone; company membership is validated in the permissions block below.
      // API-key callers scope the lookup to their company to prevent cross-company enumeration.
      const jwtUserNoCompany = !!userId && !isSuperAdmin && !companyId;
      const workflow = await prisma.workflow.findFirst({
        where: {
          id: workflowId,
          ...(isSuperAdmin || jwtUserNoCompany ? {} : (companyId ? { company_id: companyId } : { id: '__none__' })),
        },
        select: {
          id: true,
          company_id: true,
          is_public: true,
          visibility_scope: true,
          data_structure: true,
        },
      });
      if (!workflow) {
        return res.status(404).json({ error: 'workflow_not_found' });
      }
      if (isSuperAdmin || jwtUserNoCompany) companyId = workflow.company_id ?? undefined;
      if (!companyId) {
        return res.status(401).json({ error: 'Missing company authorization' });
      }

      // --- Permissions (JWT users only) ---
      const isApiKeyCaller = !!apiKeyCompanyId && !req.user;
      if (!isSuperAdmin && !isApiKeyCaller && userId) {
        const visibility = await resolveExecutionVisibilityForUser(userId, companyId);
        if (!visibility.canAccessCompany) {
          return res.status(403).json({ error: 'Access denied to this workflow' });
        }
        const allowed = await hasWorkflowVisibility({
          workflow: {
            id: workflow.id,
            is_public: workflow.is_public,
            visibility_scope: (workflow as any).visibility_scope,
          },
          userId,
          groupIds: visibility.groupIds,
        });
        if (!allowed) {
          return res.status(403).json({ error: 'Access denied to this workflow' });
        }
      }

      // --- Translate filter names → field UUIDs ---
      const fields: WorkflowDataStructureField[] = Array.isArray(workflow.data_structure)
        ? (workflow.data_structure as WorkflowDataStructureField[])
        : [];
      const topLevelByName = new Map<string, WorkflowDataStructureField>();
      for (const f of fields) {
        if (!f.parent_item_id) topLevelByName.set(f.name, f);
      }

      const unknown: string[] = [];
      const resolved: import('../services/workflow.service').ResolvedSearchFilter[] = [];
      const isPrimitive = (v: unknown) =>
        v === null || ['string', 'number', 'boolean'].includes(typeof v);

      for (const [name, value] of filterEntries) {
        const field = topLevelByName.get(name);
        if (!field) {
          unknown.push(name);
          continue;
        }
        if (field.field_type === 'array') {
          if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return res.status(400).json({
              error: 'invalid_field_value',
              field: name,
              reason: 'array field requires an object of child filters',
            });
          }
          const childEntries = Object.entries(value as Record<string, unknown>);
          if (childEntries.length === 0) {
            return res.status(400).json({
              error: 'invalid_field_value',
              field: name,
              reason: 'array filter requires at least one child predicate',
            });
          }
          const children: { childId: string; value: any }[] = [];
          const childByName = new Map<string, WorkflowDataStructureField>();
          for (const f of fields) {
            if (f.parent_item_id === field.id) childByName.set(f.name, f);
          }
          for (const [childName, childValue] of childEntries) {
            const childField = childByName.get(childName);
            if (!childField) {
              return res.status(400).json({
                error: 'invalid_field_value',
                field: name,
                reason: `unknown child field "${childName}"`,
              });
            }
            if (!isPrimitive(childValue)) {
              return res.status(400).json({
                error: 'invalid_field_value',
                field: name,
                reason: `child "${childName}" requires a primitive value`,
              });
            }
            children.push({ childId: childField.id, value: childValue as any });
          }
          resolved.push({ kind: 'array', fieldId: field.id, children });
        } else {
          if (!isPrimitive(value)) {
            return res.status(400).json({
              error: 'invalid_field_value',
              field: name,
              reason: 'scalar field requires a primitive value',
            });
          }
          resolved.push({ kind: 'scalar', fieldId: field.id, value: value as any });
        }
      }

      if (unknown.length > 0) {
        return res.status(400).json({ error: 'unknown_fields', unknown });
      }

      // --- Archived flag (honored only for super admin / API-key callers) ---
      const includeArchivedRequested = body.includeArchived === true;
      const includeArchived = includeArchivedRequested && (isSuperAdmin || isApiKeyCaller);

      // --- Search ---
      const { total, executionIds } = await workflowService.searchExecutionsByData({
        workflowId: workflow.id,
        companyId,
        filters: resolved,
        limit,
        offset,
        includeArchived,
      });

      if (executionIds.length === 0) {
        return res.json({ total, limit, offset, executions: [] });
      }

      const rows = await prisma.workflowExecution.findMany({
        where: { id: { in: executionIds } },
        include: {
          workflow: { select: { data_structure: true } },
          execution_data_records: true,
        },
      });
      const orderIndex = new Map(executionIds.map((id, idx) => [id, idx]));
      rows.sort((a, b) => (orderIndex.get(a.id)! - orderIndex.get(b.id)!));

      const executions = rows.map((row) => {
        const { execution_data_mapped } = buildMappedExecutionData(
          row.workflow,
          (row as any).execution_data_records?.[0]
        );
        return {
          id: row.id,
          workflow_id: row.workflow_id,
          name: (row as any).name,
          status: row.status,
          current_step_id: row.current_step_id,
          created_at: row.created_at,
          started_at: row.started_at,
          completed_at: row.completed_at,
          execution_data_mapped,
        };
      });

      return res.json({ total, limit, offset, executions });
    } catch (error) {
      console.error('Error searching executions:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  /**
   * PUT /api/workflows/executions/:executionId/data
   * Update execution data (was: update-execution-data)
   */
  async updateExecutionData(req: AuthRequest, res: Response) {
    try {
      if (!(await resolveCompanyForRequest(req, res))) return;
      const { executionId } = req.params;
      const { data, values } = req.body;
      const companyId = req.company!.id;

      const hasData = data && typeof data === 'object';
      const hasValues = values && typeof values === 'object';
      if (!executionId || (!hasData && !hasValues)) {
        return res.status(400).json({
          error: 'missing or invalid parameters',
          details: 'execution_id and a data or values object are required',
        });
      }

      // Fetch execution with workflow
      const execution = await prisma.workflowExecution.findFirst({
        where: {
          id: executionId,
          company_id: companyId,
          is_archived: false,
        },
        include: {
          workflow: true,
        },
      });

      if (!execution) {
        return res.status(404).json({ error: 'execution not found or access denied' });
      }

      if (!execution.workflow.data_structure || !Array.isArray(execution.workflow.data_structure)) {
        return res.status(400).json({ error: 'execution has no associated data structure' });
      }

      const dataStructure = { fields: execution.workflow.data_structure as any[] };

      // Create field maps
      const fieldNameToId: Record<string, string> = {};
      const fieldIdToField: Record<string, any> = {};
      dataStructure.fields.forEach((field: any) => {
        if (field.name && field.id) {
          fieldNameToId[field.name] = field.id;
          fieldIdToField[field.id] = field;
        }
      });

      // Normalize input: accept data (field names) and/or values (field IDs)
      const updatesByFieldId: Record<string, any> = {};
      const unmatchedFields: string[] = [];
      if (hasData) {
        for (const [name, value] of Object.entries(data)) {
          const fieldId = fieldNameToId[name];
          if (fieldId) updatesByFieldId[fieldId] = value;
          else unmatchedFields.push(name);
        }
      }
      if (hasValues) {
        for (const [key, value] of Object.entries(values)) {
          const fieldId = fieldIdToField[key] ? key : fieldNameToId[key];
          if (fieldId) updatesByFieldId[fieldId] = value;
          else unmatchedFields.push(key);
        }
      }

      // Fetch existing execution data
      const existingData = await prisma.workflowExecutionData.findFirst({
        where: { execution_id: executionId },
      });

      if (!existingData) {
        return res.status(404).json({ error: 'no execution data found' });
      }

      const currentValues = (existingData.values || {}) as Record<string, any>;
      const transformedValues: Record<string, any> = {};

      // Process each field update (by field ID)
      for (const [fieldId, value] of Object.entries(updatesByFieldId)) {
        const field = fieldIdToField[fieldId];
        if (!field) continue;

        // Handle array fields
        if (field.field_type === 'array' && Array.isArray(value)) {
          const childFields = dataStructure.fields.filter((f: any) => f.parent_item_id === fieldId);
          const childFieldNameToId: Record<string, string> = {};

          childFields.forEach((childField: any) => {
            if (childField.name && childField.id) {
              childFieldNameToId[childField.name] = childField.id;
            }
          });

          const childFieldIdToName: Record<string, string> = {};
          childFields.forEach((childField: any) => {
            if (childField.name && childField.id) {
              childFieldIdToName[childField.id] = childField.name;
            }
          });

          const newItems: any[] = [];
          for (const itemData of value) {
            const newItem: Record<string, any> = {};

            for (const [itemKey, itemValue] of Object.entries(itemData as any)) {
              if (itemKey === '_id') {
                newItem._id = itemValue;
                continue;
              }

              // Support both field name (API contract) and field id (frontend may send id)
              const childFieldId = childFieldNameToId[itemKey] ?? (childFieldIdToName[itemKey] ? itemKey : null);
              if (childFieldId) {
                newItem[childFieldId] = itemValue;
              }
            }

            // Add unique ID if missing
            if (!newItem._id) {
              newItem._id = crypto.randomUUID();
            }

            newItems.push(newItem);
          }

          // Replace array with the sent value (do not append, to avoid duplicates)
          transformedValues[fieldId] = {
            ...currentValues[fieldId],
            value: newItems,
          };
        } else {
          let normalizedValue = value;
          if (isUserField(field)) {
            const normalizedUserId = normalizeUserFieldValue(value);
            if (normalizedUserId) {
              const isAllowedUser = await ensureCompanyUser(companyId, normalizedUserId);
              if (!isAllowedUser) {
                return res.status(400).json({
                  error: 'invalid user field value',
                  details: `Field "${field.name || fieldId}" must reference a user in this company`,
                });
              }
            }
            normalizedValue = normalizedUserId;
          }

          const isFileLikePayload = (v: unknown): v is { value: string; original_name?: unknown } =>
            v !== null &&
            typeof v === 'object' &&
            !Array.isArray(v) &&
            typeof (v as { value?: unknown }).value === 'string';

          const isFileOrSignatureField =
            field.field_type === 'file' || field.field_type === 'signature';

          if (isFileOrSignatureField && isFileLikePayload(normalizedValue)) {
            const path = normalizedValue.value.trim();
            const trimmedName =
              typeof normalizedValue.original_name === 'string'
                ? normalizedValue.original_name.trim()
                : '';
            transformedValues[fieldId] = {
              ...currentValues[fieldId],
              value: path,
              ...(trimmedName.length > 0 ? { original_name: trimmedName } : {}),
            };
          } else {
            // Regular field update
            transformedValues[fieldId] = {
              ...currentValues[fieldId],
              value: normalizedValue,
            };
          }
        }
      }

      if (unmatchedFields.length > 0) {
        return res.status(400).json({
          error: 'some field names do not match data structure',
          unmatched_fields: unmatchedFields,
          available_field_names: Object.keys(fieldNameToId),
        });
      }

      // Merge and update
      const updatedValues = {
        ...currentValues,
        ...transformedValues,
      };

      const updatedRecord = await prisma.workflowExecutionData.update({
        where: { id: existingData.id },
        data: { values: updatedValues },
      });

      return res.json({
        success: true,
        message: 'execution data updated successfully',
        updated_record: updatedRecord,
        updated_fields: Object.keys(transformedValues),
      });
    } catch (error) {
      console.error('Error updating execution data:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  /**
   * PATCH /api/workflows/executions/:executionId/data/array-item
   * Update a single sub-field value in an existing array item
   */
  async patchArrayItem(req: AuthRequest, res: Response) {
    try {
      if (!(await resolveCompanyForRequest(req, res))) return;
      const { executionId } = req.params;
      let { field_name, index, sub_field_name, value } = req.body;
      const companyId = req.company!.id;

      // Support dot notation: "arrayName.childName" auto-parses into field_name + sub_field_name
      if (field_name && typeof field_name === 'string' && field_name.includes('.') && !sub_field_name) {
        const dotIndex = field_name.indexOf('.');
        sub_field_name = field_name.substring(dotIndex + 1);
        field_name = field_name.substring(0, dotIndex);
      }

      if (!executionId || !field_name || index === undefined || index === null || !sub_field_name) {
        return res.status(400).json({
          error: 'Missing required fields',
          details: 'field_name, index, sub_field_name, and value are required',
        });
      }

      if (typeof index !== 'number' || index < 0 || !Number.isInteger(index)) {
        return res.status(400).json({
          error: 'Invalid index',
          details: 'index must be a non-negative integer',
        });
      }

      // Fetch execution with workflow
      const execution = await prisma.workflowExecution.findFirst({
        where: { id: executionId, company_id: companyId, is_archived: false },
        include: { workflow: true },
      });

      if (!execution) {
        return res.status(404).json({ error: 'Execution not found or access denied' });
      }

      const dataStructure = execution.workflow.data_structure as any[];
      if (!Array.isArray(dataStructure)) {
        return res.status(400).json({ error: 'Workflow has no data structure' });
      }

      // Resolve field_name to field
      const field = dataStructure.find((f: any) => f.name === field_name);
      if (!field) {
        return res.status(404).json({
          error: 'Field not found',
          details: `Field "${field_name}" not found in data structure`,
        });
      }

      if (field.field_type !== 'array') {
        return res.status(400).json({
          error: 'Field is not an array',
          details: `Field "${field_name}" is not an array field`,
        });
      }

      // Resolve sub_field_name to child field
      const subField = dataStructure.find(
        (f: any) => f.name === sub_field_name && f.parent_item_id === field.id
      );

      if (!subField) {
        return res.status(404).json({
          error: 'Sub-field not found',
          details: `Sub-field "${sub_field_name}" not found in array field "${field_name}"`,
        });
      }

      // Fetch execution data
      const existingData = await prisma.workflowExecutionData.findFirst({
        where: { execution_id: executionId },
      });

      if (!existingData) {
        return res.status(404).json({ error: 'Execution data not found' });
      }

      const currentValues = (existingData.values || {}) as Record<string, any>;
      const currentArray = Array.isArray(currentValues[field.id]?.value)
        ? [...currentValues[field.id].value]
        : [];

      if (index >= currentArray.length) {
        return res.status(400).json({
          error: 'Index out of range',
          details: `Index ${index} is out of range. Array has ${currentArray.length} items.`,
        });
      }

      // Update the sub-field in the array item
      currentArray[index] = {
        ...currentArray[index],
        [subField.id]: value,
      };

      const updatedValues = {
        ...currentValues,
        [field.id]: {
          ...currentValues[field.id],
          value: currentArray,
        },
      };

      await prisma.workflowExecutionData.update({
        where: { id: existingData.id },
        data: { values: updatedValues },
      });

      return res.json({
        success: true,
        message: 'Array item updated successfully',
        field_name,
        sub_field_name,
        index,
      });
    } catch (error) {
      console.error('Error patching array item:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  /**
   * PATCH /api/workflows/executions/:executionId/name
   * Rename an execution (was: rename-execution)
   */
  async renameExecution(req: AuthRequest, res: Response) {
    try {
      if (!(await resolveCompanyForRequest(req, res))) return;
      const { executionId } = req.params;
      const { name } = req.body;
      const companyId = req.company!.id;

      if (!executionId || name === undefined) {
        return res.status(400).json({
          error: 'Missing required fields',
          details: 'execution_id and name are required',
        });
      }

      const updatedExecution = await prisma.workflowExecution.updateMany({
        where: {
          id: executionId,
          company_id: companyId,
          is_archived: false,
        },
        data: { name },
      });

      if (updatedExecution.count === 0) {
        return res.status(404).json({
          error: 'Execution not found',
          details: 'Could not find the execution with the given ID and company',
        });
      }

      return res.json({
        success: true,
        message: 'Execution renamed successfully',
      });
    } catch (error) {
      console.error('Error renaming execution:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  /**
   * POST /api/workflows/executions/:executionId/logs
   * Add execution log entry (was: add-execution-step-log)
   */
  async addExecutionLog(req: AuthRequest, res: Response) {
    try {
      if (!(await resolveCompanyForRequest(req, res))) return;
      const { executionId } = req.params;
      const { step_id, log_text, log_type } = req.body;
      const companyId = req.company!.id;

      if (!executionId || !log_text) {
        return res.status(400).json({
          error: 'Missing required fields',
          details: 'execution_id and log_text are required',
        });
      }

      // Verify execution belongs to company
      const execution = await prisma.workflowExecution.findFirst({
        where: {
          id: executionId,
          company_id: companyId,
          is_archived: false,
        },
      });

      if (!execution) {
        return res.status(404).json({
          error: 'Execution not found or access denied',
        });
      }

      // If step_id provided, verify it
      if (step_id) {
        const step = await prisma.workflowExecutionStep.findFirst({
          where: {
            id: step_id,
            execution_id: executionId,
          },
        });

        if (!step) {
          return res.status(404).json({
            error: 'Step not found or does not belong to this execution',
          });
        }
      }

      // Create log entry
      const logEntry = await prisma.workflowExecutionLog.create({
        data: {
          company_id: companyId,
          execution_id: executionId,
          step_id: step_id || null,
          log_text,
          log_type: log_type || null,
        },
      });

      return res.json({
        success: true,
        message: 'Log entry created successfully',
        log_entry: {
          id: logEntry.id,
          created_at: logEntry.created_at,
          execution_id: executionId,
          step_id: step_id || null,
          log_text,
        },
      });
    } catch (error) {
      console.error('Error adding execution log:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  /**
   * PATCH /api/workflows/executions/:executionId/steps/:stepId
   * Update execution step (e.g. reassign assigned_to_user_id / assigned_to_group_id)
   */
  async updateExecutionStep(req: AuthRequest, res: Response) {
    try {
      if (!(await resolveCompanyForRequest(req, res))) return;
      const { executionId, stepId } = req.params;
      const { assigned_to_user_id, assigned_to_group_id } = req.body;
      const companyId = req.company!.id;

      if (!executionId || !stepId) {
        return res.status(400).json({ error: 'Missing execution_id or step_id' });
      }

      const step = await prisma.workflowExecutionStep.findFirst({
        where: {
          id: stepId,
          execution_id: executionId,
          company_id: companyId,
          execution: { is_archived: false },
        },
      });

      if (!step) {
        return res.status(404).json({ error: 'Execution step not found or access denied' });
      }

      const updateData: { assigned_to_user_id?: string | null; assigned_to_group_id?: string | null } = {};
      if (assigned_to_user_id !== undefined) updateData.assigned_to_user_id = assigned_to_user_id || null;
      if (assigned_to_group_id !== undefined) updateData.assigned_to_group_id = assigned_to_group_id || null;

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: 'No update fields provided' });
      }

      await prisma.workflowExecutionStep.update({
        where: { id: stepId },
        data: updateData,
      });

      return res.json({ success: true, message: 'Step updated successfully' });
    } catch (error) {
      console.error('Error updating execution step:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
};
