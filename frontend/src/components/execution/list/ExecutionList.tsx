import { format, isToday, isYesterday, isSameYear } from "date-fns";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import {
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { PlayCircle, Clock, CheckCircle, XCircle, Pause, User, Users, ChevronRight, Calendar, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useCompanyId } from "@/hooks/useCompanyId";
import { useQueryClient } from "@tanstack/react-query";

interface Execution {
    id: string;
    status: string;
    started_at: string | null;
    workflows: {
        name: string;
    } | null;
    current_step_name?: string;
    current_step_names?: string[];
    assignees?: Array<{ type: 'user' | 'group'; name: string }>;
    name?: string | null;
}

interface ExecutionListProps {
    executions: Execution[];
}

export const ExecutionList = ({ executions }: ExecutionListProps) => {
    const navigate = useNavigate();
    const { isCompanyAdmin } = useAuth();
    const companyId = useCompanyId();
    const queryClient = useQueryClient();

    const handleDeleteExecution = async (e: React.MouseEvent, executionId: string) => {
        e.stopPropagation();
        if (!companyId) return;
        try {
            await api.delete(`/api/companies/${companyId}/executions/${executionId}`);
            toast.success("Execution deleted successfully");
            queryClient.invalidateQueries({ queryKey: ["workflow_executions_extended"] });
        } catch (error) {
            console.error("Error deleting execution:", error);
            toast.error("Failed to delete execution");
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case "pending": return <Clock className="h-3.5 w-3.5" />;
            case "running": return <PlayCircle className="h-3.5 w-3.5" />;
            case "completed": return <CheckCircle className="h-3.5 w-3.5" />;
            case "failed": return <XCircle className="h-3.5 w-3.5" />;
            case "paused": return <Pause className="h-3.5 w-3.5" />;
            default: return null;
        }
    };

    const getStatusBadgeClass = (status: string) => {
        switch (status) {
            case "pending":
                return "bg-yellow-50 text-yellow-700 border-yellow-200 hover:bg-yellow-100 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-800";
            case "running":
                return "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800";
            case "completed":
                return "bg-green-50 text-green-700 border-green-200 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800";
            case "failed":
                return "bg-red-50 text-red-700 border-red-200 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800";
            case "paused":
                return "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700";
            default:
                return "";
        }
    };

    const formatExecutionDate = (dateString: string | null) => {
        if (!dateString) return "-";
        const date = new Date(dateString);
        if (isToday(date)) {
            return format(date, "'Today at' HH:mm");
        }
        if (isYesterday(date)) {
            return format(date, "'Yesterday at' HH:mm");
        }
        if (isSameYear(date, new Date())) {
            return format(date, "MMM d, HH:mm");
        }
        return format(date, "MMM d, yyyy HH:mm");
    };

    if (executions.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground p-8 border border-dashed rounded-lg m-4 bg-muted/10">
                <div className="h-12 w-12 rounded-full bg-muted/20 flex items-center justify-center mb-3">
                    <PlayCircle className="h-6 w-6 opacity-50" />
                </div>
                <h3 className="font-medium text-foreground mb-1">No executions found</h3>
                <p className="text-sm">There are no workflow executions matching your filters.</p>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col overflow-hidden bg-card rounded-md">
            <div className="flex-1 overflow-auto relative">
                <table className="w-full caption-bottom text-sm">
                    <TableHeader className="sticky top-0 bg-background z-10 border-b-2 border-border shadow-sm">
                        <TableRow className="hover:bg-transparent border-none">
                            <TableHead className="w-[45%] pl-4 py-3 h-auto font-medium text-muted-foreground">Workflow & Current Step</TableHead>
                            <TableHead className="w-[20%] py-3 h-auto font-medium text-muted-foreground">Status</TableHead>
                            <TableHead className="w-[20%] py-3 h-auto font-medium text-muted-foreground">Assignees</TableHead>
                            <TableHead className="w-[15%] py-3 h-auto font-medium text-muted-foreground text-right pr-6">Started</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {executions.map((execution) => (
                            <TableRow
                                key={execution.id}
                                className="cursor-pointer hover:bg-muted/40 transition-colors group border-b border-border/40 last:border-0"
                                onClick={() => navigate(`/executions/${execution.id}`)}
                            >
                                <TableCell className="pl-4 py-3 align-top">
                                    <div className="flex flex-col gap-1.5">
                                        <span className="font-semibold text-foreground group-hover:text-primary transition-colors text-base">
                                            {execution.workflows?.name || "Untitled Workflow"}
                                        </span>
                                        {execution.name && (
                                            <span className="text-xs text-muted-foreground -mt-1">
                                                {execution.name}
                                            </span>
                                        )}

                                        <div className="flex flex-wrap gap-1.5 items-center min-h-[20px]">
                                            {(execution.current_step_names && execution.current_step_names.length > 0) ? (
                                                execution.current_step_names.map((stepName, idx) => (
                                                    <Badge
                                                        key={idx}
                                                        variant="outline"
                                                        className="text-[10px] font-medium px-1.5 py-0 h-5 bg-purple-50/50 text-purple-700 border-purple-200 dark:bg-purple-900/10 dark:text-purple-300 dark:border-purple-800"
                                                    >
                                                        {stepName}
                                                    </Badge>
                                                ))
                                            ) : execution.current_step_name ? (
                                                <Badge
                                                    variant="outline"
                                                    className="text-[10px] font-medium px-1.5 py-0 h-5 bg-purple-50/50 text-purple-700 border-purple-200 dark:bg-purple-900/10 dark:text-purple-300 dark:border-purple-800"
                                                >
                                                    {execution.current_step_name}
                                                </Badge>
                                            ) : null}
                                        </div>
                                    </div>
                                </TableCell>

                                <TableCell className="py-3 align-top">
                                    <Badge
                                        variant="outline"
                                        className={cn(
                                            "flex w-fit items-center gap-1.5 text-xs font-medium border px-2 py-0.5",
                                            getStatusBadgeClass(execution.status)
                                        )}
                                    >
                                        {getStatusIcon(execution.status)}
                                        <span className="capitalize">{execution.status}</span>
                                    </Badge>
                                </TableCell>

                                <TableCell className="py-3 align-top">
                                    <div className="flex flex-wrap gap-1.5">
                                        {execution.assignees && execution.assignees.length > 0 ? (
                                            execution.assignees.map((assignee, idx) => (
                                                <Badge
                                                    key={idx}
                                                    variant="outline"
                                                    className={cn(
                                                        "text-[10px] font-normal flex items-center gap-1 px-1.5 py-0 h-5",
                                                        assignee.type === 'user'
                                                            ? "bg-indigo-50/50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/10 dark:text-indigo-300 dark:border-indigo-800"
                                                            : "bg-teal-50/50 text-teal-700 border-teal-200 dark:bg-teal-900/10 dark:text-teal-300 dark:border-teal-800"
                                                    )}
                                                >
                                                    {assignee.type === 'user' ? (
                                                        <User className="h-2.5 w-2.5" />
                                                    ) : (
                                                        <Users className="h-2.5 w-2.5" />
                                                    )}
                                                    <span className="truncate max-w-[100px]">{assignee.name}</span>
                                                </Badge>
                                            ))
                                        ) : (
                                            <span className="text-xs text-muted-foreground italic">Unassigned</span>
                                        )}
                                    </div>
                                </TableCell>

                                <TableCell className="text-right pr-4 py-3 align-top">
                                    <div className="flex flex-col items-end gap-1">
                                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                            <Calendar className="h-3 w-3" />
                                            <span>
                                                {formatExecutionDate(execution.started_at)}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="text-[10px] text-primary/0 group-hover:text-primary transition-all flex items-center gap-0.5 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 duration-300">
                                                View Details <ChevronRight className="h-3 w-3" />
                                            </div>
                                            {isCompanyAdmin && (
                                                <button
                                                    onClick={(e) => handleDeleteExecution(e, execution.id)}
                                                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                                                    title="Delete execution"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </table>
            </div>
        </div>
    );
};
