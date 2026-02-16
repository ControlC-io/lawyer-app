import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { getDocumentProxyUrl } from '../lib/documentUrl';
import { workflowService } from '../services/workflow.service';
import { notificationService } from '../services/notification.service';
import { emailService } from '../services/email.service';
import { storageService } from '../services/storage.service';
import { aiService } from '../services/ai.service';
import crypto from 'crypto';

export const workflowController = {
  /**
   * POST /api/workflows/:workflowId/trigger
   * Trigger a workflow execution via external API (requires api_enabled on workflow).
   */
  async triggerWorkflow(req: AuthRequest, res: Response) {
    try {
      const { workflowId } = req.params;
      const { data } = req.body;
      const companyId = req.company?.id;

      if (!companyId) {
        return res.status(401).json({
          error: 'Missing company authorization',
          details: 'x-api-key header is required',
        });
      }

      if (!workflowId) {
        return res.status(400).json({
          error: 'Missing required fields',
          details: 'workflow_id is required',
        });
      }

      const workflow = await prisma.workflow.findFirst({
        where: { id: workflowId, company_id: companyId },
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
    try {
      const { executionId, stepId } = req.params;

      if (!executionId || !stepId) {
        return res.status(400).json({
          error: 'Missing required fields',
          details: 'execution_id and execution_step_id are required',
        });
      }

      // Fetch execution step with workflow step details
      const executionStep = await prisma.workflowExecutionStep.findFirst({
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

      const execution = await prisma.workflowExecution.findUnique({
        where: { id: executionId },
        select: { company_id: true },
      });
      const executionCompanyId = execution?.company_id;
      if (executionCompanyId && req.user && !req.company?.id) {
        const userCompany = await prisma.userCompany.findFirst({
          where: { user_id: req.user.id, company_id: executionCompanyId },
        });
        if (!userCompany) {
          return res.status(403).json({ error: 'Access denied to this execution' });
        }
      } else if (req.company?.id && executionCompanyId && req.company.id !== executionCompanyId) {
        return res.status(403).json({ error: 'Company does not match execution' });
      }

      const workflowStep = executionStep.step;

      // Check if automatic/agent step
      const isAutomaticAction = workflowStep.step_type === 'action' && workflowStep.action_type === 'automatic';
      const isAgentAction = workflowStep.step_type === 'action' && workflowStep.action_type === 'agent';
      const isAgentDecision =
        workflowStep.step_type === 'decision' &&
        (workflowStep.decision_node_type === 'Agent' || workflowStep.decision_node_type === 'Agent_Human' ||
          (workflowStep.decision_node_type && workflowStep.decision_node_type.toLowerCase() === 'agent'));

      if (!isAutomaticAction && !isAgentDecision && !isAgentAction) {
        return res.json({
          success: true,
          message: 'Step is not an automatic/agent step, skipping',
        });
      }

      // Extract API configuration
      const config = (workflowStep.config as any) || {};
      let apiUrl = config.api_url;
      let apiMethod = config.api_method || 'POST';
      let apiHeaders: any[] = [];
      let apiData: any[] = [];

      // Handle agent configuration
      if (config.agent_id) {
        const agentConfig = await prisma.agentConfiguration.findUnique({
          where: { id: config.agent_id },
        });

        if (!agentConfig) {
          return res.status(400).json({
            error: 'Invalid configuration',
            details: 'Could not find the agent configuration',
          });
        }

        apiUrl = agentConfig.api_url;
        apiMethod = agentConfig.api_method || 'POST';
        apiHeaders = typeof agentConfig.api_headers === 'string'
          ? JSON.parse(agentConfig.api_headers as string)
          : (agentConfig.api_headers || []) as any[];
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

      // Get execution data for bindings
      const executionDataSnapshot = await workflowService.getExecutionDataSnapshot(executionId);

      // Resolve data bindings
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

      // Build request body
      let requestBody: any = {
        execution_id: executionId,
        execution_step_id: stepId,
        ...resolvedData,
      };

      // For agent decisions, include condition and outputs
      if (isAgentDecision) {
        requestBody.condition = config.condition || '';
        requestBody.outputs = Array.isArray(config.outputs) ? config.outputs : [];
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

      return res.json({
        success: result.success,
        message: result.success ? 'API call completed successfully' : 'API call failed',
        response: result.data || result.error,
      });
    } catch (error) {
      console.error('Error processing automatic step:', error);
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

      // Mark step as completed
      await prisma.workflowExecutionStep.update({
        where: { id: stepId },
        data: {
          status: 'completed',
          completed_at: new Date(),
          step_data: finalStepData,
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

      await prisma.workflowExecutionStep.update({
        where: { id: stepId },
        data: {
          decision_choice,
          status: 'completed',
          completed_at: new Date(),
          step_data: stepDataWithComment,
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

      if (!executionId) {
        return res.status(400).json({ error: 'missing execution_id' });
      }

      if (!companyId && req.user?.id) {
        const execution = await prisma.workflowExecution.findUnique({
          where: { id: executionId },
          select: { company_id: true },
        });
        if (!execution?.company_id) {
          return res.status(404).json({ error: 'not found or access denied' });
        }
        const userCompany = await prisma.userCompany.findFirst({
          where: { user_id: req.user.id, company_id: execution.company_id },
        });
        if (!userCompany) {
          return res.status(403).json({ error: 'Access denied to this execution' });
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

      // Process execution data if data structure exists
      if (execution.workflow.data_structure && Array.isArray(execution.workflow.data_structure)) {
        const dataStructure = { fields: execution.workflow.data_structure as any[] };
        const executionDataValues =
          execution.execution_data_records[0]?.values || {};

        // Get document URLs for file fields (proxy through backend, same logic as /api/files/signed-url for documents)
        const fileSignedUrls: Record<string, any> = {};

        for (const field of dataStructure.fields) {
          const fieldValue = (executionDataValues as any)[field.id];

          if (field.field_type === 'file' && fieldValue?.value) {
            fileSignedUrls[field.id] = getDocumentProxyUrl(fieldValue.value);
          } else if (field.field_type === 'multiple_files' && Array.isArray(fieldValue?.value)) {
            fileSignedUrls[field.id] = fieldValue.value.map((filePath: string) =>
              getDocumentProxyUrl(filePath)
            );
          }
        }

        // Add file signed URLs
        if (Object.keys(fileSignedUrls).length > 0 && execution.execution_data_records[0]) {
          (execution.execution_data_records[0] as any).file_signed_urls = fileSignedUrls;
        }

        // Build execution_data_array and execution_data_mapped
        const topLevelFields = dataStructure.fields.filter((f) => !(f as any).parent_item_id);

        (execution as any).execution_data_array = topLevelFields.map((field: any) => {
          const fieldValue = (executionDataValues as any)[field.id];
          const result: any = {
            field_id: field.id,
            field_name: field.name,
            field_type: field.field_type,
            value: fieldValue?.value ?? null,
          };

          if (field.field_type === 'file' && fileSignedUrls[field.id]) {
            result.signed_url = fileSignedUrls[field.id];
          } else if (field.field_type === 'multiple_files' && fileSignedUrls[field.id]) {
            result.signed_urls = fileSignedUrls[field.id];
          }

          return result;
        });

        (execution as any).execution_data_mapped = {};
        topLevelFields.forEach((field: any) => {
          const fieldValue = (executionDataValues as any)[field.id];
          (execution as any).execution_data_mapped[field.name] = fieldValue?.value ?? null;

          if (field.field_type === 'file' && fileSignedUrls[field.id]) {
            (execution as any).execution_data_mapped[`${field.name}_signed_url`] = fileSignedUrls[field.id];
          } else if (field.field_type === 'multiple_files' && fileSignedUrls[field.id]) {
            (execution as any).execution_data_mapped[`${field.name}_signed_urls`] = fileSignedUrls[field.id];
          }
        });
      }

      return res.json(execution);
    } catch (error) {
      console.error('Error getting execution data:', error);
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
      const { executionId } = req.params;
      const { data } = req.body;
      const companyId = req.company?.id;

      if (!companyId) {
        return res.status(401).json({ error: 'Missing company authorization' });
      }

      if (!executionId || !data || typeof data !== 'object') {
        return res.status(400).json({
          error: 'missing or invalid parameters',
          details: 'execution_id and data object are required',
        });
      }

      // Fetch execution with workflow
      const execution = await prisma.workflowExecution.findFirst({
        where: {
          id: executionId,
          company_id: companyId,
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

      // Fetch existing execution data
      const existingData = await prisma.workflowExecutionData.findFirst({
        where: { execution_id: executionId },
      });

      if (!existingData) {
        return res.status(404).json({ error: 'no execution data found' });
      }

      const currentValues = (existingData.values || {}) as Record<string, any>;
      const transformedValues: Record<string, any> = {};
      const unmatchedFields: string[] = [];

      // Process each field in the data object
      for (const [key, value] of Object.entries(data)) {
        const fieldId = fieldNameToId[key];
        const field = fieldId ? fieldIdToField[fieldId] : null;

        if (!field) {
          unmatchedFields.push(key);
          continue;
        }

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
          // Regular field update
          transformedValues[fieldId] = {
            ...currentValues[fieldId],
            value,
          };
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
        updated_fields: Object.keys(data),
      });
    } catch (error) {
      console.error('Error updating execution data:', error);
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
      const { executionId } = req.params;
      const { name } = req.body;
      const companyId = req.company?.id;

      if (!companyId) {
        return res.status(401).json({ error: 'Missing company authorization' });
      }

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
      const { executionId } = req.params;
      const { step_id, log_text, log_type } = req.body;
      const companyId = req.company?.id;

      if (!companyId) {
        return res.status(401).json({ error: 'Missing company authorization' });
      }

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
      const { executionId, stepId } = req.params;
      const { assigned_to_user_id, assigned_to_group_id } = req.body;
      const companyId = req.company?.id;

      if (!companyId) {
        return res.status(401).json({ error: 'Missing company authorization' });
      }

      if (!executionId || !stepId) {
        return res.status(400).json({ error: 'Missing execution_id or step_id' });
      }

      const step = await prisma.workflowExecutionStep.findFirst({
        where: {
          id: stepId,
          execution_id: executionId,
          company_id: companyId,
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
