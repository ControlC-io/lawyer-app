import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { workflowService } from '../services/workflow.service';
import { emailService } from '../services/email.service';
import fetch from 'node-fetch';
import crypto from 'crypto';
import {
  localizeDataStructure,
  localizeFormStepConfig,
  normalizePortalDefaultLanguage,
  normalizePortalLanguages,
  resolveLocalizedText,
} from '../services/portalTranslation.service';
import { ensureCompanyUser, getWorkflowFieldById, isUserField, normalizeUserFieldValue } from '../lib/workflowUserField';
import { isExternalLinkAccessible } from '../lib/externalLinkExpiry';

// prisma is imported from ../lib/prisma

const AI_FORM_VALIDATION_URL = process.env.AI_FORM_VALIDATION_URL || 'https://automation.floowly.app/webhook/7604f736-0ea8-4ec1-9b03-082256e42e0c';
const AI_FORM_VALIDATION_API_KEY = process.env.FLOOWLY_AI_VALIDATION_API_KEY || '';

// ---------------------------------------------------------------------------
// Field validation rules (server-side enforcement for external forms)
// ---------------------------------------------------------------------------

interface FieldValidationRule {
  id: string;
  target_field_id: string;
  validation_type: string;
  value?: string | number;
  error_message?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/.+/i;
const PHONE_RE = /^\+?[\d\s\-().]{7,20}$/;

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

function evaluateFieldValidation(
  rule: FieldValidationRule,
  fieldValue: unknown,
): { valid: boolean; message?: string } {
  if (fieldValue === undefined || fieldValue === null || fieldValue === '') {
    return { valid: true }; // empty values are handled by required rules
  }
  const customMsg = typeof rule.error_message === 'string' ? rule.error_message.trim() : '';

  switch (rule.validation_type) {
    case 'min_length': {
      const len = String(fieldValue).length;
      const min = Number(rule.value ?? 0);
      if (len < min) return { valid: false, message: customMsg || `Must be at least ${min} characters` };
      return { valid: true };
    }
    case 'max_length': {
      const len = String(fieldValue).length;
      const max = Number(rule.value ?? Infinity);
      if (len > max) return { valid: false, message: customMsg || `Must be at most ${max} characters` };
      return { valid: true };
    }
    case 'regex': {
      const pattern = String(rule.value ?? '');
      if (!pattern) return { valid: true };
      try {
        if (!new RegExp(pattern).test(String(fieldValue))) {
          return { valid: false, message: customMsg || 'Does not match the required pattern' };
        }
      } catch {
        return { valid: true };
      }
      return { valid: true };
    }
    case 'email_format':
      if (!EMAIL_RE.test(String(fieldValue))) return { valid: false, message: customMsg || 'Must be a valid email address' };
      return { valid: true };
    case 'url_format':
      if (!URL_RE.test(String(fieldValue))) return { valid: false, message: customMsg || 'Must be a valid URL' };
      return { valid: true };
    case 'phone_format':
      if (!PHONE_RE.test(String(fieldValue))) return { valid: false, message: customMsg || 'Must be a valid phone number' };
      return { valid: true };
    case 'min_value': {
      const num = Number(fieldValue);
      const min = Number(rule.value ?? -Infinity);
      if (isNaN(num) || num < min) return { valid: false, message: customMsg || `Must be at least ${min}` };
      return { valid: true };
    }
    case 'max_value': {
      const num = Number(fieldValue);
      const max = Number(rule.value ?? Infinity);
      if (isNaN(num) || num > max) return { valid: false, message: customMsg || `Must be at most ${max}` };
      return { valid: true };
    }
    case 'integer_only': {
      const num = Number(fieldValue);
      if (isNaN(num) || !Number.isInteger(num)) return { valid: false, message: customMsg || 'Must be a whole number' };
      return { valid: true };
    }
    case 'date_before_today': {
      const d = new Date(String(fieldValue));
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (isNaN(d.getTime()) || d >= today) return { valid: false, message: customMsg || 'Date must be before today' };
      return { valid: true };
    }
    case 'date_after_today': {
      const d = new Date(String(fieldValue));
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (isNaN(d.getTime()) || d < today) return { valid: false, message: customMsg || 'Date must be today or later' };
      return { valid: true };
    }
    case 'date_before': {
      const d = new Date(String(fieldValue));
      const target = new Date(String(rule.value ?? ''));
      if (isNaN(d.getTime()) || isNaN(target.getTime()) || d >= target) return { valid: false, message: customMsg || `Date must be before ${rule.value}` };
      return { valid: true };
    }
    case 'date_after': {
      const d = new Date(String(fieldValue));
      const target = new Date(String(rule.value ?? ''));
      if (isNaN(d.getTime()) || isNaN(target.getTime()) || d <= target) return { valid: false, message: customMsg || `Date must be after ${rule.value}` };
      return { valid: true };
    }
    case 'min_selections': {
      const count = Array.isArray(fieldValue) ? fieldValue.length : 0;
      const min = Number(rule.value ?? 0);
      if (count < min) return { valid: false, message: customMsg || `Select at least ${min} option(s)` };
      return { valid: true };
    }
    case 'max_selections': {
      const count = Array.isArray(fieldValue) ? fieldValue.length : 0;
      const max = Number(rule.value ?? Infinity);
      if (count > max) return { valid: false, message: customMsg || `Select at most ${max} option(s)` };
      return { valid: true };
    }
    default:
      return { valid: true };
  }
}

function runFieldValidations(
  fieldValidations: FieldValidationRule[],
  data: Record<string, unknown>,
): { valid: boolean; errors: Record<string, string[]> } {
  if (!fieldValidations || fieldValidations.length === 0) return { valid: true, errors: {} };

  const errors: Record<string, string[]> = {};
  for (const rule of fieldValidations) {
    const val = data[rule.target_field_id];
    const result = evaluateFieldValidation(rule, val);
    if (!result.valid && result.message) {
      if (!errors[rule.target_field_id]) errors[rule.target_field_id] = [];
      errors[rule.target_field_id].push(result.message);
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * Run AI form validation
 */
async function runAiFormValidation(args: {
  company_id: string;
  data: any;
  validation_rule: string;
}): Promise<{ is_valid: boolean; validation_comment?: string }> {
  if (!AI_FORM_VALIDATION_API_KEY) {
    return {
      is_valid: false,
      validation_comment: 'AI validation API key not configured on the backend.',
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(AI_FORM_VALIDATION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': AI_FORM_VALIDATION_API_KEY,
      },
      body: JSON.stringify({
        company_id: args.company_id,
        data: args.data,
        validation_rule: args.validation_rule,
      }),
      signal: controller.signal as any,
    });

    clearTimeout(timeout);

    const text = await response.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // ignore
    }

    if (!response.ok) {
      return {
        is_valid: false,
        validation_comment:
          json?.validation_comment || json?.error || json?.message || `Validation service returned ${response.status}`,
      };
    }

    return {
      is_valid: !!json?.is_valid,
      validation_comment: json?.validation_comment || '',
    };
  } catch (error: any) {
    clearTimeout(timeout);
    return {
      is_valid: false,
      validation_comment: error.name === 'AbortError' ? 'Validation timed out' : error.message || 'Validation failed',
    };
  }
}

function getRequestedLanguage(req: AuthRequest): string {
  const queryLang = typeof req.query.lang === 'string' ? req.query.lang.trim().toLowerCase() : '';
  if (queryLang) return queryLang;

  const headerLang = typeof req.headers['accept-language'] === 'string'
    ? req.headers['accept-language']
    : '';
  if (!headerLang) return '';
  return headerLang.split(',')[0]?.split('-')[0]?.trim().toLowerCase() || '';
}

async function getStepInfoByToken(token: string) {
  const stepInfo = await prisma.$queryRaw<
    Array<{
      execution_id: string;
      execution_step_id: string;
      workflow_step_id: string;
      company_id: string;
      started_at: Date | null;
      status: string;
      external_token_expires_at: Date | null;
      data_structure: any;
      step_config: any;
      workflow_name: string;
      workflow_name_i18n: any;
      portal_default_language: string;
      portal_enabled_languages: any;
    }>
  >`
    SELECT 
      wes.execution_id,
      wes.id as execution_step_id,
      wes.step_id as workflow_step_id,
      wes.company_id,
      wes.started_at,
      wes.status,
      wes.external_token_expires_at,
      w.name as workflow_name,
      w.name_i18n as workflow_name_i18n,
      w.data_structure,
      ws.config as step_config,
      c.portal_default_language,
      c.portal_enabled_languages
    FROM public.workflow_execution_steps wes
    JOIN public.workflow_steps ws ON ws.id = wes.step_id
    JOIN public.workflow_executions we ON we.id = wes.execution_id
    JOIN public.workflows w ON w.id = we.workflow_id
    JOIN public.companies c ON c.id = wes.company_id
    WHERE wes.external_token = ${token}::uuid
    LIMIT 1
  `;
  return stepInfo;
}

function externalLinkInaccessibleResponse(res: Response) {
  return res.status(410).json({
    error: 'Link expired',
    expired: true,
    details: 'This external form link is no longer active',
  });
}

function mergeExecutionValuesFromRows(
  rows: Array<{ values?: unknown }>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const row of rows) {
    const values =
      row.values && typeof row.values === 'object' && !Array.isArray(row.values)
        ? (row.values as Record<string, unknown>)
        : {};
    Object.assign(merged, values);
  }
  return merged;
}

function getWorkflowFields(dataStructure: unknown): Array<{ id?: string; options_source?: string; api_configuration_id?: string }> {
  if (Array.isArray(dataStructure)) {
    return dataStructure;
  }
  if (
    dataStructure &&
    typeof dataStructure === 'object' &&
    Array.isArray((dataStructure as { fields?: unknown }).fields)
  ) {
    return (dataStructure as { fields: Array<{ id?: string; options_source?: string; api_configuration_id?: string }> }).fields;
  }
  return [];
}

function collectDynamicApiConfigurationIds(dataStructure: unknown): string[] {
  const ids = new Set<string>();
  for (const field of getWorkflowFields(dataStructure)) {
    if (field.options_source === 'dynamic' && typeof field.api_configuration_id === 'string' && field.api_configuration_id) {
      ids.add(field.api_configuration_id);
    }
  }
  return Array.from(ids);
}

export const externalController = {
  /**
   * GET /api/external/steps/:token
   * Get step config and workflow data_structure by external token (no auth - for form load)
   */
  async getStepByToken(req: AuthRequest, res: Response) {
    try {
      const { token } = req.params;
      if (!token) {
        return res.status(400).json({ error: 'Token is required' });
      }

      const stepInfo = await getStepInfoByToken(token);
      if (!stepInfo || stepInfo.length === 0) {
        return res.status(404).json({
          error: 'Invalid or expired token',
          details: 'No step found for this link',
        });
      }

      const step = stepInfo[0];
      if (
        !isExternalLinkAccessible({
          status: step.status,
          expiresAt: step.external_token_expires_at,
        })
      ) {
        return externalLinkInaccessibleResponse(res);
      }

      const enabledLanguages = normalizePortalLanguages(step.portal_enabled_languages);
      const defaultLanguage = normalizePortalDefaultLanguage(step.portal_default_language, enabledLanguages);
      const requestedLanguage = getRequestedLanguage(req);

      const executionDataRows = await prisma.workflowExecutionData.findMany({
        where: { execution_id: step.execution_id },
      });
      const execution_values = mergeExecutionValuesFromRows(executionDataRows);

      return res.json({
        ...step,
        step_status: step.status,
        execution_values,
        expires_at: step.external_token_expires_at?.toISOString() ?? null,
        selected_language: requestedLanguage || defaultLanguage,
        default_language: defaultLanguage,
        enabled_languages: enabledLanguages,
        workflow_name: resolveLocalizedText(step.workflow_name, step.workflow_name_i18n, requestedLanguage, defaultLanguage),
        data_structure: localizeDataStructure(step.data_structure, requestedLanguage, defaultLanguage),
        step_config: localizeFormStepConfig(step.step_config, requestedLanguage, defaultLanguage),
      });
    } catch (error) {
      console.error('getStepByToken error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  /**
   * GET /api/external/steps/:token/api-configurations
   * List API configurations referenced by dynamic option fields (token-gated, no auth)
   */
  async getApiConfigurationsByToken(req: AuthRequest, res: Response) {
    try {
      const { token } = req.params;
      if (!token) {
        return res.status(400).json({ error: 'Token is required' });
      }

      const stepInfo = await getStepInfoByToken(token);
      if (!stepInfo || stepInfo.length === 0) {
        return res.status(404).json({
          error: 'Invalid or expired token',
          details: 'No step found for this link',
        });
      }

      const step = stepInfo[0];
      if (
        !isExternalLinkAccessible({
          status: step.status,
          expiresAt: step.external_token_expires_at,
        })
      ) {
        return externalLinkInaccessibleResponse(res);
      }

      const configIds = collectDynamicApiConfigurationIds(step.data_structure);
      if (configIds.length === 0) {
        return res.json([]);
      }

      const configs = await prisma.apiConfiguration.findMany({
        where: {
          company_id: step.company_id,
          id: { in: configIds },
        },
        select: {
          id: true,
          api_url: true,
          api_method: true,
          api_headers: true,
          api_params: true,
        },
      });

      return res.json(configs);
    } catch (error) {
      console.error('getApiConfigurationsByToken error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  /**
   * POST /api/external/steps/:token/submit
   * Submit external step (was: submit-external-step)
   */
  async submitExternalStep(req: AuthRequest, res: Response) {
    try {
      const { token } = req.params;
      const { data } = req.body;

      if (!token) {
        return res.status(400).json({ error: 'Token is required' });
      }

      // Get step info
      const stepInfo = await getStepInfoByToken(token);

      if (!stepInfo || stepInfo.length === 0) {
        return res.status(404).json({
          error: 'Invalid or expired token',
        });
      }

      const currentStep = stepInfo[0];

      if (
        !isExternalLinkAccessible({
          status: currentStep.status,
          expiresAt: currentStep.external_token_expires_at,
        })
      ) {
        return externalLinkInaccessibleResponse(res);
      }

      // Field-level validation rules (format, length, range, etc.)
      const fieldValidations = ((currentStep.step_config as any)?.field_validations ?? []) as FieldValidationRule[];
      if (fieldValidations.length > 0) {
        const fieldValResult = runFieldValidations(fieldValidations, data || {});
        if (!fieldValResult.valid) {
          const errorMessages = Object.entries(fieldValResult.errors)
            .map(([, errs]) => errs.join(', '))
            .join('; ');
          return res.json({
            success: false,
            validation: {
              is_valid: false,
              validation_comment: `Field validation failed: ${errorMessages}`,
            },
          });
        }
      }

      // AI Form Validation (optional)
      const aiEnabled = !!(currentStep.step_config as any)?.ai_form_validation_enabled;
      const aiRule = String((currentStep.step_config as any)?.ai_form_validation_rule || '').trim();

      if (aiEnabled) {
        if (!aiRule) {
          return res.json({
            success: false,
            validation: {
              is_valid: false,
              validation_comment: 'AI form validation is enabled but no validation rule is configured.',
            },
          });
        }

        const validation = await runAiFormValidation({
          company_id: currentStep.company_id,
          data,
          validation_rule: aiRule,
        });

        if (!validation.is_valid) {
          return res.json({
            success: false,
            validation: {
              is_valid: false,
              validation_comment: validation.validation_comment || 'Validation failed.',
            },
          });
        }
      }

      // Fetch execution data
      const executionDataRows = await prisma.workflowExecutionData.findMany({
        where: { execution_id: currentStep.execution_id },
      });

      // Update data
      if (executionDataRows.length > 0) {
        const workflowFields = Array.isArray(currentStep.data_structure) ? currentStep.data_structure : [];
        if (executionDataRows.length === 1) {
          const rowId = executionDataRows[0].id;
          const currentValues = (executionDataRows[0].values || {}) as Record<string, any>;
          const newValues = { ...currentValues };

          for (const [fieldId, val] of Object.entries(data)) {
            let normalizedValue = val;
            const fieldDefinition = getWorkflowFieldById(workflowFields, fieldId);
            if (isUserField(fieldDefinition)) {
              const normalizedUserId = normalizeUserFieldValue(val);
              if (normalizedUserId) {
                const isAllowedUser = await ensureCompanyUser(currentStep.company_id, normalizedUserId);
                if (!isAllowedUser) {
                  return res.status(400).json({
                    error: 'Invalid field value',
                    details: `Field "${fieldId}" must reference a user in this company`,
                  });
                }
              }
              normalizedValue = normalizedUserId;
            }
            newValues[fieldId] = { ...(currentValues[fieldId] || {}), value: normalizedValue };
          }

          await prisma.workflowExecutionData.update({
            where: { id: rowId },
            data: { values: newValues },
          });
        } else {
          // Multiple rows - update matching fields
          for (const row of executionDataRows) {
            const currentValues = (row.values || {}) as Record<string, any>;
            const newValues = { ...currentValues };
            let hasUpdate = false;

            for (const [fieldId, val] of Object.entries(data)) {
              if (currentValues[fieldId] !== undefined) {
                let normalizedValue = val;
                const fieldDefinition = getWorkflowFieldById(workflowFields, fieldId);
                if (isUserField(fieldDefinition)) {
                  const normalizedUserId = normalizeUserFieldValue(val);
                  if (normalizedUserId) {
                    const isAllowedUser = await ensureCompanyUser(currentStep.company_id, normalizedUserId);
                    if (!isAllowedUser) {
                      return res.status(400).json({
                        error: 'Invalid field value',
                        details: `Field "${fieldId}" must reference a user in this company`,
                      });
                    }
                  }
                  normalizedValue = normalizedUserId;
                }
                newValues[fieldId] = { ...currentValues[fieldId], value: normalizedValue };
                hasUpdate = true;
              }
            }

            if (hasUpdate) {
              await prisma.workflowExecutionData.update({
                where: { id: row.id },
                data: { values: newValues },
              });
            }
          }
        }
      }

      // Mark step as completed
      const completedAt = new Date();
      const stepDataWithMeta = attachStepCompletionMeta(
        {
          ...data,
          _submitted_at: completedAt.toISOString(),
          _submission_type: 'external',
        },
        {
          startedAt: currentStep.started_at,
          completedAt,
          closedBySource: 'external',
        }
      );
      await workflowService.cancelReminderForExecutionStep(currentStep.execution_step_id);
      await prisma.workflowExecutionStep.update({
        where: { id: currentStep.execution_step_id },
        data: {
          status: 'completed',
          completed_at: completedAt,
          step_data: stepDataWithMeta,
        },
      });

      // Advance workflow
      const triggeredSteps = await workflowService.advanceWorkflow(
        currentStep.execution_id,
        currentStep.execution_step_id,
        currentStep.company_id,
        'Submit'
      );

      return res.json({
        success: true,
        triggered_steps: triggeredSteps,
        validation: aiEnabled ? { is_valid: true, validation_comment: '' } : undefined,
      });
    } catch (error) {
      console.error('Error submitting external step:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Internal Error',
      });
    }
  },

  /**
   * POST /api/external/steps/:stepId/send-link
   * Send external form link via email (was: send-external-form-link)
   */
  async sendExternalFormLink(req: AuthRequest, res: Response) {
    try {
      const { email, token, executionId, companyId, stepName, comment } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!email || !token || !executionId || !companyId) {
        return res.status(400).json({
          error: 'Missing required parameters',
        });
      }

      // Get company name
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { name: true },
      });

      if (!company) {
        return res.status(404).json({ error: 'Company not found' });
      }

      // Send email
      await emailService.sendExternalFormLink(email, stepName || 'Action Required', token);

      return res.json({ success: true });
    } catch (error) {
      console.error('Send external link error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
};
