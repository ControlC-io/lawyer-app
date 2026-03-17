import { Response } from 'express';
import { AuthRequest, resolveCompanyForRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { aiService } from '../services/ai.service';
import fetch from 'node-fetch';
import crypto from 'crypto';

const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY || '';
const AI_FORM_VALIDATION_URL = process.env.AI_FORM_VALIDATION_URL || 'https://automation.floowly.app/webhook/7604f736-0ea8-4ec1-9b03-082256e42e0c';
const AI_FORM_VALIDATION_API_KEY = process.env.FLOOWLY_AI_VALIDATION_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

export const agentsController = {
  /**
   * GET /api/agents/:agentId
   * Get agent configuration (was: get-agent).
   * With company API key: requires company permission. With super admin key: can get any agent by ID (no company required).
   */
  async getAgent(req: AuthRequest, res: Response) {
    try {
      const { agentId } = req.params;

      if (!agentId) {
        return res.status(400).json({
          error: 'Missing agent ID',
          details: 'agent_id is required',
        });
      }

      const isSuperAdmin = req.user?.super_admin === true;

      if (!isSuperAdmin) {
        if (!(await resolveCompanyForRequest(req, res))) return;
      }

      const companyId = req.company?.id;

      // Fetch agent configuration
      const agent = await prisma.agentConfiguration.findUnique({
        where: { id: agentId },
        include: {
          category: {
            select: {
              id: true,
              name: true,
              description: true,
              icon: true,
            },
          },
        },
      });

      if (!agent) {
        return res.status(404).json({
          error: 'Agent not found',
          details: 'Could not find the specified agent configuration',
        });
      }

      // Super admin can access any agent; others need company permission
      if (!isSuperAdmin && companyId) {
        const permission = await prisma.agentPermission.findFirst({
          where: {
            agent_configuration_id: agentId,
            company_id: companyId,
            enabled: true,
          },
        });

        if (!permission) {
          return res.status(403).json({
            error: 'Access denied',
            details: 'The agent is not accessible by the company',
          });
        }
      }

      return res.json({
        success: true,
        agent: {
          ...agent,
          agent_categories: agent.category,
        },
      });
    } catch (error) {
      console.error('Error getting agent:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  /**
   * POST /api/workflows/create-with-ai
   * Create a workflow using AI (was: create-workflow-with-ai)
   */
  async createWorkflowWithAI(req: AuthRequest, res: Response) {
    try {
      const { messages, companyId } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          error: 'Not authenticated',
        });
      }

      if (!LOVABLE_API_KEY) {
        return res.status(500).json({
          error: 'LOVABLE_API_KEY is not configured',
        });
      }

      const systemPrompt = `Tu es un assistant qui aide à créer des workflows visuels. Ton rôle est de :
1. Poser des questions pour comprendre le processus métier de l'utilisateur
2. Identifier les étapes, décisions, formulaires et actions nécessaires
3. Une fois que tu as assez d'informations, créer la structure COMPLÈTE du workflow

Les détails de structure sont identiques aux spécifications Supabase originales.`;

      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
          tools: [
            {
              type: 'function',
              function: {
                name: 'create_workflow',
                description: 'Crée un workflow complet avec toutes ses étapes et connexions',
                parameters: {
                  type: 'object',
                  properties: {
                    workflow: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        description: { type: 'string' },
                        is_public: { type: 'boolean' },
                        data_structure: { type: 'array' },
                      },
                      required: ['name', 'description', 'data_structure'],
                    },
                    steps: { type: 'array' },
                    connections: { type: 'array' },
                  },
                  required: ['workflow', 'steps', 'connections'],
                },
              },
            },
          ],
          tool_choice: 'auto',
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error('AI gateway error:', error);
        throw new Error('AI gateway error');
      }

      const data: any = await response.json();
      const message = data.choices[0].message;

      // Check if AI wants to create workflow
      if (message.tool_calls && message.tool_calls[0].function.name === 'create_workflow') {
        const args = JSON.parse(message.tool_calls[0].function.arguments);

        // Ensure data structure has UUIDs
        const dataStructure = (args.workflow.data_structure || []).map((field: any, index: number) => ({
          ...field,
          id: field.id || crypto.randomUUID(),
          position: field.position ?? index,
        }));

        // Create workflow
        const workflow = await prisma.workflow.create({
          data: {
            name: args.workflow.name,
            description: args.workflow.description,
            company_id: companyId,
            is_public: args.workflow.is_public ?? true,
            data_structure: dataStructure,
          },
        });

        // Create steps
        const stepsData = args.steps.map((step: any) => {
          const stepType = step.step_type === 'form' ? 'edit_form' : step.step_type;

          let defaultOutputs: string[] = [];
          let defaultOutputStyles: Record<string, string> = {};

          if (stepType === 'decision') {
            defaultOutputs = ['Oui', 'Non'];
            defaultOutputStyles = { Oui: 'primary', Non: 'secondary' };
          } else if (stepType === 'action') {
            defaultOutputs = ['Succès', 'Erreur'];
            defaultOutputStyles = { Succès: 'primary', Erreur: 'secondary' };
          } else if (stepType === 'edit_form') {
            defaultOutputs = ['Valider', 'Annuler'];
            defaultOutputStyles = { Valider: 'primary', Annuler: 'secondary' };
          } else if (stepType === 'file') {
            defaultOutputs = ['Continuer'];
            defaultOutputStyles = { Continuer: 'primary' };
          }

          return {
            workflow_id: workflow.id,
            name: step.name,
            step_type: stepType,
            position_x: step.position.x,
            position_y: step.position.y,
            company_id: companyId,
            config: {
              ...(step.config ?? {}),
              outputs: step.config?.outputs || defaultOutputs,
              output_styles: step.config?.output_styles || defaultOutputStyles,
            },
          };
        });

        const steps = await prisma.workflowStep.createManyAndReturn({
          data: stepsData,
        });

        // Create connections
        const connectionsData = args.connections.map((conn: any) => ({
          workflow_id: workflow.id,
          source_step_id: steps[conn.from_step_index].id,
          target_step_id: steps[conn.to_step_index].id,
          output_name: conn.from_output ?? 'default',
          company_id: companyId,
        }));

        if (connectionsData.length > 0) {
          await prisma.workflowConnection.createMany({
            data: connectionsData,
          });
        }

        return res.json({
          workflowId: workflow.id,
          message: 'Workflow créé avec succès !',
        });
      }

      // AI is asking more questions
      return res.json({ message: message.content });
    } catch (error) {
      console.error('Error in create-workflow-with-ai:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  /**
   * POST /api/forms/validate-with-ai
   * Validate form data using AI (was: run-ai-form-validation)
   */
  async validateWithAI(req: AuthRequest, res: Response) {
    try {
      const { company_id, data, validation_rule } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      if (!company_id) {
        return res.status(400).json({ error: 'company_id is required' });
      }

      // Verify user belongs to company
      const membership = await prisma.userCompany.findFirst({
        where: {
          user_id: userId,
          company_id,
        },
      });

      if (!membership) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      const rule = String(validation_rule || '').trim();
      if (!rule) {
        return res.json({
          success: true,
          validation: {
            is_valid: false,
            validation_comment: 'AI form validation is enabled but no validation rule is configured.',
          },
        });
      }

      if (!AI_FORM_VALIDATION_API_KEY) {
        return res.json({
          success: true,
          validation: {
            is_valid: false,
            validation_comment: 'AI validation API key not configured on the backend.',
          },
        });
      }

      // Call AI validation service
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
            company_id,
            data,
            validation_rule: rule,
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
          return res.json({
            success: true,
            validation: {
              is_valid: false,
              validation_comment:
                json?.validation_comment || json?.error || json?.message || `Validation service returned ${response.status}`,
            },
          });
        }

        return res.json({
          success: true,
          validation: {
            is_valid: !!json?.is_valid,
            validation_comment: json?.validation_comment || '',
          },
        });
      } catch (error: any) {
        clearTimeout(timeout);
        return res.json({
          success: true,
          validation: {
            is_valid: false,
            validation_comment: error.name === 'AbortError' ? 'Validation timed out' : error.message || 'Validation failed',
          },
        });
      }
    } catch (error) {
      console.error('Error validating with AI:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  /**
   * POST /api/audio/transcribe
   * Transcribe audio using OpenAI Whisper (was: transcribe-audio)
   */
  async transcribeAudio(req: AuthRequest, res: Response) {
    try {
      const { audio } = req.body;

      if (!audio) {
        return res.status(400).json({ error: 'No audio data provided' });
      }

      if (!OPENAI_API_KEY) {
        return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });
      }

      // Decode base64 audio
      const binaryAudio = Buffer.from(audio, 'base64');

      // Prepare form data
      const FormData = (await import('form-data')).default;
      const formData = new FormData();
      formData.append('file', binaryAudio, 'audio.webm');
      formData.append('model', 'whisper-1');
      formData.append('language', 'fr');

      // Send to OpenAI
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          ...formData.getHeaders(),
        },
        body: formData as any,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error: ${errorText}`);
      }

      const result: any = await response.json();

      return res.json({ text: result.text });
    } catch (error) {
      console.error('Transcription error:', error);
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },

  async listCategories(req: AuthRequest, res: Response) {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
      const list = await prisma.agentCategory.findMany({ orderBy: { name: 'asc' } });
      return res.json(list);
    } catch (error) {
      console.error('listCategories error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async createCategory(req: AuthRequest, res: Response) {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
      const { name, description, icon } = req.body || {};
      const category = await prisma.agentCategory.create({
        data: {
          name: name || 'New Category',
          description: description ?? null,
          icon: icon ?? null,
        },
      });
      return res.status(201).json(category);
    } catch (error) {
      console.error('createCategory error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async updateCategory(req: AuthRequest, res: Response) {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
      const { categoryId } = req.params;
      const { name, description, icon } = req.body || {};
      const result = await prisma.agentCategory.updateMany({
        where: { id: categoryId },
        data: {
          ...(name !== undefined && { name }),
          ...(description !== undefined && { description }),
          ...(icon !== undefined && { icon }),
        },
      });
      if (result.count === 0) return res.status(404).json({ error: 'Category not found' });
      const updated = await prisma.agentCategory.findUnique({ where: { id: categoryId } });
      return res.json(updated);
    } catch (error) {
      console.error('updateCategory error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async deleteCategory(req: AuthRequest, res: Response) {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
      const { categoryId } = req.params;
      const result = await prisma.agentCategory.deleteMany({ where: { id: categoryId } });
      if (result.count === 0) return res.status(404).json({ error: 'Category not found' });
      return res.status(204).send();
    } catch (error) {
      console.error('deleteCategory error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async listConfigurations(req: AuthRequest, res: Response) {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
      const list = await prisma.agentConfiguration.findMany({
        include: { category: true },
        orderBy: { name: 'asc' },
      });
      return res.json(list);
    } catch (error) {
      console.error('listConfigurations error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  /**
   * GET /api/agents/configurations/:configId
   * Get a single agent configuration by id (JWT). Used by workflow editor to load prompt_template.
   */
  async getConfigurationById(req: AuthRequest, res: Response) {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
      const { configId } = req.params;
      const config = await prisma.agentConfiguration.findUnique({
        where: { id: configId },
        include: { category: true },
      });
      if (!config) return res.status(404).json({ error: 'Configuration not found' });
      return res.json(config);
    } catch (error) {
      console.error('getConfigurationById error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  /**
   * GET /api/agents/usage
   * List agent_usage table (read-only). Super admin only.
   */
  async listAgentUsage(req: AuthRequest, res: Response) {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
      if (!req.user?.super_admin) return res.status(403).json({ error: 'Forbidden: super admin only' });

      const list = await prisma.agentUsage.findMany({
        include: {
          agent: { select: { id: true, name: true } },
          company: { select: { id: true, name: true } },
        },
        orderBy: { created_at: 'desc' },
      });

      // Serialize BigInt and Decimal for JSON
      const serialized = list.map((row) => ({
        id: row.id,
        workflow_execution_id: row.workflow_execution_id,
        agent_id: row.agent_id,
        agent_name: row.agent?.name ?? null,
        model_name: row.model_name,
        input_tokens: row.input_tokens != null ? String(row.input_tokens) : null,
        thinking_tokens: row.thinking_tokens != null ? String(row.thinking_tokens) : null,
        output_tokens: row.output_tokens != null ? String(row.output_tokens) : null,
        total_cost: row.total_cost != null ? String(row.total_cost) : null,
        company_id: row.company_id,
        company_name: row.company?.name ?? null,
        comment: row.comment ?? null,
        created_at: row.created_at,
      }));

      return res.json(serialized);
    } catch (error) {
      console.error('listAgentUsage error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  /**
   * POST /api/agents/usage
   * Create an agent_usage record. Super admin only.
   */
  async createAgentUsage(req: AuthRequest, res: Response) {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
      if (!req.user?.super_admin) return res.status(403).json({ error: 'Forbidden: super admin only' });

      const {
        workflow_execution_id,
        agent_id,
        model_name,
        input_tokens,
        thinking_tokens,
        output_tokens,
        total_cost,
        company_id,
        comment,
      } = req.body || {};

      const record = await prisma.agentUsage.create({
        data: {
          workflow_execution_id: workflow_execution_id || null,
          agent_id: agent_id || null,
          model_name: model_name || null,
          input_tokens: input_tokens != null ? BigInt(input_tokens) : null,
          thinking_tokens: thinking_tokens != null ? BigInt(thinking_tokens) : null,
          output_tokens: output_tokens != null ? BigInt(output_tokens) : null,
          total_cost: total_cost != null ? total_cost : null,
          company_id: company_id || null,
          comment: comment || null,
        },
      });

      return res.status(201).json({
        id: record.id,
        workflow_execution_id: record.workflow_execution_id,
        agent_id: record.agent_id,
        model_name: record.model_name,
        input_tokens: record.input_tokens != null ? String(record.input_tokens) : null,
        thinking_tokens: record.thinking_tokens != null ? String(record.thinking_tokens) : null,
        output_tokens: record.output_tokens != null ? String(record.output_tokens) : null,
        total_cost: record.total_cost != null ? String(record.total_cost) : null,
        company_id: record.company_id,
        comment: record.comment,
        created_at: record.created_at,
      });
    } catch (error) {
      console.error('createAgentUsage error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async createConfiguration(req: AuthRequest, res: Response) {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
      const body = req.body || {};
      const config = await prisma.agentConfiguration.create({
        data: {
          name: body.name || 'New Config',
          description: body.description ?? null,
          api_url: body.api_url || '',
          api_method: body.api_method || 'POST',
          api_headers: body.api_headers ?? [],
          api_params: body.api_params ?? [],
          prompt_template: body.prompt_template ?? null,
          category_id: body.category_id ?? null,
          agent_type: body.agent_type ?? null,
        },
      });
      return res.status(201).json(config);
    } catch (error) {
      console.error('createConfiguration error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async updateConfiguration(req: AuthRequest, res: Response) {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
      const { configId } = req.params;
      const body = req.body || {};
      const result = await prisma.agentConfiguration.updateMany({
        where: { id: configId },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.description !== undefined && { description: body.description }),
          ...(body.api_url !== undefined && { api_url: body.api_url }),
          ...(body.api_method !== undefined && { api_method: body.api_method }),
          ...(body.api_headers !== undefined && { api_headers: body.api_headers }),
          ...(body.api_params !== undefined && { api_params: body.api_params }),
          ...(body.prompt_template !== undefined && { prompt_template: body.prompt_template }),
          ...(body.category_id !== undefined && { category_id: body.category_id }),
          ...(body.agent_type !== undefined && { agent_type: body.agent_type }),
        },
      });
      if (result.count === 0) return res.status(404).json({ error: 'Configuration not found' });
      const updated = await prisma.agentConfiguration.findUnique({ where: { id: configId }, include: { category: true } });
      return res.json(updated);
    } catch (error) {
      console.error('updateConfiguration error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },

  async deleteConfiguration(req: AuthRequest, res: Response) {
    try {
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });
      const { configId } = req.params;
      const result = await prisma.agentConfiguration.deleteMany({ where: { id: configId } });
      if (result.count === 0) return res.status(404).json({ error: 'Configuration not found' });
      return res.status(204).send();
    } catch (error) {
      console.error('deleteConfiguration error:', error);
      return res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  },
};
