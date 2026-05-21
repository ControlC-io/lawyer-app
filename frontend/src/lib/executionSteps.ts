type ExecutionStepLike = {
  id?: string;
  status?: string;
  started_at?: string | null;
  created_at?: string | null;
  workflow_steps?: { id?: string; name?: string } | null;
  step?: { id?: string; name?: string } | null;
};

function getStepStartedTime(step: ExecutionStepLike): number {
  const started = step.started_at ? new Date(step.started_at).getTime() : null;
  if (started != null && !Number.isNaN(started)) return started;
  const created = step.created_at ? new Date(step.created_at).getTime() : 0;
  return Number.isNaN(created) ? 0 : created;
}

export function getActiveRunningStep(
  steps: ExecutionStepLike[] | undefined,
  preferredStepId?: string | null
): ExecutionStepLike | undefined {
  if (!steps?.length) return undefined;

  if (preferredStepId) {
    const preferred = steps.find((step) => step.id === preferredStepId);
    if (preferred?.status === "running") return preferred;
  }

  const runningSteps = steps.filter((step) => step.status === "running");
  if (runningSteps.length === 0) return undefined;

  return [...runningSteps].sort((a, b) => {
    const timeDiff = getStepStartedTime(b) - getStepStartedTime(a);
    if (timeDiff !== 0) return timeDiff;
    return (b.id ?? "").localeCompare(a.id ?? "");
  })[0];
}

export function getWorkflowStepDefinitionId(step: ExecutionStepLike | undefined): string | null {
  if (!step) return null;
  return step.workflow_steps?.id ?? step.step?.id ?? null;
}

export function getStepVisitNumber(
  step: ExecutionStepLike,
  visibleSteps: ExecutionStepLike[]
): number | null {
  const definitionId = getWorkflowStepDefinitionId(step);
  if (!definitionId) return null;

  const sameDefinitionSteps = visibleSteps
    .filter((candidate) => getWorkflowStepDefinitionId(candidate) === definitionId)
    .sort((a, b) => {
      const timeDiff = getStepStartedTime(a) - getStepStartedTime(b);
      if (timeDiff !== 0) return timeDiff;
      return (a.id ?? "").localeCompare(b.id ?? "");
    });

  if (sameDefinitionSteps.length <= 1) return null;

  const visitIndex = sameDefinitionSteps.findIndex((candidate) => candidate.id === step.id);
  return visitIndex >= 0 ? visitIndex + 1 : null;
}

export function formatStepVisitLabel(
  stepName: string,
  visitNumber: number | null,
  visitLabel: string
): string {
  if (!visitNumber || visitNumber <= 1) return stepName;
  return `${stepName} (${visitLabel} ${visitNumber})`;
}
