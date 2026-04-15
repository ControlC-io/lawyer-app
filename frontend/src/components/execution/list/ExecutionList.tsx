import { useState } from "react";
import { format, isToday, isYesterday, isSameYear } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import {
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
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
import { PlayCircle, Clock, CheckCircle, XCircle, Pause, User, Users, ChevronRight, Calendar, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useCompanyId } from "@/hooks/useCompanyId";
import { useQueryClient } from "@tanstack/react-query";
import { getStepExecutionStyles } from "@/lib/stepTypeColors";
import { getTagColors } from "@/lib/tagColors";

interface Execution {
    id: string;
    status: string;
    started_at: string | null;
    workflows: {
        name: string;
    } | null;
    current_step_name?: string;
    current_step_names?: string[];
    current_step_types?: Array<string | null>;
    assignees?: Array<{ type: 'user' | 'group'; name: string }>;
    name?: string | null;
}

interface ExecutionListProps {
    executions: Execution[];
}

export const ExecutionList = ({ executions }: ExecutionListProps) => {
    const navigate = useNavigate();
    const { t, language } = useLanguage();
    const { isCompanyAdmin, companyBranding } = useAuth();
    const companyId = useCompanyId();
    const queryClient = useQueryClient();
    const [executionToDelete, setExecutionToDelete] = useState<Execution | null>(null);
    const dateLocale = language === "fr" ? fr : enUS;

    const openDeleteConfirm = (e: React.MouseEvent, execution: Execution) => {
        e.stopPropagation();
        setExecutionToDelete(execution);
    };

    const performDelete = async () => {
        if (!executionToDelete || !companyId) return;
        try {
            await api.delete(`/api/companies/${companyId}/executions/${executionToDelete.id}`);
            toast.success(t("executionList.deleteSuccess"));
            queryClient.invalidateQueries({ queryKey: ["workflow_executions_extended"] });
        } catch (error) {
            console.error("Error deleting execution:", error);
            toast.error(t("executionList.deleteFailed"));
        } finally {
            setExecutionToDelete(null);
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
            return `${t("executionList.date.todayAt")} ${format(date, "HH:mm", { locale: dateLocale })}`;
        }
        if (isYesterday(date)) {
            return `${t("executionList.date.yesterdayAt")} ${format(date, "HH:mm", { locale: dateLocale })}`;
        }
        if (isSameYear(date, new Date())) {
            return format(date, "MMM d, HH:mm", { locale: dateLocale });
        }
        return format(date, "MMM d, yyyy HH:mm", { locale: dateLocale });
    };

    const getStepBadgeStyle = (stepType?: string | null) => {
        const stepStyle = getStepExecutionStyles(stepType);
        return {
            backgroundColor: stepStyle.backgroundColor,
            color: stepStyle.textColor,
            borderColor: stepStyle.borderColor,
        };
    };

    const companyTagColors = getTagColors(companyBranding?.internal_primary_color ?? undefined);
    const assigneeBadgeStyle = companyBranding?.internal_primary_color
        ? {
            backgroundColor: companyTagColors.bg,
            color: companyTagColors.text,
            borderColor: companyTagColors.dot,
        }
        : undefined;

    if (executions.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground p-8 border border-dashed rounded-lg m-4 bg-muted/10">
                <div className="h-12 w-12 rounded-full bg-muted/20 flex items-center justify-center mb-3">
                    <PlayCircle className="h-6 w-6 opacity-50" />
                </div>
                <h3 className="font-medium text-foreground mb-1">{t("executionList.noExecutions")}</h3>
                <p className="text-sm">{t("executionList.noExecutionsDescription")}</p>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col overflow-hidden bg-card rounded-md">
            <div className="flex-1 overflow-auto relative">
                <table className="w-full caption-bottom text-sm">
                    <TableHeader className="sticky top-0 bg-background z-10 border-b-2 border-border shadow-sm">
                        <TableRow className="hover:bg-transparent border-none">
                            <TableHead className="w-[45%] pl-4 py-3 h-auto font-medium text-muted-foreground">{t("executionList.workflowAndStep")}</TableHead>
                            <TableHead className="w-[20%] py-3 h-auto font-medium text-muted-foreground">{t("executionList.status")}</TableHead>
                            <TableHead className="w-[20%] py-3 h-auto font-medium text-muted-foreground">{t("executionList.assignees")}</TableHead>
                            <TableHead className="w-[15%] py-3 h-auto font-medium text-muted-foreground text-right pr-6">{t("executionList.started")}</TableHead>
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
                                            {execution.workflows?.name || t("executionList.untitledWorkflow")}
                                        </span>
                                        {execution.name && (
                                            <span className="text-xs text-muted-foreground -mt-1">
                                                {execution.name}
                                            </span>
                                        )}

                                        <div className="flex flex-wrap gap-1.5 items-center min-h-[20px]">
                                            {(execution.current_step_names && execution.current_step_names.length > 0) ? (
                                                execution.current_step_names.map((stepName, idx) => {
                                                    return (
                                                        <Badge
                                                            key={idx}
                                                            variant="outline"
                                                            className="text-[10px] font-medium px-1.5 py-0 h-5"
                                                            style={getStepBadgeStyle(execution.current_step_types?.[idx])}
                                                        >
                                                            {stepName}
                                                        </Badge>
                                                    );
                                                })
                                            ) : execution.current_step_name ? (
                                                <Badge
                                                    variant="outline"
                                                    className="text-[10px] font-medium px-1.5 py-0 h-5"
                                                    style={getStepBadgeStyle(execution.current_step_types?.[0])}
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
                                                        !assigneeBadgeStyle && assignee.type === 'user'
                                                            ? "bg-indigo-50/50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/10 dark:text-indigo-300 dark:border-indigo-800"
                                                            : !assigneeBadgeStyle
                                                                ? "bg-teal-50/50 text-teal-700 border-teal-200 dark:bg-teal-900/10 dark:text-teal-300 dark:border-teal-800"
                                                                : undefined
                                                    )}
                                                    style={assigneeBadgeStyle}
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
                                            <span className="text-xs text-muted-foreground italic">{t("executionList.unassigned")}</span>
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
                                                {t("executionList.viewDetails")} <ChevronRight className="h-3 w-3" />
                                            </div>
                                            {isCompanyAdmin && (
                                                <button
                                                    onClick={(e) => openDeleteConfirm(e, execution)}
                                                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                                                    title={t("common.delete")}
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

            <AlertDialog open={!!executionToDelete} onOpenChange={(open) => !open && setExecutionToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t("executionList.deleteConfirmTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t("executionList.deleteConfirmDescription")}
                            {executionToDelete && (
                                <> for &quot;{executionToDelete.workflows?.name || t("executionList.untitledWorkflow")}&quot;{executionToDelete.name ? ` (${executionToDelete.name})` : ""}</>
                            )}
                            .
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={(e) => {
                                e.preventDefault();
                                performDelete();
                            }}
                        >
                            {t("common.delete")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};
