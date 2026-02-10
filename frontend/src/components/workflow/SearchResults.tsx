import { ChevronDown, Folder, Workflow, FolderOpen } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { renderIcon } from "@/lib/iconUtils";

interface Workflow {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  category_id: string | null;
}

interface Category {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  parent_category_id: string | null;
}

interface SearchResultsProps {
  workflows: Workflow[];
  categories: Category[];
  searchQuery: string;
  onWorkflowClick: (workflowId: string) => void;
  onCategoryClick: (categoryId: string) => void;
  onClearSearch?: () => void;
}

export function SearchResults({
  workflows,
  categories,
  searchQuery,
  onWorkflowClick,
  onCategoryClick,
  onClearSearch,
}: SearchResultsProps) {
  // Get icon component from name
  const getIcon = (iconName: string | null, defaultIcon: any, size: string = "h-5 w-5") => {
    // Return null if no icon name provided (don't show default)
    if (!iconName) {
      return null;
    }
    
    // Use the icon utility to render the icon
    return renderIcon(iconName, `${size} text-primary`, defaultIcon);
  };

  // Highlight matching text
  const highlightText = (text: string, query: string) => {
    if (!query) return text;
    const regex = new RegExp(`(${query})`, "gi");
    const parts = text.split(regex);
    return parts.map((part, index) =>
      regex.test(part) ? (
        <mark key={index} className="bg-yellow-200 dark:bg-yellow-800">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  // Group workflows by category
  const workflowsByCategory = workflows.reduce((acc, workflow) => {
    const categoryId = workflow.category_id || "uncategorized";
    if (!acc[categoryId]) {
      acc[categoryId] = [];
    }
    acc[categoryId].push(workflow);
    return acc;
  }, {} as Record<string, Workflow[]>);

  // Get category path for display
  const getCategoryPath = (categoryId: string): string => {
    const category = categories.find((c) => c.id === categoryId);
    if (!category) return "Unknown";
    
    const path: string[] = [];
    let current: Category | undefined = category;
    
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

  // Get all category IDs including parents
  const getAllCategoryIds = (categoryId: string): string[] => {
    const ids: string[] = [categoryId];
    let current = categories.find((c) => c.id === categoryId);
    
    while (current?.parent_category_id) {
      ids.push(current.parent_category_id);
      current = categories.find((c) => c.id === current!.parent_category_id);
    }
    
    return ids;
  };

  // Find matching categories (categories whose names match the search)
  const matchingCategories = categories.filter((cat) =>
    cat.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get unique category IDs that have workflows or are matching
  const relevantCategoryIds = new Set<string>();
  Object.keys(workflowsByCategory).forEach((id) => {
    if (id !== "uncategorized") {
      getAllCategoryIds(id).forEach((cid) => relevantCategoryIds.add(cid));
    }
  });
  matchingCategories.forEach((cat) => relevantCategoryIds.add(cat.id));

  // Organize categories hierarchically
  const organizedCategories = Array.from(relevantCategoryIds)
    .map((id) => categories.find((c) => c.id === id))
    .filter((c): c is Category => c !== undefined)
    .sort((a, b) => {
      // Sort by depth (shallow first) then by name
      const depthA = getAllCategoryIds(a.id).length;
      const depthB = getAllCategoryIds(b.id).length;
      if (depthA !== depthB) return depthA - depthB;
      return a.name.localeCompare(b.name);
    });

  return (
    <div className="space-y-2">
      {/* Uncategorized workflows */}
      {workflowsByCategory["uncategorized"] && workflowsByCategory["uncategorized"].length > 0 && (
        <Collapsible defaultOpen>
          <CollapsibleTrigger className="flex items-center gap-2 w-full p-2 rounded-md hover:bg-accent text-left">
            <ChevronDown className="h-4 w-4 flex-shrink-0" />
            <Folder className="h-5 w-5 text-primary flex-shrink-0" />
            <span className="font-medium flex-1 min-w-0">Uncategorized</span>
            <span className="text-sm text-muted-foreground ml-auto flex-shrink-0">
              ({workflowsByCategory["uncategorized"].length})
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent className="pl-6 mt-2 space-y-2">
            {workflowsByCategory["uncategorized"].map((workflow) => {
              const IconComponent = getIcon(workflow.icon, Workflow, "h-5 w-5");
              return (
                <Card
                  key={workflow.id}
                  className="hover:shadow-md transition-shadow"
                >
                  <CardHeader className="p-4">
                    <div className="cursor-pointer" onClick={() => onWorkflowClick(workflow.id)}>
                      <CardTitle className="text-base flex items-center gap-3">
                        {IconComponent && <span className="flex-shrink-0 flex items-center justify-center">{IconComponent}</span>}
                        <span className="flex-1 min-w-0">{highlightText(workflow.name, searchQuery)}</span>
                      </CardTitle>
                      {workflow.description && (
                        <CardDescription className="mt-2">
                          {highlightText(workflow.description, searchQuery)}
                        </CardDescription>
                      )}
                    </div>
                  </CardHeader>
                </Card>
              );
            })}
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Categorized workflows */}
      {organizedCategories.map((category) => {
        const categoryWorkflows = workflowsByCategory[category.id] || [];
        const isMatching = matchingCategories.some((c) => c.id === category.id);
        const hasWorkflows = categoryWorkflows.length > 0;
        
        // Skip if category doesn't match and has no workflows
        if (!isMatching && !hasWorkflows) return null;

        const IconComponent = getIcon(category.icon, Folder, "h-5 w-5");
        const categoryPath = getCategoryPath(category.id);

        return (
          <Collapsible key={category.id} defaultOpen>
            <div className="flex items-center gap-2">
              <CollapsibleTrigger className="flex items-center gap-2 flex-1 w-full p-2 rounded-md hover:bg-accent text-left">
                <ChevronDown className="h-4 w-4 flex-shrink-0" />
                {IconComponent && <span className="flex-shrink-0 flex items-center justify-center">{IconComponent}</span>}
                <span className="font-medium flex-1 min-w-0">
                  {highlightText(categoryPath, searchQuery)}
                </span>
                {hasWorkflows && (
                  <span className="text-sm text-muted-foreground ml-auto flex-shrink-0">
                    ({categoryWorkflows.length})
                  </span>
                )}
              </CollapsibleTrigger>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2 flex-shrink-0 gap-1.5 mr-2"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onClearSearch) {
                    onClearSearch();
                  }
                  onCategoryClick(category.id);
                }}
                title="Go to category"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                <span className="text-xs">Go to</span>
              </Button>
            </div>
            <CollapsibleContent className="pl-6 mt-2 space-y-2">
              {categoryWorkflows.map((workflow) => {
                const WorkflowIcon = getIcon(workflow.icon, Workflow, "h-5 w-5");
                return (
                <Card
                  key={workflow.id}
                  className="hover:shadow-md transition-shadow"
                >
                  <CardHeader className="p-4">
                    <div className="cursor-pointer" onClick={() => onWorkflowClick(workflow.id)}>
                      <CardTitle className="text-base flex items-center gap-3">
                        {WorkflowIcon && <span className="flex-shrink-0 flex items-center justify-center">{WorkflowIcon}</span>}
                        <span className="flex-1 min-w-0">{highlightText(workflow.name, searchQuery)}</span>
                      </CardTitle>
                      {workflow.description && (
                        <CardDescription className="mt-2">
                          {highlightText(workflow.description, searchQuery)}
                        </CardDescription>
                      )}
                    </div>
                  </CardHeader>
                </Card>
                );
              })}
            </CollapsibleContent>
          </Collapsible>
        );
      })}

      {workflows.length === 0 && categories.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No results found for "{searchQuery}"
        </div>
      )}
    </div>
  );
}

