import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { workflowService } from '../services/workflow.service';

// ---------------------------------------------------------------------------
// Field validation (reused from external.controller.ts)
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

function evaluateFieldValidation(
  rule: FieldValidationRule,
  fieldValue: unknown,
): { valid: boolean; message?: string } {
  if (fieldValue === undefined || fieldValue === null || fieldValue === '') {
    return { valid: true };
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

// ---------------------------------------------------------------------------
// Portal controller (all public, no auth)
// ---------------------------------------------------------------------------

export const portalController = {
  /**
   * GET /api/portal/:slug
   * Returns company portal info (public)
   */
  async getPortalInfo(req: Request, res: Response) {
    try {
      const { slug } = req.params;
      if (!slug) {
        return res.status(400).json({ error: 'Slug is required' });
      }

      const company = await prisma.company.findFirst({
        where: {
          slug,
          portal_enabled: true,
          is_active: true,
        },
        select: {
          id: true,
          name: true,
          slug: true,
          logo_url: true,
          portal_description: true,
          portal_primary_color: true,
        },
      });

      if (!company) {
        return res.status(404).json({ error: 'Portal not found' });
      }

      return res.json(company);
    } catch (error) {
      console.error('getPortalInfo error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  /**
   * GET /api/portal/:slug/workflows
   * Returns list of portal-enabled active workflows (public)
   */
  async listPortalWorkflows(req: Request, res: Response) {
    try {
      const { slug } = req.params;
      if (!slug) {
        return res.status(400).json({ error: 'Slug is required' });
      }

      const company = await prisma.company.findFirst({
        where: {
          slug,
          portal_enabled: true,
          is_active: true,
        },
        select: { id: true },
      });

      if (!company) {
        return res.status(404).json({ error: 'Portal not found' });
      }

      const workflows = await prisma.workflow.findMany({
        where: {
          company_id: company.id,
          portal_enabled: true,
          is_active: true,
        },
        select: {
          id: true,
          name: true,
          description: true,
          icon: true,
        },
        orderBy: { name: 'asc' },
      });

      return res.json(workflows);
    } catch (error) {
      console.error('listPortalWorkflows error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  /**
   * GET /api/portal/:slug/workflows/:workflowId
   * Returns workflow detail + first form step config (public)
   */
  async getPortalWorkflowDetail(req: Request, res: Response) {
    try {
      const { slug, workflowId } = req.params;
      if (!slug || !workflowId) {
        return res.status(400).json({ error: 'Slug and workflowId are required' });
      }

      const company = await prisma.company.findFirst({
        where: {
          slug,
          portal_enabled: true,
          is_active: true,
        },
        select: { id: true },
      });

      if (!company) {
        return res.status(404).json({ error: 'Portal not found' });
      }

      const workflow = await prisma.workflow.findFirst({
        where: {
          id: workflowId,
          company_id: company.id,
          portal_enabled: true,
          is_active: true,
        },
        select: {
          id: true,
          name: true,
          description: true,
          icon: true,
          data_structure: true,
        },
      });

      if (!workflow) {
        return res.status(404).json({ error: 'Workflow not found or not available on portal' });
      }

      // Find start step and follow its first connection to get the first form step
      const startStep = await prisma.workflowStep.findFirst({
        where: { workflow_id: workflowId, step_type: 'start' },
        select: { id: true },
      });

      if (!startStep) {
        return res.status(400).json({ error: 'Workflow has no start step' });
      }

      const startConnection = await prisma.workflowConnection.findFirst({
        where: { workflow_id: workflowId, source_step_id: startStep.id },
        select: { target_step_id: true },
      });

      if (!startConnection) {
        return res.status(400).json({ error: 'Start step has no outgoing connection' });
      }

      const firstStep = await prisma.workflowStep.findFirst({
        where: { id: startConnection.target_step_id, workflow_id: workflowId },
        select: {
          id: true,
          name: true,
          step_type: true,
          config: true,
        },
      });

      if (!firstStep || firstStep.step_type !== 'edit_form') {
        return res.status(400).json({ error: 'First step must be a form step for portal access' });
      }

      return res.json({
        workflow: {
          id: workflow.id,
          name: workflow.name,
          description: workflow.description,
          icon: workflow.icon,
          data_structure: workflow.data_structure,
        },
        first_step: {
          id: firstStep.id,
          name: firstStep.name,
          config: firstStep.config,
        },
      });
    } catch (error) {
      console.error('getPortalWorkflowDetail error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  /**
   * POST /api/portal/:slug/workflows/:workflowId/submit
   * Submit the first form step (creates execution + completes first step)
   */
  async submitPortalWorkflow(req: Request, res: Response) {
    try {
      const { slug, workflowId } = req.params;
      const { data } = req.body;

      if (!slug || !workflowId) {
        return res.status(400).json({ error: 'Slug and workflowId are required' });
      }

      if (!data || typeof data !== 'object') {
        return res.status(400).json({ error: 'Form data is required' });
      }

      // Validate company + portal
      const company = await prisma.company.findFirst({
        where: {
          slug,
          portal_enabled: true,
          is_active: true,
        },
        select: { id: true },
      });

      if (!company) {
        return res.status(404).json({ error: 'Portal not found' });
      }

      // Validate workflow
      const workflow = await prisma.workflow.findFirst({
        where: {
          id: workflowId,
          company_id: company.id,
          portal_enabled: true,
          is_active: true,
        },
        select: { id: true },
      });

      if (!workflow) {
        return res.status(404).json({ error: 'Workflow not found or not available on portal' });
      }

      // Find start step → first step
      const startStep = await prisma.workflowStep.findFirst({
        where: { workflow_id: workflowId, step_type: 'start' },
        select: { id: true },
      });

      if (!startStep) {
        return res.status(400).json({ error: 'Workflow has no start step' });
      }

      const startConnection = await prisma.workflowConnection.findFirst({
        where: { workflow_id: workflowId, source_step_id: startStep.id },
        select: { target_step_id: true },
      });

      if (!startConnection) {
        return res.status(400).json({ error: 'Start step has no outgoing connection' });
      }

      const firstStep = await prisma.workflowStep.findFirst({
        where: { id: startConnection.target_step_id, workflow_id: workflowId },
        select: {
          id: true,
          step_type: true,
          config: true,
        },
      });

      if (!firstStep || firstStep.step_type !== 'edit_form') {
        return res.status(400).json({ error: 'First step must be a form step' });
      }

      // Run field-level validations
      const fieldValidations = ((firstStep.config as any)?.field_validations ?? []) as FieldValidationRule[];
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

      // Create execution (anonymous — createdBy: null)
      const executionId = await workflowService.createExecutionAndStart(
        company.id,
        workflowId,
        { data: {}, createdBy: null }
      );

      // Find the execution step for the first step
      const executionStep = await prisma.workflowExecutionStep.findFirst({
        where: {
          execution_id: executionId,
          step_id: firstStep.id,
        },
        select: { id: true },
      });

      if (!executionStep) {
        return res.status(500).json({ error: 'Failed to find execution step' });
      }

      // Update execution data with submitted form data
      const executionDataRows = await prisma.workflowExecutionData.findMany({
        where: { execution_id: executionId },
      });

      if (executionDataRows.length > 0) {
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
      }

      // Mark first step as completed
      await prisma.workflowExecutionStep.update({
        where: { id: executionStep.id },
        data: {
          status: 'completed',
          completed_at: new Date(),
          step_data: {
            ...data,
            _submitted_at: new Date().toISOString(),
            _submission_type: 'portal',
          },
        },
      });

      // Advance workflow to next step(s)
      const triggeredSteps = await workflowService.advanceWorkflow(
        executionId,
        firstStep.id,
        company.id
      );

      return res.json({
        success: true,
        execution_id: executionId,
        triggered_steps: triggeredSteps,
      });
    } catch (error) {
      console.error('submitPortalWorkflow error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
};
