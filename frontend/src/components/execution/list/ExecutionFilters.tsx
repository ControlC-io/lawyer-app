import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LayoutList, User, CheckSquare, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export type FilterType = "all" | "my_workflows" | "my_tasks";

interface ExecutionFiltersProps {
    activeFilter: FilterType;
    onFilterChange: (filter: FilterType) => void;
    showCompleted: boolean;
    onShowCompletedChange: (show: boolean) => void;
    counts: {
        all: number;
        my_workflows: number;
        my_tasks: number;
    };
    searchQuery: string;
    onSearchChange: (query: string) => void;
}

export const ExecutionFilters = ({
    activeFilter,
    onFilterChange,
    showCompleted,
    onShowCompletedChange,
    counts,
    searchQuery,
    onSearchChange,
}: ExecutionFiltersProps) => {
    const filters = [
        {
            id: "all" as const,
            label: "All Workflows",
            icon: LayoutList,
            count: counts.all,
            description: "View all executions",
        },
        {
            id: "my_workflows" as const,
            label: "My Workflows",
            icon: User,
            count: counts.my_workflows,
            description: "Started by me",
        },
        {
            id: "my_tasks" as const,
            label: "My Tasks",
            icon: CheckSquare,
            count: counts.my_tasks,
            description: "Assigned to me",
        },
    ];

    return (
        <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
                {filters.map((filter) => (
                    <Card
                        key={filter.id}
                        className={cn(
                            "cursor-pointer transition-all hover:border-primary/50",
                            activeFilter === filter.id ? "border-primary bg-primary/5" : ""
                        )}
                        onClick={() => onFilterChange(filter.id)}
                    >
                        <CardContent className="p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className={cn(
                                    "p-2 rounded-full",
                                    activeFilter === filter.id ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                                )}>
                                    <filter.icon className="h-5 w-5" />
                                </div>
                                <div>
                                    <p className="font-medium text-sm">{filter.label}</p>
                                    <p className="text-xs text-muted-foreground">{filter.description}</p>
                                </div>
                            </div>
                            <div className="text-2xl font-bold">{filter.count}</div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center space-x-2">
                    <Switch
                        id="show-completed"
                        checked={showCompleted}
                        onCheckedChange={onShowCompletedChange}
                    />
                    <Label htmlFor="show-completed" className="cursor-pointer">
                        Show completed executions
                    </Label>
                </div>

                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by workflow or execution name..."
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="pl-8"
                    />
                </div>
            </div>
        </div>
    );
};
