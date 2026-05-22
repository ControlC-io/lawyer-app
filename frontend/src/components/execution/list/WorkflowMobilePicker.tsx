import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { CategoryNode } from "./CategorySidebar";

interface WorkflowOption {
  id: string;
  name: string;
  count: number;
  categoryId: string;
  categoryName: string;
}

interface WorkflowMobilePickerProps {
  categories: CategoryNode[];
  uncategorizedWorkflows: Array<{ id: string; name: string; count: number; icon: string | null }>;
  uncategorizedCategoryId: string;
  selectedCategoryId: string | null;
  selectedWorkflowId: string | null;
  onSelectCategory: (id: string | null) => void;
  onSelectWorkflow: (id: string | null) => void;
  totalCount: number;
}

function collectCategoryWorkflows(
  nodes: CategoryNode[],
  groups: Map<string, WorkflowOption[]>
) {
  for (const node of nodes) {
    if (node.workflows?.length) {
      const existing = groups.get(node.name) ?? [];
      for (const workflow of node.workflows) {
        existing.push({
          id: workflow.id,
          name: workflow.name,
          count: workflow.count,
          categoryId: node.id,
          categoryName: node.name,
        });
      }
      groups.set(node.name, existing);
    }
    if (node.children.length) {
      collectCategoryWorkflows(node.children, groups);
    }
  }
}

function workflowValue(categoryId: string, workflowId: string) {
  return `${categoryId}:${workflowId}`;
}

export const WorkflowMobilePicker = ({
  categories,
  uncategorizedWorkflows,
  uncategorizedCategoryId,
  selectedCategoryId,
  selectedWorkflowId,
  onSelectCategory,
  onSelectWorkflow,
  totalCount,
}: WorkflowMobilePickerProps) => {
  const { t } = useLanguage();

  const { groupedWorkflows, currentValue } = useMemo(() => {
    const groups = new Map<string, WorkflowOption[]>();

    if (uncategorizedWorkflows.length > 0) {
      groups.set(
        t("workflowMobilePicker.uncategorized"),
        uncategorizedWorkflows.map((workflow) => ({
          id: workflow.id,
          name: workflow.name,
          count: workflow.count,
          categoryId: uncategorizedCategoryId,
          categoryName: t("workflowMobilePicker.uncategorized"),
        }))
      );
    }

    collectCategoryWorkflows(categories, groups);

    const value =
      selectedWorkflowId && selectedCategoryId
        ? workflowValue(selectedCategoryId, selectedWorkflowId)
        : "all";

    return { groupedWorkflows: groups, currentValue: value };
  }, [
    categories,
    uncategorizedWorkflows,
    uncategorizedCategoryId,
    selectedCategoryId,
    selectedWorkflowId,
    t,
  ]);

  const handleSelectChange = (value: string) => {
    if (value === "all") {
      onSelectCategory(null);
      onSelectWorkflow(null);
      return;
    }

    const [categoryId, workflowId] = value.split(":");
    onSelectCategory(categoryId);
    onSelectWorkflow(workflowId);
  };

  return (
    <div className="flex-shrink-0 border-b bg-card/50 p-3">
      <Select value={currentValue} onValueChange={handleSelectChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder={t("executionFilters.allWorkflows")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">
            {t("executionFilters.allWorkflows")} ({totalCount})
          </SelectItem>
          {Array.from(groupedWorkflows.entries()).map(([groupName, workflows]) => (
            <SelectGroup key={groupName}>
              <SelectLabel>{groupName}</SelectLabel>
              {workflows.map((workflow) => (
                <SelectItem
                  key={workflowValue(workflow.categoryId, workflow.id)}
                  value={workflowValue(workflow.categoryId, workflow.id)}
                >
                  {workflow.name} ({workflow.count})
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
