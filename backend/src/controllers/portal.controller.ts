import { Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { workflowService } from '../services/workflow.service';
import { storageService } from '../services/storage.service';

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
// Portal URL segment: uuid6_slug (first 6 chars of company id + underscore + slug)
// ---------------------------------------------------------------------------

const UUID_PREFIX_LEN = 6;
const UUID_PREFIX_RE = /^[a-fA-F0-9]{6}$/;

function parsePortalSegment(segment: string): { uuidPrefix: string; slugPart: string } | null {
  if (!segment || typeof segment !== 'string') return null;
  const idx = segment.indexOf('_');
  if (idx < 0) return null;
  const uuidPrefix = segment.slice(0, idx);
  const slugPart = segment.slice(idx + 1);
  if (uuidPrefix.length !== UUID_PREFIX_LEN || !UUID_PREFIX_RE.test(uuidPrefix) || !slugPart.trim()) {
    return null;
  }
  return { uuidPrefix, slugPart: slugPart.trim() };
}

async function resolveCompanyFromPortalSegment<T>(
  segment: string,
  select: { id: true } & Record<string, unknown>,
): Promise<T | null> {
  const trimmed = typeof segment === 'string' ? segment.trim() : '';
  if (!trimmed) return null;

  const parsed = parsePortalSegment(trimmed);
  if (parsed) {
    const company = await prisma.company.findFirst({
      where: {
        slug: parsed.slugPart,
        portal_enabled: true,
        is_active: true,
      },
      select: select as any,
    });
    if (!company || (company as unknown as { id: string }).id.slice(0, UUID_PREFIX_LEN).toLowerCase() !== parsed.uuidPrefix.toLowerCase()) {
      return null;
    }
    return company as T;
  }

  // Fallback: treat whole segment as company slug (e.g. /portal/mycompany)
  const company = await prisma.company.findFirst({
    where: {
      slug: trimmed,
      portal_enabled: true,
      is_active: true,
    },
    select: select as any,
  });
  return company ? (company as T) : null;
}

function sanitizeFileName(fileName: string): string {
  if (!fileName || typeof fileName !== 'string') return 'file';
  let s = fileName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*\x00-\x1f,;=+&%$#@!~`{}[\]()]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '');
  return s || 'file';
}

const PORTAL_UPLOADS_PREFIX = 'portal_uploads/';
const DOCUMENTS_BUCKET = 'documents';

async function copyStorageFile(oldPath: string, newPath: string): Promise<void> {
  const stream = await storageService.downloadFile(DOCUMENTS_BUCKET, oldPath);
  await storageService.uploadFile(DOCUMENTS_BUCKET, newPath, stream);
}

// ---------------------------------------------------------------------------
// Portal controller (all public, no auth)
// ---------------------------------------------------------------------------

export const portalController = {
  /**
   * GET /api/portal/:slug
   * Returns company portal info (public). Slug format: {uuid6}_{companySlug}
   */
  async getPortalInfo(req: Request, res: Response) {
    try {
      const { slug } = req.params;
      if (!slug) {
        return res.status(400).json({ error: 'Slug is required' });
      }

      type PortalInfoSelect = {
        id: string;
        name: string;
        slug: string | null;
        logo_url: string | null;
        logo_storage_path: string | null;
        portal_description: string | null;
        portal_primary_color: string | null;
      };
      const company = await resolveCompanyFromPortalSegment<PortalInfoSelect>(slug, {
        id: true,
        name: true,
        slug: true,
        logo_url: true,
        logo_storage_path: true,
        portal_description: true,
        portal_primary_color: true,
      });

      if (!company) {
        return res.status(404).json({ error: 'Portal not found' });
      }

      // Only use /api/portal/.../logo when we have an uploaded file; if logo_url was saved as that path but storage was cleared, treat as no logo
      const rawLogoUrl =
        company.logo_storage_path && slug
          ? `/api/portal/${slug}/logo`
          : company.logo_url ?? null;
      const logo_url =
        typeof rawLogoUrl === 'string' && rawLogoUrl.startsWith('/api/portal/') && rawLogoUrl.endsWith('/logo') && !company.logo_storage_path
          ? null
          : rawLogoUrl;

      return res.json({
        id: company.id,
        name: company.name,
        slug: company.slug,
        logo_url,
        portal_description: company.portal_description,
        portal_primary_color: company.portal_primary_color,
      });
    } catch (error) {
      console.error('getPortalInfo error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  /**
   * GET /api/portal/:slug/logo
   * Stream uploaded portal logo (public). Slug format: {uuid6}_{companySlug}
   */
  async getPortalLogo(req: Request, res: Response) {
    try {
      const { slug } = req.params;
      if (!slug) {
        return res.status(400).send();
      }

      type LogoSelect = { id: string; logo_storage_path: string | null };
      const company = await resolveCompanyFromPortalSegment<LogoSelect>(slug, {
        id: true,
        logo_storage_path: true,
      });

      if (!company || !company.logo_storage_path) {
        return res.status(404).send();
      }

      const bucket = storageService.getBucketName();
      const stream = await storageService.downloadFile(bucket, company.logo_storage_path);
      const ext = company.logo_storage_path.split('.').pop()?.toLowerCase();
      const mime: Record<string, string> = {
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        svg: 'image/svg+xml',
        webp: 'image/webp',
      };
      const contentType = mime[ext ?? ''] || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      // Allow revalidation so new uploads replace the previous logo immediately
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      stream.pipe(res);
    } catch (error) {
      console.error('getPortalLogo error:', error);
      if (!res.headersSent) {
        res.status(500).send();
      }
    }
  },

  /**
   * GET /api/portal/:slug/workflows
   * Returns list of portal-enabled active workflows (public). Slug format: {uuid6}_{companySlug}
   */
  async listPortalWorkflows(req: Request, res: Response) {
    try {
      const { slug } = req.params;
      if (!slug) {
        return res.status(400).json({ error: 'Slug is required' });
      }

      const company = await resolveCompanyFromPortalSegment<{ id: string }>(slug, { id: true });

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
   * Returns workflow detail + first form step config (public). Slug format: {uuid6}_{companySlug}
   */
  async getPortalWorkflowDetail(req: Request, res: Response) {
    try {
      const { slug, workflowId } = req.params;
      if (!slug || !workflowId) {
        return res.status(400).json({ error: 'Slug and workflowId are required' });
      }

      const company = await resolveCompanyFromPortalSegment<{ id: string }>(slug, { id: true });

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
   * POST /api/portal/:slug/workflows/:workflowId/upload
   * Upload a file for a portal form (no execution yet). File is stored under portal_uploads/
   * and will be relocated to the execution on submit.
   */
  async uploadPortalFile(req: Request, res: Response) {
    try {
      const { slug, workflowId } = req.params;
      const file = (req as any).file;

      if (!slug || !workflowId) {
        return res.status(400).json({ error: 'Slug and workflowId are required' });
      }
      if (!file || !file.buffer) {
        return res.status(400).json({ error: 'File is required' });
      }

      const company = await resolveCompanyFromPortalSegment<{ id: string }>(slug, { id: true });
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
        select: { id: true },
      });
      if (!workflow) {
        return res.status(404).json({ error: 'Workflow not found or not available on portal' });
      }

      const sanitized = sanitizeFileName(file.originalname);
      const unique = crypto.randomUUID().slice(0, 8);
      const filePath = `${PORTAL_UPLOADS_PREFIX}${company.id}/${workflowId}/${unique}_${sanitized}`;

      await storageService.uploadFile(
        storageService.getDocumentsBucket(),
        filePath,
        file.buffer,
        file.mimetype
      );

      return res.json({
        success: true,
        path: filePath,
        fullPath: `${DOCUMENTS_BUCKET}/${filePath}`,
        original_name: file.originalname,
      });
    } catch (error) {
      console.error('uploadPortalFile error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
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

      // Validate company + portal (slug format: {uuid6}_{companySlug})
      const company = await resolveCompanyFromPortalSegment<{ id: string }>(slug, { id: true });

      if (!company) {
        return res.status(404).json({ error: 'Portal not found' });
      }

      // Validate workflow and get data_structure for file field relocation
      const workflow = await prisma.workflow.findFirst({
        where: {
          id: workflowId,
          company_id: company.id,
          portal_enabled: true,
          is_active: true,
        },
        select: { id: true, data_structure: true },
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

      // Relocate portal_uploads paths to execution folder before saving
      const dataStructure = workflow.data_structure as { fields?: Array<{ id: string; field_type?: string; type?: string }> } | null;
      const fieldsList = dataStructure?.fields ?? (Array.isArray(dataStructure) ? dataStructure : []);
      const fileFieldIds = new Set(
        fieldsList
          .filter((f: any) => ['file', 'signature'].includes(f.field_type || f.type || ''))
          .map((f: any) => f.id)
      );

      const relocatedData = { ...data };
      const ts = Date.now();
      for (const fieldId of Object.keys(relocatedData)) {
        if (!fileFieldIds.has(fieldId)) continue;
        const val = relocatedData[fieldId];
        if (val && typeof val === 'object' && 'value' in val) {
          const inner = val as { value: string | string[]; original_name?: string | string[] };
          if (typeof inner.value === 'string' && inner.value.startsWith(PORTAL_UPLOADS_PREFIX)) {
            try {
              const base = (inner.value.split('/').pop() || 'file').replace(/^[^_]+_/, '');
              const newPath = `executions/${executionId}/${ts}_${base}`;
              await copyStorageFile(inner.value, newPath);
              relocatedData[fieldId] = { ...inner, value: newPath };
            } catch (err) {
              console.error('Portal file relocate error:', err);
            }
          } else if (Array.isArray(inner.value)) {
            const newPaths: string[] = [];
            let changed = false;
            for (let i = 0; i < inner.value.length; i++) {
              const p = inner.value[i];
              if (typeof p === 'string' && p.startsWith(PORTAL_UPLOADS_PREFIX)) {
                try {
                  const base = (p.split('/').pop() || 'file').replace(/^[^_]+_/, '');
                  const newPath = `executions/${executionId}/${ts}_${i}_${base}`;
                  await copyStorageFile(p, newPath);
                  newPaths.push(newPath);
                  changed = true;
                } catch (err) {
                  console.error('Portal file relocate error:', err);
                  newPaths.push(p);
                }
              } else {
                newPaths.push(p);
              }
            }
            if (changed) {
              relocatedData[fieldId] = { ...inner, value: newPaths };
            }
          }
        }
      }

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

      // Update execution data with submitted form data (with relocated paths)
      const executionDataRows = await prisma.workflowExecutionData.findMany({
        where: { execution_id: executionId },
      });

      if (executionDataRows.length > 0) {
        const rowId = executionDataRows[0].id;
        const currentValues = (executionDataRows[0].values || {}) as Record<string, any>;
        const newValues = { ...currentValues };

        Object.entries(relocatedData).forEach(([fieldId, val]) => {
          newValues[fieldId] = { ...(currentValues[fieldId] || {}), value: val };
        });

        await prisma.workflowExecutionData.update({
          where: { id: rowId },
          data: { values: newValues },
        });
      }

      // Mark first step as completed (use relocatedData so step_data has final paths)
      await prisma.workflowExecutionStep.update({
        where: { id: executionStep.id },
        data: {
          status: 'completed',
          completed_at: new Date(),
          step_data: {
            ...relocatedData,
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
