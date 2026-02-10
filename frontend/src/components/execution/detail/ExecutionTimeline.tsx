import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { CheckCircle, Clock, PlayCircle, XCircle, Pause, FileText, AlertCircle, ChevronLeft } from "lucide-react";

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
          title="Expand timeline"
        >
          <span className="text-xs transform -rotate-90 whitespace-nowrap">Timeline</span>
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
          title="Collapse timeline"
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
                    <span className="font-medium flex-shrink-0">Started:</span>
                    <span className="break-words">{format(new Date(execution.started_at), "dd/MM/yyyy HH:mm:ss")}</span>
                  </div>}

                  {execution.completed_at && <div className="flex items-center gap-1.5 text-muted-foreground flex-wrap">
                    <CheckCircle className="h-3 w-3 flex-shrink-0" />
                    <span className="font-medium flex-shrink-0">Completed:</span>
                    <span className="break-words">{format(new Date(execution.completed_at), "dd/MM/yyyy HH:mm:ss")}</span>
                  </div>}
                </div>

                {execution.workflows?.description && <p className="mt-2 text-xs text-muted-foreground leading-relaxed line-clamp-2">
                  {execution.workflows.description}
                </p>}
              </div>

              {/* Process Timeline */}
              <div>
                <h2 className="text-sm font-semibold mb-2">Process Timeline</h2>
                <div className="space-y-2">
                  {visibleSteps.map((step) => {
                    const stepLogs = logs?.filter((log: any) => log.step_id === step.id) || [];
                    const hasStepData = step.step_data && Object.keys(step.step_data).length > 0;
                    const isCompleted = step.status === "completed";
                    const isActiveStep = step.status === "running";
                    // Make active steps clickable to navigate between multiple running steps
                    // Also make completed steps clickable to view historical data
                    const isClickable = isCompleted || isActiveStep;
                    const isCurrentlyViewing = viewingHistoricalStep === step.id;

                    return <div
                      key={step.id}
                      className={`relative pl-5 pb-2 border-l-2 border-border last:border-l-0 transition-colors ${isClickable && !isCurrentlyViewing ? 'cursor-pointer hover:bg-muted/50 rounded-md p-1.5 -ml-1.5' : ''
                        } ${isCurrentlyViewing ? 'bg-primary/10 border-primary rounded-md p-1.5 -ml-1.5' : ''} ${isActiveStep && !isCurrentlyViewing ? 'ring-1 ring-primary/50 rounded-md p-1.5 -ml-1.5' : ''}`}
                      onClick={() => {
                        if (isClickable && !isCurrentlyViewing) {
                          // Clicking any step (running or completed) to view it
                          // Don't allow deselecting - always keep a step selected
                          onStepClick(step.id);
                        }
                      }}
                    >
                      <div className="absolute -left-[7px] top-1.5">
                        <div className={`w-3 h-3 rounded-full flex items-center justify-center ${step.status === "completed" ? "bg-primary" : step.status === "running" ? "bg-secondary border-2 border-background" : step.status === "failed" ? "bg-destructive" : "bg-muted"}`}>
                          {step.status === "completed" && <CheckCircle className="h-2.5 w-2.5 text-primary-foreground" />}
                          {step.status === "running" && <div className="w-1.5 h-1.5 rounded-full bg-secondary-foreground animate-pulse" />}
                          {step.status === "failed" && <XCircle className="h-2.5 w-2.5 text-destructive-foreground" />}
                        </div>
                      </div>

                      <div className="space-y-0.5">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <h3 className="font-semibold text-xs break-words flex-1 min-w-0">
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

                        {step.started_at && <p className="text-[10px] text-muted-foreground break-words">
                          {format(new Date(step.started_at), "dd/MM/yyyy HH:mm:ss")}
                        </p>}

                        {step.decision_choice && <div className="mt-1 space-y-0.5">
                          <Badge variant="secondary" className="text-[10px] py-0 px-1.5 break-words">
                            <span className="break-words">Decision: {step.decision_choice}</span>
                          </Badge>
                          {step.step_data?.decision_comment && (
                            <div className="mt-1 p-1.5 bg-muted/50 rounded-md border border-border">
                              <p className="text-[10px] font-medium text-muted-foreground mb-0.5">Decision Comment:</p>
                              <p className="text-[10px] text-foreground whitespace-pre-wrap break-words">{step.step_data.decision_comment}</p>
                            </div>
                          )}
                        </div>}

                        {!step.started_at && step.status === "pending" && <p className="text-[10px] text-muted-foreground italic">
                          Not started
                        </p>}

                        {step.status === "running" && <div className="mt-1">
                          <Badge variant="secondary" className="text-[10px] py-0 px-1.5 break-words">
                            <span className="break-words">Action required</span>
                          </Badge>
                        </div>}
                      </div>
                    </div>;
                  })}

                  {visibleSteps.length === 0 && <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <AlertCircle className="h-4 w-4" />
                    <span>No completed or running steps found</span>
                  </div>}
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
};

