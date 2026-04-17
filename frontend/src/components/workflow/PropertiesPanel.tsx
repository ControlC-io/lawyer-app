import { useState, useEffect } from "react";
import { X, Plus, Trash2, Link2, Settings, ChevronDown, ChevronRight, MessageSquare } from "lucide-react";
import { WorkflowStep } from "@/pages/WorkflowEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel, SelectSeparator } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useCompanyId } from "@/hooks/useCompanyId";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { FormBlocksEditor } from "./FormBlocksEditor";
import { FieldRulesEditor } from "./FieldRulesEditor";
import { FieldValidationsEditor } from "./FieldValidationsEditor";
import { getIconComponent } from "@/lib/iconUtils";
import { getTagColors } from "@/lib/tagColors";
import { Folder } from "lucide-react";
import { PermissionTargetPicker } from "./PermissionTargetPicker";
import { InteractivePromptEditor } from "@/components/promptTemplate/InteractivePromptEditor";
import type { PromptValues } from "@/lib/promptTemplate";
import { MetadataValueControl, type FileMetadataKey } from "@/components/documents/MetadataValueControl";
import { useLanguage } from "@/contexts/LanguageContext";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";

type KeyValuePair = { key: string; value: string; mode?: "static" | "bind" };
type ReminderMode = "none" | "repeat" | "schedule";

type StepNotificationConfig = {
  assignment: { enabled: boolean };
  reminder: {
    mode: ReminderMode;
    delay_minutes: number;
    repeat_every_minutes?: number;
    max_count?: number;
    schedule_minutes: number[];
  };
};

type ReminderDurationUnit = "hours" | "days";

function clampPositiveInteger(value: unknown, fallbackValue: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallbackValue;
  const rounded = Math.round(parsed);
  return rounded > 0 ? rounded : fallbackValue;
}

function normalizeStepNotificationConfig(rawConfig: unknown): StepNotificationConfig {
  const input = (rawConfig && typeof rawConfig === "object" ? rawConfig : {}) as Record<string, any>;
  const assignment = (input.assignment && typeof input.assignment === "object" ? input.assignment : {}) as Record<string, any>;
  const reminder = (input.reminder && typeof input.reminder === "object" ? input.reminder : {}) as Record<string, any>;

  const rawMode = typeof reminder.mode === "string" ? reminder.mode.toLowerCase() : "none";
  const mode: ReminderMode =
    rawMode === "repeat" ? "repeat" : rawMode === "schedule" || rawMode === "once" ? "schedule" : "none";
  const scheduleRaw = Array.isArray(reminder.schedule_minutes) ? reminder.schedule_minutes : [];
  const scheduleMinutes = scheduleRaw
    .map((value: unknown) => Number(value))
    .filter((value: number) => Number.isFinite(value) && value > 0)
    .map((value: number) => Math.round(value))
    .sort((a: number, b: number) => a - b)
    .filter((value: number, index: number, list: number[]) => index === 0 || value !== list[index - 1]);

  return {
    assignment: {
      enabled: assignment.enabled !== false,
    },
    reminder: {
      mode,
      delay_minutes: clampPositiveInteger(reminder.delay_minutes, 24 * 60),
      repeat_every_minutes: clampPositiveInteger(reminder.repeat_every_minutes, 24 * 60),
      max_count:
        reminder.max_count === null || reminder.max_count === undefined
          ? undefined
          : clampPositiveInteger(reminder.max_count, 1),
      schedule_minutes: scheduleMinutes.length > 0 ? scheduleMinutes : [24 * 60],
    },
  };
}

function minutesToDuration(minutes: number): { value: number; unit: ReminderDurationUnit } {
  const safeMinutes = clampPositiveInteger(minutes, 24 * 60);
  if (safeMinutes % (24 * 60) === 0) {
    return { value: Math.max(1, Math.round(safeMinutes / (24 * 60))), unit: "days" };
  }
  return { value: Math.max(1, Math.round(safeMinutes / 60)), unit: "hours" };
}

function durationToMinutes(value: unknown, unit: ReminderDurationUnit): number {
  const safeValue = clampPositiveInteger(value, 1);
  return unit === "days" ? safeValue * 24 * 60 : safeValue * 60;
}

function normalizeStepExplanation(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const raw = typeof value === "string" ? value : String(value);
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  const plainText = trimmed
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return plainText ? trimmed : undefined;
}

const EXPLANATION_EDITOR_MODULES = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ["bold", "italic", "underline"],
    [{ list: "ordered" }, { list: "bullet" }],
    ["link", "clean"],
  ],
};

const EXPLANATION_EDITOR_FORMATS = [
  "header",
  "bold",
  "italic",
  "underline",
  "list",
  "bullet",
  "link",
];

interface PropertiesPanelProps {
  step: WorkflowStep;
  workflowId: string;
  dataStructure?: any[] | null;
  onUpdateStep: (step: WorkflowStep) => void;
  onClose: () => void;
  onOutputRenamed?: (stepId: string, oldName: string, newName: string) => void;
  onOpenDataStructureEditor?: () => void;
  /** When set (e.g. "form"), open the configuration sub-tab on this tab when step is edit_form. Used to return to Form after closing data structure editor. */
  initialConfigurationSubTab?: "status" | "form" | "rules" | "validation" | "action";
}

export function PropertiesPanel({ step, workflowId, dataStructure, onUpdateStep, onClose, onOutputRenamed, onOpenDataStructureEditor, initialConfigurationSubTab }: PropertiesPanelProps) {
  const companyId = useCompanyId();
  const { isSuperAdmin } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  // API configurations are typed; for an "action" step we only want action-compatible configs.
  // Otherwise the dropdown shows decision configs, which isn't allowed in the current UX.
  const apiConfigTypeForStep: "automatic_action" | "agent_decision" | null =
    step.step_type === "action" && step.action_type === "automatic"
      ? "automatic_action"
      : step.step_type === "decision"
        ? "agent_decision"
        : null;
  const [outputs, setOutputs] = useState<string[]>(
    step.step_type === "decision"
      ? (step.config.outputs?.length ? step.config.outputs : ["Yes", "No"])
      : step.step_type === "edit_form"
        ? (step.config.outputs?.length ? step.config.outputs : ["Submit", "Cancel"])
        : step.step_type === "file"
          ? (step.config.outputs?.length ? [step.config.outputs[0]] : ["Done"])
          : step.step_type === "action"
            ? (step.config.outputs?.length ? [step.config.outputs[0]] : ["Done"])
            : []
  );
  const [users, setUsers] = useState<Array<{ id: string; email: string; full_name: string | null }>>([]);
  const [groups, setGroups] = useState<Array<{ id: string; name: string; description: string | null }>>([]);
  const [dataStructureItems, setDataStructureItems] = useState<Array<{ id: string; name: string; data_structure_name: string; field_type?: string; parent_item_id?: string | null }>>([]);
  const [apiConfigurations, setApiConfigurations] = useState<Array<{ id: string; name: string; config_type: string; api_url?: string }>>([]);
  const [workflowStatuses, setWorkflowStatuses] = useState<Array<{ id: string; name: string; color: string; order: number }>>([]);
  const [agents, setAgents] = useState<Array<{ id: string; name: string; category_id: string | null }>>([]);
  const [agentCategories, setAgentCategories] = useState<Array<{ id: string; name: string; icon: string | null }>>([]);
  const [metadataKeys, setMetadataKeys] = useState<FileMetadataKey[]>([]);
  const [agentPromptTemplate, setAgentPromptTemplate] = useState<string>("");
  const [agentPromptTemplateLoading, setAgentPromptTemplateLoading] = useState(false);
  /** Cache of prompt templates per agent id, for form actions */
  const [formActionAgentTemplates, setFormActionAgentTemplates] = useState<Record<string, string>>({});
  const [formActionAgentTemplatesLoading, setFormActionAgentTemplatesLoading] = useState<Record<string, boolean>>({});

  // Default to assign to execution creator (true) if not set
  const assignToExecutionCreator = step.config.assign_to_execution_creator !== false;
  const isStartOrEnd = step.step_type === "start" || step.step_type === "end";
  const requiresExplicitAssignment =
    (step.step_type === "action" && (step.action_type || "manual") === "manual") ||
    (step.step_type === "decision" && ["Human", "Agent", "Agent_Human"].includes(step.decision_node_type || "Human")) ||
    (step.step_type === "edit_form" && step.config.allow_external_assignment !== true);
  const isAgentDecisionNode =
    step.step_type === "decision" &&
    (step.decision_node_type === "Agent" || step.decision_node_type === "Agent_Human");
  const supportsNotificationTab =
    (step.step_type === "action" && (step.action_type || "manual") === "manual") ||
    (step.step_type === "decision" && ["Human", "Agent_Human"].includes(step.decision_node_type || "Human")) ||
    step.step_type === "edit_form";
  const stepNotificationConfig = normalizeStepNotificationConfig(step.config?.notifications);
  const reminderDelayDuration = minutesToDuration(stepNotificationConfig.reminder.delay_minutes);
  const reminderRepeatDuration = minutesToDuration(
    stepNotificationConfig.reminder.repeat_every_minutes || stepNotificationConfig.reminder.delay_minutes
  );
  const reminderScheduleDurations = (stepNotificationConfig.reminder.schedule_minutes || [24 * 60]).map((minutes) =>
    minutesToDuration(minutes)
  );
  const [decisionSourceMode, setDecisionSourceMode] = useState<"none" | "integration" | "agent">(
    step.config.agent_id ? "agent" : step.config.api_configuration_id ? "integration" : "none"
  );
  const hasExplicitAssignment = Boolean(step.config.assigned_to_user_id || step.config.assigned_to_group_id);
  const [selectedConfigId, setSelectedConfigId] = useState<string>(
    step.config.api_configuration_id || "none"
  );
  const [useCustomConfig, setUseCustomConfig] = useState<boolean>(
    !step.config.api_configuration_id || step.config.api_configuration_id === "none"
  );

  const [stepExplanationOpen, setStepExplanationOpen] = useState(false);

  const [headers, setHeaders] = useState<KeyValuePair[]>(
    step.config.api_headers ? (typeof step.config.api_headers === 'string' ? JSON.parse(step.config.api_headers) : step.config.api_headers) : [{ key: "", value: "" }]
  );
  const [params, setParams] = useState<KeyValuePair[]>(
    step.config.api_params ? (typeof step.config.api_params === 'string' ? JSON.parse(step.config.api_params) : step.config.api_params).map((p: KeyValuePair) => ({
      ...p,
      mode: p.value?.startsWith("{{") ? "bind" : "static"
    })) : [{ key: "", value: "", mode: "static" }]
  );
  const [data, setData] = useState<KeyValuePair[]>(
    step.config.api_data ? (typeof step.config.api_data === 'string' ? JSON.parse(step.config.api_data) : step.config.api_data).map((d: KeyValuePair) => ({
      ...d,
      mode: d.value?.startsWith("{{") ? "bind" : "static"
    })) : [{ key: "", value: "", mode: "static" }]
  );

  useEffect(() => {
    setStepExplanationOpen(false);
  }, [step.id]);

  useEffect(() => {
    const fetchUsersAndGroups = async () => {
      if (!companyId) return;

      try {
        const usersList = await api.get<Array<{ id: string; email: string; full_name: string | null }>>(
          `/api/companies/${companyId}/users`
        );
        if (usersList) setUsers(usersList);

        const groupsList = await api.get<Array<{ id: string; name: string; description: string | null }>>(
          `/api/companies/${companyId}/groups`
        );
        if (groupsList) setGroups(groupsList);

        if (step.step_type === "file") {
          const metadataList = await api.get<FileMetadataKey[]>(
            `/api/companies/${companyId}/files-metadata-keys`
          );
          if (metadataList) setMetadataKeys(metadataList);
        }

        if (apiConfigTypeForStep) {
          const apiConfigList = await api.get<Array<{ id: string; name: string; config_type: string }>>(
            `/api/companies/${companyId}/api-configurations?config_type=${encodeURIComponent(apiConfigTypeForStep)}`
          );
          if (apiConfigList) setApiConfigurations(apiConfigList);
        } else {
          setApiConfigurations([]);
        }
      } catch {
        // ignore
      }
    };

    const fetchWorkflowStatuses = async () => {
      if (!workflowId || !companyId) return;
      try {
        const statuses = await api.get<Array<{ id: string; name: string; color: string; order: number }>>(
          `/api/companies/${companyId}/workflows/${workflowId}/statuses`
        );
        if (statuses) setWorkflowStatuses(statuses);
      } catch {
        // ignore
      }
    };

    const fetchAgents = async (agentType?: "action" | "decision") => {
      if (!companyId) return;
      try {
        const permissions = await api.get<Array<{
          enabled?: boolean;
          agent_configuration?: { id: string; name: string; category_id: string | null; agent_type?: string };
        }>>(`/api/companies/${companyId}/agent-permissions`);
        const enabled = (permissions ?? []).filter((p) => p.enabled !== false);
        let availableAgents = enabled
          .map((p) => p.agent_configuration)
          .filter(Boolean)
          .map((a) => ({
            id: a!.id,
            name: a!.name,
            category_id: a!.category_id,
            agent_type: (a!.agent_type as string) || "action",
          }));

        if (agentType) {
          availableAgents = availableAgents.filter((a) => (a.agent_type || "action") === agentType);
        }
        setAgents(availableAgents);
      } catch {
        // ignore
      }
    };

    const fetchAgentCategories = async () => {
      try {
        const categories = await api.get<Array<{ id: string; name: string; icon: string | null }>>(
          `/api/agents/categories`
        );
        if (categories) setAgentCategories(categories);
      } catch {
        // ignore
      }
    };

    fetchUsersAndGroups();
    fetchWorkflowStatuses();
    fetchAgents();
    fetchAgentCategories();
  }, [companyId, workflowId, step.step_type, step.action_type]);

  useEffect(() => {
    if (step.action_type === "agent" && step.config.agent_id) {
      setAgentPromptTemplateLoading(true);
      api
        .get<{ prompt_template?: string | null }>(`/api/agents/configurations/${step.config.agent_id}`)
        .then((config) => {
          setAgentPromptTemplate(config.prompt_template ?? "");
        })
        .catch(() => {
          setAgentPromptTemplate("");
        })
        .finally(() => {
          setAgentPromptTemplateLoading(false);
        });
    } else {
      setAgentPromptTemplate("");
    }
  }, [step.action_type, step.config.agent_id]);

  // Load prompt templates for form action agents (edit_form step)
  const formActionAgentIds = step.step_type === "edit_form"
    ? (step.config.form_actions || []).map((a: any) => a.agent_id).filter(Boolean)
    : [];
  const formActionAgentIdsKey = [...new Set(formActionAgentIds)].sort().join(",");
  useEffect(() => {
    if (step.step_type !== "edit_form") {
      setFormActionAgentTemplates({});
      setFormActionAgentTemplatesLoading({});
      return;
    }
    const agentIds = formActionAgentIdsKey ? formActionAgentIdsKey.split(",") : [];
    if (agentIds.length === 0) {
      setFormActionAgentTemplates({});
      setFormActionAgentTemplatesLoading({});
      return;
    }
    agentIds.forEach((agentId) => {
      setFormActionAgentTemplatesLoading((prev) => ({ ...prev, [agentId]: true }));
      api
        .get<{ prompt_template?: string | null }>(`/api/agents/configurations/${agentId}`)
        .then((config) => {
          setFormActionAgentTemplates((prev) => ({ ...prev, [agentId]: config.prompt_template ?? "" }));
        })
        .catch(() => {
          setFormActionAgentTemplates((prev) => ({ ...prev, [agentId]: "" }));
        })
        .finally(() => {
          setFormActionAgentTemplatesLoading((prev) => ({ ...prev, [agentId]: false }));
        });
    });
  }, [step.step_type, formActionAgentIdsKey]);

  useEffect(() => {
    fetchDataStructureItems();
  }, [dataStructure, workflowId, companyId]);

  useEffect(() => {
    const configId = step.config.api_configuration_id || "none";
    setSelectedConfigId(configId);
    setUseCustomConfig(configId === "none");
  }, [step.id, step.config.api_configuration_id]);

  useEffect(() => {
    setDecisionSourceMode(
      step.config.agent_id ? "agent" : step.config.api_configuration_id ? "integration" : "none"
    );
  }, [step.id]);

  // Initialize output_styles for outputs that don't have styles yet
  useEffect(() => {
    if (outputs.length > 0 && (!step.config.output_styles || Object.keys(step.config.output_styles).length === 0)) {
      const outputStyles: Record<string, "primary" | "secondary"> = {};
      outputs.forEach((output, index) => {
        outputStyles[output] = index === 0 ? "primary" : "secondary";
      });
      onUpdateStep({ ...step, config: { ...step.config, output_styles: outputStyles } });
    }
  }, [step.id]); // Only run when step changes

  const fetchDataStructureItems = async () => {
    // Use the data_structure passed as prop, or fetch it if not provided
    if (dataStructure !== undefined && dataStructure !== null) {
      // data_structure is an array of field objects directly
      if (Array.isArray(dataStructure) && dataStructure.length > 0) {
        const allItems = dataStructure
          .filter((field: any) => field && field.id && field.name) // Filter out invalid entries
          .map((field: any) => ({
            id: field.id,
            name: field.name,
            data_structure_name: "Workflow Data Structure",
            field_type: field.field_type,
            parent_item_id: field.parent_item_id || null,
          }));
        setDataStructureItems(allItems);
        return;
      } else {
        // Empty array or not an array
        setDataStructureItems([]);
        return;
      }
    }

    // Fallback: fetch from database if not provided as prop
    if (!companyId) {
      setDataStructureItems([]);
      return;
    }

    const workflow = await api.get<{ data_structure?: unknown[] }>(
      `/api/companies/${companyId}/workflows/${workflowId}`
    );

    if (!workflow?.data_structure || !Array.isArray(workflow.data_structure)) {
      setDataStructureItems([]);
      return;
    }

    const allItems = (workflow.data_structure as Array<{ id?: string; name?: string; field_type?: string; parent_item_id?: string }>)
      .filter((field: any) => field && field.id && field.name) // Filter out invalid entries
      .map((field: any) => ({
        id: field.id,
        name: field.name,
        data_structure_name: "Workflow Data Structure",
        field_type: field.field_type,
        parent_item_id: field.parent_item_id || null,
      }));

    setDataStructureItems(allItems);
  };


  // Helper: get display name for a field, prefixed with parent array name for child fields
  const getFieldDisplayName = (field: { id: string; name: string; parent_item_id?: string | null }) => {
    if (field.parent_item_id) {
      const parent = dataStructureItems.find(f => f.id === field.parent_item_id);
      if (parent) return `${parent.name}.${field.name}`;
    }
    return field.name;
  };

  const fetchApiConfigurations = async () => {
    if (!companyId) return;
    const configType = step.action_type === "automatic" ? "automatic_action" : "agent_decision";
    const configs = await api.get<Array<{ id: string; name: string; config_type: string; api_url?: string }>>(
      `/api/companies/${companyId}/api-configurations`
    );
    if (configs) setApiConfigurations(configs.filter((c) => c.config_type === configType));
  };

  // Helper function to render agents grouped by category
  const renderGroupedAgents = (filterType?: "action" | "decision") => {
    // Filter agents by type if specified
    const filteredAgents = filterType 
      ? agents.filter((a: any) => (a.agent_type || "action") === filterType)
      : agents;

    // Group agents by category
    const agentsByCategory = new Map<string | null, Array<{ id: string; name: string; category_id: string | null }>>();
    
    filteredAgents.forEach(agent => {
      const categoryId = agent.category_id || null;
      if (!agentsByCategory.has(categoryId)) {
        agentsByCategory.set(categoryId, []);
      }
      agentsByCategory.get(categoryId)!.push(agent);
    });

    // Get uncategorized agents
    const uncategorizedAgents = agentsByCategory.get(null) || [];
    agentsByCategory.delete(null);

    // Sort categories by name
    const sortedCategories = Array.from(agentCategories)
      .filter(cat => agentsByCategory.has(cat.id))
      .sort((a, b) => a.name.localeCompare(b.name));

    return (
      <>
        <SelectItem value="none">Select an agent...</SelectItem>
        {sortedCategories.map(category => {
          const categoryAgents = agentsByCategory.get(category.id) || [];
          const IconComponent = getIconComponent(category.icon, Folder);
          
          return (
            <SelectGroup key={category.id}>
              <SelectLabel className="flex items-center gap-2">
                {IconComponent && <IconComponent className="h-4 w-4" />}
                {category.name}
              </SelectLabel>
              {categoryAgents.map(agent => (
                <SelectItem key={agent.id} value={agent.id} className="pl-8">
                  {agent.name}
                </SelectItem>
              ))}
            </SelectGroup>
          );
        })}
        {uncategorizedAgents.length > 0 && (
          <>
            {sortedCategories.length > 0 && <SelectSeparator />}
            {uncategorizedAgents.map(agent => (
              <SelectItem key={agent.id} value={agent.id}>
                {agent.name}
              </SelectItem>
            ))}
          </>
        )}
      </>
    );
  };

  const handleConfigSelect = async (configId: string) => {
    if (configId === "none") {
      setSelectedConfigId("none");
      setUseCustomConfig(true);
      onUpdateStep({
        ...step,
        config: {
          ...step.config,
          agent_id: null,
          api_configuration_id: null,
        },
      });
      return;
    }

    setSelectedConfigId(configId);
    setUseCustomConfig(false);

    const configs = await api.get<Array<{ id: string; api_headers?: unknown }>>(
      `/api/companies/${companyId}/api-configurations`
    );
    const config = configs?.find((c) => c.id === configId);

    if (config) {
      const configHeaders = Array.isArray(config.api_headers)
        ? config.api_headers
        : typeof config.api_headers === "string"
          ? (() => {
              try {
                return JSON.parse(config.api_headers as string) as KeyValuePair[];
              } catch {
                return [];
              }
            })()
          : [];

      setHeaders(configHeaders.length > 0 ? configHeaders : [{ key: "", value: "" }]);
      // Keep existing data, or initialize empty if not set
      // Data is configured per step, not from the configuration
      // When using a saved config, data must be static only
      const currentData = step.config.api_data
        ? (typeof step.config.api_data === 'string' ? JSON.parse(step.config.api_data) : step.config.api_data)
        : [{ key: "", value: "", mode: "static" }];

      // Force all data items to static mode when using a saved configuration
      setData(currentData.map((d: KeyValuePair) => ({
        ...d,
        mode: "static" as const,
        value: d.value?.startsWith("{{") ? "" : d.value || ""
      })));

      onUpdateStep({
        ...step,
        config: {
          ...step.config,
          agent_id: null,
          api_configuration_id: configId,
          api_url: config.api_url,
          api_method: config.api_method,
          api_headers: JSON.stringify(configHeaders),
          // Data is configured per step and must be static when using saved config
          api_params: JSON.stringify([]),
          api_data: JSON.stringify(currentData.filter((d: KeyValuePair) => d.key.trim() || d.value.trim()).map((d: KeyValuePair) => ({
            key: d.key,
            value: d.value?.startsWith("{{") ? "" : d.value || "",
            mode: "static"
          }))),
        },
      });
    }
  };

  const handleNameChange = (name: string) => {
    onUpdateStep({ ...step, name });
  };

  const handleConfigChange = (key: string, value: string | boolean) => {
    onUpdateStep({
      ...step,
      config: { ...step.config, [key]: value },
    });
  };

  const handleAddOutput = () => {
    const newOutputs = [...outputs, `Output ${outputs.length + 1}`];
    setOutputs(newOutputs);
    // Initialize output styles: first is primary, rest are secondary by default
    const outputStyles = step.config.output_styles || {};
    newOutputs.forEach((output, idx) => {
      if (!outputStyles[output]) {
        outputStyles[output] = idx === 0 ? "primary" : "secondary";
      }
    });
    onUpdateStep({ ...step, config: { ...step.config, outputs: newOutputs, output_styles: outputStyles } });
  };

  const handleUpdateOutput = (index: number, value: string) => {
    const oldOutputName = outputs[index];

    // Don't proceed if name hasn't changed
    if (oldOutputName === value) return;

    const newOutputs = [...outputs];
    newOutputs[index] = value;

    // Preserve or initialize style when renaming output
    const outputStyles = step.config.output_styles || {};
    if (oldOutputName && outputStyles[oldOutputName]) {
      outputStyles[value] = outputStyles[oldOutputName];
      delete outputStyles[oldOutputName];
    } else if (!outputStyles[value]) {
      // First output is primary, rest are secondary by default
      outputStyles[value] = index === 0 ? "primary" : "secondary";
    }

    setOutputs(newOutputs);
    onUpdateStep({ ...step, config: { ...step.config, outputs: newOutputs, output_styles: outputStyles } });

    // Update connections that reference this output locally
    if (oldOutputName) {
      // Notify parent to update local state immediately
      onOutputRenamed?.(step.id, oldOutputName, value);
    }
  };

  const handleDeleteOutput = (index: number) => {
    if (outputs.length <= 2) return; // Minimum 2 outputs for decision
    const deletedOutput = outputs[index];
    const newOutputs = outputs.filter((_, i) => i !== index);
    // Clean up style for deleted output
    const outputStyles = { ...(step.config.output_styles || {}) };
    delete outputStyles[deletedOutput];
    // Re-initialize styles for remaining outputs if needed
    newOutputs.forEach((output, idx) => {
      if (!outputStyles[output]) {
        outputStyles[output] = idx === 0 ? "primary" : "secondary";
      }
    });
    setOutputs(newOutputs);
    onUpdateStep({ ...step, config: { ...step.config, outputs: newOutputs, output_styles: outputStyles } });
  };

  const handleUpdateOutputStyle = (outputName: string, style: "primary" | "secondary") => {
    const outputStyles = { ...(step.config.output_styles || {}) };
    outputStyles[outputName] = style;
    onUpdateStep({ ...step, config: { ...step.config, output_styles: outputStyles } });
  };

  const handleUpdateKeyValue = (
    type: "headers" | "params" | "data",
    index: number,
    field: "key" | "value" | "mode",
    value: string
  ) => {
    const setter = type === "headers" ? setHeaders : type === "params" ? setParams : setData;
    const current = type === "headers" ? headers : type === "params" ? params : data;
    const updated = [...current];

    if (field === "mode") {
      updated[index].mode = value as "static" | "bind";
      // Clear value when switching modes
      if (value === "static" && updated[index].value?.startsWith("{{")) {
        updated[index].value = "";
      } else if (value === "bind" && !updated[index].value?.startsWith("{{")) {
        updated[index].value = "";
      }
    } else {
      updated[index][field] = value;
    }

    setter(updated);
    const configKey = type === "headers" ? "api_headers" : type === "params" ? "api_params" : "api_data";
    onUpdateStep({ ...step, config: { ...step.config, [configKey]: JSON.stringify(updated) } });
  };

  const handleAddKeyValue = (type: "headers" | "params" | "data") => {
    const setter = type === "headers" ? setHeaders : type === "params" ? setParams : setData;
    const current = type === "headers" ? headers : type === "params" ? params : data;
    // When using a saved config, data must always be static
    const newItem = type === "headers"
      ? { key: "", value: "" }
      : { key: "", value: "", mode: "static" as const };
    setter([...current, newItem]);

    // Update step config immediately for data to ensure it's saved
    if (type === "data") {
      const configKey = "api_data";
      const updatedData = [...current, newItem];
      onUpdateStep({
        ...step,
        config: {
          ...step.config,
          [configKey]: JSON.stringify(updatedData.map(d => ({
            key: d.key,
            value: d.value,
            mode: "static"
          })))
        }
      });
    }
  };

  const handleDeleteKeyValue = (type: "headers" | "params" | "data", index: number) => {
    const setter = type === "headers" ? setHeaders : type === "params" ? setParams : setData;
    const current = type === "headers" ? headers : type === "params" ? params : data;
    const updated = current.filter((_, i) => i !== index);
    setter(updated);
    const configKey = type === "headers" ? "api_headers" : type === "params" ? "api_params" : "api_data";
    // For data, ensure all items are static when using a saved config
    const valueToSave = type === "data"
      ? JSON.stringify(updated.map((d: KeyValuePair) => ({
        key: d.key,
        value: d.value,
        mode: "static"
      })))
      : JSON.stringify(updated);
    onUpdateStep({ ...step, config: { ...step.config, [configKey]: valueToSave } });
  };

  const updateStepNotifications = (updater: (current: StepNotificationConfig) => StepNotificationConfig) => {
    const current = normalizeStepNotificationConfig(step.config?.notifications);
    const next = updater(current);
    onUpdateStep({
      ...step,
      config: {
        ...step.config,
        notifications: next,
      },
    });
  };

  const handleExplanationChange = (value: string) => {
    const normalizedExplanation = normalizeStepExplanation(value);
    const nextConfig = { ...step.config };
    if (normalizedExplanation) {
      nextConfig.explanation = normalizedExplanation;
    } else {
      delete nextConfig.explanation;
    }

    onUpdateStep({
      ...step,
      config: nextConfig,
    });
  };

  const hasStepExplanation = Boolean(normalizeStepExplanation(step.config.explanation));

  return (
    <div className="flex flex-col h-full p-6">
      <div className="space-y-6">
        <div className="flex items-center">
          <h2 className="text-lg font-semibold">Node Properties</h2>
        </div>

        <div className="space-y-2">
          <Label htmlFor="node-name">Node Name</Label>
          <Input
            id="node-name"
            type="text"
            value={step.name}
            onChange={(e) => handleNameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === " ") {
                e.stopPropagation();
              }
            }}
            placeholder="Enter node name"
          />
        </div>

        {!isStartOrEnd && (
          <Collapsible open={stepExplanationOpen} onOpenChange={setStepExplanationOpen}>
            <div
              className={`overflow-hidden rounded-md border bg-muted/20 ${
                hasStepExplanation && !stepExplanationOpen ? "border-primary/40" : "border-border"
              }`}
            >
              <CollapsibleTrigger className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors">
                <ChevronRight
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
                    stepExplanationOpen ? "rotate-90" : ""
                  }`}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {t("workflowEditor.stepExplanationLabel")}
                </span>
                {hasStepExplanation && (
                  <span
                    className="inline-flex shrink-0 items-center justify-center rounded-md border border-primary/35 bg-primary/10 p-1 text-primary"
                    title={t("workflowEditor.stepExplanationFilledHint")}
                  >
                    <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                    <span className="sr-only">{t("workflowEditor.stepExplanationFilledHint")}</span>
                  </span>
                )}
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="space-y-2 px-3 pb-3 pt-0">
                  <div className="bg-background rounded-md">
                    <ReactQuill
                      theme="snow"
                      value={step.config.explanation || ""}
                      onChange={handleExplanationChange}
                      modules={EXPLANATION_EDITOR_MODULES}
                      formats={EXPLANATION_EDITOR_FORMATS}
                      placeholder={t("workflowEditor.stepExplanationPlaceholder")}
                      className="min-h-[130px]"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">{t("workflowEditor.stepExplanationDescription")}</p>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>
        )}

        <Tabs defaultValue="configuration" className="w-full">
          {!isStartOrEnd && (
            <TabsList className={`grid w-full ${supportsNotificationTab ? "grid-cols-4" : "grid-cols-3"}`}>
              <TabsTrigger value="assign">Assign</TabsTrigger>
              <TabsTrigger value="configuration">Configuration</TabsTrigger>
              {supportsNotificationTab && <TabsTrigger value="notification">Notification</TabsTrigger>}
              <TabsTrigger value="output" className="flex items-center gap-2">
                Output
                <Badge variant="secondary" className="h-5 px-1.5 min-w-[1.25rem]">
                  {outputs.length}
                </Badge>
              </TabsTrigger>
            </TabsList>
          )}

          {!isStartOrEnd && (
          <TabsContent value="assign" className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="assign-to-creator">Assign to execution creator</Label>
                <p className="text-xs text-muted-foreground">
                  When enabled, the step will be assigned to the user who creates the execution
                </p>
              </div>
              <Switch
                id="assign-to-creator"
                checked={assignToExecutionCreator}
                onCheckedChange={(checked) => {
                  onUpdateStep({
                    ...step,
                    config: {
                      ...step.config,
                      assign_to_execution_creator: checked,
                      // Clear user/group assignments when enabling assign to creator
                      assigned_to_user_id: checked ? "" : step.config.assigned_to_user_id,
                      assigned_to_group_id: checked ? "" : step.config.assigned_to_group_id,
                    },
                  });
                }}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="allow-reassign">Allow reassignment</Label>
                <p className="text-xs text-muted-foreground">
                  Allow the assignee to reassign this step to another user or group
                </p>
              </div>
              <Switch
                id="allow-reassign"
                checked={step.config.allow_reassign || false}
                onCheckedChange={(checked) => {
                  onUpdateStep({
                    ...step,
                    config: {
                      ...step.config,
                      allow_reassign: checked,
                    },
                  });
                }}
              />
            </div>

            {step.step_type === "edit_form" && (
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="allow-external">Assign to external people</Label>
                  <p className="text-xs text-muted-foreground">
                    Generate a public link to allow external users to complete this form
                  </p>
                </div>
                <Switch
                  id="allow-external"
                  checked={step.config.allow_external_assignment || false}
                  onCheckedChange={(checked) => {
                    onUpdateStep({
                      ...step,
                      config: {
                        ...step.config,
                        allow_external_assignment: checked,
                      },
                    });
                  }}
                />
              </div>
            )}

            {!assignToExecutionCreator && (
              <>
                <PermissionTargetPicker
                  users={users}
                  groups={groups}
                  selectedUsers={step.config.assigned_to_user_id ? [step.config.assigned_to_user_id] : []}
                  selectedGroups={step.config.assigned_to_group_id ? [step.config.assigned_to_group_id] : []}
                  onSelectedUsersChange={(ids) => {
                    const selectedId = ids[ids.length - 1] || "";
                    onUpdateStep({
                      ...step,
                      config: {
                        ...step.config,
                        assigned_to_user_id: selectedId,
                        assigned_to_group_id: selectedId ? "" : step.config.assigned_to_group_id,
                      },
                    });
                  }}
                  onSelectedGroupsChange={(ids) => {
                    const selectedId = ids[ids.length - 1] || "";
                    onUpdateStep({
                      ...step,
                      config: {
                        ...step.config,
                        assigned_to_group_id: selectedId,
                        assigned_to_user_id: selectedId ? "" : step.config.assigned_to_user_id,
                      },
                    });
                  }}
                  allowNoneOption
                  noneLabel="No assignment"
                  labels={{
                    users: "Assigned user",
                    groups: "Assigned group",
                    usersPlaceholder: "Select user",
                    groupsPlaceholder: "Select group",
                  }}
                />

                {requiresExplicitAssignment && !hasExplicitAssignment && (
                  <Alert>
                    <AlertDescription>
                      This step type requires an explicit user or group assignment.
                    </AlertDescription>
                  </Alert>
                )}
              </>
            )}
          </TabsContent>
          )}

          {supportsNotificationTab && (
          <TabsContent value="notification" className="space-y-4 mt-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="notification-assignment-enabled">
                    {t("workflowEditorStepNotifications.assignmentEnabled")}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t("workflowEditorStepNotifications.assignmentEnabledHint")}
                  </p>
                </div>
                <Switch
                  id="notification-assignment-enabled"
                  checked={stepNotificationConfig.assignment.enabled}
                  onCheckedChange={(checked) => {
                    updateStepNotifications((current) => ({
                      ...current,
                      assignment: {
                        ...current.assignment,
                        enabled: checked,
                      },
                    }));
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="step-reminder-mode">{t("workflowEditorStepNotifications.reminderMode")}</Label>
                <Select
                  value={stepNotificationConfig.reminder.mode}
                  onValueChange={(value) => {
                    const nextMode = value as ReminderMode;
                    if (nextMode !== "none" && nextMode !== "repeat" && nextMode !== "schedule") return;
                    updateStepNotifications((current) => ({
                      ...current,
                      reminder: {
                        ...current.reminder,
                        mode: nextMode,
                      },
                    }));
                  }}
                >
                  <SelectTrigger id="step-reminder-mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("workflowEditorStepNotifications.reminderModeNone")}</SelectItem>
                    <SelectItem value="repeat">{t("workflowEditorStepNotifications.reminderModeRepeat")}</SelectItem>
                    <SelectItem value="schedule">{t("workflowEditorStepNotifications.reminderModeSchedule")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {stepNotificationConfig.reminder.mode === "repeat" && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>{t("workflowEditorStepNotifications.firstReminderAfter")}</Label>
                    <div className="grid grid-cols-[1fr_140px] gap-2">
                      <Input
                        type="number"
                        min={1}
                        value={reminderDelayDuration.value}
                        onChange={(event) => {
                          updateStepNotifications((current) => {
                            const unit = minutesToDuration(current.reminder.delay_minutes).unit;
                            return {
                              ...current,
                              reminder: {
                                ...current.reminder,
                                delay_minutes: durationToMinutes(event.target.value, unit),
                              },
                            };
                          });
                        }}
                      />
                      <Select
                        value={reminderDelayDuration.unit}
                        onValueChange={(value) => {
                          if (value !== "hours" && value !== "days") return;
                          updateStepNotifications((current) => {
                            const currentValue = minutesToDuration(current.reminder.delay_minutes).value;
                            return {
                              ...current,
                              reminder: {
                                ...current.reminder,
                                delay_minutes: durationToMinutes(currentValue, value),
                              },
                            };
                          });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="hours">{t("workflowEditorStepNotifications.hours")}</SelectItem>
                          <SelectItem value="days">{t("workflowEditorStepNotifications.days")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>{t("workflowEditorStepNotifications.repeatEvery")}</Label>
                    <div className="grid grid-cols-[1fr_140px] gap-2">
                      <Input
                        type="number"
                        min={1}
                        value={reminderRepeatDuration.value}
                        onChange={(event) => {
                          updateStepNotifications((current) => {
                            const unit = minutesToDuration(
                              current.reminder.repeat_every_minutes || current.reminder.delay_minutes
                            ).unit;
                            return {
                              ...current,
                              reminder: {
                                ...current.reminder,
                                repeat_every_minutes: durationToMinutes(event.target.value, unit),
                              },
                            };
                          });
                        }}
                      />
                      <Select
                        value={reminderRepeatDuration.unit}
                        onValueChange={(value) => {
                          if (value !== "hours" && value !== "days") return;
                          updateStepNotifications((current) => {
                            const currentValue = minutesToDuration(
                              current.reminder.repeat_every_minutes || current.reminder.delay_minutes
                            ).value;
                            return {
                              ...current,
                              reminder: {
                                ...current.reminder,
                                repeat_every_minutes: durationToMinutes(currentValue, value),
                              },
                            };
                          });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="hours">{t("workflowEditorStepNotifications.hours")}</SelectItem>
                          <SelectItem value="days">{t("workflowEditorStepNotifications.days")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>{t("workflowEditorStepNotifications.maxReminders")}</Label>
                    <Input
                      type="number"
                      min={1}
                      value={stepNotificationConfig.reminder.max_count ?? ""}
                      placeholder={t("workflowEditorStepNotifications.maxRemindersPlaceholder")}
                      onChange={(event) => {
                        const rawValue = event.target.value.trim();
                        updateStepNotifications((current) => ({
                          ...current,
                          reminder: {
                            ...current.reminder,
                            max_count: rawValue ? clampPositiveInteger(rawValue, 1) : undefined,
                          },
                        }));
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("workflowEditorStepNotifications.maxRemindersHint")}
                    </p>
                  </div>
                </div>
              )}

              {stepNotificationConfig.reminder.mode === "schedule" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>{t("workflowEditorStepNotifications.multipleReminders")}</Label>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        updateStepNotifications((current) => {
                          const existingSchedule = current.reminder.schedule_minutes || [24 * 60];
                          const highestDelay = existingSchedule.length > 0 ? Math.max(...existingSchedule) : 24 * 60;
                          const nextDelay = highestDelay + 24 * 60;
                          return {
                            ...current,
                            reminder: {
                              ...current.reminder,
                              // Keep delays unique so normalization does not collapse the new row.
                              schedule_minutes: [...existingSchedule, nextDelay],
                            },
                          };
                        });
                      }}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      {t("workflowEditorStepNotifications.addReminder")}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("workflowEditorStepNotifications.multipleRemindersHint")}
                  </p>

                  {(stepNotificationConfig.reminder.schedule_minutes || [24 * 60]).map((minutes, index) => (
                    <div key={`${minutes}-${index}`} className="grid grid-cols-[1fr_140px_auto] gap-2">
                      <Input
                        type="number"
                        min={1}
                        value={reminderScheduleDurations[index]?.value || 1}
                        onChange={(event) => {
                          updateStepNotifications((current) => {
                            const currentList = [...(current.reminder.schedule_minutes || [24 * 60])];
                            const unit = minutesToDuration(currentList[index] || 24 * 60).unit;
                            currentList[index] = durationToMinutes(event.target.value, unit);
                            return {
                              ...current,
                              reminder: {
                                ...current.reminder,
                                schedule_minutes: currentList,
                              },
                            };
                          });
                        }}
                      />
                      <Select
                        value={reminderScheduleDurations[index]?.unit || "days"}
                        onValueChange={(value) => {
                          if (value !== "hours" && value !== "days") return;
                          updateStepNotifications((current) => {
                            const currentList = [...(current.reminder.schedule_minutes || [24 * 60])];
                            const currentValue = minutesToDuration(currentList[index] || 24 * 60).value;
                            currentList[index] = durationToMinutes(currentValue, value);
                            return {
                              ...current,
                              reminder: {
                                ...current.reminder,
                                schedule_minutes: currentList,
                              },
                            };
                          });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="hours">{t("workflowEditorStepNotifications.hours")}</SelectItem>
                          <SelectItem value="days">{t("workflowEditorStepNotifications.days")}</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={(stepNotificationConfig.reminder.schedule_minutes || [24 * 60]).length <= 1}
                        onClick={() => {
                          updateStepNotifications((current) => {
                            const currentList = [...(current.reminder.schedule_minutes || [24 * 60])];
                            const nextList = currentList.filter((_, i) => i !== index);
                            return {
                              ...current,
                              reminder: {
                                ...current.reminder,
                                schedule_minutes: nextList.length > 0 ? nextList : [24 * 60],
                              },
                            };
                          });
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
          )}

          {!isStartOrEnd && (
          <TabsContent value="output" className="space-y-4 mt-4">
            {(step.step_type === "action" || step.step_type === "file") ? (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Button Name</Label>
                  <Input
                    value={outputs[0] || "Done"}
                    onChange={(e) => handleUpdateOutput(0, e.target.value)}
                    placeholder="Done"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {step.step_type === "file"
                    ? "File steps have a single output. This text will be displayed on the button that triggers the file processing."
                    : "Action steps have a single output. This text will be displayed on the button that the user will click to complete the action."}
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-2">
                  <Label>Outputs</Label>
                  {step.step_type === "decision" && (
                    <Button size="sm" variant="outline" onClick={handleAddOutput}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add
                    </Button>
                  )}
                </div>
                <div className="space-y-3">
                  {outputs.map((output, index) => {
                    const outputStyles = step.config.output_styles || {};
                    const currentStyle = outputStyles[output] || (index === 0 ? "primary" : "secondary");
                    return (
                      <div key={index} className="space-y-2 p-3 border border-border rounded-md">
                        <div className="flex gap-2">
                          <div className="space-y-1 flex-1">
                            <Label className="text-xs text-muted-foreground">
                              Output {index + 1}
                            </Label>
                            <Input
                              value={output}
                              onChange={(e) => handleUpdateOutput(index, e.target.value)}
                              placeholder={`Output ${index + 1}`}
                            />
                          </div>
                          {step.step_type === "decision" && outputs.length > 2 && (
                            <div className="flex items-end pb-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleDeleteOutput(index)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Label className="text-xs text-muted-foreground">Button Style:</Label>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant={currentStyle === "primary" ? "default" : "outline"}
                              onClick={() => handleUpdateOutputStyle(output, "primary")}
                              className="h-7 text-xs"
                            >
                              Primary
                            </Button>
                            <Button
                              size="sm"
                              variant={currentStyle === "secondary" ? "default" : "outline"}
                              onClick={() => handleUpdateOutputStyle(output, "secondary")}
                              className="h-7 text-xs"
                            >
                              Secondary
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  {step.step_type === "decision"
                    ? "Define outputs for this decision node (min 2). Set each output's button style to control how it appears to users."
                    : step.step_type === "edit_form"
                      ? "Define the form output names (e.g., Submit/Cancel). First output is primary by default, second is secondary."
                      : "Define the file output names (e.g., Success/Error). First output is primary by default, second is secondary."}
                </p>
              </>
            )}
          </TabsContent>
          )}

          <TabsContent value="configuration" className="space-y-4 mt-4">
            {step.step_type === "edit_form" ? (
              <Tabs defaultValue={initialConfigurationSubTab ?? "status"} className="w-full">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="status">Status</TabsTrigger>
                  <TabsTrigger value="form">Form</TabsTrigger>
                  <TabsTrigger value="rules">Rules</TabsTrigger>
                  <TabsTrigger value="action">Action</TabsTrigger>
                </TabsList>
                <TabsContent value="status" className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="step-status-form">Status</Label>
                    <Select
                      value={step.config.status_id || "none"}
                      onValueChange={(value) => {
                        onUpdateStep({
                          ...step,
                          config: {
                            ...step.config,
                            status_id: value === "none" ? null : value,
                          },
                        });
                      }}
                    >
                      <SelectTrigger id="step-status-form">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No status</SelectItem>
                        {workflowStatuses.map((status) => (
                          <SelectItem key={status.id} value={status.id}>
                            <div className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: getTagColors(status.color).dot }}
                              />
                              <span>{status.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Assign a status to this step that will be linked when the step is executed
                    </p>
                  </div>
                </TabsContent>
                <TabsContent value="form" className="space-y-4 mt-4">
                  {dataStructureItems.length === 0 ? (
                    <div className="p-4 border border-dashed rounded-md text-center">
                      <p className="text-sm text-muted-foreground">
                        No data structures linked to this workflow. Please link a data structure first.
                      </p>
                    </div>
                  ) : (
                    <FormBlocksEditor
                      step={step}
                      dataStructureItems={dataStructureItems}
                      onUpdate={onUpdateStep}
                      fullDataStructure={dataStructure || undefined}
                      onGoToDataStructure={onOpenDataStructureEditor}
                    />
                  )}
                </TabsContent>
                <TabsContent value="rules" className="space-y-4 mt-4">
                  {dataStructureItems.length === 0 ? (
                    <div className="p-4 border border-dashed rounded-md text-center">
                      <p className="text-sm text-muted-foreground">
                        No data structures linked to this workflow. Please link a data structure first.
                      </p>
                    </div>
                  ) : (
                    <>
                      <FieldRulesEditor
                        step={step}
                        dataStructureItems={dataStructureItems}
                        fullDataStructure={dataStructure || undefined}
                        onUpdate={onUpdateStep}
                      />
                      <FieldValidationsEditor
                        step={step}
                        dataStructureItems={dataStructureItems}
                        fullDataStructure={dataStructure || undefined}
                        onUpdate={onUpdateStep}
                      />
                    </>
                  )}

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>AI Form Validation</Label>
                        <p className="text-xs text-muted-foreground">
                          Validate submitted data with an AI rule before allowing submission.
                        </p>
                      </div>
                      <Switch
                        id="ai-form-validation"
                        checked={!!step.config.ai_form_validation_enabled}
                        onCheckedChange={(checked) => {
                          onUpdateStep({
                            ...step,
                            config: {
                              ...step.config,
                              ai_form_validation_enabled: checked,
                            },
                          });
                        }}
                      />
                    </div>

                    {!!step.config.ai_form_validation_enabled && (
                      <div className="space-y-2">
                        <Label htmlFor="ai-form-validation-rule">Validation rule (prompt)</Label>
                        <p className="text-xs text-muted-foreground">
                          This prompt is sent to the validator as the user edits the form and again on submission.
                        </p>
                        <Textarea
                          id="ai-form-validation-rule"
                          value={step.config.ai_form_validation_rule || ""}
                          onChange={(e) => {
                            onUpdateStep({
                              ...step,
                              config: {
                                ...step.config,
                                ai_form_validation_rule: e.target.value,
                              },
                            });
                          }}
                          placeholder="Describe what makes the submission valid, and what to reject."
                          className="min-h-[120px]"
                        />
                      </div>
                    )}
                  </div>
                </TabsContent>
                <TabsContent value="action" className="space-y-4 mt-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Form Actions</Label>
                        <p className="text-xs text-muted-foreground">
                          Configure agent actions that can be called from the form
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const currentActions = step.config.form_actions || [];
                          const newAction = {
                            id: crypto.randomUUID(),
                            agent_id: null,
                            api_data: [],
                            data_to_update: []
                          };
                          onUpdateStep({
                            ...step,
                            config: {
                              ...step.config,
                              form_actions: [...currentActions, newAction]
                            }
                          });
                        }}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Action
                      </Button>
                    </div>

                    {(step.config.form_actions || []).length === 0 ? (
                      <div className="p-4 border border-dashed rounded-md text-center">
                        <p className="text-sm text-muted-foreground">
                          No actions configured. Click "Add Action" to add an agent action.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {(step.config.form_actions || []).map((action: any, actionIndex: number) => (
                          <div key={action.id || actionIndex} className="border rounded-lg p-4 space-y-4">
                            <div className="flex items-center justify-between">
                              <Label>Action {actionIndex + 1}</Label>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const currentActions = step.config.form_actions || [];
                                  const updatedActions = currentActions.filter((a: any, idx: number) => idx !== actionIndex);
                                  onUpdateStep({
                                    ...step,
                                    config: {
                                      ...step.config,
                                      form_actions: updatedActions
                                    }
                                  });
                                }}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>

                            <div className="space-y-2">
                              <Label>Select Agent</Label>
                              <Select
                                value={action.agent_id || "none"}
                                onValueChange={(value) => {
                                  const currentActions = step.config.form_actions || [];
                                  const updatedActions = currentActions.map((a: any, idx: number) =>
                                    idx === actionIndex ? { ...a, agent_id: value === "none" ? null : value } : a
                                  );
                                  onUpdateStep({
                                    ...step,
                                    config: {
                                      ...step.config,
                                      form_actions: updatedActions
                                    }
                                  });
                                }}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select an agent" />
                                </SelectTrigger>
                                <SelectContent>
                                  {renderGroupedAgents("action")}
                                </SelectContent>
                              </Select>
                            </div>

                            {action.agent_id && (
                              <>
                                <div className="space-y-2">
                                  <Label>Data to Send</Label>
                                  <p className="text-xs text-muted-foreground mb-2">
                                    Click fields to select or deselect data to send to the agent.
                                  </p>
                                  <div className="border rounded-md p-3 flex flex-wrap gap-2 max-h-60 overflow-y-auto">
                                    {dataStructureItems.length === 0 && (
                                      <p className="text-sm text-muted-foreground">No data structure fields defined.</p>
                                    )}
                                    {dataStructureItems.map((field) => {
                                      const currentApiData = action.api_data || [];
                                      const isSelected = currentApiData.some((d: any) => d.value === `{{${field.id}}}`);

                                      return (
                                        <Badge
                                          key={field.id}
                                          variant={isSelected ? "default" : "outline"}
                                          className={`cursor-pointer shrink-0 ${!isSelected ? "text-muted-foreground hover:text-foreground" : ""}`}
                                          onClick={() => {
                                            const currentActions = step.config.form_actions || [];
                                            const currentAction = currentActions[actionIndex] || {};
                                            let newApiData = [...(currentAction.api_data || [])];

                                            if (isSelected) {
                                              newApiData = newApiData.filter((d: any) => d.value !== `{{${field.id}}}`);
                                            } else {
                                              newApiData.push({
                                                key: getFieldDisplayName(field),
                                                value: `{{${field.id}}}`,
                                                mode: "bind"
                                              });
                                            }

                                            const updatedActions = currentActions.map((a: any, idx: number) =>
                                              idx === actionIndex ? { ...a, api_data: newApiData } : a
                                            );
                                            onUpdateStep({
                                              ...step,
                                              config: {
                                                ...step.config,
                                                form_actions: updatedActions
                                              }
                                            });
                                          }}
                                        >
                                          {getFieldDisplayName(field)}
                                        </Badge>
                                      );
                                    })}
                                  </div>
                                </div>

                                {/* Interactive prompt (same editor as action step) */}
                                {formActionAgentTemplatesLoading[action.agent_id] ? (
                                  <p className="text-sm text-muted-foreground">Loading prompt template…</p>
                                ) : (formActionAgentTemplates[action.agent_id] || "").trim() ? (
                                  <div className="space-y-2">
                                    <Label>Interactive prompt</Label>
                                    <p className="text-xs text-muted-foreground mb-2">
                                      Fill the placeholders below. The resolved prompt will be sent to the agent API when this action runs.
                                    </p>
                                    <InteractivePromptEditor
                                      key={`form-action-${actionIndex}-${action.agent_id}`}
                                      template={formActionAgentTemplates[action.agent_id]}
                                      promptValues={(action.prompt_values as PromptValues) ?? {}}
                                      onChange={(nextValues) => {
                                        const currentActions = step.config.form_actions || [];
                                        const updatedActions = currentActions.map((a: any, idx: number) =>
                                          idx === actionIndex ? { ...a, prompt_values: nextValues } : a
                                        );
                                        onUpdateStep({
                                          ...step,
                                          config: {
                                            ...step.config,
                                            form_actions: updatedActions,
                                          },
                                        });
                                      }}
                                      className="rounded-md border bg-muted/30 p-3"
                                    />
                                  </div>
                                ) : null}

                                <div className="space-y-2">
                                  <Label>Data to Update</Label>
                                  <p className="text-xs text-muted-foreground mb-2">
                                    Click fields to select or deselect data to update from agent response.
                                  </p>
                                  <div className="border rounded-md p-3 flex flex-wrap gap-2 max-h-60 overflow-y-auto">
                                    {dataStructureItems.length === 0 && (
                                      <p className="text-sm text-muted-foreground">No data structure fields defined.</p>
                                    )}
                                    {dataStructureItems.map((field) => {
                                      const currentUpdateData = action.data_to_update || [];
                                      const isSelected = currentUpdateData.some((d: any) => d.value === field.id);

                                      return (
                                        <Badge
                                          key={`update-${actionIndex}-${field.id}`}
                                          variant={isSelected ? "default" : "outline"}
                                          className={`cursor-pointer shrink-0 ${!isSelected ? "text-muted-foreground hover:text-foreground" : ""}`}
                                          onClick={() => {
                                            const currentActions = step.config.form_actions || [];
                                            const currentAction = currentActions[actionIndex] || {};
                                            let newUpdateData = [...(currentAction.data_to_update || [])];

                                            if (isSelected) {
                                              newUpdateData = newUpdateData.filter((d: any) => d.value !== field.id);
                                            } else {
                                              newUpdateData.push({
                                                key: getFieldDisplayName(field),
                                                value: field.id
                                              });
                                            }

                                            const updatedActions = currentActions.map((a: any, idx: number) =>
                                              idx === actionIndex ? { ...a, data_to_update: newUpdateData } : a
                                            );
                                            onUpdateStep({
                                              ...step,
                                              config: {
                                                ...step.config,
                                                form_actions: updatedActions
                                              }
                                            });
                                          }}
                                        >
                                          {getFieldDisplayName(field)}
                                        </Badge>
                                      );
                                    })}
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="step-status">Status</Label>
                  <Select
                    value={step.config.status_id || "none"}
                    onValueChange={(value) => {
                      onUpdateStep({
                        ...step,
                        config: {
                          ...step.config,
                          status_id: value === "none" ? null : value,
                        },
                      });
                    }}
                  >
                    <SelectTrigger id="step-status">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No status</SelectItem>
                      {workflowStatuses.map((status) => (
                        <SelectItem key={status.id} value={status.id}>
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: getTagColors(status.color).dot }}
                            />
                            <span>{status.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Assign a status to this step that will be linked when the step is executed
                  </p>
                </div>

                {step.step_type === "action" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Action Type</Label>
                  <Select
                    value={step.action_type || "manual"}
                    onValueChange={(value) => onUpdateStep({ ...step, action_type: value as "manual" | "automatic" | "agent" })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual</SelectItem>
                      <SelectItem value="automatic">Automatic</SelectItem>
                      <SelectItem value="agent">Agent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {step.action_type === "agent" && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Select Agent</Label>
                      <Select
                        value={step.config.agent_id || "none"}
                        onValueChange={(value) => {
                          onUpdateStep({
                            ...step,
                            config: {
                              ...step.config,
                              agent_id: value === "none" ? null : value,
                            },
                          });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select an agent" />
                        </SelectTrigger>
                        <SelectContent>
                          {renderGroupedAgents("action")}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Data to Send */}
                    <div className="space-y-2">
                      <Label>Data to Send</Label>
                      <p className="text-xs text-muted-foreground mb-2">
                        Click fields to select or deselect data to send to the agent.
                      </p>
                      <div className="border rounded-md p-3 flex flex-wrap gap-2 max-h-60 overflow-y-auto">
                        {dataStructureItems.length === 0 && (
                          <p className="text-sm text-muted-foreground">No data structure fields defined.</p>
                        )}
                        {dataStructureItems.map((field) => {
                          const isSelected = data.some(d => d.value === `{{${field.id}}}`);

                          return (
                            <Badge
                              key={field.id}
                              variant={isSelected ? "default" : "outline"}
                              className={`cursor-pointer shrink-0 ${!isSelected ? "text-muted-foreground hover:text-foreground" : ""}`}
                              onClick={() => {
                                let newData = [...data];
                                if (isSelected) {
                                  newData = newData.filter(d => d.value !== `{{${field.id}}}`);
                                } else {
                                  newData.push({
                                    key: getFieldDisplayName(field),
                                    value: `{{${field.id}}}`,
                                    mode: "bind"
                                  });
                                }
                                setData(newData);
                                onUpdateStep({
                                  ...step,
                                  config: {
                                    ...step.config,
                                    api_data: JSON.stringify(newData)
                                  }
                                });
                              }}
                            >
                              {getFieldDisplayName(field)}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>

                    {/* Interactive prompt (when agent has a prompt template) */}
                    {step.config.agent_id && (
                      <>
                        {agentPromptTemplateLoading ? (
                          <p className="text-sm text-muted-foreground">Loading prompt template…</p>
                        ) : agentPromptTemplate.trim() ? (
                          <div className="space-y-2">
                            <Label>Interactive prompt</Label>
                            <p className="text-xs text-muted-foreground mb-2">
                              Fill the placeholders below. The resolved prompt will be sent to the agent API when this step runs.
                            </p>
                            <InteractivePromptEditor
                              key={step.id}
                              template={agentPromptTemplate}
                              promptValues={(step.config.prompt_values as PromptValues) ?? {}}
                              onChange={(nextValues) => {
                                onUpdateStep({
                                  ...step,
                                  config: {
                                    ...step.config,
                                    prompt_values: nextValues,
                                  },
                                });
                              }}
                              className="rounded-md border bg-muted/30 p-3"
                            />
                          </div>
                        ) : null}
                      </>
                    )}

                    {/* Data to Update */}
                    <div className="space-y-2">
                      <Label>Data to Update</Label>
                      <p className="text-xs text-muted-foreground mb-2">
                        Click fields to select or deselect data to update from agent response.
                      </p>
                      <div className="border rounded-md p-3 flex flex-wrap gap-2 max-h-60 overflow-y-auto">
                        {dataStructureItems.length === 0 && (
                          <p className="text-sm text-muted-foreground">No data structure fields defined.</p>
                        )}
                        {dataStructureItems.map((field) => {
                          const currentUpdateData = step.config.data_to_update || [];
                          const isSelected = currentUpdateData.some((d: any) => d.value === field.id);

                          return (
                            <Badge
                              key={`update-${field.id}`}
                              variant={isSelected ? "default" : "outline"}
                              className={`cursor-pointer shrink-0 ${!isSelected ? "text-muted-foreground hover:text-foreground" : ""}`}
                              onClick={() => {
                                let newUpdateData = [...(step.config.data_to_update || [])];

                                if (isSelected) {
                                  newUpdateData = newUpdateData.filter((d: any) => d.value !== field.id);
                                } else {
                                  newUpdateData.push({
                                    key: getFieldDisplayName(field),
                                    value: field.id
                                  });
                                }

                                onUpdateStep({
                                  ...step,
                                  config: {
                                    ...step.config,
                                    data_to_update: newUpdateData
                                  }
                                });
                              }}
                            >
                              {getFieldDisplayName(field)}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {step.action_type === "automatic" && (
                  <>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="api-config">API Configuration</Label>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate("/api-configurations")}
                        >
                          <Settings className="h-4 w-4 mr-1" />
                          Manage
                        </Button>
                      </div>
                      <Select
                        value={useCustomConfig ? "none" : selectedConfigId}
                        onValueChange={(value) => {
                          if (value === "custom") {
                            setUseCustomConfig(true);
                            setSelectedConfigId("none");
                            onUpdateStep({
                              ...step,
                              config: {
                                ...step.config,
                                api_configuration_id: null,
                              },
                            });
                          } else {
                            handleConfigSelect(value);
                          }
                        }}
                      >
                        <SelectTrigger id="api-config">
                          <SelectValue placeholder="Select configuration" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Use Custom Configuration</SelectItem>
                          {apiConfigurations.map((config) => (
                            <SelectItem key={config.id} value={config.id}>
                              {config.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {!useCustomConfig && selectedConfigId !== "none" && (
                        <>
                          <Alert>
                            <AlertDescription className="text-xs">
                              Using saved configuration. You can add static request data below.
                            </AlertDescription>
                          </Alert>
                          <div className="space-y-2">
                            <Label htmlFor="api-path">API Path (Optional)</Label>
                            <Input
                              id="api-path"
                              value={step.config.api_path || ""}
                              onChange={(e) => handleConfigChange("api_path", e.target.value)}
                              placeholder="e.g., rename"
                            />
                            <p className="text-xs text-muted-foreground">
                              Optional path to append to the base URL from the API configuration.
                            </p>
                            {(() => {
                              const selectedConfig = apiConfigurations.find((c) => c.id === selectedConfigId);
                              const baseUrl = selectedConfig?.api_url?.trim() || "";
                              const pathPart = (step.config.api_path && String(step.config.api_path).trim()) || "";
                              const fullPath = baseUrl
                                ? pathPart
                                  ? `${baseUrl.replace(/\/+$/, "")}/${pathPart.replace(/^\/+/, "")}`
                                  : baseUrl.replace(/\/+$/, "") || baseUrl
                                : "";
                              if (!fullPath) return null;
                              return (
                                <p className="text-xs text-muted-foreground font-mono break-all" title={fullPath}>
                                  Full path: {fullPath}
                                </p>
                              );
                            })()}
                          </div>
                        </>
                      )}
                    </div>

                    {useCustomConfig && (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="api-url">API URL</Label>
                          <Input
                            id="api-url"
                            value={step.config.api_url || ""}
                            onChange={(e) => handleConfigChange("api_url", e.target.value)}
                            placeholder="https://api.example.com/endpoint"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="api-method">HTTP Method</Label>
                          <Select
                            value={step.config.api_method || "POST"}
                            onValueChange={(value) => handleConfigChange("api_method", value)}
                          >
                            <SelectTrigger id="api-method">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="GET">GET</SelectItem>
                              <SelectItem value="POST">POST</SelectItem>
                              <SelectItem value="PUT">PUT</SelectItem>
                              <SelectItem value="PATCH">PATCH</SelectItem>
                              <SelectItem value="DELETE">DELETE</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label>Headers</Label>
                            <Button size="sm" variant="outline" onClick={() => handleAddKeyValue("headers")}>
                              <Plus className="h-4 w-4 mr-1" />
                              Add
                            </Button>
                          </div>
                          <div className="space-y-2">
                            {headers.map((header, index) => (
                              <div key={index} className="flex gap-2">
                                <Input
                                  placeholder="Key"
                                  value={header.key}
                                  onChange={(e) => handleUpdateKeyValue("headers", index, "key", e.target.value)}
                                />
                                <Input
                                  placeholder="Value"
                                  value={header.value}
                                  onChange={(e) => handleUpdateKeyValue("headers", index, "value", e.target.value)}
                                />
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => handleDeleteKeyValue("headers", index)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label>Params</Label>
                            <Button size="sm" variant="outline" onClick={() => handleAddKeyValue("params")}>
                              <Plus className="h-4 w-4 mr-1" />
                              Add
                            </Button>
                          </div>
                          <div className="space-y-3">
                            {params.map((param, index) => (
                              <div key={index} className="space-y-2 p-3 border border-border rounded-md">
                                <Input
                                  placeholder="Key"
                                  value={param.key}
                                  onChange={(e) => handleUpdateKeyValue("params", index, "key", e.target.value)}
                                />
                                <div className="flex gap-2">
                                  <Select
                                    value={param.mode || "static"}
                                    onValueChange={(value) => handleUpdateKeyValue("params", index, "mode", value)}
                                  >
                                    <SelectTrigger className="w-32">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="static">Static</SelectItem>
                                      <SelectItem value="bind">Bind Data</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  {param.mode === "bind" ? (
                                    <div className="flex-1 flex gap-1">
                                      <Input
                                        placeholder="Select data to bind"
                                        value={param.value.startsWith("{{") ? dataStructureItems.find(i => param.value === `{{${i.id}}}`)?.name || "Not found" : ""}
                                        disabled
                                        className="flex-1"
                                      />
                                      <Popover>
                                        <PopoverTrigger asChild>
                                          <Button size="icon" variant="outline">
                                            <Link2 className="h-4 w-4" />
                                          </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-80">
                                          <div className="space-y-2">
                                            <Label className="text-xs font-medium">Bind to Data Structure Item</Label>
                                            <div className="max-h-60 overflow-y-auto space-y-1">
                                              {dataStructureItems.map((item) => (
                                                <Button
                                                  key={item.id}
                                                  variant="ghost"
                                                  size="sm"
                                                  className="w-full justify-start text-xs"
                                                  onClick={() => handleUpdateKeyValue("params", index, "value", `{{${item.id}}}`)}
                                                >
                                                  <div className="flex flex-col items-start">
                                                    <span className="font-medium">{item.name}</span>
                                                    <span className="text-muted-foreground">{item.data_structure_name}</span>
                                                  </div>
                                                </Button>
                                              ))}
                                              {dataStructureItems.length === 0 && (
                                                <p className="text-xs text-muted-foreground p-2">No data structures linked to this workflow</p>
                                              )}
                                            </div>
                                          </div>
                                        </PopoverContent>
                                      </Popover>
                                    </div>
                                  ) : (
                                    <Input
                                      placeholder="Static value"
                                      value={param.value}
                                      onChange={(e) => handleUpdateKeyValue("params", index, "value", e.target.value)}
                                      className="flex-1"
                                    />
                                  )}
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => handleDeleteKeyValue("params", index)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label>Data</Label>
                            <Button size="sm" variant="outline" onClick={() => handleAddKeyValue("data")}>
                              <Plus className="h-4 w-4 mr-1" />
                              Add
                            </Button>
                          </div>
                          <div className="space-y-3">
                            {data.map((item, index) => (
                              <div key={index} className="space-y-2 p-3 border border-border rounded-md">
                                <Input
                                  placeholder="Key"
                                  value={item.key}
                                  onChange={(e) => handleUpdateKeyValue("data", index, "key", e.target.value)}
                                />
                                <div className="flex gap-2">
                                  <Select
                                    value={item.mode || "static"}
                                    onValueChange={(value) => handleUpdateKeyValue("data", index, "mode", value)}
                                  >
                                    <SelectTrigger className="w-32">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="static">Static</SelectItem>
                                      <SelectItem value="bind">Bind Data</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  {item.mode === "bind" ? (
                                    <div className="flex-1 flex gap-1">
                                      <Input
                                        placeholder="Select data to bind"
                                        value={item.value.startsWith("{{") ? dataStructureItems.find(i => item.value === `{{${i.id}}}`)?.name || "Not found" : ""}
                                        disabled
                                        className="flex-1"
                                      />
                                      <Popover>
                                        <PopoverTrigger asChild>
                                          <Button size="icon" variant="outline">
                                            <Link2 className="h-4 w-4" />
                                          </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-80">
                                          <div className="space-y-2">
                                            <Label className="text-xs font-medium">Bind to Data Structure Item</Label>
                                            <div className="max-h-60 overflow-y-auto space-y-1">
                                              {dataStructureItems.map((dsItem) => (
                                                <Button
                                                  key={dsItem.id}
                                                  variant="ghost"
                                                  size="sm"
                                                  className="w-full justify-start text-xs"
                                                  onClick={() => handleUpdateKeyValue("data", index, "value", `{{${dsItem.id}}}`)}
                                                >
                                                  <div className="flex flex-col items-start">
                                                    <span className="font-medium">{dsItem.name}</span>
                                                    <span className="text-muted-foreground">{dsItem.data_structure_name}</span>
                                                  </div>
                                                </Button>
                                              ))}
                                              {dataStructureItems.length === 0 && (
                                                <p className="text-xs text-muted-foreground p-2">No data structures linked to this workflow</p>
                                              )}
                                            </div>
                                          </div>
                                        </PopoverContent>
                                      </Popover>
                                    </div>
                                  ) : (
                                    <Input
                                      placeholder="Static value"
                                      value={item.value}
                                      onChange={(e) => handleUpdateKeyValue("data", index, "value", e.target.value)}
                                      className="flex-1"
                                    />
                                  )}
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => handleDeleteKeyValue("data", index)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}

                    {!useCustomConfig && selectedConfigId !== "none" && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Request Data (Static Only)</Label>
                          <Button size="sm" variant="outline" onClick={() => handleAddKeyValue("data")}>
                            <Plus className="h-4 w-4 mr-1" />
                            Add
                          </Button>
                        </div>
                        <div className="space-y-2">
                          {data.map((item, index) => (
                            <div key={index} className="flex gap-2">
                              <Input
                                placeholder="Key"
                                value={item.key}
                                onChange={(e) => {
                                  const updated = [...data];
                                  updated[index] = { ...updated[index], key: e.target.value, mode: "static" as const };
                                  setData(updated);
                                  onUpdateStep({
                                    ...step,
                                    config: {
                                      ...step.config,
                                      api_data: JSON.stringify(updated.map(d => ({
                                        key: d.key,
                                        value: d.value,
                                        mode: "static"
                                      })))
                                    }
                                  });
                                }}
                              />
                              <Input
                                placeholder="Value"
                                value={item.mode === "static" ? item.value : ""}
                                onChange={(e) => {
                                  // Force static mode when configuration is selected
                                  const updated = [...data];
                                  updated[index] = { ...updated[index], value: e.target.value, mode: "static" as const };
                                  setData(updated);
                                  onUpdateStep({
                                    ...step,
                                    config: {
                                      ...step.config,
                                      api_data: JSON.stringify(updated.map(d => ({
                                        key: d.key,
                                        value: d.value,
                                        mode: "static"
                                      })))
                                    }
                                  });
                                }}
                              />
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleDeleteKeyValue("data", index)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Only static values are allowed when using a saved configuration. Headers and query parameters are managed in the configuration.
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {step.step_type === "decision" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="decision-type">Decision Type</Label>
                  <Select
                    value={step.decision_node_type || "Human"}
                    onValueChange={(value) => onUpdateStep({ ...step, decision_node_type: value as "Agent" | "Human" | "Agent_Human" })}
                  >
                    <SelectTrigger id="decision-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Human">Human</SelectItem>
                      <SelectItem value="Agent">Agent</SelectItem>
                      <SelectItem value="Agent_Human">Agent + Human</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {isAgentDecisionNode && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="decision-source">Webhook Source</Label>
                      <Select
                        value={decisionSourceMode}
                        onValueChange={(value) => {
                          setDecisionSourceMode(value as "none" | "integration" | "agent");
                          if (value === "agent") {
                            onUpdateStep({
                              ...step,
                              config: {
                                ...step.config,
                                agent_id: null,
                                api_configuration_id: null,
                                api_url: null,
                                api_method: null,
                                api_headers: null,
                                api_params: null,
                                api_data: null,
                                api_path: null,
                              },
                            });
                            return;
                          }

                          if (value === "integration") {
                            onUpdateStep({
                              ...step,
                              config: {
                                ...step.config,
                                agent_id: null,
                                api_configuration_id: null,
                                api_url: null,
                                api_method: null,
                                api_headers: null,
                                api_params: null,
                                api_data: null,
                                api_path: null,
                              },
                            });
                            return;
                          }

                          onUpdateStep({
                            ...step,
                            config: {
                              ...step.config,
                              agent_id: null,
                              api_configuration_id: null,
                              api_url: null,
                              api_method: null,
                              api_headers: null,
                              api_params: null,
                              api_data: null,
                              api_path: null,
                            },
                          });
                        }}
                      >
                        <SelectTrigger id="decision-source">
                          <SelectValue placeholder="Select webhook source" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Select source</SelectItem>
                          <SelectItem value="integration">Company Integration</SelectItem>
                          <SelectItem value="agent">Shared Agent</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {decisionSourceMode === "integration" && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="decision-api-config">Decision Integration</Label>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate("/api-configurations")}
                          >
                            <Settings className="h-4 w-4 mr-1" />
                            Manage
                          </Button>
                        </div>
                        <Select
                          value={step.config.api_configuration_id || "none"}
                          onValueChange={(value) => {
                            if (value === "none") {
                              onUpdateStep({
                                ...step,
                                config: {
                                  ...step.config,
                                  agent_id: null,
                                  api_configuration_id: null,
                                },
                              });
                              return;
                            }
                            handleConfigSelect(value);
                          }}
                        >
                          <SelectTrigger id="decision-api-config">
                            <SelectValue placeholder="Select integration" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Select integration</SelectItem>
                            {apiConfigurations.map((config) => (
                              <SelectItem key={config.id} value={config.id}>
                                {config.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {step.config.api_configuration_id && (
                          <Alert>
                            <AlertDescription className="text-xs">
                              Using company decision integration configuration for this step.
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    )}

                    {decisionSourceMode === "agent" && (
                      <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="agent-select">Select Agent</Label>
                        {isSuperAdmin && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate("/agent-configurations")}
                          >
                            <Settings className="h-4 w-4 mr-1" />
                            Manage
                          </Button>
                        )}
                      </div>
                      <Select
                        value={step.config.agent_id || "none"}
                        onValueChange={(value) => {
                          onUpdateStep({
                            ...step,
                            config: {
                              ...step.config,
                              agent_id: value === "none" ? null : value,
                              api_configuration_id: null,
                              api_url: null,
                              api_method: null,
                              api_headers: null,
                              api_params: null,
                              api_data: null,
                              api_path: null,
                            },
                          });
                        }}
                      >
                        <SelectTrigger id="agent-select">
                          <SelectValue placeholder="Select an agent" />
                        </SelectTrigger>
                        <SelectContent>
                          {renderGroupedAgents("decision")}
                        </SelectContent>
                      </Select>
                      {step.config.agent_id && (
                        <Alert>
                          <AlertDescription className="text-xs">
                            Using saved agent configuration. All technical information is taken from the agent configuration.
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="condition">Condition</Label>
                      <Textarea
                        id="condition"
                        value={step.config.condition || ""}
                        onChange={(e) => handleConfigChange("condition", e.target.value)}
                        placeholder="Describe the condition in natural language..."
                        rows={5}
                      />
                      <p className="text-xs text-muted-foreground">
                        Describe the decision criteria for the agent to evaluate
                      </p>
                      {outputs.length > 0 && (
                        <div className="mt-2 p-2 bg-muted/50 rounded-md border border-border">
                          <p className="text-xs font-medium text-muted-foreground mb-1.5">
                            Available options:
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {outputs.map((output: string, index: number) => (
                              <Badge
                                key={index}
                                variant="outline"
                                className="text-xs"
                              >
                                {output}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            )}

            {step.step_type === "file" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Processing Type</Label>
                  <Select
                    value={step.action_type || "manual"}
                    onValueChange={(value) => onUpdateStep({ ...step, action_type: value as "manual" | "automatic" })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">Manual</SelectItem>
                      <SelectItem value="automatic">Automatic</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {step.action_type === "automatic"
                      ? "The file will be processed automatically when this step is reached."
                      : "A user must click the button to process the file."}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Action</Label>
                  <div className="p-3 border border-border rounded-md bg-muted/50">
                    <p className="text-sm font-medium">Create File Copy</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      A copy of the source file will be created. The original file will remain unchanged.
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="source-file">Source File</Label>
                  <Select
                    value={step.config.source_file_id || "none"}
                    onValueChange={(value) => handleConfigChange("source_file_id", value === "none" ? "" : value)}
                  >
                    <SelectTrigger id="source-file">
                      <SelectValue placeholder="Select source file" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Select a file field</SelectItem>
                      {dataStructureItems
                        .filter(item => item.field_type === 'file')
                        .map((item) => {
                          const parentArray = item.parent_item_id
                            ? dataStructureItems.find(p => p.id === item.parent_item_id)
                            : null;
                          return (
                            <SelectItem key={item.id} value={item.id}>
                              {parentArray ? `${parentArray.name} → ${item.name}` : item.name}
                            </SelectItem>
                          );
                        })}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Select the file field from the data structure. For files inside arrays, each item with a file will be processed separately with its row metadata.
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Metadata</Label>
                    <Button size="sm" variant="outline" onClick={() => handleAddKeyValue("data")}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {data.map((item, index) => (
                      <div key={index} className="space-y-2 p-3 border border-border rounded-md">
                        <Select
                          value={item.key}
                          onValueChange={(value) => handleUpdateKeyValue("data", index, "key", value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select key" />
                          </SelectTrigger>
                          <SelectContent>
                            {metadataKeys
                              .filter((k): k is FileMetadataKey & { name: string } => !!k.name?.trim())
                              .map((k) => (
                              <SelectItem key={k.id} value={k.name}>
                                {k.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="flex gap-2">
                          <Select
                            value={item.mode || "static"}
                            onValueChange={(value) => handleUpdateKeyValue("data", index, "mode", value)}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="static">Static</SelectItem>
                              <SelectItem value="bind">Bind Data</SelectItem>
                            </SelectContent>
                          </Select>
                          {item.mode === "bind" ? (() => {
                            // Determine which fields to show for binding
                            const sourceField = dataStructureItems.find(f => f.id === step.config.source_file_id);
                            const sourceParentId = sourceField?.parent_item_id;
                            // If source is an array child, show siblings first, then top-level fields
                            const bindableItems = sourceParentId
                              ? [
                                  ...dataStructureItems.filter(f => f.parent_item_id === sourceParentId && f.id !== sourceField.id),
                                  ...dataStructureItems.filter(f => !f.parent_item_id && f.field_type !== 'array'),
                                ]
                              : dataStructureItems;
                            const boundItem = dataStructureItems.find(i => item.value === `{{${i.id}}}`);
                            const boundParent = boundItem?.parent_item_id
                              ? dataStructureItems.find(p => p.id === boundItem.parent_item_id)
                              : null;
                            return (
                            <div className="flex-1 flex gap-1">
                              <Input
                                placeholder="Select data to bind"
                                value={boundItem ? (boundParent ? `${boundParent.name} → ${boundItem.name}` : boundItem.name) : (item.value.startsWith("{{") ? "Not found" : "")}
                                disabled
                                className="flex-1"
                              />
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button size="icon" variant="outline">
                                    <Link2 className="h-4 w-4" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-80">
                                  <div className="space-y-2">
                                    <Label className="text-xs font-medium">
                                      {sourceParentId ? "Bind to Array Item Field (same row)" : "Bind to Data Structure Item"}
                                    </Label>
                                    <div className="max-h-60 overflow-y-auto space-y-1">
                                      {bindableItems.map((dsItem) => {
                                        const dsParent = dsItem.parent_item_id
                                          ? dataStructureItems.find(p => p.id === dsItem.parent_item_id)
                                          : null;
                                        return (
                                        <Button
                                          key={dsItem.id}
                                          variant="ghost"
                                          size="sm"
                                          className="w-full justify-start text-xs"
                                          onClick={() => handleUpdateKeyValue("data", index, "value", `{{${dsItem.id}}}`)}
                                        >
                                          <div className="flex flex-col items-start">
                                            <span className="font-medium">{dsParent ? `${dsParent.name} → ${dsItem.name}` : dsItem.name}</span>
                                            <span className="text-muted-foreground">
                                              {dsItem.parent_item_id === sourceParentId ? "Same row" : dsItem.data_structure_name}
                                            </span>
                                          </div>
                                        </Button>
                                        );
                                      })}
                                      {bindableItems.length === 0 && (
                                        <p className="text-xs text-muted-foreground p-2">No data structures linked to this workflow</p>
                                      )}
                                    </div>
                                  </div>
                                </PopoverContent>
                              </Popover>
                            </div>
                            );
                          })() : (
                            <MetadataValueControl
                              placeholder="Static value"
                              metaKey={metadataKeys.find((k) => k.name === item.key)}
                              value={item.value}
                              onChange={(v) => handleUpdateKeyValue("data", index, "value", v)}
                              className="flex-1"
                            />
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDeleteKeyValue("data", index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Add metadata key-value pairs to be stored with the file.
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="ocr-enabled"
                      checked={!!step.config.ocrEnabled}
                      onCheckedChange={(checked) => handleConfigChange("ocrEnabled", checked)}
                    />
                    <Label htmlFor="ocr-enabled">OCR uploaded documents</Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Automatically extract text from documents passing through this node.
                  </p>
                </div>
              </div>
            )}
              </>
            )}
          </TabsContent>
        </Tabs>


      </div>
    </div>
  );
}
