import { cn } from "@/lib/utils";
import { Folder, FolderOpen, ChevronRight, ChevronDown, FileText, Layout } from "lucide-react";
import { useState } from "react";
import React from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { renderIcon } from "@/lib/iconUtils";

export interface CategoryNode {
    id: string;
    name: string;
    count: number;
    icon: string | null;
    children: CategoryNode[];
    workflows?: Array<{ id: string; name: string; count: number; icon: string | null }>;
}

interface CategorySidebarProps {
    categories: CategoryNode[];
    uncategorizedWorkflows: Array<{ id: string; name: string; count: number; icon: string | null }>;
    uncategorizedCount: number;
    uncategorizedCategoryId: string;
    selectedCategoryId: string | null;
    selectedWorkflowId: string | null;
    onSelectCategory: (id: string | null) => void;
    onSelectWorkflow: (id: string | null) => void;
    totalCount: number;
}

// Helper to get icon component from name
const getIcon = (iconName: string | null, DefaultIcon: React.ComponentType<{ className?: string }>) => {
    if (!iconName) {
        return <DefaultIcon className="h-4 w-4" />;
    }
    const rendered = renderIcon(iconName, "h-4 w-4", DefaultIcon);
    return rendered || <DefaultIcon className="h-4 w-4" />;
};

const CategoryItem = ({
    node,
    level = 0,
    selectedCategoryId,
    selectedWorkflowId,
    onSelectCategory,
    onSelectWorkflow,
}: {
    node: CategoryNode;
    level?: number;
    selectedCategoryId: string | null;
    selectedWorkflowId: string | null;
    onSelectCategory: (id: string | null) => void;
    onSelectWorkflow: (id: string | null) => void;
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const hasChildren = node.children && node.children.length > 0;
    const hasWorkflows = node.workflows && node.workflows.length > 0;
    const isEmpty = !hasChildren && !hasWorkflows;
    
    const isCategorySelected = selectedCategoryId === node.id && !selectedWorkflowId;
    const isChildSelected = selectedCategoryId === node.id && !!selectedWorkflowId; // Used for expanding parent if needed, logic handled by parent usually
    
    // Auto-open if selected is inside (simple heuristic, could be improved with context or prop)
    // specific logic for selection is handled by parent passing down, but local state persists
    
    const categoryIcon = getIcon(node.icon, isOpen ? FolderOpen : Folder);

    return (
        <div className="select-none">
            <Button
                variant="ghost"
                size="sm"
                className={cn(
                    "w-full justify-start mb-0.5 h-9 px-2 transition-all duration-200 ease-in-out group",
                    isCategorySelected 
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium shadow-sm" 
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
                style={{ paddingLeft: `${level * 16 + 8}px` }}
                onClick={() => {
                    onSelectCategory(node.id);
                    onSelectWorkflow(null);
                }}
            >
                <div
                    className={cn(
                        "mr-1.5 p-0.5 rounded-sm transition-colors cursor-pointer",
                        !isEmpty && "hover:bg-muted-foreground/20",
                        isEmpty && "opacity-50 cursor-default"
                    )}
                    onClick={(e) => {
                        if (!isEmpty) {
                            e.stopPropagation();
                            setIsOpen(!isOpen);
                        }
                    }}
                >
                    {!isEmpty ? (
                        isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />
                    ) : (
                        <div className="w-3.5" />
                    )}
                </div>

                <span className={cn("mr-2 flex-shrink-0 flex items-center justify-center", isCategorySelected ? "text-primary" : "text-muted-foreground group-hover:text-primary/80")}>
                    {categoryIcon}
                </span>
                
                <span className="truncate flex-1 text-left text-sm">{node.name}</span>
                
                {node.count > 0 && (
                    <span className={cn(
                        "ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-medium transition-colors",
                        isCategorySelected 
                            ? "bg-background/50 text-foreground" 
                            : "bg-muted text-muted-foreground group-hover:bg-muted-foreground/10"
                    )}>
                        {node.count}
                    </span>
                )}
            </Button>

            {isOpen && !isEmpty && (
                <div className="relative">
                    {/* Guide line for hierarchy */}
                    <div 
                        className="absolute left-0 top-0 bottom-0 border-l border-border/40" 
                        style={{ left: `${level * 16 + 15}px` }} 
                    />
                    
                    <div className="flex flex-col gap-0.5">
                        {node.workflows?.map((workflow) => {
                            const workflowIcon = getIcon(workflow.icon, FileText);
                            const isWorkflowSelected = selectedWorkflowId === workflow.id;
                            
                            return (
                                <Button
                                    key={workflow.id}
                                    variant="ghost"
                                    size="sm"
                                    className={cn(
                                        "w-full justify-start h-8 px-2 transition-all duration-200 group/item",
                                        isWorkflowSelected 
                                            ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" 
                                            : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                                    )}
                                    style={{ paddingLeft: `${(level + 1) * 16 + 20}px` }} // Indented more for hierarchy
                                    onClick={() => {
                                        onSelectCategory(node.id);
                                        onSelectWorkflow(workflow.id);
                                    }}
                                >
                                    <span className={cn(
                                        "mr-2 transition-colors flex-shrink-0 flex items-center justify-center", 
                                        isWorkflowSelected ? "text-primary" : "text-muted-foreground/70 group-hover/item:text-primary/70"
                                    )}>
                                        {workflowIcon}
                                    </span>
                                    <span className="truncate flex-1 text-left text-sm">{workflow.name}</span>
                                    {workflow.count > 0 && (
                                        <span className={cn(
                                            "ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                                            isWorkflowSelected
                                                ? "bg-background/50 text-foreground"
                                                : "bg-muted text-muted-foreground"
                                        )}>
                                            {workflow.count}
                                        </span>
                                    )}
                                </Button>
                            );
                        })}
                        
                        {node.children.map((child) => (
                            <CategoryItem
                                key={child.id}
                                node={child}
                                level={level + 1}
                                selectedCategoryId={selectedCategoryId}
                                selectedWorkflowId={selectedWorkflowId}
                                onSelectCategory={onSelectCategory}
                                onSelectWorkflow={onSelectWorkflow}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export const CategorySidebar = ({
    categories,
    uncategorizedWorkflows,
    uncategorizedCount,
    uncategorizedCategoryId,
    selectedCategoryId,
    selectedWorkflowId,
    onSelectCategory,
    onSelectWorkflow,
    totalCount,
}: CategorySidebarProps) => {
    const isAllSelected = selectedCategoryId === null && selectedWorkflowId === null;

    return (
        <div className="h-full flex flex-col bg-card/50 border-r">
            <div className="p-4 border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
                <h3 className="font-semibold text-sm tracking-tight">Explorer</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Manage workflows and categories</p>
            </div>
            
            <ScrollArea className="flex-1">
                <div className="p-2 space-y-1">
                    {/* All Categories / Overview */}
                    <Button
                        variant="ghost"
                        size="sm"
                        className={cn(
                            "w-full justify-start h-9 px-2 mb-4 font-medium",
                            isAllSelected 
                                ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm" 
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                        )}
                        onClick={() => {
                            onSelectCategory(null);
                            onSelectWorkflow(null);
                        }}
                    >
                        <Layout className={cn("h-4 w-4 mr-2", isAllSelected ? "text-primary" : "text-muted-foreground")} />
                        <span className="flex-1 text-left">All Workflows</span>
                        <span className={cn(
                            "ml-auto text-[10px] px-2 py-0.5 rounded-full font-medium border",
                            isAllSelected 
                                ? "bg-background/80 border-transparent shadow-sm" 
                                : "bg-muted border-transparent text-muted-foreground"
                        )}>
                            {totalCount}
                        </span>
                    </Button>

                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">
                        Workflows
                    </div>

                    {/* Uncategorized Workflows - displayed directly at root level */}
                    {uncategorizedWorkflows.map((workflow) => {
                        const workflowIcon = getIcon(workflow.icon, FileText);
                        const isWorkflowSelected = selectedWorkflowId === workflow.id && selectedCategoryId === uncategorizedCategoryId;
                        return (
                            <Button
                                key={workflow.id}
                                variant="ghost"
                                size="sm"
                                className={cn(
                                    "w-full justify-start h-9 px-2 mb-0.5 transition-all group/item",
                                    isWorkflowSelected 
                                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" 
                                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                                )}
                                style={{ paddingLeft: '8px' }}
                                onClick={() => {
                                    onSelectCategory(uncategorizedCategoryId);
                                    onSelectWorkflow(workflow.id);
                                }}
                            >
                                <span className={cn(
                                    "mr-2 transition-colors flex-shrink-0 flex items-center justify-center", 
                                    isWorkflowSelected ? "text-primary" : "text-muted-foreground/70 group-hover/item:text-primary/70"
                                )}>
                                    {workflowIcon}
                                </span>
                                <span className="truncate flex-1 text-left text-sm">{workflow.name}</span>
                                {workflow.count > 0 && (
                                    <span className={cn(
                                        "ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                                        isWorkflowSelected
                                            ? "bg-background/50 text-foreground"
                                            : "bg-muted text-muted-foreground"
                                    )}>
                                        {workflow.count}
                                    </span>
                                )}
                            </Button>
                        );
                    })}

                    {/* Categories Tree */}
                    {categories.map((category) => (
                        <CategoryItem
                            key={category.id}
                            node={category}
                            selectedCategoryId={selectedCategoryId}
                            selectedWorkflowId={selectedWorkflowId}
                            onSelectCategory={onSelectCategory}
                            onSelectWorkflow={onSelectWorkflow}
                        />
                    ))}
                    
                    {categories.length === 0 && uncategorizedWorkflows.length === 0 && (
                        <div className="text-center py-8 px-4">
                            <p className="text-sm text-muted-foreground">No workflows found</p>
                        </div>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
};
