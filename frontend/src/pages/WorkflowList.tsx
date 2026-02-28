import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2, Copy, Key, Zap, Edit, ChevronRight, ChevronDown, GripVertical, Star, X, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { useCompanyId } from "@/hooks/useCompanyId";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useQueryClient } from "@tanstack/react-query";
import { CreateWorkflowDialog } from "@/components/workflow/CreateWorkflowDialog";
import { WorkflowAIChat } from "@/components/workflow/WorkflowAIChat";
import { CategoryDialog } from "@/components/workflow/CategoryDialog";
import { CategoryCard } from "@/components/workflow/CategoryCard";
import { CategoryBreadcrumb } from "@/components/workflow/CategoryBreadcrumb";
import { SearchResults } from "@/components/workflow/SearchResults";
import { IconPicker } from "@/components/workflow/IconPicker";
import { PermissionTargetPicker } from "@/components/workflow/PermissionTargetPicker";
import { FolderPlus, MoreVertical, Workflow as WorkflowIcon, Folder } from "lucide-react";
import { renderIcon } from "@/lib/iconUtils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Workflow {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  step_count?: number;
  category_id: string | null;
  icon: string | null;
  is_active?: boolean;
  visibility_scope?: "all_company" | "specific";
  start_permission_scope?: "public" | "specific";
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

type KeyValuePairWithMode = { key: string; value: string; mode?: "static" | "bind" };

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
  api_query_params?: KeyValuePairWithMode[];
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
  api_query_params?: KeyValuePairWithMode[];
};

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
  { value: "multiple_files", label: "Multiple Files" },
  { value: "html", label: "HTML" },
  { value: "signature", label: "Handwritten Signature" },
];

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

interface Company {
  id: string;
  name: string;
}

type StatusFormData = {
  name: string;
  color: string;
};

type PendingStatus = {
  tempId: string;
  name: string;
  color: string;
  order: number;
};

export default function WorkflowList() {
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const companyId = useCompanyId();
  const { isSuperAdmin } = useAuth();
  const dateLocale = language === "fr" ? fr : enUS;
  const queryClient = useQueryClient();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [allWorkflows, setAllWorkflows] = useState<Workflow[]>([]); // All workflows for counting
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);
  const [workflowToDelete, setWorkflowToDelete] = useState<Workflow | null>(null);
  const [formData, setFormData] = useState({ name: "", description: "", is_public: true, api_enabled: false });
  const [dataStructureFields, setDataStructureFields] = useState<DataStructureField[]>([]);
  const [addingNewFieldParentId, setAddingNewFieldParentId] = useState<string | null | undefined>(undefined);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [fieldDescriptionOpen, setFieldDescriptionOpen] = useState(false);
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
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [visibilityScope, setVisibilityScope] = useState<"all_company" | "specific">("all_company");
  const [startScope, setStartScope] = useState<"public" | "specific">("public");
  const [visibilityUsers, setVisibilityUsers] = useState<string[]>([]);
  const [visibilityGroups, setVisibilityGroups] = useState<string[]>([]);
  const [startUsers, setStartUsers] = useState<string[]>([]);
  const [startGroups, setStartGroups] = useState<string[]>([]);
  const [showWorkflowId, setShowWorkflowId] = useState<string | null>(null);
  const [draggedFieldId, setDraggedFieldId] = useState<string | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [draggedParentId, setDraggedParentId] = useState<string | null>(null);
  const [dragOverParentId, setDragOverParentId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showAIChat, setShowAIChat] = useState(false);
  const [categories, setCategories] = useState<WorkflowCategory[]>([]);
  const [currentCategoryId, setCurrentCategoryId] = useState<string | null>(null);
  const [categoryBreadcrumb, setCategoryBreadcrumb] = useState<WorkflowCategory[]>([]);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<WorkflowCategory | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedIcon, setSelectedIcon] = useState<string | null>(null);
  const [isCategoriesStuck, setIsCategoriesStuck] = useState(false);
  const [apiConfigurations, setApiConfigurations] = useState<Array<{ id: string; name: string }>>([]);
  const categoriesStickyRef = useRef<HTMLDivElement>(null);
  const categoriesSentinelRef = useRef<HTMLDivElement>(null);
  const [draggedWorkflowId, setDraggedWorkflowId] = useState<string | null>(null);
  const [dragOverCategoryId, setDragOverCategoryId] = useState<string | null | undefined>(undefined);

  // Duplicate to company (super admin)
  const [duplicateToCompanyDialogOpen, setDuplicateToCompanyDialogOpen] = useState(false);
  const [workflowToDuplicate, setWorkflowToDuplicate] = useState<Workflow | null>(null);
  const [duplicateTargetCompanyId, setDuplicateTargetCompanyId] = useState<string>("");
  const [allCompanies, setAllCompanies] = useState<Company[]>([]);
  const [loadingCompaniesForDuplicate, setLoadingCompaniesForDuplicate] = useState(false);

  // Workflow Status State
  const [workflowStatuses, setWorkflowStatuses] = useState<WorkflowStatus[]>([]);
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null);
  const [statusFormData, setStatusFormData] = useState<StatusFormData>({
    name: "",
    color: "#3b82f6",
  });
  const [draggedStatusId, setDraggedStatusId] = useState<string | null>(null);
  const [dragOverStatusIndex, setDragOverStatusIndex] = useState<number | null>(null);
  const [defaultStatusId, setDefaultStatusId] = useState<string | null>(null);
  const [pendingStatuses, setPendingStatuses] = useState<PendingStatus[]>([]);
  const [editingPendingStatusId, setEditingPendingStatusId] = useState<string | null>(null);
  const prevCompanyIdRef = useRef<string | null>(companyId);

  // When company changes, go back to root and reload workflows for the new company
  useEffect(() => {
    if (companyId) {
      setCurrentCategoryId(null);
      fetchWorkflows(null);
      fetchAllWorkflows(); // Fetch all workflows for counting
      fetchCategories();
      fetchUsers();
      fetchGroups();
      fetchApiConfigurations();
    }
  }, [companyId]);

  // Fetch all companies when opening duplicate-to-company dialog (super admin only)
  useEffect(() => {
    if (duplicateToCompanyDialogOpen && isSuperAdmin) {
      setLoadingCompaniesForDuplicate(true);
      api
        .get<{ id: string; name: string }[]>("/api/companies")
        .then((data) => setAllCompanies(data || []))
        .catch((err) => {
          console.error("Error fetching companies for duplicate:", err);
          toast.error("Failed to load companies");
        })
        .finally(() => setLoadingCompaniesForDuplicate(false));
    }
  }, [duplicateToCompanyDialogOpen, isSuperAdmin]);

  // Refetch filtered workflows when category changes (same company only; company change is handled above)
  useEffect(() => {
    if (companyId && prevCompanyIdRef.current === companyId) {
      fetchWorkflows();
    }
    prevCompanyIdRef.current = companyId;
  }, [currentCategoryId, companyId]);

  // Update breadcrumb when current category changes
  useEffect(() => {
    if (currentCategoryId === null) {
      setCategoryBreadcrumb([]);
      return;
    }

    const buildBreadcrumb = (categoryId: string | null): WorkflowCategory[] => {
      if (!categoryId) return [];

      const category = categories.find((c) => c.id === categoryId);
      if (!category) return [];

      const path = buildBreadcrumb(category.parent_category_id);
      path.push(category);
      return path;
    };

    setCategoryBreadcrumb(buildBreadcrumb(currentCategoryId));
  }, [currentCategoryId, categories]);

  // Detect when categories section is stuck using Intersection Observer
  useEffect(() => {
    const subcategories = categories.filter((c) => c.parent_category_id === currentCategoryId);

    if (subcategories.length === 0) {
      setIsCategoriesStuck(false);
      return;
    }

    // Wait for DOM to be ready before setting up observer
    let observer: IntersectionObserver | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    let retryTimeoutId: NodeJS.Timeout | null = null;
    let retryCount = 0;
    const maxRetries = 10;
    let scrollCleanup: (() => void) | null = null;

    const checkStuckState = () => {
      if (categoriesSentinelRef.current) {
        const sentinelRect = categoriesSentinelRef.current.getBoundingClientRect();
        setIsCategoriesStuck(sentinelRect.top < 0);
      }
    };

    const setupObserver = () => {
      if (!categoriesSentinelRef.current) {
        // Retry if element not ready yet (max 10 retries = 500ms)
        if (retryCount < maxRetries) {
          retryCount++;
          retryTimeoutId = setTimeout(setupObserver, 50);
        }
        return;
      }

      // Check initial state
      checkStuckState();

      observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            // When sentinel is not intersecting (scrolled past), categories are stuck
            setIsCategoriesStuck(!entry.isIntersecting);
          });
        },
        {
          // Use a small rootMargin to trigger slightly before the sentinel leaves viewport
          rootMargin: '0px',
          threshold: 0,
        }
      );

      observer.observe(categoriesSentinelRef.current);

      // Add scroll listener as fallback
      window.addEventListener('scroll', checkStuckState, { passive: true });
      scrollCleanup = () => {
        window.removeEventListener('scroll', checkStuckState);
      };
    };

    // Use requestAnimationFrame to ensure DOM is ready, with fallback timeout
    const rafId = requestAnimationFrame(() => {
      timeoutId = setTimeout(() => {
        setupObserver();
      }, 100);
    });

    return () => {
      cancelAnimationFrame(rafId);
      if (timeoutId) clearTimeout(timeoutId);
      if (retryTimeoutId) clearTimeout(retryTimeoutId);
      if (observer) observer.disconnect();
      if (scrollCleanup) scrollCleanup();
    };
  }, [categories, currentCategoryId]);


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
      toast.error("Failed to load users");
    }
  };

  const fetchGroups = async () => {
    if (!companyId) return;
    try {
      const data = await api.get<{ id: string; name: string; description: string | null }[]>(
        `/api/companies/${companyId}/groups`
      );
      setGroups(data || []);
    } catch (error) {
      console.error("Error fetching groups:", error);
      toast.error("Failed to load groups");
    }
  };

  const fetchApiConfigurations = async () => {
    if (!companyId) return;
    try {
      const data = await api.get<{ id: string; name: string; config_type?: string }[]>(
        `/api/companies/${companyId}/api-configurations`
      );
      const filtered = (data || []).filter((c) => c.config_type === "dynamic_options");
      setApiConfigurations(filtered);
    } catch (error) {
      console.error("Error fetching API configurations:", error);
      toast.error("Failed to load API configurations");
    }
  };

  const fetchWorkflowStatuses = async (workflowId: string) => {
    if (!companyId) return;
    try {
      const [statuses, workflow] = await Promise.all([
        api.get<any[]>(`/api/companies/${companyId}/workflows/${workflowId}/statuses`),
        api.get<{ default_status_id: string | null }>(
          `/api/companies/${companyId}/workflows/${workflowId}`
        ),
      ]);
      setWorkflowStatuses(statuses || []);
      setDefaultStatusId(workflow?.default_status_id ?? null);
    } catch (error) {
      console.error("Error fetching workflow statuses:", error);
      toast.error("Failed to load workflow statuses");
    }
  };

  const fetchCategories = async () => {
    if (!companyId) return;
    try {
      const data = await api.get<any[]>(`/api/companies/${companyId}/workflow-categories`);
      setCategories(data || []);
    } catch (error) {
      console.error("Error fetching categories:", error);
      toast.error("Failed to load categories");
    }
  };

  const fetchAllWorkflows = async () => {
    if (!companyId) return;
    try {
      const workflowsWithCounts = await api.get<any[]>(
        `/api/companies/${companyId}/workflows`
      );
      setAllWorkflows(workflowsWithCounts || []);
    } catch (error) {
      console.error("Error fetching all workflows:", error);
      toast.error("Failed to load workflows");
    }
  };

  const fetchWorkflows = async (overrideCategoryId?: string | null) => {
    if (!companyId) {
      setWorkflows([]);
      setLoading(false);
      return;
    }
    try {
      const search = new URLSearchParams();
      const categoryId =
        overrideCategoryId !== undefined ? overrideCategoryId : currentCategoryId;
      search.set("categoryId", categoryId === null ? "" : categoryId);
      const url = `/api/companies/${companyId}/workflows?${search.toString()}`;
      const workflowsWithCounts = await api.get<any[]>(url);
      setWorkflows(workflowsWithCounts || []);
    } catch (error) {
      console.error("Error fetching workflows:", error);
      toast.error("Failed to load workflows");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOrUpdate = async () => {
    if (!formData.name.trim()) {
      toast.error("Workflow name is required");
      return;
    }

    try {
      if (editingWorkflow && companyId) {
        await api.patch(
          `/api/companies/${companyId}/workflows/${editingWorkflow.id}`,
          {
            name: formData.name,
            description: formData.description,
            is_public: startScope === "public",
            visibility_scope: visibilityScope,
            start_permission_scope: startScope,
            api_enabled: formData.api_enabled,
            category_id: selectedCategoryId || null,
            icon: selectedIcon,
          }
        );

        // Update or create data structure
        await updateWorkflowDataStructure(editingWorkflow.id);

        // Update workflow permissions
        await updateWorkflowPermissions(editingWorkflow.id);

        queryClient.invalidateQueries({ queryKey: ["workflows"] });
        toast.success("Workflow updated successfully");
      } else {
        if (!companyId) {
          toast.error("Company not set. Please contact administrator.");
          return;
        }

        const data = await api.post<{ id: string }>(
          `/api/companies/${companyId}/workflows`,
          {
            name: formData.name,
            description: formData.description,
            is_public: startScope === "public",
            visibility_scope: visibilityScope,
            start_permission_scope: startScope,
            api_enabled: formData.api_enabled,
            category_id: selectedCategoryId || null,
            icon: selectedIcon,
          }
        );

        if (data?.id) {
          await createWorkflowDataStructure(data.id);
          await createWorkflowPermissions(data.id);
          // Create any statuses that were added during creation
          const pendingCount = pendingStatuses.length;
          let firstStatusId: string | null = null;
          for (let i = 0; i < pendingCount; i++) {
            const status = await api.post<{ id: string }>(
              `/api/companies/${companyId}/workflows/${data.id}/statuses`,
              {
                name: pendingStatuses[i].name,
                color: pendingStatuses[i].color,
                order: i,
              }
            );
            if (i === 0 && status?.id) firstStatusId = status.id;
          }
          if (firstStatusId) {
            await api.patch(`/api/companies/${companyId}/workflows/${data.id}`, {
              default_status_id: firstStatusId,
            });
          }
          setPendingStatuses([]);
          queryClient.invalidateQueries({ queryKey: ["workflows"] });
          toast.success(
            pendingCount > 0
              ? "Workflow and statuses created successfully"
              : "Workflow created successfully"
          );
          setDialogOpen(false);
          setEditingWorkflow(null);
          setVisibilityScope("all_company");
          setStartScope("public");
          setFormData({ name: "", description: "", is_public: true, api_enabled: false });
          setDataStructureFields([]);
          setVisibilityUsers([]);
          setVisibilityGroups([]);
          setStartUsers([]);
          setStartGroups([]);
          setSelectedCategoryId(null);
          setSelectedIcon(null);
          fetchWorkflows();
          fetchAllWorkflows();
          navigate(`/workflow/${data.id}`);
          return;
        }
      }

      setDialogOpen(false);
      setVisibilityScope("all_company");
      setStartScope("public");
      setFormData({ name: "", description: "", is_public: true, api_enabled: false }); // Default to public
      setDataStructureFields([]);
      setVisibilityUsers([]);
      setVisibilityGroups([]);
      setStartUsers([]);
      setStartGroups([]);
      setEditingWorkflow(null);
      setSelectedCategoryId(null);
      setSelectedIcon(null);
      fetchWorkflows();
      fetchAllWorkflows();
    } catch (error) {
      console.error("Error saving workflow:", error);
      toast.error("Failed to save workflow");
    }
  };

  const createWorkflowDataStructure = async (workflowId: string) => {
    if (dataStructureFields.length === 0 || !companyId) return;
    await api.patch(
      `/api/companies/${companyId}/workflows/${workflowId}`,
      { data_structure: dataStructureFields }
    );
  };

  const updateWorkflowDataStructure = async (workflowId: string) => {
    if (!companyId) return;
    await api.patch(
      `/api/companies/${companyId}/workflows/${workflowId}`,
      { data_structure: dataStructureFields }
    );
  };

  const createWorkflowPermissions = async (workflowId: string) => {
    if (!companyId) return;
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
    await createWorkflowPermissions(workflowId);
  };

  const confirmDelete = (e: React.MouseEvent, workflow: Workflow) => {
    e.stopPropagation();
    setWorkflowToDelete(workflow);
  };

  const executeDelete = async () => {
    if (!workflowToDelete || !companyId) return;
    try {
      await api.delete(
        `/api/companies/${companyId}/workflows/${workflowToDelete.id}`
      );
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      toast.success("Workflow deleted successfully");
      fetchWorkflows();
      fetchAllWorkflows();
    } catch (error) {
      console.error("Error deleting workflow:", error);
      toast.error("Failed to delete workflow");
    } finally {
      setWorkflowToDelete(null);
    }
  };

  const handleToggleActive = async (e: React.MouseEvent, workflow: Workflow) => {
    e.stopPropagation();
    if (!workflow.id || !companyId) return;
    try {
      const newActiveState = !(workflow.is_active ?? true);
      await api.patch(
        `/api/companies/${companyId}/workflows/${workflow.id}`,
        { is_active: newActiveState }
      );
      setWorkflows((prev) =>
        prev.map((w) => (w.id === workflow.id ? { ...w, is_active: newActiveState } : w))
      );
      setAllWorkflows((prev) =>
        prev.map((w) => (w.id === workflow.id ? { ...w, is_active: newActiveState } : w))
      );
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
      toast.success(newActiveState ? "Workflow activated" : "Workflow deactivated");
    } catch (error) {
      console.error("Error toggling workflow active state:", error);
      toast.error("Failed to update workflow status");
    }
  };

  const handleDuplicate = async (workflow: Workflow, targetCompanyId?: string | null) => {
    const effectiveCompanyId = targetCompanyId ?? companyId;
    if (!effectiveCompanyId) {
      toast.error("Company not set. Please contact administrator.");
      return;
    }
    if (targetCompanyId != null && targetCompanyId !== companyId && !isSuperAdmin) {
      toast.error("Only super admins can duplicate a workflow to another company.");
      return;
    }

    const isCopyingToAnotherCompany = targetCompanyId != null && targetCompanyId !== companyId;

    try {
      const sourceCompanyId = workflow.company_id ?? companyId;
      const fullWorkflow = await api.get<any>(
        `/api/companies/${sourceCompanyId}/workflows/${workflow.id}`
      );
      const workflowData = fullWorkflow;

      const newCategoryId = isCopyingToAnotherCompany ? null : (workflowData.category_id || null);

      const newWorkflow = await api.post<{ id: string }>(
        `/api/companies/${effectiveCompanyId}/workflows`,
        {
          name: `${workflowData.name} (Copy)`,
          description: workflowData.description,
          category_id: newCategoryId,
          icon: workflowData.icon || null,
          is_active: workflowData.is_active ?? false,
          data_structure: workflowData.data_structure || null,
          is_public: workflowData.is_public ?? false,
          visibility_scope: workflowData.visibility_scope ?? "all_company",
          start_permission_scope: workflowData.start_permission_scope ?? (workflowData.is_public ? "public" : "specific"),
          api_enabled: workflowData.api_enabled ?? false,
        }
      );

      if (!newWorkflow?.id) throw new Error("Workflow copy created but no data returned");

      const steps = workflowData.steps || [];
      const stepIdMap = new Map<string, string>();

      if (steps.length > 0) {
        const newSteps = steps.map((step: any) => {
          const config = step.config ? JSON.parse(JSON.stringify(step.config)) : {};
          return {
            step_type: step.step_type,
            name: step.name,
            position_x: step.position_x,
            position_y: step.position_y,
            config,
            action_type: step.action_type || "manual",
            decision_node_type: step.decision_node_type || "Human",
            assigned_to_user_id: step.assigned_to_user_id || config?.assigned_to_user_id || null,
            assigned_to_group_id: step.assigned_to_group_id || config?.assigned_to_group_id || null,
          };
        });
        const insertedSteps = await api.put<any[]>(
          `/api/companies/${effectiveCompanyId}/workflows/${newWorkflow.id}/steps`,
          { steps: newSteps }
        );
        if (insertedSteps && Array.isArray(insertedSteps)) {
          steps.forEach((oldStep: any, index: number) => {
            if (insertedSteps[index]) stepIdMap.set(oldStep.id, insertedSteps[index].id);
          });
        }
      }

      const connections = workflowData.connections || [];
      if (connections.length > 0) {
        const newConnections = connections.map((conn: any) => ({
          source_step_id: stepIdMap.get(conn.source_step_id) || conn.source_step_id,
          target_step_id: stepIdMap.get(conn.target_step_id) || conn.target_step_id,
          output_name: conn.output_name || "default",
          config: conn.config ? JSON.parse(JSON.stringify(conn.config)) : { color: "hsl(var(--primary))", style: "solid" },
        }));
        try {
          await api.put(
            `/api/companies/${effectiveCompanyId}/workflows/${newWorkflow.id}/connections`,
            { connections: newConnections }
          );
        } catch (err) {
          console.error("Error copying workflow connections:", err);
        }
      }

      const statuses = workflowData.statuses || [];
      if (statuses.length > 0) {
        let insertedStatuses: any[] = [];
        try {
          for (let i = 0; i < statuses.length; i++) {
            const s = statuses[i];
            const created = await api.post<any>(
              `/api/companies/${effectiveCompanyId}/workflows/${newWorkflow.id}/statuses`,
              { name: s.name, order: s.order, color: s.color }
            );
            insertedStatuses.push(created);
          }
        } catch (err) {
          console.error("Error copying workflow statuses:", err);
        }
        if (insertedStatuses.length && workflowData.default_status_id) {
          const oldIdx = statuses.findIndex((s: any) => s.id === workflowData.default_status_id);
          if (oldIdx !== -1 && insertedStatuses[oldIdx]) {
            try {
              await api.patch(
                `/api/companies/${effectiveCompanyId}/workflows/${newWorkflow.id}`,
                { default_status_id: insertedStatuses[oldIdx].id }
              );
            } catch (err) {
              console.error("Error setting default status:", err);
            }
          }
        }
      }

      toast.success("Workflow duplicated successfully");
      
      // Refresh the workflow lists
      await fetchWorkflows();
      await fetchAllWorkflows();
    } catch (error) {
      console.error("Error duplicating workflow:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to duplicate workflow";
      toast.error(errorMessage);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied to clipboard`);
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
      toast.error("Failed to copy to clipboard");
    }
  };

  const openDialog = async (workflow?: Workflow) => {
    // Ensure we capture the current category at the time of opening
    const categoryToUse = currentCategoryId;

    if (workflow) {
      setEditingWorkflow(workflow);
      setFormData({
        name: workflow.name,
        description: workflow.description || "",
        is_public: (workflow as any).start_permission_scope
          ? (workflow as any).start_permission_scope === "public"
          : (workflow as any).is_public || false,
        api_enabled: (workflow as any).api_enabled || false
      });
      setSelectedCategoryId(workflow.category_id || null);
      setSelectedIcon(workflow.icon || null);

      let workflowDataTyped: {
        data_structure?: any[];
        is_public?: boolean;
        api_enabled?: boolean;
        visibility_scope?: "all_company" | "specific";
        start_permission_scope?: "public" | "specific";
      } = {};
      if (companyId) {
        workflowDataTyped = await api.get(
          `/api/companies/${companyId}/workflows/${workflow.id}`
        );
      }

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
        .sort((a: any, b: any) => {
          if (!a.parent_item_id && !b.parent_item_id) return a.position - b.position;
          return 0;
        }));

      setVisibilityScope(workflowDataTyped?.visibility_scope === "specific" ? "specific" : "all_company");
      setStartScope(workflowDataTyped?.start_permission_scope === "specific" ? "specific" : "public");

      let visibilityUserIds: string[] = [];
      let visibilityGroupIds: string[] = [];
      let startUserIds: string[] = [];
      let startGroupIds: string[] = [];
      if (companyId) {
        const permissions = await api.get<{ user_id: string | null; group_id: string | null; permission_type: string }[]>(
          `/api/companies/${companyId}/workflows/${workflow.id}/permissions`
        );
        visibilityUserIds =
          permissions?.filter((p) => p.user_id && (p.permission_type === "visibility" || p.permission_type === "view")).map((p) => p.user_id!) || [];
        visibilityGroupIds =
          permissions?.filter((p) => p.group_id && (p.permission_type === "visibility" || p.permission_type === "view")).map((p) => p.group_id!) || [];
        startUserIds =
          permissions?.filter((p) => p.user_id && (p.permission_type === "start" || p.permission_type === "execute")).map((p) => p.user_id!) || [];
        startGroupIds =
          permissions?.filter((p) => p.group_id && (p.permission_type === "start" || p.permission_type === "execute")).map((p) => p.group_id!) || [];
      }

      setVisibilityUsers(visibilityUserIds);
      setVisibilityGroups(visibilityGroupIds);
      setStartUsers(startUserIds);
      setStartGroups(startGroupIds);

      // Fetch workflow statuses
      await fetchWorkflowStatuses(workflow.id);
    } else {
      setEditingWorkflow(null);
      setVisibilityScope("all_company");
      setStartScope("public");
      setFormData({ name: "", description: "", is_public: true, api_enabled: false }); // Default to public when creating new workflow
      setDataStructureFields([]);
      setVisibilityUsers([]);
      setVisibilityGroups([]);
      setStartUsers([]);
      setStartGroups([]);
      setSelectedCategoryId(categoryToUse); // Default to current category (captured at open time)
      setSelectedIcon(null);
      setPendingStatuses([]);
      setEditingPendingStatusId(null);
      setAddingNewFieldParentId(undefined);
      setFieldDescriptionOpen(false);
      setEditingFieldId(null);
      setFieldFormData({
        name: "",
        description: "",
        field_type: "text",
        options: "",
        parent_item_id: "",
      });
    }
    setDialogOpen(true);
  };

  // Category management functions
  const handleNavigateCategory = (categoryId: string | null) => {
    // Don't navigate if we're already in this category
    if (currentCategoryId === categoryId) {
      return;
    }
    setCurrentCategoryId(categoryId);
    setLoading(true);
  };

  const handleDeleteCategory = async (categoryId: string) => {
    // Check if category has workflows or subcategories
    const hasWorkflows = workflows.some((w) => w.category_id === categoryId);
    const hasSubcategories = categories.some((c) => c.parent_category_id === categoryId);

    if (hasWorkflows || hasSubcategories) {
      if (!confirm(`This category contains ${hasWorkflows ? 'workflows' : ''}${hasWorkflows && hasSubcategories ? ' and ' : ''}${hasSubcategories ? 'subcategories' : ''}. Are you sure you want to delete it? Workflows will be moved to uncategorized.`)) {
        return;
      }
    } else {
      if (!confirm("Are you sure you want to delete this category?")) {
        return;
      }
    }

    if (!companyId) return;
    try {
      if (hasWorkflows) {
        const inCategory = workflows.filter((w) => w.category_id === categoryId);
        for (const w of inCategory) {
          await api.patch(`/api/companies/${companyId}/workflows/${w.id}`, { category_id: null });
        }
      }

      if (hasSubcategories) {
        const category = categories.find((c) => c.id === categoryId);
        const newParentId = category?.parent_category_id || null;
        const subcats = categories.filter((c) => c.parent_category_id === categoryId);
        for (const sub of subcats) {
          await api.patch(`/api/companies/${companyId}/workflow-categories/${sub.id}`, { parent_category_id: newParentId });
        }
      }

      await api.delete(`/api/companies/${companyId}/workflow-categories/${categoryId}`);

      toast.success("Category deleted successfully");

      // If we deleted the current category, navigate to parent or root
      if (currentCategoryId === categoryId) {
        const category = categories.find((c) => c.id === categoryId);
        setCurrentCategoryId(category?.parent_category_id || null);
      }

      fetchCategories();
      fetchWorkflows();
      fetchAllWorkflows();
    } catch (error) {
      console.error("Error deleting category:", error);
      toast.error("Failed to delete category");
    }
  };

  const handleEditCategory = (category: WorkflowCategory) => {
    setEditingCategory(category);
    setIsCategoryDialogOpen(true);
  };

  const [pendingParentId, setPendingParentId] = useState<string | null>(null);
  const [dialogKeyCounter, setDialogKeyCounter] = useState(0);
  const pendingParentIdRef = useRef<string | null>(null);

  const handleCreateCategory = (parentCategoryId?: string | null) => {
    setEditingCategory(null);
    // When creating from within a category, parentCategoryId is currentCategoryId
    // When creating from root, parentCategoryId is null
    // Always use the explicitly passed value, falling back to currentCategoryId if not provided
    const parentId = parentCategoryId !== undefined ? parentCategoryId : currentCategoryId;

    // Store in ref immediately (synchronous) for immediate access
    pendingParentIdRef.current = parentId;

    // Set state and increment counter at the same time
    setPendingParentId(parentId);
    setDialogKeyCounter(prev => prev + 1);

    // Open dialog immediately - ref ensures correct value is available
    // The key change will force React to create a fresh component with correct props
    setIsCategoryDialogOpen(true);
  };

  const handleCategoryDialogSuccess = () => {
    fetchCategories();
  };

  // Get subcategories of current category
  const getSubcategories = () => {
    return categories.filter((c) => c.parent_category_id === currentCategoryId);
  };

  // Get total workflow count for category (recursively includes all workflows in subcategories)
  const getCategoryItemCount = (categoryId: string): number => {
    // Count workflows directly in this category using allWorkflows (unfiltered)
    const directWorkflowCount = allWorkflows.filter((w) => w.category_id === categoryId).length;

    // Get all subcategories of this category
    const subcategories = categories.filter((c) => c.parent_category_id === categoryId);

    // Recursively count workflows in all subcategories
    const subcategoryWorkflowCount = subcategories.reduce((total, subcategory) => {
      return total + getCategoryItemCount(subcategory.id);
    }, 0);

    // Return total count (direct workflows + workflows in all subcategories)
    return directWorkflowCount + subcategoryWorkflowCount;
  };

  const getAllWorkflowsForSearch = async () => {
    if (!companyId) return [];
    try {
      return await api.get<any[]>(`/api/companies/${companyId}/workflows`);
    } catch (error) {
      console.error("Error fetching all workflows:", error);
      return [];
    }
  };

  // Get filtered workflows and categories for search
  const getSearchResults = () => {
    if (!searchQuery.trim()) {
      return { workflows: [], categories: [] };
    }

    const query = searchQuery.toLowerCase();
    const filteredWorkflows = workflows.filter((w) =>
      w.name.toLowerCase().includes(query) ||
      (w.description && w.description.toLowerCase().includes(query))
    );
    const filteredCategories = categories.filter((c) =>
      c.name.toLowerCase().includes(query) ||
      (c.description && c.description.toLowerCase().includes(query))
    );

    return { workflows: filteredWorkflows, categories: filteredCategories };
  };

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
    // Reset field_type if it's invalid for a sub-item (file, signature, or array cannot be sub-items)
    const fieldType = field.parent_item_id && (field.field_type === "file" || field.field_type === "multiple_files" || field.field_type === "signature" || field.field_type === "array")
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

  const handleSubmitField = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate: cannot add file, signature, or array types as sub-items
    if (fieldFormData.parent_item_id && (fieldFormData.field_type === "file" || fieldFormData.field_type === "multiple_files" || fieldFormData.field_type === "signature" || fieldFormData.field_type === "array")) {
      toast.error("Cannot add file, signature, or array types as sub-items of an array");
      return;
    }

    // Preserve existing position when editing, or calculate new position for new fields
    let position: number;
    if (editingFieldId) {
      // When editing, preserve the existing position
      const existingField = dataStructureFields.find(f => f.id === editingFieldId);
      position = existingField?.position ?? 0;
    } else {
      // When creating new field, calculate position based on parent context
      if (fieldFormData.parent_item_id) {
        // For child fields, find max position among siblings
        const siblings = dataStructureFields.filter(f => f.parent_item_id === fieldFormData.parent_item_id);
        const maxSiblingPosition = siblings.length > 0
          ? Math.max(...siblings.map(f => f.position))
          : -1;
        position = maxSiblingPosition + 1;
      } else {
        // For top-level fields, find max position among top-level fields
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

  const handleDragStart = (e: React.DragEvent, fieldId: string, parentId: string | null = null) => {
    setDraggedFieldId(fieldId);
    setDraggedParentId(parentId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", fieldId);
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

    // Check if we're dragging within the same parent context
    if (draggedParentId !== targetParentId) {
      setDraggedFieldId(null);
      setDraggedParentId(null);
      return;
    }

    if (targetParentId === null) {
      // Reordering top-level fields
      const topLevelFields = dataStructureFields
        .filter(f => !f.parent_item_id)
        .sort((a, b) => a.position - b.position);

      const draggedIndex = topLevelFields.findIndex(f => f.id === draggedFieldId);

      if (draggedIndex === -1 || draggedIndex === targetIndex) {
        setDraggedFieldId(null);
        setDraggedParentId(null);
        return;
      }

      // Reorder the fields
      const reorderedFields = [...topLevelFields];
      const [removed] = reorderedFields.splice(draggedIndex, 1);
      reorderedFields.splice(targetIndex, 0, removed);

      // Update positions for all top-level fields
      const updatedFields = dataStructureFields.map(field => {
        if (field.parent_item_id) {
          // Keep child fields as-is
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
      // Reordering child fields within the same parent
      const childFields = dataStructureFields
        .filter(f => f.parent_item_id === targetParentId)
        .sort((a, b) => a.position - b.position);

      const draggedIndex = childFields.findIndex(f => f.id === draggedFieldId);

      if (draggedIndex === -1 || draggedIndex === targetIndex) {
        setDraggedFieldId(null);
        setDraggedParentId(null);
        return;
      }

      // Reorder the child fields
      const reorderedChildren = [...childFields];
      const [removed] = reorderedChildren.splice(draggedIndex, 1);
      reorderedChildren.splice(targetIndex, 0, removed);

      // Update positions for all child fields of this parent
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

  // Workflow Status Handlers
  const handleAddStatus = () => {
    setEditingStatusId(null);
    setEditingPendingStatusId(null);
    setStatusFormData({
      name: "",
      color: "#3b82f6",
    });
    setIsStatusDialogOpen(true);
  };

  const handleEditStatus = (status: WorkflowStatus) => {
    setEditingStatusId(status.id);
    setEditingPendingStatusId(null);
    setStatusFormData({
      name: status.name,
      color: status.color,
    });
    setIsStatusDialogOpen(true);
  };

  const handleEditPendingStatus = (pending: PendingStatus) => {
    setEditingStatusId(null);
    setEditingPendingStatusId(pending.tempId);
    setStatusFormData({
      name: pending.name,
      color: pending.color,
    });
    setIsStatusDialogOpen(true);
  };

  const handleDeletePendingStatus = (tempId: string) => {
    setPendingStatuses((prev) => {
      const next = prev.filter((p) => p.tempId !== tempId);
      return next.map((p, i) => ({ ...p, order: i }));
    });
    toast.success("Status removed");
  };

  const handleDeleteStatus = async (statusId: string) => {
    if (!confirm("Are you sure you want to delete this status?") || !editingWorkflow || !companyId) return;
    try {
      await api.delete(
        `/api/companies/${companyId}/workflows/${editingWorkflow.id}/statuses/${statusId}`
      );
      setWorkflowStatuses((prev) => prev.filter((s) => s.id !== statusId));
      toast.success("Status deleted successfully");
    } catch (error) {
      console.error("Error deleting status:", error);
      toast.error("Failed to delete status");
    }
  };

  const handleSubmitStatus = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!statusFormData.name.trim()) {
      toast.error("Status name is required");
      return;
    }

    // Creating new workflow: store statuses locally until workflow is saved
    if (!editingWorkflow) {
      if (editingPendingStatusId) {
        setPendingStatuses((prev) =>
          prev.map((p) =>
            p.tempId === editingPendingStatusId
              ? { ...p, name: statusFormData.name.trim(), color: statusFormData.color }
              : p
          )
        );
        toast.success("Status updated");
      } else {
        const newOrder = pendingStatuses.length;
        setPendingStatuses((prev) => [
          ...prev,
          {
            tempId: crypto.randomUUID(),
            name: statusFormData.name.trim(),
            color: statusFormData.color,
            order: newOrder,
          },
        ]);
        toast.success("Status added");
      }
      setIsStatusDialogOpen(false);
      setEditingStatusId(null);
      setEditingPendingStatusId(null);
      setStatusFormData({ name: "", color: "#3b82f6" });
      return;
    }

    if (!companyId) return;
    try {
      if (editingStatusId) {
        await api.patch(
          `/api/companies/${companyId}/workflows/${editingWorkflow.id}/statuses/${editingStatusId}`,
          { name: statusFormData.name, color: statusFormData.color }
        );
        setWorkflowStatuses((prev) =>
          prev.map((s) =>
            s.id === editingStatusId
              ? { ...s, name: statusFormData.name, color: statusFormData.color }
              : s
          )
        );
        toast.success("Status updated successfully");
      } else {
        const newOrder = workflowStatuses.length;
        const data = await api.post(
          `/api/companies/${companyId}/workflows/${editingWorkflow.id}/statuses`,
          { name: statusFormData.name, color: statusFormData.color, order: newOrder }
        );
        setWorkflowStatuses((prev) => [...prev, data]);
        toast.success("Status created successfully");
      }

      setIsStatusDialogOpen(false);
      setEditingStatusId(null);
      setStatusFormData({ name: "", color: "#3b82f6" });
    } catch (error) {
      console.error("Error saving status:", error);
      toast.error("Failed to save status");
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

    if (!draggedStatusId) return;

    if (editingWorkflow) {
      const draggedIndex = workflowStatuses.findIndex((s) => s.id === draggedStatusId);
      if (draggedIndex === -1 || draggedIndex === targetIndex) {
        setDraggedStatusId(null);
        setDragOverStatusIndex(null);
        return;
      }
      const reordered = [...workflowStatuses];
      const [removed] = reordered.splice(draggedIndex, 1);
      reordered.splice(targetIndex, 0, removed);
      const updatedStatuses = reordered.map((status, index) => ({ ...status, order: index }));
      setWorkflowStatuses(updatedStatuses);
      if (companyId) {
        try {
          await Promise.all(
            updatedStatuses.map((status) =>
              api.patch(
                `/api/companies/${companyId}/workflows/${editingWorkflow.id}/statuses/${status.id}`,
                { order: status.order }
              )
            )
          );
        } catch (error) {
          console.error("Error updating status order:", error);
          toast.error("Failed to update status order");
          await fetchWorkflowStatuses(editingWorkflow.id);
        }
      }
    } else {
      const draggedIndex = pendingStatuses.findIndex((p) => p.tempId === draggedStatusId);
      if (draggedIndex === -1 || draggedIndex === targetIndex) {
        setDraggedStatusId(null);
        setDragOverStatusIndex(null);
        return;
      }
      const reordered = [...pendingStatuses];
      const [removed] = reordered.splice(draggedIndex, 1);
      reordered.splice(targetIndex, 0, removed);
      setPendingStatuses(reordered.map((p, i) => ({ ...p, order: i })));
    }

    setDraggedStatusId(null);
    setDragOverStatusIndex(null);
  };

  const handleStatusDragEnd = () => {
    setDraggedStatusId(null);
    setDragOverStatusIndex(null);
  };

  const handleSetDefaultStatus = async (statusId: string) => {
    if (!editingWorkflow || !companyId) {
      toast.error("No workflow selected");
      return;
    }
    try {
      await api.patch(
        `/api/companies/${companyId}/workflows/${editingWorkflow.id}`,
        { default_status_id: statusId }
      );
      setDefaultStatusId(statusId);
      toast.success("Default status updated successfully");
    } catch (error) {
      console.error("Error setting default status:", error);
      toast.error("Failed to set default status");
    }
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

  const renderInlineFieldForm = () => (
    <div className="border rounded-lg bg-card p-3 space-y-3">
      <form onSubmit={handleSubmitField} className="space-y-3">
        <div className="flex gap-3 items-end">
          <div className="flex-1 min-w-0">
            <Label htmlFor="field-name" className="text-xs">Name</Label>
            <Input
              id="field-name"
              value={fieldFormData.name}
              onChange={(e) => setFieldFormData({ ...fieldFormData, name: e.target.value })}
              required
              className="h-8 mt-0.5"
            />
          </div>
          <div className="w-40 flex-shrink-0">
            <Label htmlFor="field-type" className="text-xs">Field Type</Label>
            <Select
              value={fieldFormData.field_type}
              onValueChange={(value) => setFieldFormData({ ...fieldFormData, field_type: value })}
            >
              <SelectTrigger id="field-type" className="h-8 mt-0.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPES
                  .filter((type) => {
                    if (fieldFormData.parent_item_id) {
                      return type.value !== "file" && type.value !== "multiple_files" && type.value !== "signature" && type.value !== "array";
                    }
                    return true;
                  })
                  .map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Collapsible open={fieldDescriptionOpen} onOpenChange={setFieldDescriptionOpen}>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground py-0.5"
            >
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${fieldDescriptionOpen ? "rotate-180" : ""}`} />
              Description
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
                    <div className="space-y-2 border rounded-md p-3">
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
            Cancel
          </Button>
          <Button type="submit" size="sm">
            {editingFieldId ? "Update" : "Create"}
          </Button>
        </div>
      </form>
    </div>
  );

  // Workflow drag and drop handlers
  const handleWorkflowDragStart = (e: React.DragEvent, workflowId: string) => {
    setDraggedWorkflowId(workflowId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", workflowId);
    // Add a visual indicator
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "0.5";
    }
  };

  const handleWorkflowDragEnd = (e: React.DragEvent) => {
    setDraggedWorkflowId(null);
    setDragOverCategoryId(undefined);
    // Reset opacity
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = "1";
    }
  };

  const handleCategoryDragOver = (e: React.DragEvent, categoryId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    if (draggedWorkflowId) {
      setDragOverCategoryId(categoryId);
    }
  };

  const handleCategoryDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only clear if we're actually leaving the category card (not just moving to a child element)
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
      setDragOverCategoryId(undefined);
    }
  };

  const handleCategoryDrop = async (e: React.DragEvent, targetCategoryId: string | null) => {
    e.preventDefault();
    e.stopPropagation();

    if (!draggedWorkflowId) return;

    // Don't update if dropping on the same category
    const workflow = workflows.find(w => w.id === draggedWorkflowId);
    if (workflow && workflow.category_id === targetCategoryId) {
      setDraggedWorkflowId(null);
      setDragOverCategoryId(undefined);
      return;
    }

    if (!companyId) return;
    try {
      await api.patch(
        `/api/companies/${companyId}/workflows/${draggedWorkflowId}`,
        { category_id: targetCategoryId }
      );
      toast.success("Workflow moved successfully");
      fetchWorkflows();
      fetchAllWorkflows();
    } catch (error) {
      console.error("Error moving workflow:", error);
      toast.error("Failed to move workflow");
    } finally {
      setDraggedWorkflowId(null);
      setDragOverCategoryId(undefined);
    }
  };

  // Get items to display in grid view
  const subcategories = getSubcategories();
  const displayWorkflows = searchQuery ? [] : workflows; // Only show in grid when not searching

  // Get all workflows for search when searching
  const [searchWorkflows, setSearchWorkflows] = useState<Workflow[]>([]);
  const searchResults = searchQuery ? getSearchResults() : { workflows: [], categories: [] };

  useEffect(() => {
    if (searchQuery) {
      // Fetch all workflows when searching
      getAllWorkflowsForSearch().then((allWorkflows) => {
        const query = searchQuery.toLowerCase();
        const filtered = allWorkflows.filter((w) =>
          w.name.toLowerCase().includes(query) ||
          (w.description && w.description.toLowerCase().includes(query))
        );
        setSearchWorkflows(filtered);
      });
    } else {
      setSearchWorkflows([]);
    }
  }, [searchQuery]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading workflows...</div>
      </div>
    );
  }

  // Get category path helper
  const getCategoryPath = (categoryId: string): string => {
    const category = categories.find((c) => c.id === categoryId);
    if (!category) return "Unknown";

    const path: string[] = [];
    let current: WorkflowCategory | undefined = category;

    while (current) {
      path.unshift(current.name);
      if (current.parent_category_id) {
        current = categories.find((c) => c.id === current!.parent_category_id);
      } else {
        break;
      }
    }

    return path.join(" > ");
  };

  // Helper to render workflow icon
  const renderWorkflowIcon = (iconName: string | null) => {
    if (!iconName) return null;
    return renderIcon(iconName, "h-6 w-6 text-primary", WorkflowIcon);
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("workflowList.title")}</h1>
          <p className="text-muted-foreground mt-0.5">
            {t("workflowList.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => handleCreateCategory(currentCategoryId)} variant="outline" className="gap-2">
            <FolderPlus className="h-4 w-4" />
            {t("workflowList.newCategory")}
          </Button>
          <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            {t("workflowList.createWorkflow")}
          </Button>
        </div>
      </div>

      {/* Breadcrumb Navigation */}
      <CategoryBreadcrumb
        categories={categoryBreadcrumb}
        onNavigate={handleNavigateCategory}
      />

      <div className="flex items-center gap-4">
        <Input
          placeholder={t("workflowList.searchWorkflows")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-md"
        />
      </div>

      {/* Search Results View */}
      {searchQuery && (
        <SearchResults
          workflows={searchWorkflows}
          categories={categories}
          searchQuery={searchQuery}
          onWorkflowClick={(workflowId) => navigate(`/workflow/${workflowId}`)}
          onCategoryClick={handleNavigateCategory}
          onClearSearch={() => setSearchQuery("")}
        />
      )}

      {/* Grid View (when not searching) */}
      {!searchQuery && (
        <>
          {/* Sentinel element to detect when categories section is stuck */}
          {subcategories.length > 0 && (
            <div
              ref={categoriesSentinelRef}
              className="w-full pointer-events-none"
              style={{ height: '1px', marginTop: '-1px', marginBottom: '0px' }}
            />
          )}

          {/* Compact Categories Section */}
          {subcategories.length > 0 && (
            <div
              ref={categoriesStickyRef}
              className={`sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pb-3 pt-2 -mx-8 px-8 mb-4 space-y-2 transition-all ${isCategoriesStuck ? 'border-b border-border shadow-sm' : ''}`}
              style={isCategoriesStuck ? {
                borderBottomWidth: '1px',
                borderBottomStyle: 'solid',
                borderBottomColor: 'hsl(var(--border))'
              } : undefined}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium text-muted-foreground">{t("workflowList.categories")}</h2>
              </div>
              <div className="flex flex-wrap gap-3">
                {subcategories.map((category) => {
                  const categoryIcon = renderIcon(category.icon, "h-4 w-4 text-primary", FolderPlus) || <FolderPlus className="h-4 w-4 text-primary" />;

                  return (
                    <div key={category.id} className="relative group" style={{ maxWidth: '280px' }}>
                      <Card
                        className={`hover:shadow-md transition-all duration-200 cursor-pointer border-2 border-dashed hover:border-solid ${dragOverCategoryId === category.id ? 'border-primary border-solid bg-primary/5' : ''
                          }`}
                        onClick={() => handleNavigateCategory(category.id)}
                        onDragOver={(e) => handleCategoryDragOver(e, category.id)}
                        onDragLeave={handleCategoryDragLeave}
                        onDrop={(e) => handleCategoryDrop(e, category.id)}
                      >
                        <CardContent className="pl-4 pr-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="text-primary flex-shrink-0 flex items-center justify-center">
                              {categoryIcon}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm truncate">{category.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {getCategoryItemCount(category.id)} {getCategoryItemCount(category.id) === 1 ? t("workflowList.workflow") : t("workflowList.workflows")}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      {/* Category Actions Menu */}
                      <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6">
                              <MoreVertical className="h-3 w-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEditCategory(category)}>
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleCreateCategory(category.id)}>
                              <FolderPlus className="h-4 w-4 mr-2" />
                              Create Subcategory
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDeleteCategory(category.id)}
                              className="text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Workflows Section */}
          {displayWorkflows.length > 0 && (
            <div
              className={`space-y-3 mb-4 rounded-lg transition-all ${dragOverCategoryId === null && draggedWorkflowId ? 'bg-primary/5 border-2 border-dashed border-primary' : ''
                }`}
              onDragOver={(e) => {
                if (draggedWorkflowId) {
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = "move";
                  setDragOverCategoryId(null);
                }
              }}
              onDragLeave={(e) => {
                const relatedTarget = e.relatedTarget as HTMLElement;
                if (!relatedTarget || !e.currentTarget.contains(relatedTarget)) {
                  // Only clear if we're actually leaving the workflows section
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = e.clientX;
                  const y = e.clientY;
                  if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
                    setDragOverCategoryId(undefined);
                  }
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleCategoryDrop(e, null);
              }}
            >
              <h2 className="text-sm font-medium text-muted-foreground">Workflows</h2>
              {dragOverCategoryId === null && draggedWorkflowId && (
                <p className="text-xs text-primary">Drop here to uncategorize</p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            {/* Render Workflows - one per line, dense */}
            {displayWorkflows.map((workflow) => {
              const WorkflowIcon = renderWorkflowIcon(workflow.icon);
              return (
                <Card
                  key={workflow.id}
                  className={`hover:shadow-md transition-all duration-200 cursor-pointer group flex flex-row items-center gap-4 py-2 px-4 ${draggedWorkflowId === workflow.id ? 'opacity-50' : ''
                    }`}
                  onClick={() => navigate(`/workflow/${workflow.id}`)}
                  draggable
                  onDragStart={(e) => handleWorkflowDragStart(e, workflow.id)}
                  onDragEnd={handleWorkflowDragEnd}
                >
                  <div className="opacity-40 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground flex-shrink-0" title="Drag to move to category" onClick={(e) => e.stopPropagation()}>
                    <GripVertical className="h-4 w-4" />
                  </div>
                  {WorkflowIcon && (
                    <span className="flex-shrink-0 flex items-center justify-center text-primary">
                      {WorkflowIcon}
                    </span>
                  )}
                  <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center sm:gap-4 gap-0.5 py-1">
                    <div className="min-w-0">
                      <CardTitle className="text-base leading-tight break-words font-semibold">
                        {workflow.name}
                      </CardTitle>
                      {workflow.description && (
                        <CardDescription className="text-xs text-muted-foreground truncate">
                          {workflow.description}
                        </CardDescription>
                      )}
                    </div>
                    <div className="flex flex-col gap-0.5 flex-shrink-0 text-[10px] text-muted-foreground sm:ml-auto sm:text-right">
                      <span className="uppercase tracking-wider font-medium text-foreground/80">{workflow.step_count} steps</span>
                      <span>Updated {formatDistanceToNow(new Date(workflow.updated_at))} ago</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5">
                      <Switch
                        checked={workflow.is_active ?? true}
                        onCheckedChange={() => {
                          const syntheticEvent = { stopPropagation: () => { } } as React.MouseEvent;
                          handleToggleActive(syntheticEvent, workflow);
                        }}
                        className="data-[state=checked]:bg-primary scale-90"
                      />
                      <span className="text-xs font-medium text-muted-foreground hidden sm:inline">Active</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isSuperAdmin) {
                          setWorkflowToDuplicate(workflow);
                          setDuplicateTargetCompanyId(companyId || "");
                          setDuplicateToCompanyDialogOpen(true);
                        } else {
                          handleDuplicate(workflow);
                        }
                      }}
                      title={isSuperAdmin ? "Duplicate workflow (choose company)" : "Duplicate workflow"}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        confirmDelete(e, workflow);
                      }}
                      title="Delete workflow"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>

          {subcategories.length === 0 && displayWorkflows.length === 0 && (
            <div className="text-center py-16">
              <div className="max-w-md mx-auto">
                <div className="w-16 h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
                  <Plus className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">
                  {currentCategoryId === null ? t("workflowList.noWorkflowsYet") : t("workflowList.emptyCategory")}
                </h3>
                <p className="text-muted-foreground mb-4">
                  {currentCategoryId === null
                    ? "Get started by creating your first workflow or category to organize your processes."
                    : "This category is empty. Add workflows or subcategories to get started."}
                </p>
                <div className="flex items-center justify-center gap-2">
                  <Button onClick={() => handleCreateCategory(currentCategoryId)} variant="outline" className="gap-2">
                    <FolderPlus className="h-4 w-4" />
                    {t("workflowList.newCategory")}
                  </Button>
                  <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
                    <Plus className="h-4 w-4" />
                    {t("workflowList.createWorkflow")}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Show empty state for workflows only if there are categories but no workflows */}
          {subcategories.length > 0 && displayWorkflows.length === 0 && (
            <div className="text-center py-12">
              <div className="max-w-md mx-auto">
                <div className="w-12 h-12 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
                  <WorkflowIcon className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="text-base font-semibold mb-2">{t("workflowList.noWorkflowsInCategory")}</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Create a workflow to get started in this category.
                </p>
                <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  {t("workflowList.createWorkflow")}
                </Button>
              </div>
            </div>
          )}
        </>
      )}


      <Dialog
        key={editingWorkflow ? `edit-${editingWorkflow.id}` : `new-${currentCategoryId || 'root'}`}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>
              {editingWorkflow ? "Edit Workflow" : "Create New Workflow"}
            </DialogTitle>
            <DialogDescription>
              {editingWorkflow
                ? "Update your workflow details"
                : "Create a new workflow to get started"}
            </DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="general" className="flex-1 flex flex-col overflow-hidden">
            <div className="px-6 pt-2">
              <TabsList className="w-full grid grid-cols-3">
                <TabsTrigger value="general">General</TabsTrigger>
                <TabsTrigger value="data-structure">Data Structure</TabsTrigger>
                <TabsTrigger value="status">Status</TabsTrigger>
              </TabsList>
            </div>

            <div className="flex-1 overflow-y-auto py-4 px-6">
              <TabsContent value="general" className="space-y-6 mt-0 h-full">
                {/* Basic Information Section */}
                <div className="space-y-4">
                  <div className="border-b pb-2">
                    <h3 className="text-lg font-medium">Basic Information</h3>
                    <p className="text-sm text-muted-foreground">Basic details about your workflow</p>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Name</Label>
                      <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="My Workflow"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="description">Description</Label>
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
                      <Label>Category</Label>
                      <Select
                        value={selectedCategoryId || "none"}
                        onValueChange={(value) =>
                          setSelectedCategoryId(value === "none" ? null : value)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None (Uncategorized)</SelectItem>
                          {categories.map((cat) => (
                            <SelectItem key={cat.id} value={cat.id}>
                              {getCategoryPath(cat.id)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Choose a category to organize this workflow
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>Icon</Label>
                      <div className="w-full">
                        <IconPicker value={selectedIcon} onChange={setSelectedIcon} className="w-full" />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Choose an icon to visually identify this workflow
                      </p>
                    </div>
                  </div>
                </div>

                {/* Features Section */}
                <div className="space-y-4">
                  <div className="border-b pb-2">
                    <h3 className="text-lg font-medium">Features</h3>
                    <p className="text-sm text-muted-foreground">Configure workflow capabilities</p>
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
                        Enable API triggers for this workflow
                      </label>
                    </div>
                    <p className="text-xs text-muted-foreground ml-6">
                      Allow this workflow to be triggered via external API calls
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
                          <RadioGroupItem value="all_company" id="list-visibility-all-company" />
                          <Label htmlFor="list-visibility-all-company" className="text-sm cursor-pointer">
                            {t("workflowEditor.allCompany")}
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="specific" id="list-visibility-specific" />
                          <Label htmlFor="list-visibility-specific" className="text-sm cursor-pointer">
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
                          const next = value as "public" | "specific";
                          setStartScope(next);
                          setFormData({ ...formData, is_public: next === "public" });
                        }}
                        className="space-y-2"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="public" id="list-start-public" />
                          <Label htmlFor="list-start-public" className="text-sm cursor-pointer">
                            {t("workflowEditor.allCompany")}
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="specific" id="list-start-specific" />
                          <Label htmlFor="list-start-specific" className="text-sm cursor-pointer">
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
                {/* Data Structure Section */}
                <div className="space-y-4">
                  <div className="border-b pb-3">
                    <h3 className="text-lg font-medium">Data Structure</h3>
                    <p className="text-sm text-muted-foreground">Define fields for this workflow's data</p>
                  </div>

                  {dataStructureFields.filter(f => !f.parent_item_id).length === 0 && addingNewFieldParentId === undefined ? (
                    <div className="text-center py-12 border-2 border-dashed rounded-lg bg-muted/30">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                          <Plus className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium text-sm mb-1">No fields yet</p>
                          <p className="text-sm text-muted-foreground mb-4">Get started by adding your first field</p>
                        </div>
                        <Button type="button" variant="outline" onClick={handleAddField} className="gap-2">
                          <Plus className="h-4 w-4" />
                          Add your first field
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
                                        {item.options_source === "dynamic" && item.api_configuration_id && (
                                          <div className="flex items-center gap-1.5 mt-2">
                                            <span className="text-xs text-muted-foreground font-medium">API:</span>
                                            <span className="text-xs text-muted-foreground">
                                              {apiConfigurations.find(c => c.id === item.api_configuration_id)?.name || "Unknown Configuration"}
                                            </span>
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
                                            Add Sub-item
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
                        Add Field
                      </Button>
                    </div>
                  )}

                </div>
              </TabsContent>

              <TabsContent value="status" className="space-y-6 mt-0 h-full">
                <div className="space-y-4">
                  <div className="border-b pb-3 flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-medium">Workflow Statuses</h3>
                      <p className="text-sm text-muted-foreground">Define status options for this workflow</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddStatus}
                      className="gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      Add Status
                    </Button>
                  </div>

                  {(editingWorkflow ? workflowStatuses.length === 0 : pendingStatuses.length === 0) ? (
                    <div className="text-center py-12 border-2 border-dashed rounded-lg bg-muted/30">
                      <div className="flex flex-col items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                          <Plus className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">No statuses yet</p>
                          <p className="text-sm text-muted-foreground">
                            {editingWorkflow ? "Add status options for this workflow" : "Add statuses now; they will be created when you save the workflow"}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleAddStatus}
                          className="gap-2 mt-2"
                        >
                          <Plus className="h-4 w-4" />
                          Add Status
                        </Button>
                      </div>
                    </div>
                  ) : editingWorkflow ? (
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
                            style={{ backgroundColor: status.color }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold text-sm">{status.name}</h4>
                              {defaultStatusId === status.id && (
                                <Badge variant="secondary" className="text-xs flex items-center gap-1">
                                  <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                                  Default
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">Order: {status.order + 1}</p>
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
                              title={defaultStatusId === status.id ? "Default status" : "Set as default"}
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
                  ) : (
                    <div className="space-y-2">
                      {pendingStatuses.map((pending, index) => (
                        <div
                          key={pending.tempId}
                          draggable
                          onDragStart={(e) => handleStatusDragStart(e, pending.tempId)}
                          onDragOver={(e) => handleStatusDragOver(e, index)}
                          onDragLeave={handleStatusDragLeave}
                          onDrop={(e) => handleStatusDrop(e, index)}
                          onDragEnd={handleStatusDragEnd}
                          className={`group relative flex items-center gap-3 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-move ${dragOverStatusIndex === index && draggedStatusId !== pending.tempId
                            ? "border-primary border-2"
                            : ""
                            } ${draggedStatusId === pending.tempId ? "opacity-50" : ""}`}
                        >
                          <GripVertical className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                          <div
                            className="w-4 h-4 rounded-full flex-shrink-0 border-2 border-background shadow-sm"
                            style={{ backgroundColor: pending.color }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold text-sm">{pending.name}</h4>
                              {index === 0 && (
                                <Badge variant="secondary" className="text-xs flex items-center gap-1">
                                  <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                                  Default
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">Order: {index + 1}</p>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleEditPendingStatus(pending)}
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => handleDeletePendingStatus(pending.tempId)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <Dialog open={isStatusDialogOpen} onOpenChange={setIsStatusDialogOpen}>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle>{editingStatusId || editingPendingStatusId ? "Edit" : "Add"} Status</DialogTitle>
                        <DialogDescription>
                          {editingStatusId || editingPendingStatusId ? "Update" : "Add"} a status option for this workflow
                        </DialogDescription>
                      </DialogHeader>
                      <form onSubmit={handleSubmitStatus} className="space-y-4">
                        <div>
                          <Label htmlFor="status-name">Name</Label>
                          <Input
                            id="status-name"
                            value={statusFormData.name}
                            onChange={(e) => setStatusFormData({ ...statusFormData, name: e.target.value })}
                            placeholder="e.g., In Progress"
                            required
                          />
                        </div>
                        <div>
                          <Label htmlFor="status-color">Color</Label>
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
                              placeholder="#3b82f6"
                              pattern="^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$"
                              className="flex-1"
                            />
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Choose a color to represent this status
                          </p>
                        </div>
                        <div className="flex justify-end gap-2 pt-4">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsStatusDialogOpen(false)}
                          >
                            Cancel
                          </Button>
                          <Button type="submit">
                            {editingStatusId ? "Update" : "Create"}
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
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateOrUpdate}>
              {editingWorkflow ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreateWorkflowDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSelectManual={() => {
          setShowCreateDialog(false);
          // Open dialog with current category context
          openDialog();
        }}
        onSelectAI={() => {
          setShowCreateDialog(false);
          setShowAIChat(true);
        }}
      />

      <WorkflowAIChat
        open={showAIChat}
        onOpenChange={setShowAIChat}
        companyId={companyId}
      />

      <CategoryDialog
        key={editingCategory ? `edit-${editingCategory.id}` : `new-${dialogKeyCounter}-${pendingParentIdRef.current ?? pendingParentId ?? 'root'}`}
        open={isCategoryDialogOpen}
        onOpenChange={(open) => {
          setIsCategoryDialogOpen(open);
          if (!open) {
            // Reset when dialog closes
            setEditingCategory(null);
            setPendingParentId(null);
            pendingParentIdRef.current = null;
          }
        }}
        category={editingCategory}
        companyId={companyId || ""}
        onSuccess={handleCategoryDialogSuccess}
        defaultParentCategoryId={editingCategory ? undefined : (pendingParentIdRef.current ?? pendingParentId)}
      />

      {/* Duplicate workflow to company (super admin only) */}
      <Dialog
        open={duplicateToCompanyDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setDuplicateToCompanyDialogOpen(false);
            setWorkflowToDuplicate(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Duplicate workflow</DialogTitle>
            <DialogDescription>
              Copy this workflow to another company. The workflow, its steps, connections, and statuses will be copied.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="duplicate-target-company">Target company</Label>
              {loadingCompaniesForDuplicate ? (
                <p className="text-sm text-muted-foreground">Loading companies...</p>
              ) : (
                <Select
                  value={duplicateTargetCompanyId}
                  onValueChange={setDuplicateTargetCompanyId}
                  disabled={loadingCompaniesForDuplicate}
                >
                  <SelectTrigger id="duplicate-target-company">
                    <SelectValue placeholder="Select company" />
                  </SelectTrigger>
                  <SelectContent>
                    {allCompanies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                        {c.id === companyId ? " (current)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDuplicateToCompanyDialogOpen(false);
                setWorkflowToDuplicate(null);
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={!workflowToDuplicate || !duplicateTargetCompanyId || loadingCompaniesForDuplicate}
              onClick={async () => {
                if (!workflowToDuplicate || !duplicateTargetCompanyId) return;
                await handleDuplicate(workflowToDuplicate, duplicateTargetCompanyId);
                setDuplicateToCompanyDialogOpen(false);
                setWorkflowToDuplicate(null);
              }}
            >
              Duplicate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!workflowToDelete} onOpenChange={(open) => !open && setWorkflowToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the workflow
              "{workflowToDelete?.name}" and all of its history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                executeDelete();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
