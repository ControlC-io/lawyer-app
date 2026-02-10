import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { workflowService } from '../services/workflow.service';
import { emailService } from '../services/email.service';
import fetch from 'node-fetch';
import crypto from 'crypto';

// prisma is imported from ../lib/prisma

const AI_FORM_VALIDATION_URL = process.env.AI_FORM_VALIDATION_URL || 'https://automation.floowly.app/webhook/7604f736-0ea8-4ec1-9b03-082256e42e0c';
const AI_FORM_VALIDATION_API_KEY = process.env.FLOOWLY_AI_VALIDATION_API_KEY || '';

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

async function getStepInfoByToken(token: string) {
  const stepInfo = await prisma.$queryRaw<
    Array<{
      execution_id: string;
      execution_step_id: string;
      workflow_step_id: string;
      company_id: string;
      data_structure: any;
      step_config: any;
    }>
  >`
    SELECT 
      wes.execution_id,
      wes.id as execution_step_id,
      wes.step_id as workflow_step_id,
      wes.company_id,
      w.data_structure,
      ws.config as step_config
    FROM public.workflow_execution_steps wes
    JOIN public.workflow_steps ws ON ws.id = wes.step_id
    JOIN public.workflow_executions we ON we.id = wes.execution_id
    JOIN public.workflows w ON w.id = we.workflow_id
    WHERE wes.external_token = ${token}
    LIMIT 1
  `;
  return stepInfo;
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

      return res.json(stepInfo[0]);
    } catch (error) {
      console.error('getStepByToken error:', error);
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
        if (executionDataRows.length === 1) {
          const rowId = executionDataRows[0].id;
          const currentValues = (executionDataRows[0].values || {}) as Record<string, any>;
          const newValues = { ...currentValues };

          Object.entries(data).forEach(([fieldId, val]) => {
            newValues[fieldId] = { ...(currentValues[fieldId] || {}), value: val };
          });

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

            Object.entries(data).forEach(([fieldId, val]) => {
              if (currentValues[fieldId] !== undefined) {
                newValues[fieldId] = { ...currentValues[fieldId], value: val };
                hasUpdate = true;
              }
            });

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
      await prisma.workflowExecutionStep.update({
        where: { id: currentStep.execution_step_id },
        data: {
          status: 'completed',
          completed_at: new Date(),
          step_data: {
            ...data,
            _submitted_at: new Date().toISOString(),
            _submission_type: 'external',
          },
        },
      });

      // Advance workflow
      const triggeredSteps = await workflowService.advanceWorkflow(
        currentStep.execution_id,
        currentStep.workflow_step_id,
        currentStep.company_id
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
