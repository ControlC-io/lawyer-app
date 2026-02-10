import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

export const useExecutionNavigation = (
  executionId: string,
  _companyId: string | null,
  executionSteps: any[],
  _connections: any[],
  _executionDataStructures: any[],
  _pendingConnectionRef: any,
  apiKey?: string | null
) => {
  const queryClient = useQueryClient();

  const makeDecisionMutation = useMutation({
    mutationFn: async ({
      stepId,
      choice,
      targetStepId: _targetStepId,
      comment,
    }: {
      stepId: string;
      choice: string;
      targetStepId?: string;
      comment?: string;
    }) => {
      await api.post(
        `/api/workflows/executions/${executionId}/steps/${stepId}/decision`,
        {
          decision_choice: choice,
          decision_reason: undefined,
          decision_comment: comment,
        },
        { apiKey: apiKey ?? undefined }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflow_execution_steps", executionId] });
      queryClient.invalidateQueries({ queryKey: ["workflow_execution", executionId] });
      queryClient.invalidateQueries({ queryKey: ["execution_data_structures", executionId] });
      toast({
        title: "Action completed",
        description: "The workflow has been advanced successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const completeStepMutation = useMutation({
    mutationFn: async ({ stepExecutionId }: { stepExecutionId: string }) => {
      await api.post(
        `/api/workflows/executions/${executionId}/steps/${stepExecutionId}/complete`,
        {},
        { apiKey: apiKey ?? undefined }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflow_execution_steps", executionId] });
      queryClient.invalidateQueries({ queryKey: ["workflow_execution", executionId] });
      queryClient.invalidateQueries({ queryKey: ["execution_data_structures", executionId] });
      toast({
        title: "Step completed",
        description: "The step has been marked as completed",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return {
    makeDecisionMutation,
    completeStepMutation,
    advanceExecution: async (_currentStepId: string, _choice?: string, _targetStepId?: string) => {
      // No-op: backend advances workflow when complete/decision is called
    },
  };
};
