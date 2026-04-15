import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PlayCircle, Clock, CheckCircle, XCircle, Pause, User, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { getTagColors } from "@/lib/tagColors";
import { getStepExecutionStyles } from "@/lib/stepTypeColors";
import { useAuth } from "@/contexts/AuthContext";

interface Execution {
    id: string;
    status: string;
    started_at: string | null;
    workflows: {
        name: string;
    } | null;
    current_step_name?: string;
    assignees?: Array<{ type: 'user' | 'group'; name: string }>;
    name?: string | null;
}

interface WorkflowStatus {
    id: string;
    name: string;
    color: string;
    order: number;
}

interface ExecutionStep {
    execution_id: string;
    step_id: string;
    status: string;
    assigned_to_user_id?: string | null;
    assigned_to_group_id?: string | null;
    workflow_steps: {
        name: string;
        step_type?: string | null;
        config: any;
    } | null;
    assigned_to_user?: {
        id: string;
        full_name: string | null;
        email: string;
    } | null;
    assigned_to_group?: {
        id: string;
        name: string;
    } | null;
}

interface KanbanViewProps {
    executions: Execution[];
    workflowStatuses: WorkflowStatus[];
    executionSteps: ExecutionStep[];
}

// Helper Functions
const getStatusIcon = (status: string) => {
    switch (status) {
        case "pending": return <Clock className="h-3 w-3" />;
        case "running": return <PlayCircle className="h-3 w-3" />;
        case "completed": return <CheckCircle className="h-3 w-3" />;
        case "failed": return <XCircle className="h-3 w-3" />;
        case "paused": return <Pause className="h-3 w-3" />;
        default: return null;
    }
};

const getStatusBadgeClass = (status: string) => {
    switch (status) {
        case "pending":
            return "bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-700";
        case "running":
            return "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700";
        case "completed":
            return "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700";
        case "failed":
            return "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700";
        case "paused":
            return "bg-gray-100 text-gray-800 border-gray-300 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700";
        default:
            return "";
    }
};

// Sub-components
const KanbanCard = ({ execution, step }: { execution: Execution; step: ExecutionStep }) => {
    const navigate = useNavigate();
    const { t, language } = useLanguage();
    const { companyBranding } = useAuth();
    const dateLocale = language === "fr" ? fr : enUS;
    const stepStyle = getStepExecutionStyles(step.workflow_steps?.step_type);
    const companyTagColors = getTagColors(companyBranding?.internal_primary_color ?? undefined);
    const assigneeBadgeStyle = companyBranding?.internal_primary_color
        ? {
            backgroundColor: companyTagColors.bg,
            color: companyTagColors.text,
            borderColor: companyTagColors.dot,
        }
        : undefined;

    return (
        <Card
            className="cursor-pointer hover:border-primary/50 hover:shadow-sm transition-all bg-card group"
            onClick={() => navigate(`/executions/${execution.id}`)}
        >
            <CardContent className="p-3 space-y-2">
                {/* Workflow Name */}
                <div>
                    <h4 className="font-semibold text-sm leading-tight text-foreground group-hover:text-primary transition-colors">
                        {execution.workflows?.name || t("executionList.untitledWorkflow")}
                    </h4>
                    {execution.name && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                            {execution.name}
                        </p>
                    )}
                </div>

                {/* Status and Step Badges */}
                <div className="flex flex-wrap items-center gap-1.5">
                    <Badge
                        variant="outline"
                        className={cn(
                            "flex items-center gap-1 text-[10px] font-medium border px-1.5 py-0 h-5",
                            getStatusBadgeClass(execution.status)
                        )}
                    >
                        {getStatusIcon(execution.status)}
                        <span className="capitalize">{execution.status}</span>
                    </Badge>
                    {step.workflow_steps?.name && (
                        <Badge
                            variant="outline"
                            className="text-[10px] font-medium px-1.5 py-0 h-5"
                            style={{
                                backgroundColor: stepStyle.backgroundColor,
                                color: stepStyle.textColor,
                                borderColor: stepStyle.borderColor,
                            }}
                        >
                            {step.workflow_steps.name}
                        </Badge>
                    )}
                </div>

                {/* Assignees Section */}
                {(step.assigned_to_user_id || step.assigned_to_group_id) && (
                    <div className="pt-2 border-t border-border/50 flex flex-wrap items-center gap-1.5">
                        {step.assigned_to_user_id && step.assigned_to_user && (
                            <Badge
                                variant="outline"
                                className={cn(
                                    "text-[10px] font-normal flex items-center gap-1 px-1.5 py-0 h-5",
                                    !assigneeBadgeStyle && "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/20 dark:text-indigo-300 dark:border-indigo-800",
                                )}
                                style={assigneeBadgeStyle}
                            >
                                <User className="h-2.5 w-2.5" />
                                <span className="truncate max-w-[100px]">
                                    {step.assigned_to_user.full_name || step.assigned_to_user.email}
                                </span>
                            </Badge>
                        )}
                        {step.assigned_to_group_id && step.assigned_to_group && (
                            <Badge
                                variant="outline"
                                className={cn(
                                    "text-[10px] font-normal flex items-center gap-1 px-1.5 py-0 h-5",
                                    !assigneeBadgeStyle && "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-900/20 dark:text-teal-300 dark:border-teal-800",
                                )}
                                style={assigneeBadgeStyle}
                            >
                                <Users className="h-2.5 w-2.5" />
                                <span className="truncate max-w-[100px]">
                                    {step.assigned_to_group.name}
                                </span>
                            </Badge>
                        )}
                    </div>
                )}

                {/* Timestamp */}
                {execution.started_at && (
                    <div className="pt-0.5 text-[10px] text-muted-foreground flex items-center gap-1">
                        <Clock className="h-2.5 w-2.5 opacity-50" />
                        {format(new Date(execution.started_at), "MMM d, HH:mm", { locale: dateLocale })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

const KanbanColumn = ({
    title,
    color,
    executions,
    isUnassigned = false
}: {
    title: string;
    color?: string;
    executions: Array<{ execution: Execution; step: ExecutionStep }>;
    isUnassigned?: boolean;
}) => {
    const tagColors = color && !isUnassigned ? getTagColors(color) : null;

    return (
        <div className="flex-shrink-0 w-72 flex flex-col bg-muted/30 rounded-lg border border-border h-full max-h-full">
            <div
                className={cn(
                    "p-2.5 border-b border-border rounded-t-lg flex-shrink-0",
                    isUnassigned && "bg-muted/50"
                )}
                style={tagColors ? { backgroundColor: tagColors.bg } : undefined}
            >
                <div className="flex items-center gap-2 mb-0.5">
                    <div
                        className={cn("w-2.5 h-2.5 rounded-full", !tagColors && "bg-muted-foreground/30")}
                        style={tagColors ? { backgroundColor: tagColors.dot } : undefined}
                    />
                    <h3 className="font-semibold text-sm" style={tagColors ? { color: tagColors.text } : undefined}>
                        {title}
                    </h3>
                </div>
                <p className="text-[10px] text-muted-foreground">
                    {executions.length} {executions.length === 1 ? 'execution' : 'executions'}
                </p>
            </div>
            <ScrollArea className="flex-1">
                <div className="p-2 space-y-2">
                    {executions.map(({ execution, step }, idx) => (
                        <KanbanCard
                            key={`${execution.id}-${step.step_id}-${idx}`}
                            execution={execution}
                            step={step}
                        />
                    ))}
                    {executions.length === 0 && (
                        <div className="text-center text-xs text-muted-foreground py-6">
                            No executions
                        </div>
                    )}
                </div>
            </ScrollArea>
        </div>
    );
};

export const KanbanView = ({ executions, workflowStatuses, executionSteps }: KanbanViewProps) => {
    // Group executions logic using useMemo
    const { groupedExecutions, sortedStatuses } = useMemo(() => {
        const grouped = new Map<string, Array<{ execution: Execution; step: ExecutionStep }>>();
        const UNASSIGNED_KEY = "__unassigned__";

        // Initialize
        workflowStatuses.forEach(status => grouped.set(status.id, []));
        grouped.set(UNASSIGNED_KEY, []);

        // Populate
        executionSteps.forEach(step => {
            if (step.status === "running" || step.status === "pending") {
                const execution = executions.find(e => e.id === step.execution_id);
                if (!execution) return;

                const stepConfig = step.workflow_steps?.config || {};
                const statusId = stepConfig.status_id;

                if (statusId && workflowStatuses.find(s => s.id === statusId)) {
                    grouped.get(statusId)?.push({ execution, step });
                } else {
                    grouped.get(UNASSIGNED_KEY)?.push({ execution, step });
                }
            }
        });

        return {
            groupedExecutions: grouped,
            sortedStatuses: [...workflowStatuses].sort((a, b) => a.order - b.order)
        };
    }, [executions, workflowStatuses, executionSteps]);

    const unassignedExecutions = groupedExecutions.get("__unassigned__") || [];

    return (
        <div className="h-full flex flex-col overflow-hidden">
            <div className="flex-1 overflow-x-auto">
                <div className="flex gap-3 h-full p-2 min-w-max">
                    {sortedStatuses.map((status) => (
                        <KanbanColumn
                            key={status.id}
                            title={status.name}
                            color={status.color}
                            executions={groupedExecutions.get(status.id) || []}
                        />
                    ))}
                    <KanbanColumn
                        title="Unassigned"
                        executions={unassignedExecutions}
                        isUnassigned={true}
                    />
                </div>
            </div>
        </div>
    );
};
