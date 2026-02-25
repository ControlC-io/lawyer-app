import { useQuery } from "@tanstack/react-query";
import { useRef, useEffect, useMemo } from "react";
import { api } from "@/lib/api";

// Polling interval for auto-refresh (in milliseconds)
const POLLING_INTERVAL = 2000;

// Maximum polling duration (2 minutes in milliseconds)
const POLLING_TIMEOUT = 2 * 60 * 1000;

// Helper to check if the current running step requires automatic polling
const shouldPollForStep = (executionSteps: any[] | undefined): boolean => {
  if (!executionSteps) return false;

  const runningStep = executionSteps.find((s: any) => s.status === "running");
  if (!runningStep) {
    // Keep polling while waiting for an assigned pending step to turn running.
    return executionSteps.some((s: any) => s.status === "pending");
  }

  const step = runningStep.step || runningStep.workflow_steps;
  const stepType = step?.step_type;
  const actionType = step?.action_type;
  const decisionNodeType = step?.decision_node_type;

  const isAutomaticAction = stepType === "action" && actionType === "automatic";
  const isAgentAction = stepType === "action" && actionType === "agent";
  const isAgentDecision = stepType === "decision" && decisionNodeType === "Agent";
  const isAgentPlusHumanDecision = stepType === "decision" && decisionNodeType === "Agent + Human";

  return isAutomaticAction || isAgentAction || isAgentDecision || isAgentPlusHumanDecision;
};

type ExecutionDetailResponse = {
  id: string;
  workflow_id: string;
  status: string;
  workflow: { id: string; name: string; description?: string; data_structure?: unknown; connections?: { source_step_id: string; target_step_id: string; output_name?: string }[] };
  execution_steps: Array<{ step?: unknown; workflow_steps?: unknown; status: string; [k: string]: unknown }>;
  execution_data_records: Array<{ id: string; values: Record<string, unknown> }>;
  execution_logs: Array<unknown>;
  execution_data_array?: unknown[];
  execution_data_mapped?: Record<string, unknown>;
  [k: string]: unknown;
};

export const useExecutionData = (id?: string, companyId?: string | null, apiKey?: string | null) => {
  const pollingStartTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    pollingStartTimeRef.current = Date.now();
  }, [id]);

  const isPollingTimedOut = (): boolean => {
    return Date.now() - pollingStartTimeRef.current > POLLING_TIMEOUT;
  };

  const { data: rawExecution, isLoading: isLoadingExecution } = useQuery({
    queryKey: ["workflow_execution", id, companyId],
    enabled: !!id && !!companyId && !!apiKey,
    refetchInterval: (query) => {
      const execution = query.state.data as ExecutionDetailResponse | undefined;
      if (!execution || execution.status === "completed") return false;
      if (isPollingTimedOut()) return false;
      const steps = execution?.execution_steps;
      return shouldPollForStep(steps) ? POLLING_INTERVAL : false;
    },
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const res = await api.get<ExecutionDetailResponse>(
        `/api/workflows/executions/${id}`,
        { apiKey: apiKey ?? undefined }
      );
      return res;
    },
  });

  // Normalize execution for consumers: workflow at top level, execution_steps with workflow_steps alias
  const execution = rawExecution
    ? {
        ...rawExecution,
        workflows: rawExecution.workflow
          ? { id: rawExecution.workflow.id, name: rawExecution.workflow.name, description: rawExecution.workflow.description }
          : undefined,
      }
    : undefined;

  const executionSteps = useMemo(
    () =>
      rawExecution?.execution_steps?.map((s: any) => ({
        ...s,
        workflow_steps: s.step ?? s.workflow_steps,
      })),
    [rawExecution?.execution_steps]
  );

  const connections = rawExecution?.workflow?.connections ?? [];

  const executionData = rawExecution?.execution_data_records?.length
    ? rawExecution.execution_data_records.map((ed: any) => ({
        id: ed.id,
        values: ed.values,
        data_structures: rawExecution.workflow
          ? {
              id: rawExecution.workflow.id,
              name: rawExecution.workflow.name,
              fields: (rawExecution.workflow.data_structure as any[]) || [],
            }
          : undefined,
      }))
    : undefined;

  const executionLogs = rawExecution?.execution_logs ?? [];

  return {
    execution,
    isLoadingExecution,
    executionSteps,
    isLoadingSteps: isLoadingExecution,
    connections,
    executionData,
    executionLogs,
  };
};
