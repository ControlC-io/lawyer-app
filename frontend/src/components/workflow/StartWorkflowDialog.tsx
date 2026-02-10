import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { useCompanyId } from "@/hooks/useCompanyId";
import { useCompanyApiKey } from "@/hooks/useCompanyApiKey";
import { SearchResults } from "@/components/workflow/SearchResults";
import { CategoryBreadcrumb } from "@/components/workflow/CategoryBreadcrumb";
import { CategoryCard } from "@/components/workflow/CategoryCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Search, Workflow as WorkflowIcon } from "lucide-react";
import { renderIcon } from "@/lib/iconUtils";

interface StartWorkflowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Workflow {
  id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  icon: string | null;
  category_id: string | null;
}

interface WorkflowCategory {
  id: string;
  name: string;
  description: string | null;
  parent_category_id: string | null;
  icon: string | null;
}

export function StartWorkflowDialog({ open, onOpenChange }: StartWorkflowDialogProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const companyId = useCompanyId();
  const apiKey = useCompanyApiKey(companyId);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentCategoryId, setCurrentCategoryId] = useState<string | null>(null);
  const [categoryBreadcrumb, setCategoryBreadcrumb] = useState<WorkflowCategory[]>([]);

  // Fetch categories (API)
  const { data: categories = [] } = useQuery({
    queryKey: ["workflow_categories", companyId],
    queryFn: () => api.get<WorkflowCategory[]>(`/api/companies/${companyId}/workflow-categories`),
    enabled: !!companyId && open,
  });

  // Fetch workflows (API) - backend returns all company workflows; we filter is_active client-side
  const { data: workflowsRaw = [] } = useQuery({
    queryKey: ["workflows", companyId],
    queryFn: () => api.get<Workflow[]>(`/api/companies/${companyId}/workflows`),
    enabled: !!companyId && open,
  });
  const workflows = (workflowsRaw as any[]).filter((w: any) => w.is_active !== false);
  const accessibleWorkflows = workflows;

  // Update breadcrumb when current category changes
  useEffect(() => {
    if (currentCategoryId === null) {
      // Only update if not already empty to avoid infinite loops
      setCategoryBreadcrumb((prev) => (prev.length === 0 ? prev : []));
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

    const newBreadcrumb = buildBreadcrumb(currentCategoryId);
    setCategoryBreadcrumb((prev) => {
      // Only update if the breadcrumb actually changed
      if (prev.length !== newBreadcrumb.length) return newBreadcrumb;
      const isSame = prev.every((cat, idx) => cat.id === newBreadcrumb[idx]?.id);
      return isSame ? prev : newBreadcrumb;
    });
  }, [currentCategoryId, categories]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setSearchQuery("");
      setCurrentCategoryId(null);
    }
  }, [open]);

  const startExecutionMutation = useMutation({
    mutationFn: async (workflowId: string) => {
      if (!companyId || !apiKey) {
        throw new Error("Company or API key not set");
      }
      const res = await api.post<{ execution_id?: string }>(
        `/api/workflows/${workflowId}/trigger`,
        {},
        { apiKey: apiKey ?? undefined }
      );
      const executionId = res?.execution_id;
      if (!executionId) throw new Error("No execution ID returned");
      return { id: executionId };
    },
    onSuccess: (execution) => {
      queryClient.invalidateQueries({ queryKey: ["workflow_executions"] });
      toast({
        title: "Execution started",
        description: "The workflow execution has been created successfully",
      });
      onOpenChange(false);
      navigate(`/executions/${execution.id}`);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Get icon component from name
  const getIcon = (iconName: string | null) => {
    return renderIcon(iconName, "h-6 w-6");
  };

  // Filter workflows and categories based on search query
  const filteredWorkflows = searchQuery
    ? workflows.filter(
      (w) =>
        w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (w.description && w.description.toLowerCase().includes(searchQuery.toLowerCase()))
    )
    : workflows.filter((w) => w.category_id === currentCategoryId);

  const filteredCategories = searchQuery
    ? categories.filter((c) => c.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : [];

  // Get subcategories for current category
  const subcategories = categories.filter((c) => c.parent_category_id === currentCategoryId);

  // Count workflows per category
  const getCategoryWorkflowCount = (categoryId: string): number => {
    const directCount = workflows.filter((w) => w.category_id === categoryId).length;
    const childCategories = categories.filter((c) => c.parent_category_id === categoryId);
    const childCount = childCategories.reduce((acc, cat) => acc + getCategoryWorkflowCount(cat.id), 0);
    return directCount + childCount;
  };

  const handleWorkflowClick = (workflowId: string) => {
    startExecutionMutation.mutate(workflowId);
  };

  const handleCategoryClick = (categoryId: string) => {
    setCurrentCategoryId(categoryId);
    setSearchQuery("");
  };

  const handleNavigate = (categoryId: string | null) => {
    setCurrentCategoryId(categoryId);
  };

  const handleClearSearch = () => {
    setSearchQuery("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Start New Execution</DialogTitle>
          <DialogDescription>
            Browse categories or search to find a workflow to execute
          </DialogDescription>
        </DialogHeader>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search workflows..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Content Area - Scrollable */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {searchQuery ? (
            // Search Results
            <SearchResults
              workflows={filteredWorkflows}
              categories={filteredCategories}
              searchQuery={searchQuery}
              onWorkflowClick={handleWorkflowClick}
              onCategoryClick={handleCategoryClick}
              onClearSearch={handleClearSearch}
            />
          ) : (
            // Category Navigation
            <div className="space-y-4">
              {/* Breadcrumb */}
              {categoryBreadcrumb.length > 0 && (
                <CategoryBreadcrumb
                  categories={categoryBreadcrumb}
                  onNavigate={handleNavigate}
                />
              )}

              {/* Subcategories */}
              {subcategories.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-3">Categories</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {subcategories.map((category) => {
                      const workflowCount = getCategoryWorkflowCount(category.id);
                      return (
                        <CategoryCard
                          key={category.id}
                          id={category.id}
                          name={category.name}
                          description={category.description}
                          icon={category.icon}
                          itemCount={workflowCount}
                          onClick={() => handleCategoryClick(category.id)}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Workflows in current category */}
              {filteredWorkflows.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-3">Workflows</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {filteredWorkflows.map((workflow) => {
                      const IconComponent = getIcon(workflow.icon);
                      return (
                        <Card
                          key={workflow.id}
                          className="hover:shadow-md transition-shadow cursor-pointer"
                          onClick={() => handleWorkflowClick(workflow.id)}
                        >
                          <CardHeader className="p-4">
                            <CardTitle className="text-base flex items-center gap-3">
                              {IconComponent ? (
                                <span className="flex-shrink-0 text-primary">{IconComponent}</span>
                              ) : (
                                <WorkflowIcon className="h-6 w-6 flex-shrink-0 text-primary" />
                              )}
                              <span className="flex-1 min-w-0">{workflow.name}</span>
                            </CardTitle>
                            {workflow.description && (
                              <CardDescription className="mt-2">
                                {workflow.description}
                              </CardDescription>
                            )}
                          </CardHeader>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Empty State */}
              {subcategories.length === 0 && filteredWorkflows.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <WorkflowIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">No workflows found</p>
                  <p className="text-sm mt-2">
                    {currentCategoryId
                      ? "This category doesn't contain any workflows yet."
                      : "You don't have permission to execute any workflows."}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
