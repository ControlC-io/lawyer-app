import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { LayoutList, User, CheckSquare, Search, ArrowDownUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SortOption } from "@/lib/sortExecutions";

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
    sortBy: SortOption;
    onSortChange: (sort: SortOption) => void;
}

export const ExecutionFilters = ({
    activeFilter,
    onFilterChange,
    showCompleted,
    onShowCompletedChange,
    counts,
    searchQuery,
    onSearchChange,
    sortBy,
    onSortChange,
}: ExecutionFiltersProps) => {
    const { t } = useLanguage();
    const filters = [
        {
            id: "all" as const,
            label: t("executionFilters.allWorkflows"),
            icon: LayoutList,
            count: counts.all,
            description: t("executionFilters.viewAllExecutions"),
        },
        {
            id: "my_workflows" as const,
            label: t("executionFilters.myWorkflows"),
            icon: User,
            count: counts.my_workflows,
            description: t("executionFilters.startedByMe"),
        },
        {
            id: "my_tasks" as const,
            label: t("executionFilters.myTasks"),
            icon: CheckSquare,
            count: counts.my_tasks,
            description: t("executionFilters.assignedToMe"),
        },
    ];

    return (
        <div className="space-y-2 sm:space-y-4">
            <div className="grid grid-cols-3 gap-1.5 sm:gap-4">
                {filters.map((filter) => (
                    <Card
                        key={filter.id}
                        className={cn(
                            "cursor-pointer transition-all hover:border-primary/50",
                            activeFilter === filter.id ? "border-primary bg-primary/5" : ""
                        )}
                        onClick={() => onFilterChange(filter.id)}
                    >
                        <CardContent className="p-2 sm:p-4 flex flex-col items-center gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-0">
                            <div className="flex flex-col items-center gap-1 sm:flex-row sm:items-center sm:gap-3 min-w-0 w-full sm:w-auto">
                                <div
                                    className={cn(
                                        "p-1.5 sm:p-2 rounded-full shrink-0",
                                        activeFilter === filter.id
                                            ? "bg-primary/10 text-primary"
                                            : "bg-muted text-muted-foreground"
                                    )}
                                >
                                    <filter.icon className="h-3.5 w-3.5 sm:h-5 sm:w-5" />
                                </div>
                                <div className="min-w-0 text-center sm:text-left">
                                    <p className="font-medium text-[10px] leading-tight sm:text-sm line-clamp-2 sm:line-clamp-none">
                                        {filter.label}
                                    </p>
                                    <p className="hidden sm:block text-xs text-muted-foreground">
                                        {filter.description}
                                    </p>
                                </div>
                            </div>
                            <div className="text-sm font-bold tabular-nums sm:text-2xl">{filter.count}</div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="relative w-full order-1 sm:order-2 sm:flex-1 sm:max-w-md">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
                    <Input
                        placeholder={t("executionFilters.searchPlaceholder")}
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="h-8 pl-7 text-sm sm:h-10 sm:pl-8"
                    />
                </div>

                <div className="flex items-center gap-3 order-2 sm:order-1 shrink-0">
                    <div className="flex items-center gap-1.5">
                        <ArrowDownUp className="h-3.5 w-3.5 text-muted-foreground" />
                        <Select
                            value={sortBy}
                            onValueChange={(value) => onSortChange(value as SortOption)}
                        >
                            <SelectTrigger className="h-8 w-[150px] text-xs sm:h-10 sm:text-sm">
                                <SelectValue placeholder={t("executionFilters.sortBy")} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="newest">{t("executionFilters.sortNewest")}</SelectItem>
                                <SelectItem value="name_asc">{t("executionFilters.sortNameAsc")}</SelectItem>
                                <SelectItem value="name_desc">{t("executionFilters.sortNameDesc")}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex items-center gap-2">
                        <Switch
                            id="show-completed"
                            checked={showCompleted}
                            onCheckedChange={onShowCompletedChange}
                            className="scale-[0.85] sm:scale-100"
                        />
                        <Label
                            htmlFor="show-completed"
                            className="cursor-pointer text-xs leading-tight sm:text-sm"
                        >
                            <span className="sm:hidden">{t("executionFilters.showCompletedShort")}</span>
                            <span className="hidden sm:inline">{t("executionFilters.showCompleted")}</span>
                        </Label>
                    </div>
                </div>
            </div>
        </div>
    );
};
