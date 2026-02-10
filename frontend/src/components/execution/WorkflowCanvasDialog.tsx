import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Canvas } from "@/components/workflow/Canvas";
import { WorkflowStep, WorkflowConnection } from "@/pages/WorkflowEditor";
import { api } from "@/lib/api";
import { useCompanyId } from "@/hooks/useCompanyId";
import { Loader2 } from "lucide-react";

interface WorkflowCanvasDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowId: string;
  highlightedStepId: string | null; // The workflow_step.id to highlight
}

export function WorkflowCanvasDialog({
  open,
  onOpenChange,
  workflowId,
  highlightedStepId,
}: WorkflowCanvasDialogProps) {
  const companyId = useCompanyId();
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [connections, setConnections] = useState<WorkflowConnection[]>([]);

  const { data: workflowData, isLoading } = useQuery({
    queryKey: ["workflow_for_canvas", companyId, workflowId],
    enabled: open && !!workflowId && !!companyId,
    queryFn: () =>
      api.get<{ steps?: unknown[]; connections?: unknown[] }>(
        `/api/companies/${companyId}/workflows/${workflowId}`
      ),
  });

  useEffect(() => {
    const stepsList = workflowData?.steps ?? [];
    setSteps(
      stepsList.map((step: Record<string, unknown>) => {
        const stepConfig =
          typeof step.config === "object" && step.config !== null
            ? (step.config as Record<string, unknown>)
            : {};
        return {
          ...step,
          action_type: (step.action_type as string) || "manual",
          decision_node_type: (step.decision_node_type as string) || "Human",
          config: {
            ...stepConfig,
            assigned_to_user_id:
              (step.assigned_to_user_id as string) ?? stepConfig?.assigned_to_user_id,
            assigned_to_group_id:
              (step.assigned_to_group_id as string) ?? stepConfig?.assigned_to_group_id,
          },
        };
      }) as WorkflowStep[]
    );
  }, [workflowData?.steps]);

  useEffect(() => {
    const connList = workflowData?.connections ?? [];
    setConnections(
      connList.map((conn: Record<string, unknown>) => ({
        id: conn.id,
        source_step_id: conn.source_step_id,
        target_step_id: conn.target_step_id,
        output_name: (conn.output_name as string) || "default",
        config: (conn.config as Record<string, unknown>) || {
          color: "hsl(var(--primary))",
          style: "solid",
        },
      })) as WorkflowConnection[]
    );
  }, [workflowData?.connections]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-full h-[90vh] p-0 flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-2 flex-shrink-0">
          <DialogTitle>Workflow Visualization</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 px-6 pb-6 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="h-full w-full">
              <Canvas
                steps={steps}
                connections={connections}
                selectedStep={null}
                onSelectStep={() => {}} // No-op in read-only mode
                onUpdateStep={() => {}} // No-op in read-only mode
                onDeleteStep={() => {}} // No-op in read-only mode
                onAddConnection={() => {}} // No-op in read-only mode
                onUpdateConnection={() => {}} // No-op in read-only mode
                onDeleteConnection={() => {}} // No-op in read-only mode
                readOnly={true}
                highlightedStepId={highlightedStepId}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}






