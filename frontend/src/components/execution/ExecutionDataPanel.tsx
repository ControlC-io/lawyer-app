import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ArrowRight, Lock, Eye, AlertCircle, UserCog, Bot, Mail, Save, ChevronLeft, ChevronRight } from "lucide-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useCompanyId } from "@/hooks/useCompanyId";
import { useExecutionForm } from "@/hooks/useExecutionForm";
import { useExecutionNavigation } from "@/hooks/useExecutionNavigation";
import { FieldRenderer } from "@/components/execution/form/FieldRenderer";
import { SendExternalLinkDialog } from "./SendExternalLinkDialog";
import { format } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { getFormPagesFromConfig, evaluateFieldRules, validateAllFields, type FieldRule, type FieldValidationRule } from "@/lib/formConfig";
import { resolvePromptTemplate, type PromptValues } from "@/lib/promptTemplate";
import { FormPageStepper } from "@/components/execution/FormPageStepper";
interface ExecutionDataPanelProps {
  executionId: string;
  onFileView?: (fileUrl: string, fileName: string, filePath: string) => void;
  selectedStepId?: string | null; // Optional: if provided, show this specific step instead of first running step
  apiKey?: string | null;
  /** When provided (e.g. from useExecutionData), avoids internal Supabase fetch for steps/connections/data */
  executionSteps?: any[];
  connections?: any[];
  executionDataStructures?: any[];
}
const hasValue = (value: any) => {
  if (value === null || value === undefined) return false;
  if (typeof value === "string" && value.trim() === "") return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
};
export const ExecutionDataPanel = ({
  executionId,
  onFileView,
  selectedStepId,
  apiKey,
  executionSteps: executionStepsProp,
  connections: connectionsProp,
  executionDataStructures: executionDataStructuresProp,
}: ExecutionDataPanelProps) => {
  const { profile } = useAuth();
  const { t, language } = useLanguage();
  const dateLocale = language === "fr" ? fr : enUS;
  const companyId = useCompanyId();
  const queryClient = useQueryClient();
  const [isReassignDialogOpen, setIsReassignDialogOpen] = useState(false);
  const [isSendLinkDialogOpen, setIsSendLinkDialogOpen] = useState(false);
  const [reassignType, setReassignType] = useState<"user" | "group">("user");
  const [selectedReassignId, setSelectedReassignId] = useState<string>("");
  const [triggeringActions, setTriggeringActions] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [formPageIndex, setFormPageIndex] = useState(0);
  const [aiFormValidation, setAiFormValidation] = useState<{
    status: "disabled" | "idle" | "validating" | "valid" | "invalid";
    comment?: string;
  }>({ status: "disabled" });
  const aiValidationSeqRef = useRef(0);
  const aiValidatedFingerprintRef = useRef<string | null>(null);

  // Fetch users and groups for reassignment (API)
  const { data: profiles } = useQuery({
    queryKey: ["profiles", companyId],
    enabled: !!companyId && isReassignDialogOpen,
    queryFn: () => api.get<{ id: string; email: string; full_name: string }[]>(`/api/companies/${companyId}/users`),
  });
  const { data: groups } = useQuery({
    queryKey: ["groups", companyId],
    enabled: !!companyId && isReassignDialogOpen,
    queryFn: () => api.get<{ id: string; name: string }[]>(`/api/companies/${companyId}/groups`),
  });
  const { data: myGroupIdsData } = useQuery({
    queryKey: ["my_group_ids", companyId, profile?.id],
    enabled: !!companyId && !!profile?.id,
    queryFn: () => api.get<{ group_ids: string[] }>(`/api/companies/${companyId}/my-group-ids`),
  });
  const myGroupIds: string[] = Array.isArray((myGroupIdsData as any)?.group_ids)
    ? (myGroupIdsData as { group_ids: string[] }).group_ids
    : [];

  // Fetch agents for form actions (API: agent-permissions with enabled + agent type action)
  const { data: agents } = useQuery({
    queryKey: ["agents", companyId, executionId],
    enabled: !!companyId && !!executionId,
    queryFn: async () => {
      const permissions = await api.get<{ enabled: boolean; agent_configuration?: { id: string; name: string; agent_type?: string } }[]>(`/api/companies/${companyId}/agent-permissions`);
      return (permissions || [])
        .filter((p: any) => p.enabled && p.agent_configuration)
        .map((p: any) => p.agent_configuration)
        .filter((a: any) => (a!.agent_type || "action") === "action")
        .map((a: any) => ({ id: a!.id, name: a!.name }));
    },
  });
  
  const performReassign = async ({
    stepId,
    type,
    id,
    oldAssigneeName,
    newAssigneeName
  }: {
    stepId: string;
    type: "user" | "group";
    id: string;
    oldAssigneeName: string;
    newAssigneeName: string;
  }) => {
    const body = type === "user"
      ? { assigned_to_user_id: id, assigned_to_group_id: null }
      : { assigned_to_user_id: null, assigned_to_group_id: id };
    await api.patch(
      `/api/workflows/executions/${executionId}/steps/${stepId}`,
      body,
      { apiKey: apiKey ?? undefined }
    );
    const logText = `Reassigned step <strong>${runningStep?.workflow_steps?.name ?? runningStep?.step?.name}</strong> from <strong>${oldAssigneeName}</strong> to <strong>${newAssigneeName}</strong> by <strong>${profile?.full_name || profile?.email}</strong>`;
    try {
      await api.post(
        `/api/workflows/executions/${executionId}/logs`,
        { step_id: stepId, log_text: logText },
        { apiKey: apiKey ?? undefined }
      );
    } catch (logError) {
      console.error("Failed to create log entry:", logError);
    }
  };
  const reassignMutation = useMutation({
    mutationFn: performReassign,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["workflow_execution_steps", executionId]
      });
      queryClient.invalidateQueries({
        queryKey: ["workflow_execution_log", executionId]
      });
      toast({
        title: t("executionDataPanel.stepReassignedSuccess")
      });
      setIsReassignDialogOpen(false);
      setSelectedReassignId("");
    },
    onError: error => {
      toast({
        title: t("executionDataPanel.reassignFailed"),
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // When parent does not pass execution data, fetch once from API (same shape as useExecutionData)
  const needExecutionFallback = executionStepsProp === undefined || connectionsProp === undefined || executionDataStructuresProp === undefined;
  const { data: executionFallback, isLoading: isLoadingStructures } = useQuery({
    queryKey: ["workflow_execution", executionId, companyId],
    enabled: !!executionId && !!companyId && !!apiKey && needExecutionFallback,
    queryFn: () => api.get<{
      execution_steps?: Array<{ step?: any; [k: string]: any }>;
      workflow?: { connections?: any[]; data_structure?: any[]; name?: string; id?: string };
      execution_data_records?: Array<{ id: string; values: any }>;
    }>(`/api/workflows/executions/${executionId}`, { apiKey: apiKey ?? undefined }),
  });
  const executionSteps = executionStepsProp ?? (executionFallback?.execution_steps?.map((s: any) => ({ ...s, workflow_steps: s.step ?? s.workflow_steps })));
  const connections = connectionsProp ?? executionFallback?.workflow?.connections ?? [];
  const executionDataStructures = executionDataStructuresProp ?? (executionFallback?.execution_data_records?.length
    ? executionFallback.execution_data_records.map((ed: any) => ({
        id: ed.id,
        values: ed.values || {},
        data_structures: executionFallback.workflow
          ? { id: executionFallback.workflow.id, name: executionFallback.workflow.name, description: null, fields: executionFallback.workflow.data_structure || [] }
          : undefined,
      }))
    : undefined);

  // Hooks
  const form = useExecutionForm(executionId, executionDataStructures || [], executionSteps || [], apiKey, companyId);
  const navigation = useExecutionNavigation(executionId, companyId, executionSteps || [], connections || [], executionDataStructures || [], form.pendingConnectionRef, apiKey);

  // Track which automatic file steps have been processed to prevent duplicate processing
  const processedAutoFileStepsRef = useRef<Set<string>>(new Set());
  const [isAutoProcessing, setIsAutoProcessing] = useState(false);

  // Auto-process automatic file steps when they become the running step
  useEffect(() => {
    const processAutomaticFileStep = async () => {
      if (!executionSteps || isAutoProcessing) return;

      // Find the current running step
      const runningStep = executionSteps.find((s: any) => s.status === "running");
      if (!runningStep) return;

      // Check if it's an automatic file step
      const isAutomaticFileStep =
        runningStep.workflow_steps?.step_type === 'file' &&
        runningStep.workflow_steps?.action_type === 'automatic';

      if (!isAutomaticFileStep) return;

      // Check if we've already processed this step
      if (processedAutoFileStepsRef.current.has(runningStep.id)) return;

      // Mark as processed immediately to prevent duplicate calls
      processedAutoFileStepsRef.current.add(runningStep.id);
      setIsAutoProcessing(true);

      try {
        const { api } = await import("@/lib/api");
        await api.post(
          `/api/files/workflows/executions/${executionId}/steps/${runningStep.id}/process-file`,
          { workflow_step_id: runningStep.workflow_steps?.id ?? runningStep.step?.id },
          { apiKey: apiKey ?? undefined }
        );
        {
          // Invalidate queries to refresh data
          queryClient.invalidateQueries({
            queryKey: ["workflow_execution_steps", executionId]
          });
          queryClient.invalidateQueries({
            queryKey: ["workflow_execution", executionId]
          });
        }
      } catch (error: unknown) {
        console.error('Error auto-processing file step:', error);
        toast({
          title: t("executionDataPanel.autoProcessingError"),
          description: error instanceof Error ? error.message : t("executionDataPanel.autoProcessingErrorDescription"),
          variant: "destructive"
        });
        // Remove from processed set so it can be retried
        processedAutoFileStepsRef.current.delete(runningStep.id);
      } finally {
        setIsAutoProcessing(false);
      }
    };

    processAutomaticFileStep();
  }, [executionSteps, executionId, queryClient, apiKey, isAutoProcessing]);

  // Helper to find field definition
  const findFieldDefinition = (fieldId: string) => {
    if (!executionDataStructures) return null as any;
    for (const eds of executionDataStructures) {
      const ds: any = eds.data_structures;
      const fields: any[] = (ds?.fields ?? []) as any[];
      const def = fields.find(f => f.id === fieldId);
      if (def) {
        return {
          execRow: eds,
          def
        };
      }
    }
    return null;
  };

  // Helper function to get all fields for a data structure
  const getAllFields = () => {
    if (!executionDataStructures) return [];
    const allFields: any[] = [];
    for (const eds of executionDataStructures) {
      const ds: any = eds.data_structures;
      const fields: any[] = (ds?.fields ?? []) as any[];
      allFields.push(...fields.map(f => ({
        ...f,
        execRow: eds
      })));
    }
    return allFields;
  };

  // Helper function to check if a value is empty (for read-only display)
  const hasValue = (value: any): boolean => {
    if (value === null || value === undefined) return false;
    if (typeof value === "string" && value.trim() === "") return false;
    if (Array.isArray(value) && value.length === 0) return false;
    // Keep other values including 0, false, etc. as they are valid values
    return true;
  };

  // Validation function to check required fields
  const validateRequiredFields = (step: any): {
    isValid: boolean;
    missingFields: string[];
  } => {
    if (!step?.workflow_steps?.config?.form_fields) {
      return {
        isValid: true,
        missingFields: []
      };
    }
    const cfg = step.workflow_steps.config as any;
    const formFields = (cfg.form_fields || {}) as Record<string, any>;
    const allFields = getAllFields();
    const missingFields: string[] = [];

    // Get all fields that should be shown in the form
    const arrayFieldIds = new Set(allFields.filter(f => (f.field_type || f.type) === "array" && !f.parent_item_id).map(f => f.id));
    const fieldIdsToValidate = [...Object.keys(formFields).filter(id => !arrayFieldIds.has(id) && !allFields.find(f => f.id === id && f.parent_item_id)), ...Array.from(arrayFieldIds).filter(id => formFields[id]?.shown !== false)];

    // Build map of current values for condition evaluation
    const currentValues: Record<string, any> = {};
    allFields.forEach(f => {
      const execRow = f.execRow;
      const editingKey = `${execRow.id}-${f.id}`;
      // Check editingValues first, then DB value
      if (form.editingValues[editingKey] !== undefined) {
        currentValues[f.id] = form.editingValues[editingKey];
      } else {
        currentValues[f.id] = (execRow.values as any)?.[f.id]?.value;
      }
    });
    const fieldRules = (cfg.field_rules as FieldRule[] | undefined) ?? [];

    // Check each required field
    for (const fieldUuid of fieldIdsToValidate) {
      const fieldConfig = formFields[fieldUuid];
      if (fieldConfig?.shown === false) continue;

      // Check visibility via centralized rules - if hidden, skip validation
      if (!evaluateFieldRules(fieldUuid, "visibility", fieldRules, currentValues, true)) continue;

      // Check required state (fully driven by centralized rules)
      const isRequired = evaluateFieldRules(fieldUuid, "required", fieldRules, currentValues, false);
      if (!isRequired) continue;
      const info = findFieldDefinition(fieldUuid);
      if (!info) continue;
      const def = info.def;
      const execRow = info.execRow;
      const fieldType = def.type || def.field_type;

      // Get current value (check editingValues first, then arrayItems for arrays, then DB value)
      let currentValue: any;
      if (fieldType === "array") {
        // For array fields, check arrayItems state
        currentValue = form.arrayItems[fieldUuid] || [];
      } else {
        // For regular fields, check editingValues first, then DB value
        const editingKey = `${execRow.id}-${fieldUuid}`;
        const dbValue = (execRow.values as any)?.[fieldUuid]?.value;
        currentValue = form.editingValues[editingKey] !== undefined ? form.editingValues[editingKey] : dbValue;
      }

      // Validate based on field type
      let isValid = false;
      switch (fieldType) {
        case "text":
        case "email":
        case "password":
          isValid = currentValue != null && currentValue !== "";
          break;
        case "number":
          isValid = currentValue != null && currentValue !== "";
          break;
        case "date":
          isValid = currentValue != null && currentValue !== "" && currentValue !== undefined;
          // Also validate it's a valid date string/format
          if (currentValue && typeof currentValue === "string") {
            const dateObj = new Date(currentValue);
            isValid = !isNaN(dateObj.getTime());
          }
          break;
        case "option":
          isValid = currentValue != null && currentValue !== "" && currentValue !== undefined;
          break;
        case "multiple_option":
          isValid = Array.isArray(currentValue) && currentValue.length > 0;
          break;
        case "file":
        case "signature":
          isValid = currentValue != null && currentValue !== "" && currentValue !== undefined;
          break;
        case "array":
          isValid = Array.isArray(currentValue) && currentValue.length > 0;
          // Also validate array items if they have required child fields
          if (isValid && currentValue.length > 0) {
            const fieldConfig = formFields[fieldUuid];
            const arrayChildFieldsConfig = fieldConfig?.array_child_fields;
            const childFields = allFields.filter(f => f.parent_item_id === fieldUuid);
            
            // Filter child fields based on configuration if available
            const fieldsToValidate = arrayChildFieldsConfig
              ? childFields.filter(cf => {
                  const config = arrayChildFieldsConfig[cf.id];
                  return config && config.shown && config.required;
                })
              : childFields.filter(cf => cf.required); // Fallback to field's own required property
            
            for (const item of currentValue) {
              for (const childField of fieldsToValidate) {
                const childValue = item[childField.id];
                const childType = childField.type || childField.field_type;
                let childValid = false;
                if (childType === "text" || childType === "email" || childType === "password") {
                  childValid = childValue != null && childValue !== "";
                } else if (childType === "number") {
                  childValid = childValue != null && childValue !== "";
                } else if (childType === "date") {
                  childValid = childValue != null && childValue !== "";
                } else if (childType === "option") {
                  childValid = childValue != null && childValue !== "" && childValue !== undefined;
                } else if (childType === "multiple_option") {
                  childValid = Array.isArray(childValue) && childValue.length > 0;
                } else if (childType === "file") {
                  childValid = childValue != null && childValue !== "" && childValue !== undefined;
                } else {
                  childValid = childValue != null && childValue !== "";
                }
                if (!childValid) {
                  isValid = false;
                  break;
                }
              }
              if (!isValid) break;
            }
          }
          break;
        case "boolean":
          // Boolean fields always have a value (true/false), so they're always valid
          isValid = true;
          break;
        default:
          isValid = currentValue != null && currentValue !== "" && currentValue !== undefined;
      }
      if (!isValid) {
        const fieldLabel = def.label || def.name || def.id || fieldUuid;
        missingFields.push(fieldLabel);
      }
    }
    return {
      isValid: missingFields.length === 0,
      missingFields
    };
  };
  // Helper function to save form values without validation
  const saveFormValues = async () => {
    // Group updates by executionDataId to avoid race conditions
    const updatesByExecutionData: Record<string, Record<string, any>> = {};

    // Collect all regular field updates
    Object.entries(form.editingValues).forEach(([key, newValue]) => {
      // Format is: executionDataId-fieldId
      if (key.length < 38) return; // Invalid key format

      const executionDataId = key.substring(0, 36);
      const fieldId = key.substring(37); // Skip the dash at position 36

      if (executionDataId && fieldId && newValue !== undefined) {
        if (!updatesByExecutionData[executionDataId]) {
          updatesByExecutionData[executionDataId] = {};
        }
        updatesByExecutionData[executionDataId][fieldId] = newValue;
      }
    });

    // Also handle array items
    Object.entries(form.arrayItems).forEach(([fieldId, items]) => {
      const info = findFieldDefinition(fieldId);
      if (info) {
        const executionDataId = info.execRow.id;
        if (!updatesByExecutionData[executionDataId]) {
          updatesByExecutionData[executionDataId] = {};
        }
        updatesByExecutionData[executionDataId][fieldId] = items;
      }
    });

    // Build array child field id -> name map so we send items with names (API contract)
    const allFieldsForSave = getAllFields();
    const arrayChildIdToName: Record<string, Record<string, string>> = {};
    allFieldsForSave
      .filter((f: any) => (f.field_type || f.type) === "array" && !f.parent_item_id)
      .forEach((arrayField: any) => {
        const parentId = arrayField.id;
        arrayChildIdToName[parentId] = {};
        allFieldsForSave
          .filter((cf: any) => cf.parent_item_id === parentId)
          .forEach((cf: any) => {
            if (cf?.id) {
              arrayChildIdToName[parentId][cf.id] = String(cf.name || cf.label || cf.id);
            }
          });
      });

    // Build data keyed by field name for PUT /api/workflows/executions/:executionId/data
    const dataByFieldName: Record<string, any> = {};
    Object.values(updatesByExecutionData).forEach((fieldUpdates) => {
      Object.entries(fieldUpdates).forEach(([fieldId, newValue]) => {
        const info = findFieldDefinition(fieldId);
        if (info?.def?.name) {
          const fieldType = info.def.field_type || info.def.type;
          if (fieldType === "array" && Array.isArray(newValue)) {
            const childMap = arrayChildIdToName[fieldId] || {};
            dataByFieldName[info.def.name] = newValue.map((item: any) => {
              if (!item || typeof item !== "object") return item;
              const out: Record<string, any> = {};
              for (const [k, v] of Object.entries(item)) {
                if (k === "_id") {
                  out._id = v;
                  continue;
                }
                out[childMap[k] ?? k] = v;
              }
              return out;
            });
          } else {
            dataByFieldName[info.def.name] = newValue;
          }
        }
      });
    });
    if (Object.keys(dataByFieldName).length > 0) {
      await api.put(
        `/api/workflows/executions/${executionId}/data`,
        { data: dataByFieldName },
        { apiKey: apiKey ?? undefined }
      );
    }

    queryClient.invalidateQueries({ queryKey: ["workflow_execution", executionId] });
    queryClient.invalidateQueries({ queryKey: ["execution_data_structures", executionId] });
    form.setEditingValues({});
  };

  const buildAiValidationPayload = (step: any) => {
    const cfg = (step?.workflow_steps?.config || {}) as any;
    const formFields = (cfg.form_fields || {}) as Record<string, any>;
    if (!formFields || Object.keys(formFields).length === 0) return {};

    const allFields = getAllFields();
    const fieldIdToName: Record<string, string> = {};
    const arrayChildIdToName: Record<string, Record<string, string>> = {};

    // Build lookup maps from workflow data structure
    allFields.forEach(f => {
      if (f?.id) {
        fieldIdToName[f.id] = String(f.name || f.label || f.id);
      }
    });
    allFields
      .filter(f => (f.field_type || f.type) === "array" && !f.parent_item_id)
      .forEach(arrayField => {
        const parentId = arrayField.id;
        arrayChildIdToName[parentId] = {};
        allFields
          .filter(cf => cf.parent_item_id === parentId)
          .forEach(cf => {
            if (cf?.id) {
              arrayChildIdToName[parentId][cf.id] = String(cf.name || cf.label || cf.id);
            }
          });
      });

    // Build map of current values for condition evaluation (matches UI behavior)
    const currentValues: Record<string, any> = {};
    allFields.forEach(f => {
      const execRow = f.execRow;
      const editingKey = `${execRow.id}-${f.id}`;
      if (form.editingValues[editingKey] !== undefined) {
        currentValues[f.id] = form.editingValues[editingKey];
      } else {
        currentValues[f.id] = (execRow.values as any)?.[f.id]?.value;
      }
    });

    const aiFieldRules = (cfg.field_rules as FieldRule[] | undefined) ?? [];

    const payload: Record<string, any> = {};
    const usedKeys = new Set<string>();
    const uniqueKey = (preferred: string, fieldId: string) => {
      const base = String(preferred || fieldId).trim() || fieldId;
      if (!usedKeys.has(base)) {
        usedKeys.add(base);
        return base;
      }
      const withId = `${base} [${fieldId.slice(0, 8)}]`;
      if (!usedKeys.has(withId)) {
        usedKeys.add(withId);
        return withId;
      }
      let i = 2;
      while (usedKeys.has(`${withId} #${i}`)) i += 1;
      const finalKey = `${withId} #${i}`;
      usedKeys.add(finalKey);
      return finalKey;
    };

    for (const fieldUuid of Object.keys(formFields)) {
      const fieldConfig = formFields[fieldUuid];
      if (fieldConfig?.shown === false) continue;

      if (!evaluateFieldRules(fieldUuid, "visibility", aiFieldRules, currentValues, true)) continue;

      const info = findFieldDefinition(fieldUuid);
      if (!info) continue;
      const def = info.def;
      const execRow = info.execRow;
      const fieldType = def.field_type || def.type;
      const nameKey = uniqueKey(fieldIdToName[fieldUuid] || def?.name || def?.label || fieldUuid, fieldUuid);

      if (fieldType === "array") {
        const items = form.arrayItems[fieldUuid] || [];
        const childMap = arrayChildIdToName[fieldUuid] || {};
        payload[nameKey] = items.map((item: any) => {
          if (!item || typeof item !== "object") return item;
          const out: any = {};
          for (const [k, v] of Object.entries(item)) {
            if (k === "_id") {
              out._id = v;
              continue;
            }
            const childName = childMap[k] || k;
            out[childName] = v;
          }
          return out;
        });
        continue;
      }

      const editingKey = `${execRow.id}-${fieldUuid}`;
      const editingValue = form.editingValues[editingKey];
      if (editingValue !== undefined) {
        payload[nameKey] = editingValue;
        continue;
      }

      // Prefer sending file objects with original_name if present (helps validator)
      const dbValueObj = (execRow.values as any)?.[fieldUuid];
      const isFileField = fieldType === "file";
      if (isFileField && dbValueObj && typeof dbValueObj === "object" && "original_name" in dbValueObj) {
        payload[nameKey] = dbValueObj;
        continue;
      }

      payload[nameKey] = dbValueObj?.value;
    }

    return payload;
  };

  const stableStringify = (value: any): string => {
    if (value === null) return "null";
    if (value === undefined) return "undefined";
    if (typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) {
      return `[${value.map(stableStringify).join(",")}]`;
    }
    const keys = Object.keys(value).sort();
    return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
  };

  const runAiFormValidation = async (step: any, opts?: { silent?: boolean; sequenceId?: number }) => {
    const cfg = (step?.workflow_steps?.config || {}) as any;
    const aiEnabled = step?.workflow_steps?.step_type === "edit_form" && !!cfg.ai_form_validation_enabled;
    const aiRule = String(cfg.ai_form_validation_rule || "").trim();

    if (!aiEnabled) {
      setAiFormValidation({ status: "disabled" });
      return true;
    }

    if (!companyId) {
      setAiFormValidation({ status: "invalid", comment: "Missing company context for validation." });
      return false;
    }

    if (!aiRule) {
      setAiFormValidation({
        status: "invalid",
        comment: "AI form validation is enabled but no validation rule is configured.",
      });
      return false;
    }

    const seq = opts?.sequenceId ?? ++aiValidationSeqRef.current;
    setAiFormValidation(prev => ({
      status: "validating",
      comment: prev.comment,
    }));

    try {
      const payload = buildAiValidationPayload(step);
      const fingerprint = stableStringify(payload);
      const data = await api.post<{ validation?: { is_valid?: boolean; validation_comment?: string } }>(
        "/api/agents/forms/validate-with-ai",
        { company_id: companyId, data: payload, validation_rule: aiRule }
      );

      if (seq !== aiValidationSeqRef.current) return false; // stale

      const validation = (data?.validation ?? data) as any;
      const isValid = !!validation?.is_valid;
      const comment = typeof validation?.validation_comment === "string" ? validation.validation_comment : "";

      if (isValid) {
        aiValidatedFingerprintRef.current = fingerprint;
        setAiFormValidation({ status: "valid", comment });
        return true;
      }

      setAiFormValidation({ status: "invalid", comment: comment || "Validation failed." });
      aiValidatedFingerprintRef.current = null;
      if (!opts?.silent) {
        toast({
          title: t("executionDataPanel.validationFailed"),
          description: comment || t("executionDataPanel.validationFailedDescription"),
          variant: "destructive",
        });
      }
      return false;
    } catch (e: any) {
      if (seq !== aiValidationSeqRef.current) return false; // stale
      const msg = e?.message || "Validation failed.";
      setAiFormValidation({ status: "invalid", comment: msg });
      aiValidatedFingerprintRef.current = null;
      if (!opts?.silent) {
        toast({
          title: t("executionDataPanel.validationFailed"),
          description: msg,
          variant: "destructive",
        });
      }
      return false;
    }
  };

  const handleFormSubmit = async (step: any) => {
    // Validate required fields first
    const validation = validateRequiredFields(step);
    if (!validation.isValid) {
      const fieldList = validation.missingFields.join(", ");
      toast({
        title: t("executionDataPanel.requiredFieldsMissing"),
        description: `${t("executionDataPanel.requiredFieldsMissingDescription")} ${fieldList}`,
        variant: "destructive"
      });
      return false;
    }

    // Field-level validation rules (format, length, range, etc.)
    {
      const cfg2 = (step?.workflow_steps?.config || {}) as any;
      const fieldValidations = (cfg2.field_validations as FieldValidationRule[] | undefined) ?? [];
      if (fieldValidations.length > 0) {
        const allFields2 = getAllFields();
        const currentValues2: Record<string, any> = {};
        allFields2.forEach(f => {
          const execRow = f.execRow;
          const editingKey = `${execRow.id}-${f.id}`;
          if (form.editingValues[editingKey] !== undefined) {
            currentValues2[f.id] = form.editingValues[editingKey];
          } else {
            currentValues2[f.id] = (execRow.values as any)?.[f.id]?.value;
          }
        });
        const validationErrors = validateAllFields(fieldValidations, currentValues2);
        if (Object.keys(validationErrors).length > 0) {
          const errorLines: string[] = [];
          for (const [fieldId, errors] of Object.entries(validationErrors)) {
            const fieldDef = allFields2.find(f => f.id === fieldId);
            const fieldName = fieldDef?.name || fieldId;
            errorLines.push(`${fieldName}: ${errors.join(", ")}`);
          }
          toast({
            title: t("executionDataPanel.fieldValidationFailed"),
            description: errorLines.join("\n"),
            variant: "destructive",
          });
          return false;
        }
      }
    }

    // AI form validation gate (internal edit_form):
    // Must be explicitly validated via "Validate data" button.
    const cfg = (step?.workflow_steps?.config || {}) as any;
    const aiEnabled = step?.workflow_steps?.step_type === "edit_form" && !!cfg.ai_form_validation_enabled;
    if (aiEnabled && aiFormValidation.status !== "valid") {
      toast({
        title: t("executionDataPanel.validationRequired"),
        description: t("executionDataPanel.validationRequiredDescription"),
        variant: "destructive",
      });
      return false;
    }

    // Save all pending form changes

    try {
      await saveFormValues();
      return true;
    } catch (e) {
      console.error("Error saving form", e);
      toast({
        title: t("executionDataPanel.errorSavingForm"),
        description: e instanceof Error ? e.message : t("executionDataPanel.errorSavingFormDescription"),
        variant: "destructive"
      });
      return false;
    }
  };
  const markAiValidationDirty = () => {
    const step =
      selectedStepId
        ? (executionSteps || []).find((s: any) => s.id === selectedStepId)
        : (executionSteps || []).find((s: any) => s.status === "running");

    const cfg = (step?.workflow_steps?.config || {}) as any;
    const aiEnabled = step?.workflow_steps?.step_type === "edit_form" && !!cfg.ai_form_validation_enabled;
    if (!aiEnabled) return;

    // Invalidate any in-flight validation and mark "not validated"
    aiValidationSeqRef.current += 1;
    aiValidatedFingerprintRef.current = null;

    const aiRule = String(cfg.ai_form_validation_rule || "").trim();
    if (!aiRule) {
      setAiFormValidation({
        status: "invalid",
        comment: "AI form validation is enabled but no validation rule is configured.",
      });
      return;
    }

    if (!companyId) {
      setAiFormValidation({ status: "invalid", comment: "Missing company context for validation." });
      return;
    }

    setAiFormValidation({ status: "idle", comment: undefined });
  };

  // Initialize AI validation state when the step changes / rule toggles
  useEffect(() => {
    const step =
      selectedStepId
        ? (executionSteps || []).find((s: any) => s.id === selectedStepId)
        : (executionSteps || []).find((s: any) => s.status === "running");

    const cfg = (step?.workflow_steps?.config || {}) as any;
    const aiEnabled = step?.workflow_steps?.step_type === "edit_form" && !!cfg.ai_form_validation_enabled;
    const aiRule = String(cfg.ai_form_validation_rule || "").trim();

    if (!aiEnabled) {
      setAiFormValidation({ status: "disabled" });
      aiValidatedFingerprintRef.current = null;
      return;
    }

    if (!aiRule) {
      setAiFormValidation({
        status: "invalid",
        comment: "AI form validation is enabled but no validation rule is configured.",
      });
      aiValidatedFingerprintRef.current = null;
      return;
    }

    if (!companyId) {
      setAiFormValidation({ status: "invalid", comment: "Missing company context for validation." });
      aiValidatedFingerprintRef.current = null;
      return;
    }

    // Require explicit validation
    setAiFormValidation({ status: "idle", comment: undefined });
    aiValidatedFingerprintRef.current = null;
  }, [companyId, executionSteps, selectedStepId]);

  // If selectedStepId is provided, use that step (could be running or completed)
  // Otherwise, find the first running step
  const selectedStep = selectedStepId
    ? (executionSteps || []).find((s: any) => s.id === selectedStepId)
    : (executionSteps || []).find((s: any) => s.status === "running");
  const runningStep = selectedStep;

  // Reset form page index when step changes (e.g. different edit_form step)
  useEffect(() => {
    setFormPageIndex(0);
  }, [runningStep?.id]);

  const aiValidationEnabled =
    runningStep?.workflow_steps?.step_type === "edit_form" &&
    !!(runningStep?.workflow_steps?.config as any)?.ai_form_validation_enabled;

  // If underlying data changes while "valid", require re-validation.
  useEffect(() => {
    if (!aiValidationEnabled) return;
    if (aiFormValidation.status !== "valid") return;
    if (!aiValidatedFingerprintRef.current) return;
    if (!runningStep) return;

    const currentFingerprint = stableStringify(buildAiValidationPayload(runningStep));
    if (currentFingerprint !== aiValidatedFingerprintRef.current) {
      setAiFormValidation({ status: "idle", comment: undefined });
      aiValidatedFingerprintRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiValidationEnabled, aiFormValidation.status, executionDataStructures, executionSteps, runningStep?.id]);

  if (isLoadingStructures) {
    return <div className="p-8 text-center text-muted-foreground">Loading data...</div>;
  }

  // Render logic
  if (!runningStep) {
    const isAllCompleted = executionSteps?.every((s: any) => s.status === "completed");
    const isFailed = executionSteps?.some((s: any) => s.status === "failed");
    if (isAllCompleted) {
      return <div className="p-8 text-center text-muted-foreground">Execution completed</div>;
    }
    if (isFailed) {
      return <div className="p-8 text-center text-destructive">Execution failed</div>;
    }
    return <div className="p-8 text-center text-muted-foreground">Waiting for step to start...</div>;
  }
  const isDecisionStep = runningStep.workflow_steps?.step_type === 'decision';
  const isManualActionStep = runningStep.workflow_steps?.step_type === 'action' && runningStep.workflow_steps?.action_type === 'manual';
  const isManualFileStep = runningStep.workflow_steps?.step_type === 'file' && runningStep.workflow_steps?.action_type !== 'automatic';
  const isActionStep = runningStep.workflow_steps?.action_type === 'manual' || runningStep.workflow_steps?.step_type === 'edit_form';
  const isAutomaticAction = runningStep.workflow_steps?.step_type === 'action' && runningStep.workflow_steps?.action_type === 'automatic';
  const isAutomaticFileStep = runningStep.workflow_steps?.step_type === 'file' && runningStep.workflow_steps?.action_type === 'automatic';
  const isAgentAction = runningStep.workflow_steps?.action_type === 'agent';
  // Agent decision steps (not Agent_Human) are fully automatic - user cannot make decision
  const isAgentDecision = isDecisionStep && runningStep.workflow_steps?.decision_node_type === 'Agent';
  // Agent_Human decision steps: agent makes decision first, then human confirms
  const isAgentPlusHumanDecision = isDecisionStep && runningStep.workflow_steps?.decision_node_type === 'Agent_Human';
  const stepData = (runningStep.step_data || {}) as any;
  const agentDecisionChoice = stepData.agent_decision_choice;
  const agentDecisionReason = stepData.agent_decision_reason;
  // For Agent_Human, wait for agent decision before allowing human interaction
  const isWaitingForAgentDecision = isAgentPlusHumanDecision && !agentDecisionChoice;
  const isApiProcessedAction = isAutomaticAction || isAgentAction || isAutomaticFileStep || isAgentDecision || isWaitingForAgentDecision;
  const outgoingConnections = (connections || []).filter((c: any) => c.source_step_id === runningStep.workflow_steps?.id);
  const isAssignee = runningStep.assigned_to_user_id === profile?.id;
  const isGroupMember = runningStep.assigned_to_group_id && myGroupIds?.includes(runningStep.assigned_to_group_id);
  const canCompleteStep = isAssignee || isGroupMember;
  const canReassign = runningStep.workflow_steps?.config?.allow_reassign && (isAssignee || isGroupMember);
  const aiValidationRule = String((runningStep.workflow_steps?.config as any)?.ai_form_validation_rule || "").trim();
  const aiSubmitBlocked = aiValidationEnabled && (!aiValidationRule || aiFormValidation.status !== "valid");

  // Data View Section (Read-only view of all data)
  // Only show if not in edit_form step
  const showDataView = runningStep.workflow_steps?.step_type !== "edit_form" && executionDataStructures && executionDataStructures.length > 0;

  // Form Section
  const renderForm = () => {
    const cfg = (runningStep.workflow_steps?.config || {}) as any;
    const formFields = (cfg.form_fields || {}) as Record<string, any>;
    const formPages = getFormPagesFromConfig(cfg);
    let structureName = "Form";

    // Find structure name
    if (executionDataStructures && executionDataStructures.length > 0) {
      for (const execDataStructure of executionDataStructures) {
        const ds: any = execDataStructure.data_structures;
        const fields: any[] = (ds?.fields ?? []) as any[];
        const hasMatchingField = Object.keys(formFields).some(fieldUuid => fields.some(f => f.id === fieldUuid));
        if (hasMatchingField && ds?.name) {
          structureName = ds.name;
          break;
        }
      }
      if (structureName === "Form" && executionDataStructures[0]?.data_structures?.name) {
        structureName = executionDataStructures[0].data_structures.name;
      }
    }
    const allFields = getAllFields();

    // Build map of current values for condition evaluation
    const currentValues: Record<string, any> = {};
    allFields.forEach(f => {
      const execRow = f.execRow;
      const editingKey = `${execRow.id}-${f.id}`;
      // Check editingValues first, then DB value
      if (form.editingValues[editingKey] !== undefined) {
        currentValues[f.id] = form.editingValues[editingKey];
      } else {
        currentValues[f.id] = (execRow.values as any)?.[f.id]?.value;
      }
    });
    const renderFieldRules = (cfg.field_rules as FieldRule[] | undefined) ?? [];

    // Helper function to render a single field
    const renderField = (fieldUuid: string, labelPosition: "top" | "side" = "top") => {
      const fieldConfig = formFields[fieldUuid];
      // Fields in blocks are visible by default (shown: true), but we still check if explicitly hidden
      if (fieldConfig?.shown === false) return null;

      // Check visibility via centralized rules
      if (!evaluateFieldRules(fieldUuid, "visibility", renderFieldRules, currentValues, true)) return null;
      const info = findFieldDefinition(fieldUuid);
      if (!info) return null;
      const def = info.def;
      const execRow = info.execRow;
      // Determine value: use editingValues first (for optimistic UI), then DB value
      // For file fields, we want to pass the whole value object (with original_name) if available
      const dbValueObj = (execRow.values as any)?.[fieldUuid];
      const dbValue = dbValueObj?.value;
      const editingKey = `${execRow.id}-${fieldUuid}`;
      const editingValue = form.editingValues[editingKey];
      
      // For file fields, preserve the original_name if available
      const fieldType = def.field_type || def.type;
      const isFileField = fieldType === "file";
      let currentValue;
      
      if (editingValue !== undefined) {
        // If we have an editing value, use it (might be string or object)
        currentValue = editingValue;
      } else if (isFileField && dbValueObj && typeof dbValueObj === 'object' && 'original_name' in dbValueObj) {
        // For file fields, pass the whole object if it has original_name
        currentValue = dbValueObj;
      } else {
        // Otherwise, just use the value
        currentValue = dbValue;
      }

      // For Array fields, use arrayItems state
      const isArray = (def.type || def.field_type) === "array";
      const arrayValue = isArray ? form.arrayItems[fieldUuid] || [] : undefined;
      const disabled = fieldConfig?.readonly === true || !canCompleteStep;

      // Determine required state (fully driven by centralized rules)
      const required = evaluateFieldRules(fieldUuid, "required", renderFieldRules, currentValues, false);

      // Merge field config (including allowed_file_types) into field definition
      const fieldWithConfig = {
        ...def,
        allowed_file_types: fieldConfig?.allowed_file_types,
      };

      const fieldElement = (
        <FieldRenderer
          key={fieldUuid}
          field={fieldWithConfig}
          value={isArray ? arrayValue : currentValue}
          onChange={val => {
            // Any change invalidates previous AI validation for this form
            markAiValidationDirty();
            if (isArray) {
              form.setArrayItems(prev => ({
                ...prev,
                [fieldUuid]: val
              }));
            } else {
              form.handleValueChange(editingKey, val);
            }
          }}
          disabled={disabled}
          required={required}
          labelPosition={labelPosition}
          // OptionField props
          dynamicOptions={form.dynamicOptions[fieldUuid]}
          isLoadingDynamic={form.loadingDynamicOptions[fieldUuid]}
          dynamicError={form.dynamicOptionsErrors[fieldUuid]}
          onRetryDynamic={() => form.retryDynamicOptions(fieldUuid)}
          // FileField props
          onUpload={file => {
            markAiValidationDirty();
            return form.handleFileUpload(fieldUuid, file, cfg.ocrEnabled);
          }}
          onViewFile={onFileView}
          onDelete={async (filePath: string) => {
            markAiValidationDirty();
            await form.handleFileDelete(fieldUuid, filePath);
          }}
          isUploading={form.uploadingFiles[fieldUuid]}
          signedUrl={form.signedUrls[`${execRow.id}-${fieldUuid}`]}
          // ArrayField props
          fieldConfig={fieldConfig}
          getSignedUrl={form.getSignedUrl}
          childFields={getAllFields()}
          renderChild={(childField, childValue, onChildChange, hideLabel, required, readonly) => {
            // Use required from configuration if provided, otherwise fallback to field's own required property
            const isRequired = required !== undefined ? required : (childField.required || false);
            const isDisabled = disabled || !!readonly;
            const childFieldType = childField.field_type || childField.type;
            const isFileChild = childFieldType === 'file';
            // For file sub-fields in arrays, resolve signed URL from the storage path
            const childFilePath = isFileChild && childValue ? (typeof childValue === 'string' ? childValue : childValue?.value) : null;
            return (
              <FieldRenderer
                field={childField}
                value={childValue}
                onChange={onChildChange}
                disabled={isDisabled}
                required={isRequired}
                labelPosition={hideLabel ? "hidden" : "top"}
                dynamicOptions={form.dynamicOptions[childField.id]}
                isLoadingDynamic={form.loadingDynamicOptions[childField.id]}
                dynamicError={form.dynamicOptionsErrors[childField.id]}
                onRetryDynamic={() => form.retryDynamicOptions(childField.id)}
                onUpload={isFileChild ? async (file: File) => {
                  markAiValidationDirty();
                  const result = await form.uploadFileForArrayChild(childField.id, file, def.name, childField.name);
                  onChildChange({ value: result.value, original_name: result.original_name });
                  return result.signedUrl;
                } : (file: File) => {
                  markAiValidationDirty();
                  return form.handleFileUpload(childField.id, file, cfg.ocrEnabled);
                }}
                onViewFile={onFileView}
                onDelete={isFileChild ? async (filePath: string) => {
                  markAiValidationDirty();
                  await form.deleteFileFromStorage(filePath);
                  onChildChange(null);
                } : async (filePath: string) => {
                  markAiValidationDirty();
                  await form.handleFileDelete(childField.id, filePath);
                }}
                isUploading={form.uploadingFiles[childField.id]}
                signedUrl={isFileChild && childFilePath ? form.signedUrls[childFilePath] : form.signedUrls[`${execRow.id}-${childField.id}`]}
              />
            );
          }}
        />
      );

      // Wrap with OCR info if ocrEnabled and this is a file field
      if (cfg.ocrEnabled && isFileField) {
        return (
          <div key={fieldUuid}>
            {fieldElement}
            <p className="text-xs text-muted-foreground mt-1">OCR will run automatically on uploaded documents.</p>
            {form.ocrTriggeredFiles[fieldUuid] && (
              <Badge variant="secondary" className="mt-1 text-xs">OCR processing...</Badge>
            )}
          </div>
        );
      }
      return fieldElement;
    };

    // If form has page/block structure, use page → block → fields rendering
    if (formPages.length > 0 && formPages.some((p) => p.blocks.length > 0)) {
      return (
        <Card className="w-full min-w-0 max-w-full">
          <CardHeader className="pb-2 sm:pb-3 px-2 sm:px-3 md:px-4 lg:px-6 min-w-0 max-w-full">
            <div className="flex flex-col gap-2">
              <div>
                <CardTitle className="text-sm sm:text-base md:text-lg break-words min-w-0 max-w-full">{structureName}</CardTitle>
                <CardDescription className="text-xs sm:text-sm break-words min-w-0 max-w-full">Fill required fields to continue</CardDescription>
              </div>

          {(runningStep as any).external_token && (
            <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-md border text-xs">
              <span className="font-medium shrink-0">External Link:</span>
              <code className="bg-background px-1 py-0.5 rounded border border-border flex-1 truncate select-all">
                {window.location.origin}/external/form/{(runningStep as any).external_token}
              </code>
              <div className="flex gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/external/form/${(runningStep as any).external_token}`);
                    toast({ title: t("executionDataPanel.linkCopied") });
                  }}
                  title="Copy link"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-3 w-3"
                  >
                    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                  </svg>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setIsSendLinkDialogOpen(true)}
                  title="Send link by email"
                >
                  <Mail className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
            </div>
          </CardHeader>
          <CardContent className="pt-0 px-2 sm:px-3 md:px-4 lg:px-6 pb-2 sm:pb-3 md:pb-4 lg:pb-6 min-w-0 max-w-full">
            <FormPageStepper
              pages={formPages}
              currentIndex={formPageIndex}
              onPageChange={setFormPageIndex}
              getStepLabel={(page, idx) => page.title || `${t("executionDataPanel.page", "Page")} ${idx + 1}`}
              className="mb-6"
            />
            <form onSubmit={e => e.preventDefault()} className="w-full min-w-0 max-w-full space-y-6">
              {(() => {
                const currentIndex = Math.min(Math.max(0, formPageIndex), formPages.length - 1);
                const page = formPages[currentIndex];
                if (!page) return null;
                return (
                  <div key={page.id} className="space-y-4">
                    {page.blocks.map((block) => (
                      <div key={block.id} className={cn(block.compact ? "space-y-2" : "space-y-4")}>
                        {block.title && (
                          <div className={cn(block.compact ? "pt-1 pb-0.5" : "pt-2 pb-1")}>
                            <h3 className={cn("font-semibold border-b", block.compact ? "text-sm pb-0.5" : "text-base pb-1")}>{block.title}</h3>
                          </div>
                        )}
                        <div
                          className={cn(
                            "grid",
                            block.compact ? "gap-2" : "gap-4",
                            block.columns === 1
                              ? "grid-cols-1"
                              : block.columns === 2
                              ? "grid-cols-1 md:grid-cols-2"
                              : block.columns === 3
                              ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                              : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                          )}
                        >
                          {block.columns_content.map((column, colIndex) => {
                            const columnName = block.column_names?.[colIndex];
                            const labelPosition = block.label_positions?.[colIndex] || "top";
                            const columnContent = (
                              <div className={cn(block.compact ? "space-y-2" : "space-y-3 sm:space-y-4")}>
                                {column.map((fieldUuid) => renderField(fieldUuid, labelPosition))}
                              </div>
                            );
                            if (columnName) {
                              return (
                                <div key={colIndex} className={cn("border rounded-md bg-muted/20", block.compact ? "p-2" : "p-3")}>
                                  <div className={cn("border-b", block.compact ? "mb-1 pb-1" : "mb-2 pb-2")}>
                                    <h4 className={cn("font-semibold", block.compact ? "text-xs" : "text-sm")}>{columnName}</h4>
                                  </div>
                                  {columnContent}
                                </div>
                              );
                            }
                            return <div key={colIndex}>{columnContent}</div>;
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </form>
            {/* Prev/Next page navigation when multiple pages */}
            {formPages.length > 1 && (
              <div className="flex items-center justify-between gap-4 mt-4 pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={formPageIndex <= 0}
                  onClick={() => setFormPageIndex((i) => Math.max(0, i - 1))}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  {t("executionDataPanel.previousPage", "Previous")}
                </Button>
                <span className="text-sm text-muted-foreground">
                  {formPageIndex + 1} / {formPages.length}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={formPageIndex >= formPages.length - 1}
                  onClick={() => setFormPageIndex((i) => Math.min(formPages.length - 1, i + 1))}
                >
                  {t("executionDataPanel.nextPage", "Next")}
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      );
    }

    // Fallback to old format for backward compatibility
    const arrayFieldIds = new Set(allFields.filter(f => (f.field_type || f.type) === "array" && !f.parent_item_id).map(f => f.id));
    const fieldIdsToShow = [...Object.keys(formFields).filter(id => !arrayFieldIds.has(id) && !allFields.find(f => f.id === id && f.parent_item_id)), ...Array.from(arrayFieldIds).filter(id => formFields[id]?.shown !== false)];
    const regularFieldIds = fieldIdsToShow.sort((a, b) => {
      const fieldA = allFields.find(f => f.id === a);
      const fieldB = allFields.find(f => f.id === b);
      const posA = fieldA?.position ?? 999999;
      const posB = fieldB?.position ?? 999999;
      return posA - posB;
    });
    return <Card className="w-full min-w-0 max-w-full">
      <CardHeader className="pb-2 sm:pb-3 px-2 sm:px-3 md:px-4 lg:px-6 min-w-0 max-w-full">
        <div className="flex flex-col gap-2">
          <div>
            <CardTitle className="text-sm sm:text-base md:text-lg break-words min-w-0 max-w-full">{structureName}</CardTitle>
            <CardDescription className="text-xs sm:text-sm break-words min-w-0 max-w-full">Fill required fields to continue</CardDescription>
          </div>

          {(runningStep as any).external_token && (
            <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-md border text-xs">
              <span className="font-medium shrink-0">External Link:</span>
              <code className="bg-background px-1 py-0.5 rounded border border-border flex-1 truncate select-all">
                {window.location.origin}/external/form/{(runningStep as any).external_token}
              </code>
              <div className="flex gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/external/form/${(runningStep as any).external_token}`);
                    toast({ title: t("executionDataPanel.linkCopied") });
                  }}
                  title="Copy link"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-3 w-3"
                  >
                    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                  </svg>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setIsSendLinkDialogOpen(true)}
                  title="Send link by email"
                >
                  <Mail className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0 px-2 sm:px-3 md:px-4 lg:px-6 pb-2 sm:pb-3 md:pb-4 lg:pb-6 min-w-0 max-w-full">
        <form onSubmit={e => e.preventDefault()} className="space-y-3 sm:space-y-4 w-full min-w-0 max-w-full">
          {regularFieldIds.map(fieldUuid => {
            const fieldConfig = formFields[fieldUuid];
            if (fieldConfig?.shown === false) return null;

            // Check visibility via centralized rules
            if (!evaluateFieldRules(fieldUuid, "visibility", renderFieldRules, currentValues, true)) return null;

            const info = findFieldDefinition(fieldUuid);
            if (!info) return null;
            const def = info.def;
            const execRow = info.execRow;
            // Determine value: use editingValues first (for optimistic UI), then DB value
            const dbValue = (execRow.values as any)?.[fieldUuid]?.value;
            const editingKey = `${execRow.id}-${fieldUuid}`;
            const currentValue = form.editingValues[editingKey] !== undefined ? form.editingValues[editingKey] : dbValue;

            // For Array fields, use arrayItems state
            const fieldType = def.field_type || def.type;
            const isArray = fieldType === "array";
            const arrayValue = isArray ? form.arrayItems[fieldUuid] || [] : undefined;
            const disabled = fieldConfig?.readonly === true || !canCompleteStep;

            // Determine required state (fully driven by centralized rules)
            const required = evaluateFieldRules(fieldUuid, "required", renderFieldRules, currentValues, false);
            return <div key={fieldUuid} className="space-y-3">
              <FieldRenderer field={def} value={isArray ? arrayValue : currentValue} onChange={val => {
                // Any change invalidates previous AI validation for this form
                markAiValidationDirty();
                if (isArray) {
                  form.setArrayItems(prev => ({
                    ...prev,
                    [fieldUuid]: val
                  }));
                  // Also update editingValues to trigger save if needed, or just let handleFormSubmit handle it via arrayItems
                } else {
                  form.handleValueChange(editingKey, val);
                }
              }} disabled={disabled} required={required}
                // OptionField props
                dynamicOptions={form.dynamicOptions[fieldUuid]} isLoadingDynamic={form.loadingDynamicOptions[fieldUuid]} dynamicError={form.dynamicOptionsErrors[fieldUuid]} onRetryDynamic={() => form.retryDynamicOptions(fieldUuid)}
                // FileField props
                onUpload={file => {
                  markAiValidationDirty();
                  return form.handleFileUpload(fieldUuid, file, cfg.ocrEnabled);
                }} onViewFile={onFileView} isUploading={form.uploadingFiles[fieldUuid]} signedUrl={form.signedUrls[`${execRow.id}-${fieldUuid}`]}
                // ArrayField props
                fieldConfig={fieldConfig}
                childFields={getAllFields()} renderChild={(childField, childValue, onChildChange, hideLabel, required, readonly) => {
                  const isRequired = required !== undefined ? required : (childField.required || false);
                  const isDisabled = disabled || !!readonly;
                  const childFieldType = childField.field_type || childField.type;
                  const isFileChild = childFieldType === 'file';
                  const childFilePath = isFileChild && childValue ? (typeof childValue === 'string' ? childValue : childValue?.value) : null;
                  return <FieldRenderer field={childField} value={childValue} onChange={onChildChange} disabled={isDisabled}
                    required={isRequired}
                    labelPosition={hideLabel ? "hidden" : "top"}
                    dynamicOptions={form.dynamicOptions[childField.id]} isLoadingDynamic={form.loadingDynamicOptions[childField.id]} dynamicError={form.dynamicOptionsErrors[childField.id]} onRetryDynamic={() => form.retryDynamicOptions(childField.id)}
                    onUpload={isFileChild ? async (file: File) => {
                      markAiValidationDirty();
                      const result = await form.uploadFileForArrayChild(childField.id, file, def.name, childField.name);
                      onChildChange({ value: result.value, original_name: result.original_name });
                      return result.signedUrl;
                    } : (file: File) => {
                      markAiValidationDirty();
                      return form.handleFileUpload(childField.id, file, cfg.ocrEnabled);
                    }}
                    onViewFile={onFileView}
                    onDelete={isFileChild ? async (filePath: string) => {
                      markAiValidationDirty();
                      await form.deleteFileFromStorage(filePath);
                      onChildChange(null);
                    } : undefined}
                    isUploading={form.uploadingFiles[childField.id]}
                    signedUrl={isFileChild && childFilePath ? form.signedUrls[childFilePath] : form.signedUrls[`${execRow.id}-${childField.id}`]} />;
                }} />
              {cfg.ocrEnabled && (fieldType === "file") && (
                <>
                  <p className="text-xs text-muted-foreground mt-1">OCR will run automatically on uploaded documents.</p>
                  {form.ocrTriggeredFiles[fieldUuid] && (
                    <Badge variant="secondary" className="mt-1 text-xs">OCR processing...</Badge>
                  )}
                </>
              )}
            </div>;
          })}
        </form>
      </CardContent>
    </Card>;
  };
  return <div className="space-y-6 pb-20 w-full min-w-0 max-w-full">
    {/* Action Buttons Section */}
    <div className="sticky top-0 z-50 -mx-2 sm:-mx-3 md:-mx-4 lg:-mx-6 px-2 sm:px-3 md:px-4 lg:px-6 pt-2 sm:pt-3 md:pt-4 lg:pt-3 pb-2 sm:pb-3 md:pb-4 lg:pb-3 bg-background/95 backdrop-blur-md">
      <Card className="w-full min-w-0 max-w-full overflow-x-hidden bg-primary/5 border-primary/20 shadow-md">
        <div className="p-2 sm:p-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <h3 className="text-base sm:text-lg font-semibold truncate">
              {runningStep.workflow_steps?.name}
            </h3>
            {isApiProcessedAction && (
              <Badge variant="secondary" className="gap-1 h-6 px-2 animate-pulse font-normal">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span className="hidden sm:inline">Processing</span>
              </Badge>
            )}
            {!canCompleteStep && !isApiProcessedAction && (
              <Badge variant="outline" className="gap-1 h-6 px-2 text-muted-foreground font-normal">
                <Lock className="h-3 w-3" />
                <span className="hidden sm:inline">Read Only</span>
              </Badge>
            )}
            {aiValidationEnabled && (
              <Badge
                variant={
                  aiFormValidation.status === "valid"
                    ? "secondary"
                    : aiFormValidation.status === "invalid"
                    ? "destructive"
                    : "outline"
                }
                className="gap-1 h-6 px-2 font-normal"
                title={aiFormValidation.comment || undefined}
              >
                {aiFormValidation.status === "validating" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : aiFormValidation.status === "invalid" ? (
                  <AlertCircle className="h-3 w-3" />
                ) : (
                  <Bot className="h-3 w-3" />
                )}
                <span className="hidden sm:inline">
                  {aiFormValidation.status === "valid"
                    ? "AI validated"
                    : aiFormValidation.status === "validating"
                    ? "AI validating…"
                    : aiFormValidation.status === "invalid"
                    ? "AI invalid"
                    : "AI not validated"}
                </span>
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
            {aiValidationEnabled && !isApiProcessedAction && (
              <Button
                size="sm"
                variant={aiFormValidation.status === "valid" ? "secondary" : "default"}
                onClick={async () => {
                  // Explicit validation gate
                  const ok = await runAiFormValidation(runningStep);
                  if (!ok) return;
                }}
                disabled={!canCompleteStep || aiFormValidation.status === "validating"}
                title={
                  !aiValidationRule
                    ? "AI validation is enabled but no rule is configured."
                    : aiFormValidation.status === "valid"
                    ? "Data is validated. Changing any value will require re-validation."
                    : "Validate data with AI to enable submission."
                }
              >
                {aiFormValidation.status === "validating" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Bot className="mr-2 h-4 w-4" />
                )}
                Validate data
              </Button>
            )}
            {canReassign && !isApiProcessedAction && <Dialog open={isReassignDialogOpen} onOpenChange={setIsReassignDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 sm:w-auto sm:px-3 gap-2" title="Reassign">
                  <UserCog className="h-4 w-4" />
                  <span className="hidden sm:inline">Reassign</span>
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Reassign Step</DialogTitle>
                  <DialogDescription>
                    Choose a new user or group to assign this step to.
                  </DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="user" value={reassignType} onValueChange={v => {
                  setReassignType(v as "user" | "group");
                  setSelectedReassignId("");
                }}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="user">User</TabsTrigger>
                    <TabsTrigger value="group">Group</TabsTrigger>
                  </TabsList>

                  <div className="mt-4 space-y-4">
                    {reassignType === "user" ? <div className="space-y-2">
                      <Label>Select User</Label>
                      <Select value={selectedReassignId} onValueChange={setSelectedReassignId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a user" />
                        </SelectTrigger>
                        <SelectContent>
                          {profiles?.map((user: any) => <SelectItem key={user.id} value={user.id}>
                            {user.full_name || user.email}
                          </SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div> : <div className="space-y-2">
                      <Label>Select Group</Label>
                      <Select value={selectedReassignId} onValueChange={setSelectedReassignId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a group" />
                        </SelectTrigger>
                        <SelectContent>
                          {groups?.map((group: any) => <SelectItem key={group.id} value={group.id}>
                            {group.name}
                          </SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>}
                  </div>
                </Tabs>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsReassignDialogOpen(false)}>Cancel</Button>
                  <Button onClick={() => {
                    let newName = "Unknown";
                    if (reassignType === "user") {
                      const u = profiles?.find((p: any) => p.id === selectedReassignId);
                      newName = u ? u.full_name || u.email : "Unknown User";
                    } else {
                      const g = groups?.find((gr: any) => gr.id === selectedReassignId);
                      newName = g ? g.name : "Unknown Group";
                    }
                    let oldName = "Unassigned";
                    if (runningStep.assigned_user) {
                      oldName = runningStep.assigned_user.full_name || runningStep.assigned_user.email;
                    } else if (runningStep.assigned_group) {
                      oldName = runningStep.assigned_group.name;
                    } else if (runningStep.assigned_to_user_id) {
                      // Fallback if relation load failed but ID exists
                      oldName = "User " + runningStep.assigned_to_user_id.slice(0, 8);
                    } else if (runningStep.assigned_to_group_id) {
                      oldName = "Group " + runningStep.assigned_to_group_id.slice(0, 8);
                    }
                    reassignMutation.mutate({
                      stepId: runningStep.id,
                      type: reassignType,
                      id: selectedReassignId,
                      oldAssigneeName: oldName,
                      newAssigneeName: newName
                    });
                  }} disabled={!selectedReassignId || reassignMutation.isPending}>
                    {reassignMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Reassign
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>}

            {!isApiProcessedAction && (
              <>
                {/* Form Actions - Agent Actions that can be triggered from the form */}
                {runningStep.workflow_steps?.step_type === "edit_form" && (runningStep.workflow_steps?.config?.form_actions || []).length > 0 && (
                  <>
                    {(runningStep.workflow_steps?.config?.form_actions || []).map((formAction: any, actionIndex: number) => {
                      const actionId = formAction.id || `action-${actionIndex}`;
                      const isTriggeringAction = triggeringActions[actionId] || false;
                      
                      const triggerFormAction = async () => {
                        if (!formAction.agent_id) {
                          toast({
                            title: t("common.error"),
                            description: t("executionDataPanel.agentNotConfigured"),
                            variant: "destructive"
                          });
                          return;
                        }

                        setTriggeringActions(prev => ({ ...prev, [actionId]: true }));
                        try {
                          // Save any pending form changes without validation (required fields only apply to step completion)
                          await saveFormValues();

                          // Fetch agent configuration (API)
                          const agentRes = await api.get<{ agent?: any }>(`/api/agents/${formAction.agent_id}`, { apiKey: apiKey ?? undefined });
                          const agentConfig = agentRes?.agent ?? agentRes;
                          if (!agentConfig) {
                            throw new Error('Could not find the agent configuration');
                          }

                          // Build a map of field_id -> value from current execution data (already in scope)
                          const executionDataMap: Record<string, any> = {};
                          if (executionDataStructures) {
                            executionDataStructures.forEach((eds: any) => {
                              const values = eds.values || {};
                              Object.entries(values).forEach(([fieldId, fieldData]: [string, any]) => {
                                executionDataMap[fieldId] = (fieldData as any)?.value ?? fieldData;
                              });
                            });
                          }

                          // Get workflow data structure to include field types (same as process-automatic-step)
                          const rawDataStructure = executionDataStructures?.[0]?.data_structures?.fields || [];
                          const fields = Array.isArray(rawDataStructure) ? rawDataStructure : [];
                          
                          // Build maps of field_id -> field info (name + type)
                          const fieldInfoMap: Record<string, { name: string; type: string }> = {};
                          fields.forEach((field: any) => {
                            if (field.id) {
                              const inferredType = field.field_type || field.field_type_new || field.type || 'text';
                              fieldInfoMap[field.id] = {
                                name: field.name || field.id,
                                type: inferredType,
                              };
                            }
                          });
                          
                          // Build data_to_send with key (field_id), name, value, and type (same as process-automatic-step)
                          // We only include items that are bound to a workflow field ({{field_id}})
                          const dataToSendWithTypes = (formAction.api_data || []).map((item: any) => {
                            if (!item || !item.value) return null;
                            let rawValue = item.value;
                            let fieldId: string | null = null;

                            if (typeof rawValue === 'string' && rawValue.startsWith('{{') && rawValue.endsWith('}}')) {
                              fieldId = rawValue.slice(2, -2).trim();
                            } else {
                              // Not a binding to a workflow field, skip from structured payload
                              return null;
                            }

                            const info = fieldInfoMap[fieldId] || { name: fieldId, type: 'text' };
                            const value = executionDataMap[fieldId!] ?? null;

                            return {
                              key: fieldId,
                              name: info.name,
                              value: value ?? null,
                              type: info.type || 'text',
                            };
                          }).filter(Boolean);
                          
                          // Build data_to_update with key (field_id), name, value (current value), and type
                          const dataToUpdate = formAction.data_to_update || [];
                          const dataToUpdateWithTypes = dataToUpdate.map((item: any) => {
                            // In data_to_update, the field_id is stored in item.value, not item.field_id
                            const fieldId = item?.value as string | undefined;
                            if (!fieldId) {
                              return {
                                key: null,
                                name: item?.key ?? null,
                                value: null,
                                type: 'text',
                              };
                            }

                            const info = fieldInfoMap[fieldId] || { name: fieldId, type: 'text' };
                            const currentValue = executionDataMap[fieldId] ?? null;
                            
                            return {
                              key: fieldId,
                              name: info.name,
                              value: currentValue,
                              type: info.type || 'text',
                            };
                          });

                          // Build headers
                          const apiHeaders = typeof agentConfig.api_headers === 'string'
                            ? JSON.parse(agentConfig.api_headers)
                            : (agentConfig.api_headers || []);
                          
                          const headersObj: Record<string, string> = {
                            'Content-Type': 'application/json'
                          };
                          apiHeaders.forEach((header: any) => {
                            if (header.key && header.value) {
                              headersObj[header.key] = header.value;
                            }
                          });

                          const requestBody: any = {
                            execution_id: executionId,
                            execution_step_id: runningStep.id,
                            agent_id: formAction.agent_id,
                            data_to_send: dataToSendWithTypes,
                            data_to_update: dataToUpdateWithTypes,
                          };
                          if (agentConfig.prompt_template && formAction.prompt_values && typeof formAction.prompt_values === 'object') {
                            requestBody.prompt = resolvePromptTemplate(agentConfig.prompt_template, formAction.prompt_values as PromptValues);
                          }

                          // Call the agent API with from=form query parameter
                          const apiMethod = agentConfig.api_method || 'POST';
                          let apiUrl = agentConfig.api_url;
                          
                          // Add from=form query parameter
                          try {
                            const url = new URL(apiUrl);
                            url.searchParams.set('from', 'form');
                            apiUrl = url.toString();
                          } catch {
                            // If URL is relative or invalid, append query parameter manually
                            const separator = apiUrl.includes('?') ? '&' : '?';
                            apiUrl = `${apiUrl}${separator}from=form`;
                          }
                          
                          const response = await fetch(apiUrl, {
                            method: apiMethod,
                            headers: headersObj,
                            body: JSON.stringify(requestBody)
                          });

                          if (!response.ok) {
                            const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                            throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
                          }

                          const result = await response.json();

                          // Update data fields from response if configured
                          if (formAction.data_to_update && formAction.data_to_update.length > 0 && result) {
                            const updates: Array<{ fieldId: string; value: any }> = [];
                            
                            formAction.data_to_update.forEach((updateConfig: any) => {
                              const fieldId = updateConfig.value; // This is the workflow field ID
                              const agentKey = updateConfig.key; // This is the key in the agent response
                              
                              if (result[agentKey] !== undefined) {
                                updates.push({
                                  fieldId,
                                  value: result[agentKey]
                                });
                              }
                            });

                            // Update execution data via API
                            if (updates.length > 0) {
                              const dataByFieldName: Record<string, any> = {};
                              updates.forEach(update => {
                                const info = fieldInfoMap[update.fieldId];
                                if (info?.name) {
                                  dataByFieldName[info.name] = update.value;
                                }
                              });
                              if (Object.keys(dataByFieldName).length > 0) {
                                try {
                                  await api.put(
                                    `/api/workflows/executions/${executionId}/data`,
                                    { data: dataByFieldName },
                                    { apiKey: apiKey ?? undefined }
                                  );
                                } catch (updateError) {
                                  console.error('Error updating field:', updateError);
                                }
                              }
                              queryClient.invalidateQueries({ queryKey: ["workflow_execution", executionId] });
                              queryClient.invalidateQueries({ queryKey: ["workflow_execution_steps", executionId] });
                            }
                          }

                          // Refetch execution data and current step to get latest values from agent response
                          await queryClient.invalidateQueries({
                            queryKey: ["execution_data_structures", executionId]
                          });
                          await queryClient.invalidateQueries({
                            queryKey: ["workflow_execution_steps", executionId]
                          });
                          await queryClient.invalidateQueries({
                            queryKey: ["workflow_execution", executionId]
                          });

                          toast({
                            title: t("executionDataPanel.actionCompleted"),
                            description: t("executionDataPanel.actionCompletedDescription")
                          });
                        } catch (error: any) {
                          console.error('Error triggering form action:', error);
                          toast({
                            title: t("common.error"),
                            description: error.message || t("executionDataPanel.failedToExecuteAgentAction"),
                            variant: "destructive"
                          });
                        } finally {
                          setTriggeringActions(prev => ({ ...prev, [actionId]: false }));
                        }
                      };

                      // Get agent name for button label
                      const agentName = agents?.find((a: any) => a.id === formAction.agent_id)?.name || `Action ${actionIndex + 1}`;

                      return (
                        <Button
                          key={`form-action-${actionIndex}`}
                          size="sm"
                          variant="outline"
                          onClick={triggerFormAction}
                          disabled={!canCompleteStep || isTriggeringAction}
                        >
                          {isTriggeringAction ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Processing...
                            </>
                          ) : (
                            <>
                              <Bot className="mr-2 h-4 w-4" />
                              {agentName}
                            </>
                          )}
                        </Button>
                      );
                    })}
                  </>
                )}

                {/* Save button - available for all form steps */}
                {(isActionStep || runningStep.workflow_steps?.step_type === 'edit_form') && !isApiProcessedAction && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      if (!canCompleteStep) {
                        toast({
                          title: t("common.error"),
                          description: t("executionDataPanel.unauthorizedStep"),
                          variant: "destructive"
                        });
                        return;
                      }
                      setIsSaving(true);
                      try {
                        await saveFormValues();
                        toast({
                          title: t("executionDataPanel.dataSaved"),
                          description: t("executionDataPanel.dataSavedDescription"),
                        });
                      } catch (error: any) {
                        console.error("Error saving form", error);
                        toast({
                          title: t("executionDataPanel.errorSaving"),
                          description: error instanceof Error ? error.message : t("executionDataPanel.errorSavingDescription"),
                          variant: "destructive"
                        });
                      } finally {
                        setIsSaving(false);
                      }
                    }}
                    disabled={!canCompleteStep || isSaving}
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Save
                      </>
                    )}
                  </Button>
                )}

                {outgoingConnections.length > 0 ? (
                  <>
                    {(isManualActionStep || isManualFileStep) ? (() => {
                      // Get the custom output name from config, or default to "Done"
                      const outputName = runningStep.workflow_steps?.config?.outputs?.[0] || "Done";
                      return (
                        // Manual action/file steps: single custom button
                        <Button size="sm" variant="default" onClick={async () => {
                          if (!canCompleteStep) {
                            toast({
                              title: t("common.error"),
                              description: t("executionDataPanel.unauthorizedStep"),
                              variant: "destructive"
                            });
                            return;
                          }

                          // Special handling for file steps
                          if (isManualFileStep) {
                            try {
                              await api.post(
                                `/api/files/workflows/executions/${executionId}/steps/${runningStep.id}/process-file`,
                                { workflow_step_id: runningStep.workflow_steps?.id ?? runningStep.step?.id },
                                { apiKey: apiKey ?? undefined }
                              );
                              toast({
                                title: t("executionDataPanel.fileProcessed"),
                                description: t("executionDataPanel.fileProcessedDescription")
                              });
                              queryClient.invalidateQueries({ queryKey: ["workflow_execution_steps", executionId] });
                              queryClient.invalidateQueries({ queryKey: ["workflow_execution", executionId] });
                            } catch (error: unknown) {
                              console.error('Error processing file step:', error);
                              toast({
                                title: t("common.error"),
                                description: error instanceof Error ? error.message : t("executionDataPanel.failedToProcessFileStep"),
                                variant: "destructive"
                              });
                            }
                            return;
                          }

                          // Regular action step handling (use complete endpoint, not decision - decision is only for decision steps)
                          form.pendingConnectionRef.current = {
                            choice: outputName
                          };
                          const saved = await handleFormSubmit(runningStep);
                          if (saved) {
                            navigation.completeStepMutation.mutate({
                              stepExecutionId: runningStep.id
                            });
                          }
                        }} disabled={!canCompleteStep || navigation.completeStepMutation.isPending || form.updateValueMutation.isPending || aiSubmitBlocked}>
                          {navigation.completeStepMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          {outputName}
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      );
                    })() : (
                      // Decision steps and other step types: multiple outputs from connections
                      (() => {
                        const groupedConnections = outgoingConnections.reduce((acc: any, conn: any) => {
                          const key = conn.output_name || "default";
                          if (!acc[key]) acc[key] = [];
                          acc[key].push(conn);
                          return acc;
                        }, {});
                        return Object.entries(groupedConnections).map(([outputName, conns]: [string, any], connIndex: number) => {
                          const buttonLabel = outputName === "default" ? "Continue" : outputName;
                          const buttonStyle = runningStep.workflow_steps?.config?.output_styles?.[outputName] || (connIndex === 0 ? "primary" : "secondary");
                          const buttonVariant = buttonStyle === "primary" ? "default" : "outline";
                          const isAgentSuggestedChoice = isAgentPlusHumanDecision && !!agentDecisionChoice && agentDecisionChoice === outputName;
                          return <Button key={`group-${outputName}`} size="sm" variant={buttonVariant} onClick={async () => {
                            if (!canCompleteStep) {
                              toast({
                                title: t("common.error"),
                                description: t("executionDataPanel.unauthorizedStep"),
                                variant: "destructive"
                              });
                              return;
                            }
                            form.pendingConnectionRef.current = {
                              choice: outputName
                            };
                            const saved = await handleFormSubmit(runningStep);
                            if (saved) {
                              const comment = form.decisionComments[`decision-${runningStep.id}`] || "";
                              if (isDecisionStep) {
                                navigation.makeDecisionMutation.mutate({
                                  stepId: runningStep.id,
                                  choice: outputName,
                                  comment: comment.trim() || undefined
                                });
                                form.setDecisionComments(prev => {
                                  const u = {
                                    ...prev
                                  };
                                  delete u[`decision-${runningStep.id}`];
                                  return u;
                                });
                              } else {
                                navigation.completeStepMutation.mutate({
                                  stepExecutionId: runningStep.id
                                });
                              }
                            }
                          }} className={cn(isAgentSuggestedChoice && "relative ring-4 ring-amber-400 ring-offset-2 ring-offset-background shadow-lg after:content-['Agent'] after:absolute after:-top-2 after:-right-2 after:rounded after:bg-amber-500 after:text-white after:text-[10px] after:px-1.5 after:py-0.5 after:leading-none after:shadow-md")} disabled={!canCompleteStep || navigation.makeDecisionMutation.isPending || navigation.completeStepMutation.isPending || form.updateValueMutation.isPending || aiSubmitBlocked}>
                            {navigation.makeDecisionMutation.isPending || navigation.completeStepMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            {buttonLabel}
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </Button>;
                        });
                      })()
                    )}
                  </>
                ) : (
                  // No outgoing connections (but not API processed)
                  <Button size="sm" onClick={async () => {
                    if (!canCompleteStep) {
                      toast({
                        title: t("common.error"),
                        description: t("executionDataPanel.unauthorizedStep"),
                        variant: "destructive"
                      });
                      return;
                    }

                    // Special handling for manual file steps
                    if (isManualFileStep) {
                      try {
                        await api.post(
                          `/api/files/workflows/executions/${executionId}/steps/${runningStep.id}/process-file`,
                          { workflow_step_id: runningStep.workflow_steps?.id ?? runningStep.step?.id },
                          { apiKey: apiKey ?? undefined }
                        );
                        toast({
                          title: t("executionDataPanel.fileProcessed"),
                          description: t("executionDataPanel.fileProcessedDescription")
                        });
                        queryClient.invalidateQueries({ queryKey: ["workflow_execution_steps", executionId] });
                        queryClient.invalidateQueries({ queryKey: ["workflow_execution", executionId] });
                      } catch (error: unknown) {
                        console.error('Error processing file step:', error);
                        toast({
                          title: t("common.error"),
                          description: error instanceof Error ? error.message : t("executionDataPanel.failedToProcessFileStep"),
                          variant: "destructive"
                        });
                      }
                      return;
                    }
                    const saved = await handleFormSubmit(runningStep);
                    if (saved) {
                      const comment = form.decisionComments[`decision-${runningStep.id}`] || "";
                      if (isDecisionStep) {
                        navigation.makeDecisionMutation.mutate({
                          stepId: runningStep.id,
                          choice: "default",
                          comment: comment.trim() || undefined
                        });
                      } else {
                        navigation.completeStepMutation.mutate({
                          stepExecutionId: runningStep.id
                        });
                      }
                    }
                  }} disabled={!canCompleteStep || navigation.completeStepMutation.isPending || navigation.makeDecisionMutation.isPending || aiSubmitBlocked}>
                    {navigation.completeStepMutation.isPending || navigation.makeDecisionMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {isManualFileStep ? (runningStep.workflow_steps?.config?.outputs?.[0] || 'Done') : 'Mark as Completed'}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
        {aiValidationEnabled && aiFormValidation.status === "invalid" && aiFormValidation.comment && (
          <div className="px-2 sm:px-3 pb-2 sm:pb-3">
            <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded-md p-2">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <p className="whitespace-pre-wrap">{aiFormValidation.comment}</p>
            </div>
          </div>
        )}
        {/* Agent Decision Display for Agent_Human steps */}
        {isAgentPlusHumanDecision && agentDecisionChoice && (
          <div className="px-2 sm:px-3 pb-2 sm:pb-3 pt-0 border-t border-border/50">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">Agent Decision</span>
              </div>
              <div className="bg-primary/5 border border-primary/20 rounded-md p-2 sm:p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="secondary" className="text-xs">
                    {agentDecisionChoice}
                  </Badge>
                  {stepData.agent_decision_at && (
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(stepData.agent_decision_at), "PPp", { locale: dateLocale })}
                    </span>
                  )}
                </div>
                {agentDecisionReason && (
                  <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">
                    {agentDecisionReason}
                  </p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Please review and confirm the agent's decision above.
              </p>
            </div>
          </div>
        )}
        {isDecisionStep && outgoingConnections.length > 0 && !isApiProcessedAction && (
          <div className="px-2 sm:px-3 pb-2 sm:pb-3 pt-0">
             <Textarea placeholder="Add a comment about your decision (optional)" value={form.decisionComments[`decision-${runningStep.id}`] || ""} onChange={e => form.setDecisionComments(prev => ({
               ...prev,
               [`decision-${runningStep.id}`]: e.target.value
             }))} rows={2} className="w-full text-sm resize-none" disabled={!canCompleteStep} />
          </div>
        )}
      </Card>
    </div>

    {/* Data View - only if not edit_form */}
    {showDataView && <Card className="w-full min-w-0 max-w-full overflow-hidden">
      <CardHeader className="pb-2 sm:pb-3 px-2 sm:px-3 md:px-4 lg:px-6 min-w-0 max-w-full">
        <CardTitle className="text-sm sm:text-base md:text-lg break-words min-w-0 max-w-full">Current Data</CardTitle>
        <CardDescription className="text-xs sm:text-sm break-words min-w-0 max-w-full">
          {runningStep && (isApiProcessedAction || runningStep.workflow_steps?.step_type === "decision" && (runningStep.workflow_steps?.decision_node_type === "Agent" || runningStep.workflow_steps?.decision_node_type === "Agent_Human")) ? "Read-only view - This step is being processed automatically" : "Review all data associated with this execution"}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0 px-2 sm:px-3 md:px-4 lg:px-6 pb-2 sm:pb-3 md:pb-4 lg:pb-6 min-w-0 max-w-full">
        {/* Re-implement readonly view using FieldRenderer with disabled=true or custom view */}
        {/* For brevity, I'll reuse FieldRenderer with disabled={true} which is what the original code mostly did essentially */}
        <div className="space-y-6 w-full min-w-0 overflow-hidden">
          {executionDataStructures.map((eds: any) => {
            const ds: any = eds.data_structures;
            const fields: any[] = (ds?.fields ?? []) as any[];
            const values = eds.values as Record<string, any> || {};
            const cfg = runningStep?.workflow_steps?.config as any;
            const formFields = (cfg?.form_fields || {}) as Record<string, any>;
            return <div key={eds.id} className="space-y-4 min-w-0 overflow-hidden">
              <h3 className="text-lg font-semibold">{ds?.name}</h3>
              {fields.filter((f: any) => !f.parent_item_id).filter((field: any) => {
                const fieldValue = values[field.id]?.value;
                return hasValue(fieldValue);
              }).map((field: any) => {
                const fieldValue = values[field.id]?.value;
                // Get field config to apply same settings (like compact_mode for arrays)
                const fieldConfig = formFields[field.id];
                return <FieldRenderer key={field.id} field={field} value={fieldValue} onChange={() => { }} disabled={true}
                  // Dynamic options props for OptionField
                  dynamicOptions={form.dynamicOptions[field.id]} isLoadingDynamic={form.loadingDynamicOptions[field.id]} dynamicError={form.dynamicOptionsErrors[field.id]} onRetryDynamic={() => form.retryDynamicOptions(field.id)}
                  // FileField props
                  onUpload={file => form.handleFileUpload(field.id, file)} onViewFile={onFileView} isUploading={form.uploadingFiles[field.id]} signedUrl={form.signedUrls[`${eds.id}-${field.id}`]}
                  // ArrayField props
                  fieldConfig={fieldConfig}
                  getSignedUrl={form.getSignedUrl}
                  childFields={getAllFields()} renderChild={(cf, cv, onChildChange, hideLabel, required, _readonly) => {
                    const cfType = cf.field_type || cf.type;
                    const isFileChild = cfType === 'file';
                    const cfFilePath = isFileChild && cv ? (typeof cv === 'string' ? cv : cv?.value) : null;
                    return <FieldRenderer field={cf} value={cv} onChange={onChildChange || (() => { })} disabled={true}
                    required={required}
                    labelPosition={hideLabel ? "hidden" : "top"}
                    dynamicOptions={form.dynamicOptions[cf.id]} isLoadingDynamic={form.loadingDynamicOptions[cf.id]} dynamicError={form.dynamicOptionsErrors[cf.id]} onRetryDynamic={() => form.retryDynamicOptions(cf.id)}
                    onUpload={file => form.handleFileUpload(cf.id, file)} onViewFile={onFileView} isUploading={form.uploadingFiles[cf.id]}
                    signedUrl={isFileChild && cfFilePath ? form.signedUrls[cfFilePath] : form.signedUrls[`${eds.id}-${cf.id}`]} />;
                  }} />;
              })}
            </div>;
          })}
        </div>
      </CardContent>
    </Card>}

    {/* Edit Form */}
    {runningStep.workflow_steps?.step_type === "edit_form" && renderForm()}

    {/* Send External Link Dialog */}
    {(runningStep as any).external_token && (
      <SendExternalLinkDialog
        isOpen={isSendLinkDialogOpen}
        onClose={() => setIsSendLinkDialogOpen(false)}
        token={(runningStep as any).external_token}
        executionId={executionId}
        companyId={companyId!}
        stepName={runningStep.workflow_steps?.name || ""}
      />
    )}
  </div>;
};