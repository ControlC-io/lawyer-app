import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { CheckCircle, Clock, PlayCircle, XCircle, Pause, FileText, AlertCircle, ChevronLeft } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

// Step type colors aligned with workflow editor (WorkflowNode); light + dark variants so steps fit both themes
const stepTypeStyles: Record<string, { border: string; bg: string; text: string; ring: string; completedDot: string; completedIcon: string; runningDot: string }> = {
  start: { border: "border-emerald-400 dark:border-emerald-600", bg: "bg-emerald-50/60 dark:bg-emerald-950/50", text: "text-emerald-700 dark:text-emerald-300", ring: "ring-emerald-400", completedDot: "bg-emerald-500", completedIcon: "text-white", runningDot: "bg-emerald-500" },
  end: { border: "border-rose-400 dark:border-rose-600", bg: "bg-rose-50/60 dark:bg-rose-950/50", text: "text-rose-700 dark:text-rose-300", ring: "ring-rose-400", completedDot: "bg-rose-500", completedIcon: "text-white", runningDot: "bg-rose-500" },
  decision: { border: "border-amber-400 dark:border-amber-600", bg: "bg-amber-50/60 dark:bg-amber-950/50", text: "text-amber-700 dark:text-amber-300", ring: "ring-amber-400", completedDot: "bg-amber-500", completedIcon: "text-white", runningDot: "bg-amber-500" },
  action: { border: "border-blue-400 dark:border-blue-600", bg: "bg-blue-50/60 dark:bg-blue-950/50", text: "text-blue-700 dark:text-blue-300", ring: "ring-blue-400", completedDot: "bg-blue-500", completedIcon: "text-white", runningDot: "bg-blue-500" },
  edit_form: { border: "border-primary", bg: "bg-primary/10 dark:bg-primary/20", text: "text-primary", ring: "ring-primary", completedDot: "bg-primary", completedIcon: "text-primary-foreground", runningDot: "bg-primary" },
  file: { border: "border-orange-400 dark:border-orange-600", bg: "bg-orange-50/60 dark:bg-orange-950/50", text: "text-orange-700 dark:text-orange-300", ring: "ring-orange-400", completedDot: "bg-orange-500", completedIcon: "text-white", runningDot: "bg-orange-500" },
};

interface ExecutionTimelineProps {
  execution: any;
  visibleSteps: any[];
  logs: any[];
  viewingHistoricalStep: string | null;
  onStepClick: (stepId: string | null) => void;
  onLogsClick: (stepId: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export const ExecutionTimeline = ({
  execution,
  visibleSteps,
  logs,
  viewingHistoricalStep,
  onStepClick,
  onLogsClick,
  isCollapsed,
  onToggleCollapse
}: ExecutionTimelineProps) => {
  const { t, language } = useLanguage();
  const dateLocale = language === "fr" ? fr : enUS;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending": return <Clock className="h-4 w-4" />;
      case "running": return <PlayCircle className="h-4 w-4" />;
      case "completed": return <CheckCircle className="h-4 w-4" />;
      case "failed": return <XCircle className="h-4 w-4" />;
      case "paused": return <Pause className="h-4 w-4" />;
      default: return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending": return "default";
      case "running": return "secondary";
      case "completed": return "default";
      case "failed": return "destructive";
      case "paused": return "outline";
      default: return "default";
    }
  };

  if (isCollapsed) {
    return (
      <div className="h-full overflow-hidden flex flex-col border-r bg-muted/30 w-full min-w-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleCollapse}
          className="h-full w-full flex flex-col items-center justify-center hover:bg-muted/50 p-1 gap-1 min-w-0"
          title={t("executionTimeline.expandTimeline")}
        >
          <span className="text-xs transform -rotate-90 whitespace-nowrap">{t("executionTimeline.timeline")}</span>
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col w-full min-w-0 relative" style={{ overflow: 'visible' }}>
      <div className="absolute top-2 -right-3 z-20" style={{ pointerEvents: 'auto' }}>
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleCollapse}
          className="h-6 w-6 p-0 bg-background border border-border shadow-sm rounded-full hover:bg-muted"
          title={t("executionTimeline.collapseTimeline")}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="h-full overflow-hidden flex flex-col border-r">
        <ScrollArea className="flex-1 min-w-0">
          <div className="p-3 sm:p-4 min-w-0 w-full max-w-full">
            {/* Execution Overview */}
            <div className="space-y-3">
              <div>
                <div className="flex items-start justify-between mb-2 min-w-0 gap-2 flex-wrap">
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <h1 className="text-lg font-bold break-words min-w-0">
                      {execution.workflows?.name}
                    </h1>
                    {execution.name && (
                      <p className="text-xs text-muted-foreground break-words min-w-0">
                        {execution.name}
                      </p>
                    )}
                  </div>
                  <Badge variant={getStatusColor(execution.status) as any} className="flex items-center gap-1 flex-shrink-0 text-[10px] px-1.5 py-0.5">
                    {getStatusIcon(execution.status)}
                    <span className="whitespace-nowrap">{execution.status.toUpperCase()}</span>
                  </Badge>
                </div>

                <div className="space-y-1 text-xs">
                  {execution.started_at && <div className="flex items-center gap-1.5 text-muted-foreground flex-wrap">
                    <Clock className="h-3 w-3 flex-shrink-0" />
                    <span className="font-medium flex-shrink-0">{t("executionTimeline.started")}</span>
                    <span className="break-words">{format(new Date(execution.started_at), "dd/MM/yyyy HH:mm:ss", { locale: dateLocale })}</span>
                  </div>}

                  {execution.completed_at && <div className="flex items-center gap-1.5 text-muted-foreground flex-wrap">
                    <CheckCircle className="h-3 w-3 flex-shrink-0" />
                    <span className="font-medium flex-shrink-0">{t("executionTimeline.completed")}</span>
                    <span className="break-words">{format(new Date(execution.completed_at), "dd/MM/yyyy HH:mm:ss", { locale: dateLocale })}</span>
                  </div>}
                </div>

                {execution.workflows?.description && <p className="mt-2 text-xs text-muted-foreground leading-relaxed line-clamp-2">
                  {execution.workflows.description}
                </p>}
              </div>

              {/* Process Timeline */}
              <div>
                <h2 className="text-sm font-semibold mb-2">Process Timeline</h2>
                <div className="space-y-4">
                  {(() => {
                    // Sort by when the step actually ran (started_at) so order matches execution flow.
                    // created_at is the same for all steps (created in batch), so use started_at first.
                    const previousSteps = visibleSteps
                      .filter((s: any) => s.status !== "running")
                      .sort((a: any, b: any) => {
                        const timeA = (a.started_at ? new Date(a.started_at).getTime() : null) ?? (a.created_at ? new Date(a.created_at).getTime() : 0);
                        const timeB = (b.started_at ? new Date(b.started_at).getTime() : null) ?? (b.created_at ? new Date(b.created_at).getTime() : 0);
                        if (timeA !== timeB) return timeA - timeB;
                        return (a.id ?? "").localeCompare(b.id ?? "");
                      });
                    const currentSteps = visibleSteps.filter((s: any) => s.status === "running");

                    const renderStep = (step: any) => {
                      const stepLogs = logs?.filter((log: any) => log.step_id === step.id) || [];
                      const isCompleted = step.status === "completed";
                      const isActiveStep = step.status === "running";
                      const isClickable = isCompleted || isActiveStep;
                      const isCurrentlyViewing = viewingHistoricalStep === step.id;
                      const stepType = step.workflow_steps?.step_type ?? "action";
                      const typeStyle = stepTypeStyles[stepType] ?? stepTypeStyles.action;

                      return (
                        <div
                          key={step.id}
                          className={`relative pl-5 pb-2 border-l-2 last:border-l-0 transition-colors ${typeStyle.border} ${typeStyle.bg} rounded-md p-1.5 -ml-1.5 ${isCurrentlyViewing ? `ring-2 ${typeStyle.ring} ring-inset` : isActiveStep ? `ring-2 ring-offset-2 ring-offset-background ${typeStyle.ring}` : ""} ${isClickable && !isCurrentlyViewing ? "cursor-pointer hover:bg-muted/60" : ""}`}
                          onClick={() => {
                            if (isClickable && !isCurrentlyViewing) onStepClick(step.id);
                          }}
                        >
                          <div className="absolute -left-[7px] top-1.5">
                            <div className={`w-3 h-3 rounded-full flex items-center justify-center ${step.status === "completed" ? typeStyle.completedDot : step.status === "running" ? `${typeStyle.runningDot} border-2 border-white shadow-sm` : step.status === "failed" ? "bg-destructive" : "bg-muted"}`}>
                              {step.status === "completed" && <CheckCircle className={`h-2.5 w-2.5 ${typeStyle.completedIcon}`} />}
                              {step.status === "running" && <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
                              {step.status === "failed" && <XCircle className="h-2.5 w-2.5 text-destructive-foreground" />}
                            </div>
                          </div>

                          <div className="space-y-0.5">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <h3 className={`font-semibold text-xs break-words flex-1 min-w-0 ${typeStyle.text}`}>
                                {step.workflow_steps?.name}
                              </h3>
                              <div className="flex gap-1 flex-shrink-0">
                                {stepLogs.length > 0 && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onLogsClick(step.id);
                                    }}
                                    className="h-5 px-1.5 text-xs"
                                  >
                                    <FileText className="h-3 w-3" />
                                    <span className="ml-0.5">{stepLogs.length}</span>
                                  </Button>
                                )}
                              </div>
                            </div>

                            {step.started_at && <p className="text-[10px] text-muted-foreground break-words">{format(new Date(step.started_at), "dd/MM/yyyy HH:mm:ss", { locale: dateLocale })}</p>}

                            {step.decision_choice && (
                              <div className="mt-1 space-y-0.5">
                                <Badge variant="secondary" className="text-[10px] py-0 px-1.5 break-words">
                                  <span className="break-words">{t("executionTimeline.decisionLabel")} {step.decision_choice}</span>
                                </Badge>
                                {step.step_data?.decision_comment && (
                                  <div className="mt-1 p-1.5 bg-muted/50 rounded-md border border-border">
                                    <p className="text-[10px] font-medium text-muted-foreground mb-0.5">{t("executionTimeline.decisionCommentLabel")}</p>
                                    <p className="text-[10px] text-foreground whitespace-pre-wrap break-words">{step.step_data.decision_comment}</p>
                                  </div>
                                )}
                              </div>
                            )}

                            {!step.started_at && step.status === "pending" && <p className="text-[10px] text-muted-foreground italic">{t("executionTimeline.notStarted")}</p>}

                            {step.status === "running" && (
                              <div className="mt-1">
                                <Badge variant="secondary" className="text-[10px] py-0 px-1.5 break-words">
                                  <span className="break-words">{t("executionTimeline.actionRequired")}</span>
                                </Badge>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    };

                    return (
                      <>
                        {previousSteps.length > 0 && (
                          <div className="space-y-2">
                            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("executionTimeline.previousSteps")}</h3>
                            <div className="space-y-2">{previousSteps.map(renderStep)}</div>
                          </div>
                        )}
                        {currentSteps.length > 0 && (
                          <div className="space-y-2">
                            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t("executionTimeline.currentStep")}</h3>
                            <div className="space-y-2">{currentSteps.map(renderStep)}</div>
                          </div>
                        )}
                        {visibleSteps.length === 0 && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <AlertCircle className="h-4 w-4" />
                            <span>{t("executionTimeline.noStepsFound")}</span>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};

