import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Save, Search, X, Settings, Plus, Edit, Trash2, GripVertical, ChevronRight, ChevronDown, Star, Link2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Canvas } from "@/components/workflow/Canvas";
import { Toolbar } from "@/components/workflow/Toolbar";
import { PropertiesPanel } from "@/components/workflow/PropertiesPanel";
import { CanvasCommentData } from "@/components/workflow/CanvasComment";
import { DecisionOutputsDialog } from "@/components/workflow/DecisionOutputsDialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { IconPicker } from "@/components/workflow/IconPicker";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { getTagColors, TAG_COLORS, DEFAULT_STATUS_COLOR } from "@/lib/tagColors";
import { useCompanyId } from "@/hooks/useCompanyId";
import { useLanguage } from "@/contexts/LanguageContext";
import { PermissionTargetPicker } from "@/components/workflow/PermissionTargetPicker";

export interface WorkflowStep {
  id: string;
  step_type: "start" | "end" | "decision" | "action" | "edit_form" | "file";
  name: string;
  position_x: number;
  position_y: number;
  config: any;
  action_type?: "manual" | "automatic" | "agent";
  // Must match Prisma enum values (see backend/prisma/schema.prisma)
  decision_node_type?: "Human" | "Agent" | "Agent_Human";
}

type ReminderMode = "none" | "repeat" | "schedule";

function supportsStepNotifications(
  stepType: WorkflowStep["step_type"],
  actionType?: WorkflowStep["action_type"],
  decisionNodeType?: WorkflowStep["decision_node_type"]
): boolean {
  if (stepType === "edit_form") return true;
  if (stepType === "action") return (actionType || "manual") === "manual";
  if (stepType === "decision") return ["Human", "Agent_Human"].includes(decisionNodeType || "Human");
  return false;
}

function normalizeStepNotificationSettings(step: WorkflowStep): WorkflowStep {
  const shouldApplyDefaults = supportsStepNotifications(step.step_type, step.action_type, step.decision_node_type);
  if (!shouldApplyDefaults) return step;

  const notificationsSource = (step.config?.notifications && typeof step.config.notifications === "object")
    ? step.config.notifications
    : {};
  const assignmentSource = (notificationsSource.assignment && typeof notificationsSource.assignment === "object")
    ? notificationsSource.assignment
    : {};
  const reminderSource = (notificationsSource.reminder && typeof notificationsSource.reminder === "object")
    ? notificationsSource.reminder
    : {};
  const reminderMode: ReminderMode =
    reminderSource.mode === "repeat"
      ? "repeat"
      : reminderSource.mode === "schedule" || reminderSource.mode === "once"
        ? "schedule"
        : "none";
  const delayMinutes = Number.isFinite(Number(reminderSource.delay_minutes))
    ? Math.max(1, Math.round(Number(reminderSource.delay_minutes)))
    : 24 * 60;
  const repeatEveryMinutes = Number.isFinite(Number(reminderSource.repeat_every_minutes))
    ? Math.max(1, Math.round(Number(reminderSource.repeat_every_minutes)))
    : 24 * 60;
  const maxCount = Number.isFinite(Number(reminderSource.max_count))
    ? Math.max(1, Math.round(Number(reminderSource.max_count)))
    : undefined;
  const scheduleMinutesRaw = Array.isArray(reminderSource.schedule_minutes)
    ? reminderSource.schedule_minutes
    : reminderSource.delay_minutes
      ? [reminderSource.delay_minutes]
      : [];
  const scheduleMinutes = scheduleMinutesRaw
    .map((entry: unknown) => Number(entry))
    .filter((entry: number) => Number.isFinite(entry) && entry > 0)
    .map((entry: number) => Math.round(entry))
    .sort((a: number, b: number) => a - b)
    .filter((entry: number, index: number, list: number[]) => index === 0 || entry !== list[index - 1]);

  return {
    ...step,
    config: {
      ...step.config,
      notifications: {
        assignment: {
          enabled: assignmentSource.enabled !== false,
        },
        reminder: {
          mode: reminderMode,
          delay_minutes: delayMinutes,
          repeat_every_minutes: repeatEveryMinutes,
          max_count: maxCount,
          schedule_minutes: scheduleMinutes.length > 0 ? scheduleMinutes : [24 * 60],
        },
      },
    },
  };
}

export interface WorkflowConnection {
  id: string;
  source_step_id: string;
  target_step_id: string;
  output_name: string;
  config?: {
    color?: string;
    style?: "solid" | "dashed";
  };
}

interface Workflow {
  id: string;
  name: string;
  description: string | null;
  data_structure?: any;
  default_status_id?: string | null;
  category_id?: string | null;
  icon?: string | null;
  is_public?: boolean;
  visibility_scope?: "all_company" | "specific";
  start_permission_scope?: "public" | "specific";
  api_enabled?: boolean;
  is_active?: boolean;
  portal_enabled?: boolean;
}

type DataStructureField = {
  id: string;
  data_structure_id: string;
  parent_item_id: string | null;
  name: string;
  description: string | null;
  field_type: string;
  options: string[] | null;
  position: number;
  options_source?: "static" | "dynamic";
  api_configuration_id?: string | null;
  api_query_params?: { key: string; value: string; mode?: "static" | "bind" }[];
};

type FieldFormData = {
  name: string;
  description: string;
  field_type: string;
  options: string;
  parent_item_id: string;
  options_source?: "static" | "dynamic";
  api_configuration_id?: string | null;
  use_query_params?: boolean;
  api_query_params?: { key: string; value: string; mode?: "static" | "bind" }[];
};

interface WorkflowStatus {
  id: string;
  workflow_id: string;
  name: string;
  order: number;
  color: string;
  created_at: string;
  updated_at: string;
  company_id: string | null;
}

type StatusFormData = {
  name: string;
  color: string;
};

interface User {
  id: string;
  full_name: string | null;
  email: string;
}

interface Group {
  id: string;
  name: string;
  description: string | null;
}

interface WorkflowCategory {
  id: string;
  name: string;
  description: string | null;
  parent_category_id: string | null;
  icon: string | null;
  company_id: string;
  created_at: string;
  updated_at: string;
}

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Boolean" },
  { value: "date", label: "Date" },
  { value: "time", label: "Time" },
  { value: "datetime", label: "Date & Time" },
  { value: "option", label: "Option (Single)" },
  { value: "multiple_option", label: "Multiple Options" },
  { value: "array", label: "Array" },
  { value: "file", label: "File" },

  { value: "html", label: "HTML" },
  { value: "signature", label: "Handwritten Signature" },
];

const DEFAULT_DECISION_OUTPUTS = ["Yes", "No"];

export default function WorkflowEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const companyId = useCompanyId();
  const { t } = useLanguage();
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [connections, setConnections] = useState<WorkflowConnection[]>([]);
  const [comments, setComments] = useState<CanvasCommentData[]>([]);
  const [selectedStep, setSelectedStep] = useState<WorkflowStep | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Settings dialog state
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"general" | "data-structure" | "status">("general");
  const [decisionOutputsDialogOpen, setDecisionOutputsDialogOpen] = useState(false);
  type UnconnectedPortWarning = {
    stepId: string;
    stepName: string;
    portType: "input" | "output";
    outputName?: string;
  };

  const [unconnectedPortsDialogOpen, setUnconnectedPortsDialogOpen] = useState(false);
  const [unconnectedPorts, setUnconnectedPorts] = useState<UnconnectedPortWarning[]>([]);
  const [isSavingWorkflow, setIsSavingWorkflow] = useState(false);
  // When opening data structure from form editor: restore step panel on settings close and show Form tab
  const [returnToStepIdAfterSettingsClose, setReturnToStepIdAfterSettingsClose] = useState<string | null>(null);
  const [returnToFormTab, setReturnToFormTab] = useState(false);
  const [formData, setFormData] = useState({ name: "", description: "", is_public: false, api_enabled: false, is_active: true, portal_enabled: false });
  const [dataStructureFields, setDataStructureFields] = useState<DataStructureField[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedIcon, setSelectedIcon] = useState<string | null>(null);
  const [visibilityScope, setVisibilityScope] = useState<"all_company" | "specific">("all_company");
  const [startScope, setStartScope] = useState<"public" | "specific">("public");
  const [visibilityUsers, setVisibilityUsers] = useState<string[]>([]);
  const [visibilityGroups, setVisibilityGroups] = useState<string[]>([]);
  const [startUsers, setStartUsers] = useState<string[]>([]);
  const [startGroups, setStartGroups] = useState<string[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [categories, setCategories] = useState<WorkflowCategory[]>([]);
  const [workflowStatuses, setWorkflowStatuses] = useState<WorkflowStatus[]>([]);
  const [defaultStatusId, setDefaultStatusId] = useState<string | null>(null);
  const [apiConfigurations, setApiConfigurations] = useState<Array<{ id: string; name: string }>>([]);

  // Step IDs that exist in DB (from the last successful `fetchWorkflow` load).
  // New steps created in the editor before saving will not be in this set.
  const persistedStepIdsRef = useRef<Set<string>>(new Set());
  
  // Field inline state (no modal: add/edit directly in list)
  const [addingNewFieldParentId, setAddingNewFieldParentId] = useState<string | null | undefined>(undefined);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [fieldDescriptionOpen, setFieldDescriptionOpen] = useState(false);
  const [fieldTypeComboboxOpen, setFieldTypeComboboxOpen] = useState(false);
  const [fieldFormData, setFieldFormData] = useState<FieldFormData>({
    name: "",
    description: "",
    field_type: "text",
    options: "",
    parent_item_id: "",
    options_source: "static",
    api_configuration_id: null,
    use_query_params: false,
    api_query_params: [],
  });
  
  // Status dialog state
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null);
  const [statusFormData, setStatusFormData] = useState<StatusFormData>({
    name: "",
    color: DEFAULT_STATUS_COLOR,
  });
  
  // Drag and drop state
  const [draggedFieldId, setDraggedFieldId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [draggedParentId, setDraggedParentId] = useState<string | null>(null);
  const [dragOverParentId, setDragOverParentId] = useState<string | null>(null);
  const [draggedStatusId, setDraggedStatusId] = useState<string | null>(null);
  const [dragOverStatusIndex, setDragOverStatusIndex] = useState<number | null>(null);

  // Persist to sessionStorage only after user makes changes.
  const hasEditorUserEditsRef = useRef(false);
  const hasSettingsUserEditsRef = useRef(false);

  // Storage keys for persisting state
  const settingsStorageKey = id ? `workflow-settings-${id}` : null;
  const editorStorageKey = id ? `workflow-editor-${id}` : null;

  // Save settings state to sessionStorage
  const saveSettingsState = () => {
    if (!settingsStorageKey) return;
    try {
      const stateToSave = {
        formData,
        dataStructureFields,
        selectedCategoryId,
        selectedIcon,
        visibilityScope,
        startScope,
        visibilityUsers,
        visibilityGroups,
        startUsers,
        startGroups,
        workflowStatuses,
        defaultStatusId,
      };
      sessionStorage.setItem(settingsStorageKey, JSON.stringify(stateToSave));
    } catch (error) {
      console.error("Error saving settings state:", error);
    }
  };

  // Load settings state from sessionStorage
  const loadSettingsState = () => {
    if (!settingsStorageKey) return null;
    try {
      const saved = sessionStorage.getItem(settingsStorageKey);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (error) {
      console.error("Error loading settings state:", error);
    }
    return null;
  };

  // Clear saved settings state
  const clearSettingsState = () => {
    if (!settingsStorageKey) return;
    try {
      sessionStorage.removeItem(settingsStorageKey);
    } catch (error) {
      console.error("Error clearing settings state:", error);
    }
  };

  // Load editor state from sessionStorage
  const loadEditorState = () => {
    if (!editorStorageKey) return null;
    try {
      const saved = sessionStorage.getItem(editorStorageKey);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (error) {
      console.error("Error loading editor state:", error);
    }
    return null;
  };

  // Clear saved editor state
  const clearEditorState = () => {
    if (!editorStorageKey) return;
    try {
      sessionStorage.removeItem(editorStorageKey);
    } catch (error) {
      console.error("Error clearing editor state:", error);
    }
  };

  // Save state whenever form data changes
  useEffect(() => {
    if (settingsDialogOpen && settingsStorageKey) {
      if (!hasSettingsUserEditsRef.current) return;
      try {
        const stateToSave = {
          formData,
          dataStructureFields,
          selectedCategoryId,
          selectedIcon,
          visibilityScope,
          startScope,
          visibilityUsers,
          visibilityGroups,
          startUsers,
          startGroups,
          workflowStatuses,
          defaultStatusId,
        };
        sessionStorage.setItem(settingsStorageKey, JSON.stringify(stateToSave));
      } catch (error) {
        console.error("Error saving settings state:", error);
      }
    }
  }, [
    formData,
    dataStructureFields,
    selectedCategoryId,
    selectedIcon,
    visibilityScope,
    startScope,
    visibilityUsers,
    visibilityGroups,
    startUsers,
    startGroups,
    workflowStatuses,
    defaultStatusId,
    settingsDialogOpen,
    settingsStorageKey,
  ]);

  // Save editor state whenever it changes
  useEffect(() => {
    if (editorStorageKey && !loading) {
      if (!hasEditorUserEditsRef.current) return;
      try {
        const stateToSave = {
          steps,
          connections,
          comments,
          selectedStepId: selectedStep?.id || null,
          searchQuery,
        };
        sessionStorage.setItem(editorStorageKey, JSON.stringify(stateToSave));
      } catch (error) {
        console.error("Error saving editor state:", error);
      }
    }
  }, [
    steps,
    connections,
    comments,
    selectedStep,
    searchQuery,
    editorStorageKey,
    loading,
  ]);

  // Warn before leaving page with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const hasSettingsChanges = settingsStorageKey && sessionStorage.getItem(settingsStorageKey) !== null;
      const hasEditorChanges = editorStorageKey && sessionStorage.getItem(editorStorageKey) !== null;
      
      if (hasSettingsChanges || hasEditorChanges) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [settingsStorageKey, editorStorageKey]);

  useEffect(() => {
    if (!id || !companyId) return;

    // Reset editor state and then load workflow, restoring any local unsaved state automatically.
    setLoading(true);
    setWorkflow(null);
    setSteps([]);
    setConnections([]);
    setComments([]);
    setSelectedStep(null);
    setSearchQuery("");
    hasEditorUserEditsRef.current = false;
    hasSettingsUserEditsRef.current = false;

    fetchCategories();
    fetchUsers();
    fetchGroups();
    fetchApiConfigurations();
    fetchWorkflow({ useSavedState: true });
  }, [id, companyId, settingsStorageKey, editorStorageKey]);

  const fetchWorkflow = async (options?: { useSavedState?: boolean }) => {
    if (!companyId) return;
    try {
      const useSavedState = options?.useSavedState ?? true;
      const savedEditorState = useSavedState ? loadEditorState() : null;

      const workflowData = await api.get<any>(`/api/companies/${companyId}/workflows/${id}`);
      setWorkflow(workflowData as Workflow);

      const canvasComments = workflowData?.canvas_comments;
      if (Array.isArray(canvasComments)) {
        setComments(canvasComments as CanvasCommentData[]);
      } else {
        setComments([]);
      }

      const stepsData = workflowData?.steps || [];
      const loadedSteps = stepsData.map((step: any) => {
        const stepConfig = typeof step.config === "object" && step.config !== null ? step.config : {};
        // Convert position values to numbers - Prisma Decimal types may come as strings or objects
        const posX = typeof step.position_x === 'object' ? Number(step.position_x) : parseFloat(step.position_x);
        const posY = typeof step.position_y === 'object' ? Number(step.position_y) : parseFloat(step.position_y);
        return {
          ...step,
          position_x: isNaN(posX) ? 0 : posX,
          position_y: isNaN(posY) ? 0 : posY,
          action_type: step.action_type || "manual",
          decision_node_type: step.decision_node_type || "Human",
          config: {
            ...stepConfig,
            assigned_to_user_id: step.assigned_to_user_id ?? stepConfig?.assigned_to_user_id,
            assigned_to_group_id: step.assigned_to_group_id ?? stepConfig?.assigned_to_group_id,
          },
        };
      }).map((step) => normalizeStepNotificationSettings(step as WorkflowStep)) as WorkflowStep[];
      persistedStepIdsRef.current = new Set(loadedSteps.map((s) => s.id));

      const connectionsData = workflowData?.connections || [];
      const loadedConnections = connectionsData.map((conn: any) => ({
        id: conn.id,
        source_step_id: conn.source_step_id,
        target_step_id: conn.target_step_id,
        output_name: conn.output_name || "default",
        config: conn.config || { color: "#2a5ce5", style: "solid" },
      })) as WorkflowConnection[];

      // Restore saved state if available, otherwise use loaded data
      if (savedEditorState) {
        hasEditorUserEditsRef.current = true;
        // Restore steps (merge saved positions/configs with loaded data to preserve IDs)
        const restoredSteps = savedEditorState.steps.map((savedStep: WorkflowStep) => {
          const loadedStep = loadedSteps.find(ls => ls.id === savedStep.id);
          // Ensure positions are valid numbers from sessionStorage
          const savedPosX = parseFloat(String(savedStep.position_x));
          const savedPosY = parseFloat(String(savedStep.position_y));
          if (loadedStep) {
            // Merge: use saved positions and configs, but keep loaded IDs and other DB fields
            return {
              ...loadedStep,
              position_x: isNaN(savedPosX) ? loadedStep.position_x : savedPosX,
              position_y: isNaN(savedPosY) ? loadedStep.position_y : savedPosY,
              name: savedStep.name,
              config: savedStep.config,
              action_type: savedStep.action_type,
              decision_node_type: savedStep.decision_node_type,
            };
          }
          // New step that wasn't saved yet - ensure valid positions
          return {
            ...savedStep,
            position_x: isNaN(savedPosX) ? 0 : savedPosX,
            position_y: isNaN(savedPosY) ? 0 : savedPosY,
          };
        }).map((step) => normalizeStepNotificationSettings(step));
        // Add any new steps from DB that weren't in saved state
        loadedSteps.forEach(loadedStep => {
          if (!restoredSteps.find(rs => rs.id === loadedStep.id)) {
            restoredSteps.push(loadedStep);
          }
        });
        setSteps(restoredSteps);

        // Restore connections
        setConnections(savedEditorState.connections || loadedConnections);
        
        // Restore comments
        if (savedEditorState.comments) {
          setComments(savedEditorState.comments);
        }
        
        // Restore selected step
        if (savedEditorState.selectedStepId) {
          const stepToSelect = restoredSteps.find(s => s.id === savedEditorState.selectedStepId);
          if (stepToSelect) {
            setSelectedStep(stepToSelect);
          }
        }
        
        // Restore search query
        if (savedEditorState.searchQuery !== undefined) {
          setSearchQuery(savedEditorState.searchQuery);
        }
        
        toast.info("Unsaved changes have been restored");
      } else {
        hasEditorUserEditsRef.current = false;
        // No saved state, use loaded data
        setSteps(loadedSteps);
        setConnections(loadedConnections);
      }
    } catch (error) {
      console.error("Error fetching workflow:", error);
      toast.error(t("workflowEditor.failedToLoad"));
      navigate("/workflows");
    } finally {
      setLoading(false);
    }
  };

  const getExpectedOutputsForStep = (step: WorkflowStep): string[] => {
    // Keep in sync with `WorkflowNode` output handle rendering.
    if (step.step_type === "decision") {
      const outputs = step.config?.outputs?.length ? step.config.outputs : ["Yes", "No"];
      return Array.isArray(outputs) ? outputs : ["Yes", "No"];
    }

    if (step.step_type === "edit_form") {
      const outputs = step.config?.outputs?.length ? step.config.outputs : ["Submit", "Cancel"];
      return Array.isArray(outputs) ? outputs : ["Submit", "Cancel"];
    }

    // Start/action/file nodes have a single `default` output handle.
    if (step.step_type === "end") return [];
    return ["default"];
  };

  const getUnconnectedPortsWarnings = (): UnconnectedPortWarning[] => {
    const warnings: UnconnectedPortWarning[] = [];

    const hasIncoming = (targetStepId: string) => connections.some((c) => c.target_step_id === targetStepId);
    const normalizeOutputName = (outputName: string | undefined | null) => outputName || "default";

    for (const step of steps) {
      const stepName = step.name || step.id;

      // Input handle exists for every step except `start`.
      if (step.step_type !== "start") {
        if (!hasIncoming(step.id)) {
          warnings.push({
            stepId: step.id,
            stepName,
            portType: "input",
          });
        }
      }

      // Output handles exist for every step except `end`.
      if (step.step_type !== "end") {
        const expectedOutputs = Array.from(new Set(getExpectedOutputsForStep(step)));
        for (const outputName of expectedOutputs) {
          const hasOutgoing = connections.some(
            (c) =>
              c.source_step_id === step.id &&
              normalizeOutputName(c.output_name) === normalizeOutputName(outputName)
          );
          if (!hasOutgoing) {
            warnings.push({
              stepId: step.id,
              stepName,
              portType: "output",
              outputName,
            });
          }
        }
      }
    }

    return warnings;
  };

  const performSaveWorkflow = async () => {
    try {
      if (!companyId) {
        toast.error("Company not set. Please contact administrator.");
        return;
      }

      setIsSavingWorkflow(true);

      const stepsPayload = steps.map((step) => ({
        id: step.id,
        step_type: step.step_type,
        name: step.name,
        position_x: step.position_x,
        position_y: step.position_y,
        config: step.config,
        action_type: step.action_type || "manual",
        decision_node_type: step.decision_node_type || "Human",
        assigned_to_user_id: step.config?.assigned_to_user_id || null,
        assigned_to_group_id: step.config?.assigned_to_group_id || null,
      }));

      await api.put(`/api/companies/${companyId}/workflows/${id}/steps`, { steps: stepsPayload });

      const connectionsPayload = connections.map((conn) => ({
        source_step_id: conn.source_step_id,
        target_step_id: conn.target_step_id,
        output_name: conn.output_name || "default",
        config: conn.config || { color: "#2a5ce5", style: "solid" },
      }));
      await api.put(`/api/companies/${companyId}/workflows/${id}/connections`, {
        connections: connectionsPayload,
      });

      await api.patch(`/api/companies/${companyId}/workflows/${id}`, {
        canvas_comments: comments,
      });

      console.log("Workflow saved successfully");
      
      // Clear saved editor state after successful save
      hasEditorUserEditsRef.current = false;
      clearEditorState();
      
      toast.success(t("workflowEditor.workflowSaved"));
      
      // Refresh the workflow to reflect any deletions
      await fetchWorkflow();
    } catch (error: any) {
      console.error("Error saving workflow:", error);
      toast.error(`${t("workflowEditor.failedToSave")}: ${error.message || 'Unknown error'}`);
    } finally {
      setIsSavingWorkflow(false);
    }
  };

  const handleSave = async () => {
    const warnings = getUnconnectedPortsWarnings();
    if (warnings.length > 0) {
      setUnconnectedPorts(warnings);
      setUnconnectedPortsDialogOpen(true);
      return;
    }

    await performSaveWorkflow();
  };

  const handleSaveAnyway = async () => {
    setUnconnectedPortsDialogOpen(false);
    await performSaveWorkflow();
  };

  const addStep = (stepType: WorkflowStep["step_type"], decisionOutputs?: string[]) => {
    // Map step types to their display names
    const stepNameMap: Record<WorkflowStep["step_type"], string> = {
      start: "Start",
      end: "End",
      decision: "Decision",
      action: "Action",
      edit_form: "Form",
      file: "File",
    };

    const baseConfig = workflow?.default_status_id ? { status_id: workflow.default_status_id } : {};

    const stepConfig =
      stepType === "decision" && decisionOutputs && decisionOutputs.length >= 2
        ? (() => {
            const output_styles: Record<string, "primary" | "secondary"> = {};
            decisionOutputs.forEach((output, idx) => {
              output_styles[output] = idx === 0 ? "primary" : "secondary";
            });
            return { ...baseConfig, outputs: decisionOutputs, output_styles };
          })()
        : baseConfig;

    const newStep: WorkflowStep = normalizeStepNotificationSettings({
      id: crypto.randomUUID(),
      step_type: stepType,
      name:
        stepNameMap[stepType] ||
        stepType
          .split("_")
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(" "),
      position_x: 100 + Math.random() * 200,
      position_y: 100 + Math.random() * 200,
      config: stepConfig,
    });

    hasEditorUserEditsRef.current = true;
    setSteps([...steps, newStep]);
    setSelectedStep(newStep);
  };

  const handleAddStep = (stepType: WorkflowStep["step_type"]) => {
    if (stepType === "decision") {
      setDecisionOutputsDialogOpen(true);
      return;
    }
    addStep(stepType);
  };

  const handleUpdateStep = (updatedStep: WorkflowStep) => {
    const normalizedStep = normalizeStepNotificationSettings(updatedStep);
    hasEditorUserEditsRef.current = true;
    // Update step in collection
    setSteps(steps.map((step) => (step.id === normalizedStep.id ? normalizedStep : step)));

    // Update selectedStep if this is the selected step
    if (selectedStep?.id === normalizedStep.id) {
      const prev = steps.find((s) => s.id === normalizedStep.id);
      if (!prev) return;

      const positionChanged = prev.position_x !== normalizedStep.position_x || prev.position_y !== normalizedStep.position_y;
      const otherChanged = prev.name !== normalizedStep.name || prev.step_type !== normalizedStep.step_type || prev.action_type !== normalizedStep.action_type || prev.decision_node_type !== normalizedStep.decision_node_type || JSON.stringify(prev.config) !== JSON.stringify(normalizedStep.config);

      // Always update selectedStep when action_type or decision_node_type changes, or when other properties change (but not just position)
      if (prev.action_type !== normalizedStep.action_type || prev.decision_node_type !== normalizedStep.decision_node_type || (otherChanged && !positionChanged)) {
        setSelectedStep(normalizedStep);
      }
    }
  };

  const handleDeleteStep = (stepId: string) => {
    void (async () => {
      if (!companyId) return;

      // If the step hasn't been persisted yet, delete it locally only.
      // (e.g. user creates a node and immediately clicks the trash icon before saving)
      if (!persistedStepIdsRef.current.has(stepId)) {
        hasEditorUserEditsRef.current = true;
        setSteps((prev) => prev.filter((step) => step.id !== stepId));
        setConnections((prev) =>
          prev.filter((conn) => conn.source_step_id !== stepId && conn.target_step_id !== stepId)
        );
        setSelectedStep((prev) => (prev?.id === stepId ? null : prev));
        return;
      }

      try {
        const usage = await api.get<{ past_execution_count?: number }>(
          `/api/companies/${companyId}/workflows/${id}/steps/${stepId}/execution-usage`
        );

        const pastExecutionCount = usage?.past_execution_count ?? 0;
        if (pastExecutionCount > 0) {
          const ok = confirm(t("workflowEditor.deleteStepPastExecutionsConfirm", { count: pastExecutionCount }) as string);
          if (!ok) return;
        }

        await api.delete(
          `/api/companies/${companyId}/workflows/${id}/steps/${stepId}?deletePastExecutions=${pastExecutionCount > 0}`
        );

        hasEditorUserEditsRef.current = true;
        setSteps((prev) => prev.filter((step) => step.id !== stepId));
        setConnections((prev) =>
          prev.filter((conn) => conn.source_step_id !== stepId && conn.target_step_id !== stepId)
        );
        setSelectedStep((prev) => (prev?.id === stepId ? null : prev));
      } catch (error: any) {
        console.error("Error deleting step:", error);
        toast.error(error?.message || t("workflowEditor.failedToDeleteStep"));
      }
    })();
  };

  const handleDuplicateStep = (stepId: string) => {
    const stepToDuplicate = steps.find((step) => step.id === stepId);
    if (!stepToDuplicate) return;

    const duplicatedStep: WorkflowStep = normalizeStepNotificationSettings({
      id: crypto.randomUUID(),
      step_type: stepToDuplicate.step_type,
      name: `${stepToDuplicate.name} (copy)`,
      position_x: stepToDuplicate.position_x + 50,
      position_y: stepToDuplicate.position_y + 50,
      config: { ...stepToDuplicate.config },
      action_type: stepToDuplicate.action_type,
      decision_node_type: stepToDuplicate.decision_node_type,
    });
    hasEditorUserEditsRef.current = true;
    setSteps([...steps, duplicatedStep]);
    setSelectedStep(duplicatedStep);
  };

  const handleAddConnection = (sourceId: string, targetId: string, outputName: string = "default") => {
    const newConnection: WorkflowConnection = {
      id: crypto.randomUUID(),
      source_step_id: sourceId,
      target_step_id: targetId,
      output_name: outputName,
      config: { color: "#2a5ce5", style: "solid" },
    };
    hasEditorUserEditsRef.current = true;
    setConnections([...connections, newConnection]);
  };

  const handleUpdateConnection = (connectionId: string, config: { color: string; style: "solid" | "dashed" }) => {
    hasEditorUserEditsRef.current = true;
    setConnections(connections.map((conn) =>
      conn.id === connectionId ? { ...conn, config } : conn
    ));
  };

  const handleDeleteConnection = (connectionId: string) => {
    hasEditorUserEditsRef.current = true;
    setConnections(connections.filter((conn) => conn.id !== connectionId));
  };

  const handleOutputRenamed = (stepId: string, oldName: string, newName: string) => {
    hasEditorUserEditsRef.current = true;
    setConnections(prevConnections =>
      prevConnections.map(conn => {
        if (conn.source_step_id === stepId && conn.output_name === oldName) {
          return { ...conn, output_name: newName };
        }
        return conn;
      })
    );
  };

  // Settings dialog functions
  const fetchCategories = async () => {
    if (!companyId) return;
    try {
      const data = await api.get<any[]>(`/api/companies/${companyId}/workflow-categories`);
      setCategories(data || []);
    } catch (error) {
      console.error("Error fetching categories:", error);
    }
  };

  const fetchUsers = async () => {
    if (!companyId) return;
    try {
      const data = await api.get<{ id: string; full_name: string | null; email: string }[]>(
        `/api/companies/${companyId}/users`
      );
      const usersData = (data || []).sort((a, b) =>
        (a.full_name || "").localeCompare(b.full_name || "")
      );
      setUsers(usersData);
    } catch (error) {
      console.error("Error fetching users:", error);
    }
  };

  const fetchGroups = async () => {
    if (!companyId) return;
    try {
      const data = await api.get<any[]>(`/api/companies/${companyId}/groups`);
      setGroups(data || []);
    } catch (error) {
      console.error("Error fetching groups:", error);
    }
  };

  const fetchApiConfigurations = async () => {
    if (!companyId) return;
    try {
      const data = await api.get<{ id: string; name: string }[]>(
        `/api/companies/${companyId}/api-configurations`
      );
      setApiConfigurations(data || []);
    } catch (error) {
      console.error("Error fetching API configurations:", error);
    }
  };

  const fetchWorkflowStatuses = async (workflowId: string) => {
    if (!companyId) return;
    try {
      const [statuses, wf] = await Promise.all([
        api.get<any[]>(`/api/companies/${companyId}/workflows/${workflowId}/statuses`),
        api.get<{ default_status_id: string | null }>(
          `/api/companies/${companyId}/workflows/${workflowId}`
        ),
      ]);
      setWorkflowStatuses(statuses || []);
      setDefaultStatusId(wf?.default_status_id ?? null);
    } catch (error) {
      console.error("Error fetching workflow statuses:", error);
    }
  };

  const getCategoryPath = (categoryId: string): string => {
    const category = categories.find(c => c.id === categoryId);
    if (!category) return "";
    
    const path: string[] = [];
    let current: WorkflowCategory | undefined = category;
    
    while (current) {
      path.unshift(current.name);
      if (current.parent_category_id) {
        current = categories.find(c => c.id === current.parent_category_id);
      } else {
        current = undefined;
      }
    }
    
    return path.join(" > ");
  };

  const openSettingsDialog = async (initialTab?: "general" | "data-structure" | "status") => {
    if (!workflow || !id) return;
    
    try {
      // Check if there's saved state to restore
      const savedState = loadSettingsState();
      
      if (savedState) {
        hasSettingsUserEditsRef.current = true;
        // Restore from saved state
        setFormData(savedState.formData);
        setDataStructureFields(savedState.dataStructureFields);
        setSelectedCategoryId(savedState.selectedCategoryId);
        setSelectedIcon(savedState.selectedIcon);
        setVisibilityScope(savedState.visibilityScope || "all_company");
        setStartScope(savedState.startScope || "public");
        setVisibilityUsers(savedState.visibilityUsers || []);
        setVisibilityGroups(savedState.visibilityGroups || []);
        setStartUsers(savedState.startUsers || []);
        setStartGroups(savedState.startGroups || []);
        setWorkflowStatuses(savedState.workflowStatuses);
        setDefaultStatusId(savedState.defaultStatusId);
        
        // Show a toast to inform user that unsaved changes were restored
        toast.info("Unsaved changes have been restored");
      } else {
        hasSettingsUserEditsRef.current = false;
        const workflowDataTyped = await api.get<any>(
          `/api/companies/${companyId}/workflows/${id}`
        );

        setFormData({
          name: workflow.name,
          description: workflow.description || "",
          is_public: workflowDataTyped?.start_permission_scope
            ? workflowDataTyped.start_permission_scope === "public"
            : (workflowDataTyped?.is_public || false),
          api_enabled: workflowDataTyped?.api_enabled || false,
          is_active: workflowDataTyped?.is_active ?? true,
          portal_enabled: workflowDataTyped?.portal_enabled || false
        });
        setSelectedCategoryId(workflowDataTyped?.category_id || null);
        setSelectedIcon(workflowDataTyped?.icon || null);

        // Load data structure fields
        const fields = (workflowDataTyped?.data_structure as any[]) || [];
        setDataStructureFields(fields
          .map((f: any) => ({
            id: f.id || crypto.randomUUID(),
            data_structure_id: "",
            parent_item_id: f.parent_item_id || null,
            name: f.name,
            description: f.description || null,
            field_type: f.field_type,
            options: f.options || null,
            position: f.position ?? 0,
            options_source: f.options_source || (f.options ? "static" : undefined),
            api_configuration_id: f.api_configuration_id || null,
            api_query_params: f.api_query_params || undefined,
          }))
          .sort((a, b) => {
            if (!a.parent_item_id && !b.parent_item_id) {
              return a.position - b.position;
            }
            return 0;
          }));

        setVisibilityScope(
          workflowDataTyped?.visibility_scope === "specific" ? "specific" : "all_company"
        );
        setStartScope(
          workflowDataTyped?.start_permission_scope === "specific" ? "specific" : "public"
        );

        const permissions = await api.get<{ user_id: string | null; group_id: string | null; permission_type: string }[]>(
          `/api/companies/${companyId}/workflows/${id}/permissions`
        );
        const visibilityPermissionTypes = new Set(["visibility", "view"]);
        const startPermissionTypes = new Set(["start", "execute"]);

        setVisibilityUsers(
          permissions
            ?.filter((p) => p.user_id && visibilityPermissionTypes.has(p.permission_type))
            .map((p) => p.user_id!) || []
        );
        setVisibilityGroups(
          permissions
            ?.filter((p) => p.group_id && visibilityPermissionTypes.has(p.permission_type))
            .map((p) => p.group_id!) || []
        );
        setStartUsers(
          permissions
            ?.filter((p) => p.user_id && startPermissionTypes.has(p.permission_type))
            .map((p) => p.user_id!) || []
        );
        setStartGroups(
          permissions
            ?.filter((p) => p.group_id && startPermissionTypes.has(p.permission_type))
            .map((p) => p.group_id!) || []
        );

        // Fetch workflow statuses
        await fetchWorkflowStatuses(id);
      }
      
      const validTabs = ["general", "data-structure", "status"] as const;
      setSettingsTab(initialTab && validTabs.includes(initialTab) ? initialTab : "general");
      setSettingsDialogOpen(true);
    } catch (error) {
      console.error("Error loading workflow settings:", error);
      toast.error("Failed to load workflow settings");
    }
  };

  const openDataStructureEditor = () => {
    if (selectedStep) setReturnToStepIdAfterSettingsClose(selectedStep.id);
    setSelectedStep(null);
    openSettingsDialog("data-structure");
  };

  const handleSaveSettings = async () => {
    if (!id || !companyId) return;

    try {
      await api.patch(`/api/companies/${companyId}/workflows/${id}`, {
        name: formData.name,
        description: formData.description,
        is_public: startScope === "public",
        visibility_scope: visibilityScope,
        start_permission_scope: startScope,
        api_enabled: formData.api_enabled,
        is_active: formData.is_active,
        portal_enabled: formData.portal_enabled,
        category_id: selectedCategoryId || null,
        icon: selectedIcon,
        data_structure: dataStructureFields,
      });

      await updateWorkflowPermissions(id);

      // Update workflow in local state
      setWorkflow({
        ...workflow!,
        name: formData.name,
        description: formData.description,
        data_structure: dataStructureFields,
      });

      // Clear saved state after successful save
      hasSettingsUserEditsRef.current = false;
      clearSettingsState();

      toast.success(t("workflowEditor.workflowSettingsSaved"));
      setSettingsDialogOpen(false);
    } catch (error: any) {
      console.error("Error saving workflow settings:", error);
      toast.error(`${t("workflowEditor.failedToSaveSettings")}: ${error.message || 'Unknown error'}`);
    }
  };

  // Data structure field functions
  const handleAddField = () => {
    setFieldFormData({
      name: "",
      description: "",
      field_type: "text",
      options: "",
      parent_item_id: "",
      options_source: "static",
      api_configuration_id: null,
      use_query_params: false,
      api_query_params: [],
    });
    setEditingFieldId(null);
    setAddingNewFieldParentId(null);
    setFieldDescriptionOpen(false);
  };

  const handleEditField = (field: DataStructureField) => {
    const fieldType = field.parent_item_id && (field.field_type === "signature" || field.field_type === "array")
      ? "text"
      : field.field_type;

    const queryParams = field.api_query_params || [];
    const parsedQueryParams = queryParams.map((p: any) => ({
      key: p.key || "",
      value: p.value || "",
      mode: p.value?.startsWith("{{") ? "bind" : "static"
    }));

    setFieldFormData({
      name: field.name,
      description: field.description || "",
      field_type: fieldType,
      options: field.options?.join(", ") || "",
      parent_item_id: field.parent_item_id || "",
      options_source: field.options_source || "static",
      api_configuration_id: field.api_configuration_id || null,
      use_query_params: parsedQueryParams.length > 0,
      api_query_params: parsedQueryParams.length > 0 ? parsedQueryParams : [],
    });
    setEditingFieldId(field.id);
    setAddingNewFieldParentId(undefined);
    setFieldDescriptionOpen(!!(field.description?.trim()));
  };

  const handleCloseFieldDialog = () => {
    setAddingNewFieldParentId(undefined);
    setEditingFieldId(null);
    setFieldDescriptionOpen(false);
    setFieldFormData({
      name: "",
      description: "",
      field_type: "text",
      options: "",
      parent_item_id: "",
      options_source: "static",
      api_configuration_id: null,
      use_query_params: false,
      api_query_params: [],
    });
  };

  const handleSubmitField = (e: React.FormEvent) => {
    e.preventDefault();

    if (fieldFormData.parent_item_id && (fieldFormData.field_type === "signature" || fieldFormData.field_type === "array")) {
      toast.error(t("workflowEditor.cannotAddFileTypes"));
      return;
    }

    let position: number;
    if (editingFieldId) {
      const existingField = dataStructureFields.find(f => f.id === editingFieldId);
      position = existingField?.position ?? 0;
    } else {
      if (fieldFormData.parent_item_id) {
        const siblings = dataStructureFields.filter(f => f.parent_item_id === fieldFormData.parent_item_id);
        const maxSiblingPosition = siblings.length > 0
          ? Math.max(...siblings.map(f => f.position))
          : -1;
        position = maxSiblingPosition + 1;
      } else {
        const topLevelFields = dataStructureFields.filter(f => !f.parent_item_id);
        const maxTopLevelPosition = topLevelFields.length > 0
          ? Math.max(...topLevelFields.map(f => f.position))
          : -1;
        position = maxTopLevelPosition + 1;
      }
    }

    const fieldData: DataStructureField = {
      id: editingFieldId || crypto.randomUUID(),
      data_structure_id: "",
      name: fieldFormData.name,
      description: fieldFormData.description || null,
      field_type: fieldFormData.field_type,
      parent_item_id: fieldFormData.parent_item_id || null,
      options: (fieldFormData.field_type === "option" || fieldFormData.field_type === "multiple_option") && fieldFormData.options_source === "static" && fieldFormData.options
        ? fieldFormData.options.split(",").map(o => o.trim()).filter(Boolean)
        : null,
      position: position,
      options_source: (fieldFormData.field_type === "option" || fieldFormData.field_type === "multiple_option") ? (fieldFormData.options_source || "static") : undefined,
      api_configuration_id: (fieldFormData.field_type === "option" || fieldFormData.field_type === "multiple_option") && fieldFormData.options_source === "dynamic" ? (fieldFormData.api_configuration_id || null) : null,
      api_query_params: (fieldFormData.field_type === "option" || fieldFormData.field_type === "multiple_option") && fieldFormData.options_source === "dynamic" && fieldFormData.use_query_params && fieldFormData.api_query_params
        ? fieldFormData.api_query_params.filter(p => p.key.trim())
        : undefined,
    };

    if (editingFieldId) {
      setDataStructureFields(prev =>
        prev.map(f => f.id === editingFieldId ? { ...f, ...fieldData } : f)
      );
    } else {
      setDataStructureFields(prev => [...prev, fieldData]);
    }

    setAddingNewFieldParentId(undefined);
    setEditingFieldId(null);
    setFieldDescriptionOpen(false);
    setFieldFormData({
      name: "",
      description: "",
      field_type: "text",
      options: "",
      parent_item_id: "",
      options_source: "static",
      api_configuration_id: null,
      use_query_params: false,
      api_query_params: [],
    });
  };

  const handleDeleteField = (fieldId: string) => {
    setDataStructureFields(prev =>
      prev.filter(f => f.id !== fieldId && f.parent_item_id !== fieldId)
    );
  };

  const handleAddSubItem = (parentId: string) => {
    setFieldFormData({
      name: "",
      description: "",
      field_type: "text",
      options: "",
      parent_item_id: parentId,
      options_source: "static",
      api_configuration_id: null,
      use_query_params: false,
      api_query_params: [],
    });
    setEditingFieldId(null);
    setAddingNewFieldParentId(parentId);
    setFieldDescriptionOpen(false);
  };

  const handleDragStart = (e: React.DragEvent, fieldId: string, parentId: string | null = null) => {
    setDraggedFieldId(fieldId);
    setDraggedParentId(parentId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, index: number, parentId: string | null = null) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
    setDragOverParentId(parentId);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
    setDragOverParentId(null);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number, targetParentId: string | null = null) => {
    e.preventDefault();
    setDragOverIndex(null);
    setDragOverParentId(null);

    if (!draggedFieldId) return;

    if (draggedParentId !== targetParentId) {
      setDraggedFieldId(null);
      setDraggedParentId(null);
      return;
    }

    if (targetParentId === null) {
      const topLevelFields = dataStructureFields
        .filter(f => !f.parent_item_id)
        .sort((a, b) => a.position - b.position);

      const draggedIndex = topLevelFields.findIndex(f => f.id === draggedFieldId);

      if (draggedIndex === -1 || draggedIndex === targetIndex) {
        setDraggedFieldId(null);
        setDraggedParentId(null);
        return;
      }

      const reorderedFields = [...topLevelFields];
      const [removed] = reorderedFields.splice(draggedIndex, 1);
      reorderedFields.splice(targetIndex, 0, removed);

      const updatedFields = dataStructureFields.map(field => {
        if (field.parent_item_id) {
          return field;
        }

        const newIndex = reorderedFields.findIndex(f => f.id === field.id);
        if (newIndex !== -1) {
          return { ...field, position: newIndex };
        }
        return field;
      });

      setDataStructureFields(updatedFields);
    } else {
      const childFields = dataStructureFields
        .filter(f => f.parent_item_id === targetParentId)
        .sort((a, b) => a.position - b.position);

      const draggedIndex = childFields.findIndex(f => f.id === draggedFieldId);

      if (draggedIndex === -1 || draggedIndex === targetIndex) {
        setDraggedFieldId(null);
        setDraggedParentId(null);
        return;
      }

      const reorderedChildren = [...childFields];
      const [removed] = reorderedChildren.splice(draggedIndex, 1);
      reorderedChildren.splice(targetIndex, 0, removed);

      const updatedFields = dataStructureFields.map(field => {
        if (field.parent_item_id === targetParentId) {
          const newIndex = reorderedChildren.findIndex(f => f.id === field.id);
          if (newIndex !== -1) {
            return { ...field, position: newIndex };
          }
        }
        return field;
      });

      setDataStructureFields(updatedFields);
    }

    setDraggedFieldId(null);
    setDraggedParentId(null);
  };

  const handleDragEnd = () => {
    setDraggedFieldId(null);
    setDraggedParentId(null);
    setDragOverIndex(null);
    setDragOverParentId(null);
  };

  // Status functions
  const handleAddStatus = () => {
    setEditingStatusId(null);
    setStatusFormData({
      name: "",
      color: "#3b82f6",
    });
    setIsStatusDialogOpen(true);
  };

  const handleEditStatus = (status: WorkflowStatus) => {
    setEditingStatusId(status.id);
    setStatusFormData({
      name: status.name,
      color: status.color,
    });
    setIsStatusDialogOpen(true);
  };

  const handleDeleteStatus = async (statusId: string) => {
    if (!confirm(t("workflowEditor.deleteStatusConfirm")) || !companyId || !id) return;
    try {
      await api.delete(
        `/api/companies/${companyId}/workflows/${id}/statuses/${statusId}`
      );
      setWorkflowStatuses((prev) => prev.filter((s) => s.id !== statusId));
      toast.success(t("workflowEditor.statusDeleted"));
    } catch (error) {
      console.error("Error deleting status:", error);
      toast.error(t("workflowEditor.failedToDeleteStatus"));
    }
  };

  const handleSubmitStatus = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!id) {
      toast.error(t("workflowEditor.noWorkflowSelected"));
      return;
    }

    if (!statusFormData.name.trim()) {
      toast.error(t("workflowEditor.statusNameRequired"));
      return;
    }

    if (!companyId) return;
    try {
      if (editingStatusId) {
        await api.patch(
          `/api/companies/${companyId}/workflows/${id}/statuses/${editingStatusId}`,
          { name: statusFormData.name, color: statusFormData.color }
        );
        setWorkflowStatuses((prev) =>
          prev.map((s) =>
            s.id === editingStatusId
              ? { ...s, name: statusFormData.name, color: statusFormData.color }
              : s
          )
        );
        toast.success(t("workflowEditor.statusUpdated"));
      } else {
        const maxOrder =
          workflowStatuses.length > 0
            ? Math.max(...workflowStatuses.map((s) => s.order))
            : -1;
        const data = await api.post(
          `/api/companies/${companyId}/workflows/${id}/statuses`,
          {
            name: statusFormData.name,
            color: statusFormData.color,
            order: maxOrder + 1,
          }
        );
        setWorkflowStatuses((prev) => [...prev, data]);
        toast.success(t("workflowEditor.statusCreated"));
      }

      setIsStatusDialogOpen(false);
      setEditingStatusId(null);
      setStatusFormData({ name: "", color: DEFAULT_STATUS_COLOR });
    } catch (error: any) {
      console.error("Error saving status:", error);
      toast.error(`${t("workflowEditor.failedToSaveStatus")}: ${error.message || 'Unknown error'}`);
    }
  };

  const handleSetDefaultStatus = async (statusId: string) => {
    if (!id || !companyId) return;
    try {
      await api.patch(`/api/companies/${companyId}/workflows/${id}`, {
        default_status_id: statusId,
      });
      setDefaultStatusId(statusId);
      toast.success(t("workflowEditor.defaultStatusUpdated"));
    } catch (error) {
      console.error("Error setting default status:", error);
      toast.error(t("workflowEditor.failedToSetDefault"));
    }
  };

  const handleStatusDragStart = (e: React.DragEvent, statusId: string) => {
    setDraggedStatusId(statusId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleStatusDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverStatusIndex(index);
  };

  const handleStatusDragLeave = () => {
    setDragOverStatusIndex(null);
  };

  const handleStatusDrop = async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    setDragOverStatusIndex(null);

    if (!draggedStatusId || !id) return;

    const statuses = [...workflowStatuses].sort((a, b) => a.order - b.order);
    const draggedIndex = statuses.findIndex(s => s.id === draggedStatusId);

    if (draggedIndex === -1 || draggedIndex === targetIndex) {
      setDraggedStatusId(null);
      return;
    }

    const reordered = [...statuses];
    const [removed] = reordered.splice(draggedIndex, 1);
    reordered.splice(targetIndex, 0, removed);

    // Update orders
    const updates = reordered.map((status, index) => ({
      id: status.id,
      order: index,
    }));

    if (!companyId) return;
    try {
      await Promise.all(
        updates.map((update) =>
          api.patch(
            `/api/companies/${companyId}/workflows/${id}/statuses/${update.id}`,
            { order: update.order }
          )
        )
      );
      setWorkflowStatuses(reordered.map((status, index) => ({ ...status, order: index })));
    } catch (error) {
      console.error("Error reordering statuses:", error);
      toast.error("Failed to reorder statuses");
    }

    setDraggedStatusId(null);
  };

  const handleStatusDragEnd = () => {
    setDraggedStatusId(null);
    setDragOverStatusIndex(null);
  };

  const updateWorkflowPermissions = async (workflowId: string) => {
    if (!companyId) return;
    const list = await api.get<{ id: string }[]>(
      `/api/companies/${companyId}/workflows/${workflowId}/permissions`
    );
    for (const p of list || []) {
      await api.delete(
        `/api/companies/${companyId}/workflows/${workflowId}/permissions/${p.id}`
      );
    }
    const base = `/api/companies/${companyId}/workflows/${workflowId}/permissions`;
    if (visibilityScope === "specific") {
      for (const userId of visibilityUsers) {
        await api.post(base, { user_id: userId, permission_type: "visibility" });
      }
      for (const groupId of visibilityGroups) {
        await api.post(base, { group_id: groupId, permission_type: "visibility" });
      }
    }
    if (startScope === "specific") {
      for (const userId of startUsers) {
        await api.post(base, { user_id: userId, permission_type: "start" });
      }
      for (const groupId of startGroups) {
        await api.post(base, { group_id: groupId, permission_type: "start" });
      }
    }
  };

  // Filter steps based on search query
  const filteredSteps = useMemo(() => {
    if (!searchQuery.trim()) {
      return steps;
    }
    const query = searchQuery.toLowerCase();
    return steps.filter(step => 
      step.name.toLowerCase().includes(query) ||
      step.step_type.toLowerCase().includes(query)
    );
  }, [steps, searchQuery]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">{t("workflowEditor.loadingWorkflow")}</div>
      </div>
    );
  }

  if (!workflow) return null;

  const renderInlineFieldForm = () => (
    <div className="border rounded-lg bg-card p-3 space-y-3" data-inline-field-form="v2">
      <form onSubmit={handleSubmitField} className="space-y-3">
        <div className="flex gap-3 items-end">
          <div className="flex-1 min-w-0">
            <Label htmlFor="field-name" className="text-xs">{t("workflowEditor.fieldName")}</Label>
            <Input
              id="field-name"
              value={fieldFormData.name}
              onChange={(e) => setFieldFormData({ ...fieldFormData, name: e.target.value })}
              required
              className="h-8 mt-0.5"
            />
          </div>
          <div className="w-40 flex-shrink-0">
            <Label htmlFor="field-type" className="text-xs">{t("workflowEditor.fieldType")}</Label>
            <Popover open={fieldTypeComboboxOpen} onOpenChange={setFieldTypeComboboxOpen}>
              <PopoverTrigger asChild>
                <Button
                  id="field-type"
                  variant="outline"
                  role="combobox"
                  aria-expanded={fieldTypeComboboxOpen}
                  className="h-8 mt-0.5 w-full justify-between font-normal"
                >
                  {FIELD_TYPES.find((t) => t.value === fieldFormData.field_type)?.label ?? fieldFormData.field_type}
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                <Command>
                  <CommandInput placeholder={t("workflowEditor.searchFieldType") ?? "Search type..."} className="h-9" />
                  <CommandList>
                    <CommandEmpty>{t("workflowEditor.noFieldTypeFound") ?? "No type found."}</CommandEmpty>
                    <CommandGroup>
                      {FIELD_TYPES
                        .filter((type) => {
                          if (fieldFormData.parent_item_id) {
                            return type.value !== "signature" && type.value !== "array";
                          }
                          return true;
                        })
                        .map((type) => (
                          <CommandItem
                            key={type.value}
                            value={type.label}
                            onSelect={() => {
                              setFieldFormData({ ...fieldFormData, field_type: type.value });
                              setFieldTypeComboboxOpen(false);
                            }}
                          >
                            {type.label}
                            {fieldFormData.field_type === type.value ? (
                              <Check className="ml-auto h-4 w-4" />
                            ) : null}
                          </CommandItem>
                        ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </div>
        <Collapsible open={fieldDescriptionOpen} onOpenChange={setFieldDescriptionOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground py-0.5"
            >
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${fieldDescriptionOpen ? "rotate-180" : ""}`} />
              {t("workflowEditor.fieldDescription")}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Textarea
              id="field-description"
              value={fieldFormData.description}
              onChange={(e) => setFieldFormData({ ...fieldFormData, description: e.target.value })}
              rows={2}
              className="mt-1.5 min-h-0 text-sm"
            />
          </CollapsibleContent>
        </Collapsible>
        {(fieldFormData.field_type === "option" || fieldFormData.field_type === "multiple_option") && (
          <>
            <div>
              <Label>Options Source</Label>
              <Select
                value={fieldFormData.options_source || "static"}
                onValueChange={(value: "static" | "dynamic") => {
                  setFieldFormData({
                    ...fieldFormData,
                    options_source: value,
                    api_configuration_id: value === "static" ? null : fieldFormData.api_configuration_id
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="static">Static (Define options manually)</SelectItem>
                  <SelectItem value="dynamic">Dynamic (Fetch from API)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {fieldFormData.options_source === "static" ? (
              <div>
                <Label htmlFor="field-options">Options (comma-separated)</Label>
                <Input
                  id="field-options"
                  value={fieldFormData.options}
                  onChange={(e) => setFieldFormData({ ...fieldFormData, options: e.target.value })}
                  placeholder="Option 1, Option 2, Option 3"
                />
              </div>
            ) : (
              <div>
                <Label htmlFor="field-api-config">API Configuration</Label>
                <Select
                  value={fieldFormData.api_configuration_id || ""}
                  onValueChange={(value) => setFieldFormData({ ...fieldFormData, api_configuration_id: value || null })}
                >
                  <SelectTrigger id="field-api-config">
                    <SelectValue placeholder="Select API configuration" />
                  </SelectTrigger>
                  <SelectContent>
                    {apiConfigurations.length === 0 ? (
                      <SelectItem value="" disabled>No API configurations available</SelectItem>
                    ) : (
                      apiConfigurations.map((config) => (
                        <SelectItem key={config.id} value={config.id}>
                          {config.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {'The API should return a JSON array of strings (e.g., ["Option 1", "Option 2"])'}
                </p>
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="field-use-query-params">Add additional query parameters</Label>
                    <Switch
                      id="field-use-query-params"
                      checked={fieldFormData.use_query_params || false}
                      onCheckedChange={(checked) => {
                        setFieldFormData({
                          ...fieldFormData,
                          use_query_params: checked,
                          api_query_params: checked && (!fieldFormData.api_query_params || fieldFormData.api_query_params.length === 0)
                            ? [{ key: "", value: "", mode: "static" }]
                            : fieldFormData.api_query_params || [],
                        });
                      }}
                    />
                  </div>
                  {fieldFormData.use_query_params && (
                    <div className="mt-4 space-y-2 border rounded-md p-3">
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-sm">Query Parameters</Label>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setFieldFormData({
                              ...fieldFormData,
                              api_query_params: [...(fieldFormData.api_query_params || []), { key: "", value: "", mode: "static" }],
                            });
                          }}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add Parameter
                        </Button>
                      </div>
                      {(fieldFormData.api_query_params || []).map((param, index) => (
                        <div key={index} className="space-y-2">
                          <div className="flex gap-2">
                            <Input
                              placeholder="Parameter key"
                              value={param.key}
                              onChange={(e) => {
                                const updated = [...(fieldFormData.api_query_params || [])];
                                updated[index].key = e.target.value;
                                setFieldFormData({ ...fieldFormData, api_query_params: updated });
                              }}
                              className="flex-1"
                            />
                            <Select
                              value={param.mode || "static"}
                              onValueChange={(value: "static" | "bind") => {
                                const updated = [...(fieldFormData.api_query_params || [])];
                                updated[index].mode = value;
                                if (value === "static") {
                                  updated[index].value = "";
                                } else {
                                  updated[index].value = "";
                                }
                                setFieldFormData({ ...fieldFormData, api_query_params: updated });
                              }}
                            >
                              <SelectTrigger className="w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="static">Static</SelectItem>
                                <SelectItem value="bind">Dynamic</SelectItem>
                              </SelectContent>
                            </Select>
                            {(fieldFormData.api_query_params || []).length > 1 && (
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                onClick={() => {
                                  const updated = (fieldFormData.api_query_params || []).filter((_, i) => i !== index);
                                  setFieldFormData({ ...fieldFormData, api_query_params: updated });
                                }}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                          {param.mode === "bind" ? (
                            <div className="flex gap-1">
                              <Input
                                placeholder="Select data to bind"
                                value={param.value.startsWith("{{") ? dataStructureFields.find(f => param.value === `{{${f.id}}}`)?.name || "Not found" : ""}
                                disabled
                                className="flex-1"
                              />
                              <Popover>
                                <PopoverTrigger asChild>
                                  <Button type="button" size="icon" variant="outline">
                                    <Link2 className="h-4 w-4" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-80">
                                  <div className="space-y-2">
                                    <Label className="text-xs font-medium">Bind to Data Structure Item</Label>
                                    <div className="max-h-60 overflow-y-auto space-y-1">
                                      {dataStructureFields
                                        .filter(f => f.id !== editingFieldId)
                                        .map((dsItem) => (
                                          <Button
                                            key={dsItem.id}
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="w-full justify-start text-xs"
                                            onClick={() => {
                                              const updated = [...(fieldFormData.api_query_params || [])];
                                              updated[index].value = `{{${dsItem.id}}}`;
                                              setFieldFormData({ ...fieldFormData, api_query_params: updated });
                                            }}
                                          >
                                            <div className="flex flex-col items-start">
                                              <span className="font-medium">{dsItem.name}</span>
                                              <span className="text-muted-foreground text-xs">{dsItem.field_type.replace("_", " ")}</span>
                                            </div>
                                          </Button>
                                        ))}
                                      {dataStructureFields.filter(f => f.id !== editingFieldId).length === 0 && (
                                        <p className="text-xs text-muted-foreground p-2">No data structure items available</p>
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
                              onChange={(e) => {
                                const updated = [...(fieldFormData.api_query_params || [])];
                                updated[index].value = e.target.value;
                                setFieldFormData({ ...fieldFormData, api_query_params: updated });
                              }}
                              className="flex-1"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" size="sm" onClick={handleCloseFieldDialog}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" size="sm">
            {editingFieldId ? t("common.update") : t("common.create")}
          </Button>
        </div>
      </form>
    </div>
  );

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <header className="border-b border-border bg-card px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <Button variant="ghost" size="icon" onClick={() => navigate("/workflows")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-semibold">{workflow.name}</h1>
            {workflow.description && (
              <p className="text-sm text-muted-foreground">{workflow.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Search Bar */}
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("workflowEditor.searchSteps")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-8"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 transform -translate-y-1/2 h-6 w-6"
                onClick={() => setSearchQuery("")}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
          {searchQuery && filteredSteps.length > 0 && (
            <span className="text-sm text-muted-foreground whitespace-nowrap">
              {filteredSteps.length} {filteredSteps.length === 1 ? t("workflowEditor.match") : t("workflowEditor.matches")}
            </span>
          )}
          <Button variant="outline" onClick={() => openSettingsDialog()} className="gap-2">
            <Settings className="h-4 w-4" />
            {t("workflowEditor.settings")}
          </Button>
          <Button onClick={handleSave} disabled={isSavingWorkflow} className="gap-2">
            <Save className="h-4 w-4" />
            {t("workflowEditor.saveWorkflow")}
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <Toolbar onAddStep={handleAddStep} />

        <div className="flex-1 relative overflow-hidden">
          <Canvas
            steps={steps}
            connections={connections}
            selectedStep={selectedStep}
            onSelectStep={setSelectedStep}
            onUpdateStep={handleUpdateStep}
            onDeleteStep={handleDeleteStep}
            onDuplicateStep={handleDuplicateStep}
            onAddConnection={handleAddConnection}
            onUpdateConnection={handleUpdateConnection}
            onDeleteConnection={handleDeleteConnection}
            comments={comments}
            onUpdateComments={setComments}
            highlightedStepId={searchQuery && filteredSteps.length > 0 ? filteredSteps[0].id : null}
          />
        </div>
      </div>

      <DecisionOutputsDialog
        open={decisionOutputsDialogOpen}
        initialOutputs={DEFAULT_DECISION_OUTPUTS}
        onCancel={() => setDecisionOutputsDialogOpen(false)}
        onConfirm={(outputs) => {
          addStep("decision", outputs);
          setDecisionOutputsDialogOpen(false);
        }}
      />

      {/* Unconnected ports warning (user can override). */}
      <Dialog
        open={unconnectedPortsDialogOpen}
        onOpenChange={(open) => {
          setUnconnectedPortsDialogOpen(open);
          if (!open) setUnconnectedPorts([]);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("workflowEditor.unconnectedPortsWarningTitle")}</DialogTitle>
            <DialogDescription>
              {t("workflowEditor.unconnectedPortsWarningDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              {t("workflowEditor.unconnectedPortsWarningCount", { count: unconnectedPorts.length })}
            </div>

            <ul className="list-disc pl-6 space-y-1">
              {unconnectedPorts.map((w) => (
                <li key={`${w.stepId}-${w.portType}-${w.outputName ?? "input"}`}>
                  <span className="font-medium">{w.stepName}</span>
                  {w.portType === "input" ? (
                    <>
                      {": "}
                      {t("workflowEditor.unconnectedPortsInputLabel")}
                    </>
                  ) : (
                    <>
                      {": "}
                      {t("workflowEditor.unconnectedPortsOutputLabel")} {w.outputName}
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setUnconnectedPortsDialogOpen(false)}
              disabled={isSavingWorkflow}
            >
              {t("common.cancel")}
            </Button>
            <Button type="button" onClick={handleSaveAnyway} disabled={isSavingWorkflow}>
              {t("workflowEditor.saveWorkflowAnyway")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!selectedStep}
        onOpenChange={(open) => {
          if (!open) {
            setReturnToFormTab(false);
            setSelectedStep(null);
          }
        }}
      >
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          {selectedStep && (
            <PropertiesPanel
              step={selectedStep}
              workflowId={workflow.id}
              dataStructure={workflow.data_structure}
              onUpdateStep={handleUpdateStep}
              onClose={() => {
                setReturnToFormTab(false);
                setSelectedStep(null);
              }}
              onOutputRenamed={handleOutputRenamed}
              onOpenDataStructureEditor={openDataStructureEditor}
              initialConfigurationSubTab={returnToFormTab ? "form" : undefined}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Settings Dialog */}
      <Dialog
        open={settingsDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            if (returnToStepIdAfterSettingsClose) {
              const step = steps.find((s) => s.id === returnToStepIdAfterSettingsClose);
              if (step) {
                setSelectedStep(step);
                setReturnToFormTab(true);
              }
              setReturnToStepIdAfterSettingsClose(null);
            }
          }
          setSettingsDialogOpen(open);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>{t("workflowEditor.title")}</DialogTitle>
            <DialogDescription>
              {t("workflowEditor.subtitle")}
            </DialogDescription>
          </DialogHeader>
          <Tabs value={settingsTab} onValueChange={(v) => setSettingsTab(v as typeof settingsTab)} className="flex-1 flex flex-col overflow-hidden">
            <div className="px-6 pt-2">
              <TabsList className="w-full grid grid-cols-3">
                <TabsTrigger value="general">{t("workflowEditor.general")}</TabsTrigger>
                <TabsTrigger value="data-structure">{t("workflowEditor.dataStructure")}</TabsTrigger>
                <TabsTrigger value="status">{t("workflowEditor.status")}</TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto py-4 px-6">
              <TabsContent value="general" className="space-y-6 mt-0 h-full">
                {/* Basic Information Section */}
                <div className="space-y-4">
                  <div className="border-b pb-2">
                    <h3 className="text-lg font-medium">{t("workflowEditor.basicInformation")}</h3>
                    <p className="text-sm text-muted-foreground">{t("workflowEditor.basicInformationDesc")}</p>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">{t("common.name")}</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="My Workflow"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="description">{t("common.description")}</Label>
                      <Textarea
                        id="description"
                        value={formData.description}
                        onChange={(e) =>
                          setFormData({ ...formData, description: e.target.value })
                        }
                        placeholder="Describe your workflow..."
                        rows={3}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t("workflowEditor.category")}</Label>
                      <Select
                        value={selectedCategoryId || "none"}
                        onValueChange={(value) =>
                          setSelectedCategoryId(value === "none" ? null : value)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t("workflowEditor.selectCategory")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t("workflowEditor.none")}</SelectItem>
                          {categories.map((cat) => (
                            <SelectItem key={cat.id} value={cat.id}>
                              {getCategoryPath(cat.id)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {t("workflowEditor.chooseCategory")}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>{t("workflowEditor.icon")}</Label>
                      <div className="w-full">
                        <IconPicker value={selectedIcon} onChange={setSelectedIcon} className="w-full" />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t("workflowEditor.chooseIcon")}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <Switch
                          id="is_active"
                          checked={formData.is_active ?? true}
                          onCheckedChange={(checked) => {
                            setFormData({ ...formData, is_active: checked as boolean });
                          }}
                        />
                        <label
                          htmlFor="is_active"
                          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                        >
                          {t("workflowEditor.active")}
                        </label>
                      </div>
                      <p className="text-xs text-muted-foreground ml-6">
                        {t("workflowEditor.activeDesc")}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Features Section */}
                <div className="space-y-4">
                  <div className="border-b pb-2">
                    <h3 className="text-lg font-medium">{t("workflowEditor.features")}</h3>
                    <p className="text-sm text-muted-foreground">{t("workflowEditor.featuresDesc")}</p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="api_enabled"
                        checked={formData.api_enabled || false}
                        onCheckedChange={(checked) => {
                          setFormData({ ...formData, api_enabled: checked as boolean });
                        }}
                      />
                      <label
                        htmlFor="api_enabled"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        {t("workflowEditor.enableApi")}
                      </label>
                    </div>
                    <p className="text-xs text-muted-foreground ml-6">
                      {t("workflowEditor.enableApiDesc")}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="portal_enabled"
                        checked={formData.portal_enabled || false}
                        onCheckedChange={(checked) => {
                          setFormData({ ...formData, portal_enabled: checked as boolean });
                        }}
                      />
                      <label
                        htmlFor="portal_enabled"
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        {t("workflowEditor.enablePortal")}
                      </label>
                    </div>
                    <p className="text-xs text-muted-foreground ml-6">
                      {t("workflowEditor.enablePortalDesc")}
                    </p>
                  </div>
                </div>

                {/* Permissions Section */}
                <div className="space-y-4">
                  <div className="border-b pb-2">
                    <h3 className="text-lg font-medium">{t("workflowEditor.permissions")}</h3>
                    <p className="text-sm text-muted-foreground">{t("workflowEditor.permissionsDesc")}</p>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">{t("workflowEditor.visibility")}</Label>
                      <RadioGroup
                        value={visibilityScope}
                        onValueChange={(value) => {
                          setVisibilityScope(value as "all_company" | "specific");
                        }}
                        className="space-y-2"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="all_company" id="visibility-all-company" />
                          <Label htmlFor="visibility-all-company" className="text-sm cursor-pointer">
                            {t("workflowEditor.allCompany")}
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="specific" id="visibility-specific" />
                          <Label htmlFor="visibility-specific" className="text-sm cursor-pointer">
                            {t("workflowEditor.specificUsersOrGroups")}
                          </Label>
                        </div>
                      </RadioGroup>
                    </div>

                    {visibilityScope === "specific" && (
                      <div className="pl-6 border-l-2 border-muted bg-muted/20 p-4 rounded-md">
                        <PermissionTargetPicker
                          users={users}
                          groups={groups}
                          selectedUsers={visibilityUsers}
                          selectedGroups={visibilityGroups}
                          onSelectedUsersChange={setVisibilityUsers}
                          onSelectedGroupsChange={setVisibilityGroups}
                          confirmBeforeRemove
                          labels={{
                            users: t("workflowEditor.visibleToUsers"),
                            groups: t("workflowEditor.visibleToGroups"),
                            usersPlaceholder: t("workflowEditor.selectUsers"),
                            groupsPlaceholder: t("workflowEditor.selectGroups"),
                          }}
                        />
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label className="text-sm font-medium">{t("workflowEditor.startPermission")}</Label>
                      <RadioGroup
                        value={startScope}
                        onValueChange={(value) => {
                          const nextScope = value as "public" | "specific";
                          setStartScope(nextScope);
                          setFormData({ ...formData, is_public: nextScope === "public" });
                        }}
                        className="space-y-2"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="public" id="start-public" />
                          <Label htmlFor="start-public" className="text-sm cursor-pointer">
                            {t("workflowEditor.allCompany")}
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="specific" id="start-specific" />
                          <Label htmlFor="start-specific" className="text-sm cursor-pointer">
                            {t("workflowEditor.specificUsersOrGroups")}
                          </Label>
                        </div>
                      </RadioGroup>
                    </div>

                    {startScope === "specific" && (
                      <div className="pl-6 border-l-2 border-muted bg-muted/20 p-4 rounded-md">
                        <PermissionTargetPicker
                          users={users}
                          groups={groups}
                          selectedUsers={startUsers}
                          selectedGroups={startGroups}
                          onSelectedUsersChange={setStartUsers}
                          onSelectedGroupsChange={setStartGroups}
                          confirmBeforeRemove
                          labels={{
                            users: t("workflowEditor.canStartUsers"),
                            groups: t("workflowEditor.canStartGroups"),
                            usersPlaceholder: t("workflowEditor.selectUsers"),
                            groupsPlaceholder: t("workflowEditor.selectGroups"),
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="data-structure" className="space-y-6 mt-0 h-full">
                <div className="space-y-4">
                  <div className="border-b pb-3">
                    <h3 className="text-lg font-medium">{t("workflowEditor.dataStructure")}</h3>
                    <p className="text-sm text-muted-foreground">{t("workflowEditor.dataStructureDesc")}</p>
                  </div>

                  {dataStructureFields.filter(f => !f.parent_item_id).length === 0 && addingNewFieldParentId === undefined ? (
                    <div className="text-center py-12 border-2 border-dashed rounded-lg bg-muted/30">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                          <Plus className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium text-sm mb-1">{t("workflowEditor.noFields")}</p>
                          <p className="text-sm text-muted-foreground mb-4">{t("workflowEditor.noFieldsDesc")}</p>
                        </div>
                        <Button type="button" variant="outline" onClick={handleAddField} className="gap-2">
                          <Plus className="h-4 w-4" />
                          {t("workflowEditor.addFirstField")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {dataStructureFields
                        .filter(f => !f.parent_item_id)
                        .sort((a, b) => a.position - b.position)
                        .map((field, fieldIndex) => {
                          const renderFieldCard = (item: DataStructureField, depth: number = 0, parentIndex?: number, childIndex?: number): React.ReactNode => {
                            const children = dataStructureFields
                              .filter(f => f.parent_item_id === item.id)
                              .sort((a, b) => a.position - b.position);

                            const parentId = item.parent_item_id;
                            const isTopLevel = depth === 0;
                            const currentIndex = isTopLevel ? fieldIndex : (childIndex ?? 0);

                            return (
                              <div key={item.id} className="space-y-2">
                                <div
                                  draggable={editingFieldId !== item.id}
                                  onDragStart={(e) => editingFieldId !== item.id && handleDragStart(e, item.id, parentId)}
                                  onDragOver={(e) => handleDragOver(e, currentIndex, parentId)}
                                  onDragLeave={handleDragLeave}
                                  onDrop={(e) => handleDrop(e, currentIndex, parentId)}
                                  onDragEnd={handleDragEnd}
                                  className={`border rounded-lg bg-card hover:bg-accent/50 transition-colors ${depth > 0 ? 'ml-8 border-l-2 border-l-primary/30' : ''
                                    } ${draggedFieldId === item.id ? 'opacity-50' : ''
                                    } ${dragOverIndex === currentIndex && dragOverParentId === parentId && draggedFieldId !== item.id
                                      ? 'border-primary border-2' : ''
                                    } ${editingFieldId === item.id ? '' : 'cursor-move'}`}
                                >
                                  {editingFieldId === item.id ? (
                                    renderInlineFieldForm()
                                  ) : (
                                    <div className="flex items-center justify-between p-4 gap-4">
                                      <div className="flex items-center text-muted-foreground cursor-grab active:cursor-grabbing flex-shrink-0">
                                        <GripVertical className="h-5 w-5" />
                                      </div>
                                      <div className="flex-1 min-w-0 space-y-2">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          {depth > 0 && (
                                            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                          )}
                                          <h4 className="font-semibold text-sm">{item.name}</h4>
                                          <Badge variant="secondary" className="text-xs font-normal">
                                            {item.field_type.replace("_", " ")}
                                          </Badge>
                                          {(item.field_type === "option" || item.field_type === "multiple_option") && (
                                            <>
                                              {item.options_source === "dynamic" ? (
                                                <Badge variant="outline" className="text-xs font-normal bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/20 dark:text-blue-300 dark:border-blue-800">
                                                  Dynamic
                                                </Badge>
                                              ) : (
                                                <Badge variant="outline" className="text-xs font-normal">
                                                  Static
                                                </Badge>
                                              )}
                                              {item.options_source === "dynamic" && item.api_configuration_id && (
                                                <Badge variant="outline" className="text-xs font-normal">
                                                  {apiConfigurations.find(c => c.id === item.api_configuration_id)?.name || "API Config"}
                                                </Badge>
                                              )}
                                            </>
                                          )}
                                        </div>
                                        {item.description && (
                                          <p className="text-sm text-muted-foreground leading-relaxed">
                                            {item.description}
                                          </p>
                                        )}
                                        {item.options && item.options.length > 0 && (
                                          <div className="flex flex-wrap gap-1.5 mt-2">
                                            <span className="text-xs text-muted-foreground font-medium">Options:</span>
                                            {item.options.map((option, idx) => (
                                              <Badge key={idx} variant="outline" className="text-xs font-normal">
                                                {option}
                                              </Badge>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1 flex-shrink-0">
                                        {item.field_type === "array" && (
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleAddSubItem(item.id)}
                                            className="gap-1.5 h-8 text-xs"
                                          >
                                            <Plus className="h-3.5 w-3.5" />
                                            {t("workflowEditor.addSubItem")}
                                          </Button>
                                        )}
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8"
                                          onClick={() => handleEditField(item)}
                                        >
                                          <Edit className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8 text-destructive hover:text-destructive"
                                          onClick={() => handleDeleteField(item.id)}
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                                {children.length > 0 && (
                                  <div className="space-y-2">
                                    {children.map((child, idx) => renderFieldCard(child, depth + 1, currentIndex, idx))}
                                  </div>
                                )}
                                {addingNewFieldParentId === item.id && (
                                  <div className={depth > 0 ? "ml-8" : ""}>
                                    {renderInlineFieldForm()}
                                  </div>
                                )}
                              </div>
                            );
                          };

                          return renderFieldCard(field);
                        })}
                      {addingNewFieldParentId === null && (
                        <div className="space-y-2">
                          {renderInlineFieldForm()}
                        </div>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddField}
                        className="gap-2 w-full sm:w-auto"
                      >
                        <Plus className="h-4 w-4" />
                        {t("workflowEditor.addField")}
                      </Button>
                    </div>
                  )}

                </div>
              </TabsContent>

              <TabsContent value="status" className="space-y-6 mt-0 h-full">
                <div className="space-y-4">
                  <div className="border-b pb-3 flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-medium">{t("workflowEditor.workflowStatuses")}</h3>
                      <p className="text-sm text-muted-foreground">{t("workflowEditor.workflowStatusesDesc")}</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddStatus}
                      className="gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      {t("workflowEditor.addStatus")}
                    </Button>
                  </div>

                  {workflowStatuses.length === 0 ? (
                    <div className="text-center py-12 border-2 border-dashed rounded-lg bg-muted/30">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                          <Plus className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{t("workflowEditor.noStatuses")}</p>
                          <p className="text-sm text-muted-foreground">{t("workflowEditor.noStatusesDesc")}</p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleAddStatus}
                          className="gap-2 mt-2"
                        >
                          <Plus className="h-4 w-4" />
                          {t("workflowEditor.addStatus")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {workflowStatuses.map((status, index) => (
                        <div
                          key={status.id}
                          draggable
                          onDragStart={(e) => handleStatusDragStart(e, status.id)}
                          onDragOver={(e) => handleStatusDragOver(e, index)}
                          onDragLeave={handleStatusDragLeave}
                          onDrop={(e) => handleStatusDrop(e, index)}
                          onDragEnd={handleStatusDragEnd}
                          className={`group relative flex items-center gap-3 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-move ${dragOverStatusIndex === index && draggedStatusId !== status.id
                            ? "border-primary border-2"
                            : ""
                            } ${draggedStatusId === status.id ? "opacity-50" : ""}`}
                        >
                          <GripVertical className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                          <div
                            className="w-4 h-4 rounded-full flex-shrink-0 border-2 border-background shadow-sm"
                            style={{ backgroundColor: getTagColors(status.color).dot }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold text-sm">{status.name}</h4>
                              {defaultStatusId === status.id && (
                                <Badge variant="secondary" className="text-xs flex items-center gap-1">
                                  <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                                  {t("workflowEditor.default")}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">{t("workflowEditor.order")}: {status.order + 1}</p>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className={`h-8 w-8 ${defaultStatusId === status.id ? 'text-yellow-500' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSetDefaultStatus(status.id);
                              }}
                              title={defaultStatusId === status.id ? t("workflowEditor.default") : t("workflowEditor.setAsDefault")}
                            >
                              <Star className={`h-3.5 w-3.5 ${defaultStatusId === status.id ? 'fill-yellow-500' : ''}`} />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleEditStatus(status)}
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => handleDeleteStatus(status.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Status Dialog */}
                  <Dialog open={isStatusDialogOpen} onOpenChange={setIsStatusDialogOpen}>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle>{editingStatusId ? t("workflowEditor.editStatus") : t("workflowEditor.addStatusTitle")}</DialogTitle>
                        <DialogDescription>
                          {editingStatusId ? t("workflowEditor.updateStatus") : t("workflowEditor.addStatusOption")}
                        </DialogDescription>
                      </DialogHeader>
                      <form onSubmit={handleSubmitStatus} className="space-y-4">
                        <div>
                          <Label htmlFor="status-name">{t("workflowEditor.statusName")}</Label>
                          <Input
                            id="status-name"
                            value={statusFormData.name}
                            onChange={(e) => setStatusFormData({ ...statusFormData, name: e.target.value })}
                            placeholder={t("workflowEditor.statusNamePlaceholder")}
                            required
                          />
                        </div>
                        <div>
                          <Label htmlFor="status-color">{t("workflowEditor.statusColor")}</Label>
                          <div className="flex flex-wrap gap-2 mt-1.5 mb-2">
                            {TAG_COLORS.map((preset) => (
                              <button
                                key={preset.id}
                                type="button"
                                title={preset.label}
                                className="h-8 w-8 rounded-full border-2 border-background shadow-sm transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                                style={{ backgroundColor: preset.dot }}
                                onClick={() => setStatusFormData({ ...statusFormData, color: preset.dot })}
                              />
                            ))}
                          </div>
                          <div className="flex items-center gap-3">
                            <Input
                              id="status-color"
                              type="color"
                              value={statusFormData.color}
                              onChange={(e) => setStatusFormData({ ...statusFormData, color: e.target.value })}
                              className="w-20 h-10 cursor-pointer"
                            />
                            <Input
                              type="text"
                              value={statusFormData.color}
                              onChange={(e) => setStatusFormData({ ...statusFormData, color: e.target.value })}
                              placeholder={DEFAULT_STATUS_COLOR}
                              pattern="^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$"
                              className="flex-1"
                            />
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {t("workflowEditor.chooseColor")}
                          </p>
                        </div>
                        <div className="flex justify-end gap-2 pt-4">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsStatusDialogOpen(false)}
                          >
                            {t("common.cancel")}
                          </Button>
                          <Button type="submit">
                            {editingStatusId ? t("common.update") : t("common.create")}
                          </Button>
                        </div>
                      </form>
                    </DialogContent>
                  </Dialog>
                </div>
              </TabsContent>
            </div>
          </Tabs>
          <DialogFooter className="flex-shrink-0 border-t pt-4">
            <Button variant="outline" onClick={() => setSettingsDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSaveSettings}>
              {t("common.update")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
