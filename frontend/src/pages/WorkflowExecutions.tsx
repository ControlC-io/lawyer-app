import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useState, useMemo, useEffect } from "react";
import { useCompanyId } from "@/hooks/useCompanyId";
import { useAuth } from "@/contexts/AuthContext";
import { ExecutionFilters, FilterType } from "@/components/execution/list/ExecutionFilters";
import { CategorySidebar, CategoryNode } from "@/components/execution/list/CategorySidebar";
import { WorkflowMobilePicker } from "@/components/execution/list/WorkflowMobilePicker";
import { ExecutionList } from "@/components/execution/list/ExecutionList";
import { KanbanView } from "@/components/execution/list/KanbanView";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useLanguage } from "@/contexts/LanguageContext";
import { useIsMobile } from "@/hooks/use-mobile";

// Define types for our data
interface Category {
  id: string;
  name: string;
  parent_category_id: string | null;
  icon: string | null;
}

interface Workflow {
  id: string;
  name: string;
  category_id: string | null;
  icon: string | null;
}

interface Execution {
  id: string;
  status: string;
  started_at: string | null;
  created_by: string | null;
  workflows: Workflow | null;
  current_step_name?: string;
  current_step_names?: string[];
  current_step_types?: Array<string | null>;
  name?: string | null;
}

const WorkflowExecutions = () => {
  const companyId = useCompanyId();
  const { profile } = useAuth();
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [showCompleted, setShowCompleted] = useState<boolean>(() => {
    const saved = localStorage.getItem("workflow_executions_show_completed");
    return saved === "true";
  });

  // Save showCompleted to localStorage when it changes
  useEffect(() => {
    localStorage.setItem("workflow_executions_show_completed", String(showCompleted));
  }, [showCompleted]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Special identifier for uncategorized category
  const UNCATEGORIZED_CATEGORY_ID = "__uncategorized__";

  const { data: categories } = useQuery({
    queryKey: ["workflow_categories", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      return api.get<Category[]>(`/api/companies/${companyId}/workflow-categories`);
    },
    enabled: !!companyId,
  });

  const { data: executionsRaw, isLoading } = useQuery({
    queryKey: ["workflow_executions_extended", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const list = await api.get<any[]>(`/api/companies/${companyId}/executions`);
      return (list || []).map((e) => ({ ...e, workflows: e.workflow ?? null }));
    },
    enabled: !!companyId,
  });
  const executions = executionsRaw;

  const { data: runningSteps } = useQuery({
    queryKey: ["running_steps_assignments", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const stepsData = await api.get<any[]>(
        `/api/companies/${companyId}/execution-steps?status=running`
      );
      if (!stepsData?.length) return [];
      const userIds = [...new Set(stepsData.map((s) => s.assigned_to_user_id).filter(Boolean))];
      const groupIds = [...new Set(stepsData.map((s) => s.assigned_to_group_id).filter(Boolean))];
      const usersMap = new Map();
      const groupsMap = new Map();
      if (userIds.length > 0) {
        const users = await api.get<any[]>(`/api/companies/${companyId}/users`);
        (users || []).forEach((u) => usersMap.set(u.id, u));
      }
      if (groupIds.length > 0) {
        const groups = await api.get<any[]>(`/api/companies/${companyId}/groups`);
        (groups || []).forEach((g) => groupsMap.set(g.id, g));
      }
      return stepsData.map((step) => ({
        ...step,
        assigned_to_user: step.assigned_to_user_id ? usersMap.get(step.assigned_to_user_id) : null,
        assigned_to_group: step.assigned_to_group_id ? groupsMap.get(step.assigned_to_group_id) : null,
      }));
    },
    enabled: !!companyId,
  });

  const { data: userGroups } = useQuery({
    queryKey: ["user_groups", profile?.id, companyId],
    queryFn: async () => {
      if (!profile?.id || !companyId) return [];
      const data = await api.get<{ group_ids: string[] }>(`/api/companies/${companyId}/my-group-ids`);
      return data?.group_ids ?? [];
    },
    enabled: !!profile?.id && !!companyId,
  });

  const { data: workflows } = useQuery({
    queryKey: ["workflows", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      return api.get<Workflow[]>(`/api/companies/${companyId}/workflows`);
    },
    enabled: !!companyId,
  });

  const { data: workflowStatuses } = useQuery({
    queryKey: ["workflow_statuses", selectedWorkflowId, companyId],
    queryFn: async () => {
      if (!selectedWorkflowId || !companyId) return [];
      return api.get<any[]>(
        `/api/companies/${companyId}/workflows/${selectedWorkflowId}/statuses`
      );
    },
    enabled: !!selectedWorkflowId && !!companyId,
  });

  const { data: executionStepsForKanban } = useQuery({
    queryKey: ["execution_steps_kanban", selectedWorkflowId, companyId],
    queryFn: async () => {
      if (!selectedWorkflowId || !companyId) return [];
      const execList = await api.get<any[]>(
        `/api/companies/${companyId}/executions?workflowId=${selectedWorkflowId}`
      );
      if (!execList?.length) return [];
      const executionIds = execList.map((e) => e.id);
      const stepsData = await api.get<any[]>(
        `/api/companies/${companyId}/execution-steps?status=running`
      );
      const running = (stepsData || [])
        .filter((s) => executionIds.includes(s.execution_id))
        .map((s) => ({ ...s, status: "running" }));
      const pending = await api.get<any[]>(
        `/api/companies/${companyId}/execution-steps?status=pending`
      );
      const pendingForWorkflow = (pending || [])
        .filter((s) => executionIds.includes(s.execution_id))
        .map((s) => ({ ...s, status: "pending" }));
      const usersMap = new Map();
      const groupsMap = new Map();
      const allSteps = [...running, ...pendingForWorkflow];
      const userIds = [...new Set(allSteps.map((s) => s.assigned_to_user_id).filter(Boolean))];
      const groupIds = [...new Set(allSteps.map((s) => s.assigned_to_group_id).filter(Boolean))];
      if (userIds.length) {
        const users = await api.get<any[]>(`/api/companies/${companyId}/users`);
        (users || []).forEach((u) => usersMap.set(u.id, u));
      }
      if (groupIds.length) {
        const groups = await api.get<any[]>(`/api/companies/${companyId}/groups`);
        (groups || []).forEach((g) => groupsMap.set(g.id, g));
      }
      return allSteps.map((step) => ({
        ...step,
        assigned_to_user: step.assigned_to_user_id ? usersMap.get(step.assigned_to_user_id) : null,
        assigned_to_group: step.assigned_to_group_id ? groupsMap.get(step.assigned_to_group_id) : null,
      }));
    },
    enabled: !!selectedWorkflowId && !!companyId && (workflowStatuses?.length ?? 0) > 0,
  });

  const showKanban =
    !!selectedWorkflowId &&
    workflowStatuses !== undefined &&
    workflowStatuses.length > 0 &&
    executionStepsForKanban !== undefined;

  // Process data
  const processedData = useMemo(() => {
    if (!executions) return { filtered: [], counts: { all: 0, my_workflows: 0, my_tasks: 0 }, categories: [], uncategorizedWorkflows: [], uncategorizedCount: 0 };

    const myUserId = profile?.id;

    // Helper to check if an execution is assigned to the user
    const isAssignedToUser = (executionId: string) => {
      if (!runningSteps || !myUserId) return false;

      const steps = runningSteps.filter((s: any) => s.execution_id === executionId);
      if (steps.length === 0) return false;

      return steps.some((step: any) => {
        // Check direct assignment
        if (step.assigned_to_user_id === myUserId) return true;

        // Check group assignment
        if (step.assigned_to_group_id && userGroups && userGroups.includes(step.assigned_to_group_id)) {
          return true;
        }

        return false;
      });
    };

    // Calculate counts for top cards (respecting showCompleted)
    // Only show running executions by default, or both running and completed if showCompleted is true
    const counts = {
      all: executions.filter(e => e.status === "running" || (showCompleted && e.status === "completed")).length,
      my_workflows: executions.filter(e => e.created_by === myUserId && (e.status === "running" || (showCompleted && e.status === "completed"))).length,
      my_tasks: executions.filter(e => isAssignedToUser(e.id) && (e.status === "running" || (showCompleted && e.status === "completed"))).length,
    };

    // Helper to get all descendant category IDs
    const getDescendantCategoryIds = (categoryId: string): Set<string> => {
      const descendants = new Set<string>();
      descendants.add(categoryId);

      const children = categories?.filter(c => c.parent_category_id === categoryId) || [];
      children.forEach(child => {
        const childDescendants = getDescendantCategoryIds(child.id);
        childDescendants.forEach(id => descendants.add(id));
      });

      return descendants;
    };

    // Filter executions
    let filtered = executions.filter(e => {
      // Top Filter
      if (activeFilter === "my_workflows" && e.created_by !== myUserId) return false;
      if (activeFilter === "my_tasks" && !isAssignedToUser(e.id)) return false;

      // Status Filter - only show running by default, or both running and completed if showCompleted is true
      if (e.status !== "running" && !(showCompleted && e.status === "completed")) return false;

      // Workflow Filter (when a workflow is selected)
      if (selectedWorkflowId && e.workflows?.id !== selectedWorkflowId) return false;

      // Category Filter (only if no workflow is selected)
      if (!selectedWorkflowId && selectedCategoryId) {
        if (selectedCategoryId === UNCATEGORIZED_CATEGORY_ID) {
          // Filter for uncategorized workflows (category_id is null)
          if (e.workflows?.category_id !== null) return false;
        } else {
          const categoryIds = getDescendantCategoryIds(selectedCategoryId);
          if (!e.workflows?.category_id || !categoryIds.has(e.workflows.category_id)) return false;
        }
      }

      // Search Filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const executionName = e.name?.toLowerCase() || "";
        const workflowName = e.workflows?.name?.toLowerCase() || "";

        if (!executionName.includes(query) && !workflowName.includes(query)) {
          return false;
        }
      }

      return true;
    });

    // Enrich with all current running step names and assignees
    filtered = filtered.map(e => {
      const steps = runningSteps?.filter(s => s.execution_id === e.id) || [];
      const stepEntries = steps
        .map((s) => ({
          name: s.workflow_steps?.name,
          type: s.workflow_steps?.step_type ?? null,
        }))
        .filter((entry): entry is { name: string; type: string | null } => !!entry.name);
      const stepNames = stepEntries.map((entry) => entry.name);
      const stepTypes = stepEntries.map((entry) => entry.type);

      // Collect assignees from all running steps
      const assignees: Array<{ type: 'user' | 'group'; name: string }> = [];
      steps.forEach(step => {
        if (step.assigned_to_user_id && (step as any).assigned_to_user) {
          const user = (step as any).assigned_to_user;
          const userName = user.full_name || user.email;
          if (userName && !assignees.find(a => a.type === 'user' && a.name === userName)) {
            assignees.push({ type: 'user', name: userName });
          }
        }
        if (step.assigned_to_group_id && (step as any).assigned_to_group) {
          const group = (step as any).assigned_to_group;
          if (group.name && !assignees.find(a => a.type === 'group' && a.name === group.name)) {
            assignees.push({ type: 'group', name: group.name });
          }
        }
      });

      return {
        ...e,
        current_step_name: stepNames.length > 0 ? stepNames[0] : (e as any).current_step_name, // Keep for backward compatibility
        current_step_names: stepNames.length > 0 ? stepNames : (e as any).current_step_names,
        current_step_types: stepTypes.length > 0 ? stepTypes : (e as any).current_step_types,
        // Keep server-provided assignees when step feed is intentionally scoped to current user
        assignees: assignees.length > 0 ? assignees : (e as any).assignees
      };
    });

    // Build Category Hierarchy with counts
    const executionsForCounts = executions.filter(e => {
      if (activeFilter === "my_workflows" && e.created_by !== myUserId) return false;
      if (activeFilter === "my_tasks" && !isAssignedToUser(e.id)) return false;
      // Only count running executions by default, or both running and completed if showCompleted is true
      if (e.status !== "running" && !(showCompleted && e.status === "completed")) return false;
      return true;
    });

    const categoryCounts: Record<string, number> = {};
    const workflowCounts: Record<string, number> = {};
    let uncategorizedCount = 0;

    executionsForCounts.forEach(e => {
      const catId = e.workflows?.category_id;
      if (catId) {
        categoryCounts[catId] = (categoryCounts[catId] || 0) + 1;
      } else {
        // Count executions for uncategorized workflows
        uncategorizedCount++;
      }
      const workflowId = e.workflows?.id;
      if (workflowId) {
        workflowCounts[workflowId] = (workflowCounts[workflowId] || 0) + 1;
      }
    });

    const buildCategoryTree = (parentId: string | null): CategoryNode[] => {
      return (categories || [])
        .filter(c => c.parent_category_id === parentId)
        .map(c => {
          const children = buildCategoryTree(c.id);
          const ownCount = categoryCounts[c.id] || 0;
          const childrenCount = children.reduce((acc, child) => acc + child.count, 0);

          // Get workflows for this category
          const categoryWorkflows = (workflows || [])
            .filter(w => w.category_id === c.id)
            .map(w => ({
              id: w.id,
              name: w.name,
              count: workflowCounts[w.id] || 0,
              icon: w.icon
            }));

          return {
            id: c.id,
            name: c.name,
            count: ownCount + childrenCount,
            icon: c.icon,
            children,
            workflows: categoryWorkflows.length > 0 ? categoryWorkflows : undefined
          };
        });
    };

    const categoryTree = buildCategoryTree(null);

    // Get workflows without a category
    const uncategorizedWorkflows = (workflows || [])
      .filter(w => !w.category_id)
      .map(w => ({
        id: w.id,
        name: w.name,
        count: workflowCounts[w.id] || 0,
        icon: w.icon
      }));

    return { filtered, counts, categories: categoryTree, uncategorizedWorkflows, uncategorizedCount };
  }, [executions, categories, workflows, runningSteps, userGroups, activeFilter, showCompleted, selectedCategoryId, selectedWorkflowId, profile?.id, searchQuery]);

  // Filter execution steps based on active filter (specifically for My Tasks)
  const filteredExecutionSteps = useMemo(() => {
    if (!executionStepsForKanban) return [];

    if (activeFilter === "my_tasks") {
      return executionStepsForKanban.filter(step => {
        const isUserAssigned = step.assigned_to_user_id === profile?.id;
        const isGroupAssigned = step.assigned_to_group_id && userGroups?.includes(step.assigned_to_group_id);
        return isUserAssigned || isGroupAssigned;
      });
    }

    return executionStepsForKanban;
  }, [executionStepsForKanban, activeFilter, profile?.id, userGroups]);

  const { t } = useLanguage();
  const isMobile = useIsMobile();

  if (isLoading) {
    return <div className="p-6">{t("workflowExecutions.loadingExecutions")}</div>;
  }

  return (
    <div className="h-full flex flex-col p-3 md:p-4 gap-4 overflow-hidden">
      <div className="flex-shrink-0">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold mb-0.5 sm:mb-1">{t("workflowExecutions.title")}</h1>
        <p className="text-muted-foreground text-sm mb-2 sm:text-base sm:mb-4">{t("workflowExecutions.subtitle")}</p>

        <ExecutionFilters
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          showCompleted={showCompleted}
          onShowCompletedChange={setShowCompleted}
          counts={processedData.counts}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />
      </div>

      <div className="flex-1 min-h-0 border rounded-lg overflow-hidden bg-background shadow-sm">
        {isMobile ? (
          <div className="h-full flex flex-col overflow-hidden">
            <WorkflowMobilePicker
              categories={processedData.categories}
              uncategorizedWorkflows={processedData.uncategorizedWorkflows}
              uncategorizedCount={processedData.uncategorizedCount}
              uncategorizedCategoryId={UNCATEGORIZED_CATEGORY_ID}
              selectedCategoryId={selectedCategoryId}
              selectedWorkflowId={selectedWorkflowId}
              onSelectCategory={(id) => {
                setSelectedCategoryId(id);
                if (id !== selectedCategoryId) {
                  setSelectedWorkflowId(null);
                }
              }}
              onSelectWorkflow={setSelectedWorkflowId}
              totalCount={processedData.counts[activeFilter]}
            />
            <div className="flex-1 min-h-0 overflow-hidden">
              {showKanban ? (
                <KanbanView
                  executions={processedData.filtered}
                  workflowStatuses={workflowStatuses!}
                  executionSteps={filteredExecutionSteps}
                />
              ) : (
                <ExecutionList executions={processedData.filtered} />
              )}
            </div>
          </div>
        ) : (
        <ResizablePanelGroup direction="horizontal">
          <ResizablePanel defaultSize={20} minSize={15} maxSize={30}>
            <CategorySidebar
              categories={processedData.categories}
              uncategorizedWorkflows={processedData.uncategorizedWorkflows}
              uncategorizedCount={processedData.uncategorizedCount}
              uncategorizedCategoryId={UNCATEGORIZED_CATEGORY_ID}
              selectedCategoryId={selectedCategoryId}
              selectedWorkflowId={selectedWorkflowId}
              onSelectCategory={(id) => {
                setSelectedCategoryId(id);
                if (id !== selectedCategoryId) {
                  setSelectedWorkflowId(null);
                }
              }}
              onSelectWorkflow={setSelectedWorkflowId}
              totalCount={processedData.counts[activeFilter]} // Total for "All Categories"
            />
          </ResizablePanel>

          <ResizableHandle />

          <ResizablePanel defaultSize={80}>
            <div className="h-full flex flex-col overflow-hidden">
              {showKanban ? (
                <KanbanView
                  executions={processedData.filtered}
                  workflowStatuses={workflowStatuses!}
                  executionSteps={filteredExecutionSteps}
                />
              ) : (
                <ExecutionList executions={processedData.filtered} />
              )}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
        )}
      </div>
    </div>
  );
};

export default WorkflowExecutions;