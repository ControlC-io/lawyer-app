import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Workflow } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import * as ResizablePrimitive from "react-resizable-panels";
import { ExecutionDataPanel } from "@/components/execution/ExecutionDataPanel";
import { FileViewer } from "@/components/execution/FileViewer";
import { useState, useEffect, useRef } from "react";
import { useExecutionData } from "@/hooks/useExecutionData";
import { ExecutionTimeline } from "@/components/execution/detail/ExecutionTimeline";
import { StepLogsDialog } from "@/components/execution/detail/StepLogsDialog";
import { HistoricalStepView } from "@/components/execution/detail/HistoricalStepView";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCompanyId } from "@/hooks/useCompanyId";
import { useCompanyApiKey } from "@/hooks/useCompanyApiKey";
import { DevModeBanner } from "@/components/execution/DevModeBanner";
import { WorkflowCanvasDialog } from "@/components/execution/WorkflowCanvasDialog";

const ExecutionDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useLanguage();
  const companyId = useCompanyId();
  const apiKey = useCompanyApiKey(companyId);

  // Dev mode detection via URL parameter
  const isDevMode = searchParams.get('dev_mode') === 'true';

  const {
    execution,
    executionSteps,
    executionData,
    executionLogs,
    connections,
  } = useExecutionData(id, companyId, apiKey);

  const [selectedStepForLogs, setSelectedStepForLogs] = useState<string | null>(null);
  const [viewingHistoricalStep, setViewingHistoricalStep] = useState<string | null>(null);
  const [viewedFile, setViewedFile] = useState<{ url: string; name: string; path: string } | null>(null);
  const [isFileViewerOpen, setIsFileViewerOpen] = useState(false);
  const [isTimelineCollapsed, setIsTimelineCollapsed] = useState(false);
  const [isCanvasDialogOpen, setIsCanvasDialogOpen] = useState(false);

  // When set, user has explicitly chosen this step – effect must never override with running step until they click "Return to active"
  const userChosenStepIdRef = useRef<string | null>(null);

  // Set default selected step to first running step only when none selected and user hasn't picked one
  // Only fix selection if it's invalid (selected step no longer exists)
  useEffect(() => {
    if (executionSteps && executionSteps.length > 0 && execution?.status !== "completed") {
      const currentStep = executionSteps.find((s: any) => s.id === viewingHistoricalStep);
      const firstRunningStep = executionSteps.find((s: any) => s.status === "running");

      // User explicitly chose a step – keep it; never override with running step while this ref is set
      if (userChosenStepIdRef.current != null) {
        const chosenExists = executionSteps.some((s: any) => s.id === userChosenStepIdRef.current);
        if (chosenExists) {
          setViewingHistoricalStep(userChosenStepIdRef.current);
          return;
        }
        if (!viewingHistoricalStep) return; // user just clicked, state not applied yet
        userChosenStepIdRef.current = null;
      }

      if (!viewingHistoricalStep && firstRunningStep) {
        setViewingHistoricalStep(firstRunningStep.id);
      } else if (viewingHistoricalStep && !currentStep && firstRunningStep) {
        setViewingHistoricalStep(firstRunningStep.id);
      } else if (
        viewingHistoricalStep &&
        currentStep?.status === "completed" &&
        firstRunningStep
      ) {
        // User just completed a step (we were on it); switch view to the new open step
        userChosenStepIdRef.current = null;
        setViewingHistoricalStep(firstRunningStep.id);
      }
    } else if (execution?.status === "completed") {
      if (userChosenStepIdRef.current != null && executionSteps?.some((s: any) => s.id === userChosenStepIdRef.current)) {
        setViewingHistoricalStep(userChosenStepIdRef.current);
      } else if (viewingHistoricalStep && userChosenStepIdRef.current == null) {
        setViewingHistoricalStep(null);
      }
    }
  }, [executionSteps, execution?.status, viewingHistoricalStep]);

  // When the viewed step changes, scroll main content to top so the new step is visible
  useEffect(() => {
    if (!viewingHistoricalStep) return;
    const scrollToTop = () => {
      const root = mainScrollAreaRef.current;
      const viewport =
        (root?.querySelector?.("[data-radix-scroll-area-viewport]") as HTMLElement | null) ??
        (root?.firstElementChild as HTMLElement | null);
      if (viewport) {
        viewport.scrollTop = 0;
      }
    };
    // Run after paint so the new step content is in the DOM
    const raf = requestAnimationFrame(() => {
      scrollToTop();
      requestAnimationFrame(scrollToTop);
    });
    return () => cancelAnimationFrame(raf);
  }, [viewingHistoricalStep]);

  // Refs for panel imperative API
  const timelinePanelRef = useRef<ResizablePrimitive.ImperativePanelHandle>(null);
  const middlePanelRef = useRef<ResizablePrimitive.ImperativePanelHandle>(null);
  const fileViewerPanelRef = useRef<ResizablePrimitive.ImperativePanelHandle>(null);
  const mainScrollAreaRef = useRef<HTMLDivElement>(null);

  // Panel size helpers (defined early so useEffect can use them before any early return)
  const getTimelinePanelSize = () => {
    if (isTimelineCollapsed) return 3;
    if (isFileViewerOpen) return 20;
    return 25;
  };
  const getMiddlePanelSize = () => {
    if (isTimelineCollapsed && isFileViewerOpen) return 47;
    if (isTimelineCollapsed && !isFileViewerOpen) return 97;
    if (isFileViewerOpen && !isTimelineCollapsed) return 50;
    return 75;
  };
  const getFileViewerSize = () => {
    if (isFileViewerOpen) {
      if (isTimelineCollapsed) return 50;
      return 30;
    }
    return 0;
  };

  const handleFileView = async (fileUrl: string, fileName: string, filePath: string) => {
    setViewedFile({ url: fileUrl, name: fileName, path: filePath });
    setIsFileViewerOpen(true);
  };

  const handleCloseFileViewer = () => {
    setIsFileViewerOpen(false);
    setViewedFile(null);
  };

  const toggleTimeline = () => {
    // Clear persisted sizes before state change to prevent configuration conflicts
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const possibleIds = [
          'execution-detail-panels-collapsed-file-open',
          'execution-detail-panels-collapsed-file-closed',
          'execution-detail-panels-expanded-file-open',
          'execution-detail-panels-expanded-file-closed',
        ];
        possibleIds.forEach(id => {
          const storageKey = `react-resizable-panels:${id}`;
          localStorage.removeItem(storageKey);
        });
      } catch (e) {
        // Ignore localStorage errors
      }
    }

    setIsTimelineCollapsed(prev => {
      const newState = !prev;
      // Use requestAnimationFrame to ensure DOM is ready
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (timelinePanelRef.current) {
            try {
              if (newState) {
                // Collapsing - force to 3%
                timelinePanelRef.current.collapse();
                timelinePanelRef.current.resize(3);
                // Call again to ensure it sticks
                setTimeout(() => {
                  if (timelinePanelRef.current && newState) {
                    timelinePanelRef.current.collapse();
                    timelinePanelRef.current.resize(3);
                  }
                }, 50);
              } else {
                // Expanding - calculate size based on current file viewer state
                timelinePanelRef.current.expand();
                requestAnimationFrame(() => {
                  if (timelinePanelRef.current && !newState) {
                    // Calculate size: 20% if file viewer open, 25% otherwise
                    const targetSize = isFileViewerOpen ? 20 : 25;
                    timelinePanelRef.current.resize(targetSize);
                  }
                });
              }
            } catch (error) {
              console.error("Error in toggleTimeline resize:", error);
            }
          }
        });
      });
      return newState;
    });
  };

  // Close file viewer when switching to historical step or back
  useEffect(() => {
    if (viewingHistoricalStep !== null) {
      setIsFileViewerOpen(false);
      setViewedFile(null);
    }
  }, [viewingHistoricalStep]);

  // Effect to handle panel resizing when state changes
  useEffect(() => {
    // Clear persisted sizes for all possible autoSaveId combinations to prevent conflicts
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const possibleIds = [
          'execution-detail-panels-collapsed-file-open',
          'execution-detail-panels-collapsed-file-closed',
          'execution-detail-panels-expanded-file-open',
          'execution-detail-panels-expanded-file-closed',
        ];
        possibleIds.forEach(id => {
          const storageKey = `react-resizable-panels:${id}`;
          localStorage.removeItem(storageKey);
        });
      } catch (e) {
        // Ignore localStorage errors
      }
    }

    // Use a delay to ensure DOM is updated and panel group has initialized
    const delay = isFileViewerOpen ? 200 : 50;
    const timeoutIds: NodeJS.Timeout[] = [];

    const timeoutId = setTimeout(() => {
      // Handle timeline panel - ensure it's at the correct size
      if (timelinePanelRef.current) {
        try {
          if (isTimelineCollapsed) {
            // Force collapse and resize to ensure it's at 3%
            timelinePanelRef.current.collapse();
            timelinePanelRef.current.resize(3);
            // Call multiple times to override any persisted values
            const resizeTimeoutId1 = setTimeout(() => {
              if (timelinePanelRef.current && isTimelineCollapsed) {
                timelinePanelRef.current.collapse();
                timelinePanelRef.current.resize(3);
              }
            }, 50);
            timeoutIds.push(resizeTimeoutId1);

            const resizeTimeoutId2 = setTimeout(() => {
              if (timelinePanelRef.current && isTimelineCollapsed) {
                timelinePanelRef.current.resize(3);
              }
            }, 100);
            timeoutIds.push(resizeTimeoutId2);
          } else {
            // Ensure panel is expanded and at correct size
            timelinePanelRef.current.expand();
            requestAnimationFrame(() => {
              if (timelinePanelRef.current && !isTimelineCollapsed) {
                timelinePanelRef.current.resize(getTimelinePanelSize());
              }
            });
          }
        } catch (error) {
          console.error("Error resizing timeline panel:", error);
        }
      }

      // Resize middle panel after a delay to let timeline settle
      const middlePanelDelay = isTimelineCollapsed ? 100 : 50;
      const middleTimeoutId = setTimeout(() => {
        if (middlePanelRef.current) {
          try {
            middlePanelRef.current.resize(getMiddlePanelSize());
          } catch (error) {
            console.error("Error resizing middle panel:", error);
          }
        }
      }, middlePanelDelay);
      timeoutIds.push(middleTimeoutId);

      // Resize file viewer panel if it's open and mounted
      if (isFileViewerOpen && fileViewerPanelRef.current) {
        const fileViewerTimeoutId = setTimeout(() => {
          if (fileViewerPanelRef.current) {
            try {
              fileViewerPanelRef.current.resize(getFileViewerSize());
            } catch (error) {
              console.error("Error resizing file viewer panel:", error);
            }
          }
        }, 100);
        timeoutIds.push(fileViewerTimeoutId);
      }
    }, delay);
    timeoutIds.push(timeoutId);

    return () => {
      timeoutIds.forEach(id => clearTimeout(id));
    };
  }, [isTimelineCollapsed, isFileViewerOpen]);

  if (!companyId) {
    return (
      <div className="p-6">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">No Company Selected</h2>
          <p className="text-muted-foreground">Please select a company from the sidebar to view execution details.</p>
        </div>
      </div>
    );
  }

  if (!execution || !executionSteps) {
    return <div className="p-6">Loading...</div>;
  }

  // Filter to only show completed and running steps (exclude pending steps), sorted by creation date ascending
  const visibleSteps = (executionSteps ?? [])
    .filter((step: any) => step.status !== "pending")
    .sort((a: any, b: any) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : (a.started_at ? new Date(a.started_at).getTime() : 0);
      const timeB = b.created_at ? new Date(b.created_at).getTime() : (b.started_at ? new Date(b.started_at).getTime() : 0);
      if (timeA !== timeB) return timeA - timeB;
      return (a.id ?? "").localeCompare(b.id ?? "");
    });

  // Determine the current step's workflow_step.id to highlight
  const getCurrentStepWorkflowStepId = (): string | null => {
    if (!executionSteps) return null;
    
    // If viewing a historical step, use that
    if (viewingHistoricalStep) {
      const step = executionSteps.find((s: any) => s.id === viewingHistoricalStep);
      return step?.workflow_steps?.id || null;
    }
    
    // Otherwise, find the first running step
    const runningStep = executionSteps.find((s: any) => s.status === "running");
    if (runningStep) {
      return runningStep?.workflow_steps?.id || null;
    }
    
    // If no running step, highlight the last completed step (for completed executions)
    if (execution?.status === "completed") {
      const completedSteps = executionSteps
        .filter((s: any) => s.status === "completed")
        .sort((a: any, b: any) => 
          new Date(b.updated_at || b.created_at).getTime() - 
          new Date(a.updated_at || a.created_at).getTime()
        );
      return completedSteps[0]?.workflow_steps?.id || null;
    }
    
    return null;
  };

  return (
    <div className="h-full flex flex-col overflow-hidden w-full max-w-full">
      <div className="flex-shrink-0 p-4 border-b border-border flex items-center justify-between">
        <Button variant="ghost" onClick={() => navigate("/executions")} size="sm">
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t("executionDetail.backToExecutions")}
        </Button>
        {execution?.workflow_id && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsCanvasDialogOpen(true)}
            title={t("executionDetail.viewWorkflowTitle")}
          >
            <Workflow className="h-4 w-4 mr-2" />
            {t("executionDetail.viewWorkflow")}
          </Button>
        )}
      </div>

      <ResizablePanelGroup
        direction="horizontal"
        className="flex-1 min-h-0 w-full max-w-full overflow-hidden"
        autoSaveId={`execution-detail-panels-${isTimelineCollapsed ? 'collapsed' : 'expanded'}-${isFileViewerOpen ? 'file-open' : 'file-closed'}`}
      >
        <ResizablePanel
          ref={timelinePanelRef}
          defaultSize={isTimelineCollapsed ? 3 : Math.min(getTimelinePanelSize() || 25, 40)}
          minSize={3}
          maxSize={isTimelineCollapsed ? 3 : 40}
          collapsible={true}
          collapsedSize={3}
          className="min-w-0"
          style={{ overflow: 'visible' }}
        >
          <ExecutionTimeline
            execution={execution}
            visibleSteps={visibleSteps}
            logs={executionLogs}
            viewingHistoricalStep={viewingHistoricalStep}
            onStepClick={(stepId) => {
              userChosenStepIdRef.current = stepId;
              setViewingHistoricalStep(stepId);
            }}
            onLogsClick={setSelectedStepForLogs}
            isCollapsed={isTimelineCollapsed}
            onToggleCollapse={toggleTimeline}
          />
        </ResizablePanel>

        <ResizableHandle withHandle />

        <StepLogsDialog
          isOpen={!!selectedStepForLogs}
          onClose={() => setSelectedStepForLogs(null)}
          stepId={selectedStepForLogs}
          steps={visibleSteps}
          logs={executionLogs}
        />

        <ResizablePanel
          ref={middlePanelRef}
          defaultSize={getMiddlePanelSize()}
          minSize={isFileViewerOpen ? 30 : 35}
          maxSize={isFileViewerOpen ? (isTimelineCollapsed ? 65 : 70) : (isTimelineCollapsed ? 97 : 85)}
          className="min-w-0"
        >
          <div className="h-full overflow-hidden flex flex-col bg-muted/20 min-w-0 w-full max-w-full">
            {/* Dev Mode Banner */}
            {isDevMode && (() => {
              const currentStep = viewingHistoricalStep
                ? visibleSteps.find(s => s.id === viewingHistoricalStep)
                : visibleSteps.find(s => s.status === "running");

              if (currentStep?.workflow_steps) {
                return (
                  <DevModeBanner
                    executionId={id!}
                    executionStepId={currentStep.id}
                    stepConfig={currentStep.workflow_steps.config || {}}
                    stepType={currentStep.workflow_steps.step_type || ''}
                    actionType={currentStep.workflow_steps.action_type || ''}
                    decisionNodeType={currentStep.workflow_steps.decision_node_type || ''}
                    workflowStepId={currentStep.workflow_steps.id}
                    companyId={companyId}
                  />
                );
              }
              return null;
            })()}
            <ScrollArea ref={mainScrollAreaRef} className="flex-1 min-w-0 w-full max-w-full overflow-x-hidden">
              <div className="p-2 sm:p-3 md:p-4 lg:p-6 min-w-0 w-full max-w-full">
                <div className="w-full min-w-0 max-w-full box-border">
                  {viewingHistoricalStep ? (() => {
                    const step = visibleSteps.find(s => s.id === viewingHistoricalStep);
                    // Only show HistoricalStepView for completed steps
                    // For running steps, use ExecutionDataPanel to show the interactive form
                    if (step?.status === "completed") {
                      return (
                        <HistoricalStepView
                          step={step}
                          executionData={executionData}
                          onReturnToActive={() => {
                            userChosenStepIdRef.current = null;
                            setViewingHistoricalStep(null);
                          }}
                          onFileView={handleFileView}
                          isExecutionCompleted={execution?.status === "completed"}
                        />
                      );
                    }
                    // For running steps, show ExecutionDataPanel with selectedStepId
                    return (
                      <ExecutionDataPanel
                        executionId={id!}
                        onFileView={handleFileView}
                        selectedStepId={viewingHistoricalStep}
                        apiKey={apiKey}
                        executionSteps={executionSteps}
                        connections={connections}
                        executionDataStructures={executionData}
                      />
                    );
                  })() : (
                    <ExecutionDataPanel
                      executionId={id!}
                      onFileView={handleFileView}
                      selectedStepId={null}
                      apiKey={apiKey}
                      executionSteps={executionSteps}
                      connections={connections}
                      executionDataStructures={executionData}
                    />
                  )}
                </div>
              </div>
            </ScrollArea>
          </div>
        </ResizablePanel>

        {isFileViewerOpen && (
          <>
            <ResizableHandle withHandle />
            <ResizablePanel
              key="file-viewer-panel"
              ref={fileViewerPanelRef}
              defaultSize={Math.min(getFileViewerSize(), isTimelineCollapsed ? 65 : 50)}
              minSize={25}
              maxSize={isTimelineCollapsed ? 65 : 50}
              collapsible={false}
              className="min-w-0"
            >
              {viewedFile && (
                <div className="h-full p-2 sm:p-4 bg-background overflow-hidden flex flex-col min-h-0 w-full max-w-full">
                  <div className="flex-1 min-h-0 w-full max-w-full min-w-0">
                    <FileViewer
                      fileUrl={viewedFile.url}
                      fileName={viewedFile.name}
                      onClose={handleCloseFileViewer}
                    />
                  </div>
                </div>
              )}
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>

      {/* Workflow Canvas Dialog */}
      {execution?.workflow_id && (
        <WorkflowCanvasDialog
          open={isCanvasDialogOpen}
          onOpenChange={setIsCanvasDialogOpen}
          workflowId={execution.workflow_id}
          highlightedStepId={getCurrentStepWorkflowStepId()}
        />
      )}
    </div>
  );
};

export default ExecutionDetail;
