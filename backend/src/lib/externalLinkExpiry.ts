import crypto from 'crypto';

export function parsePositiveInteger(value: unknown, fallbackValue: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallbackValue;
  const rounded = Math.round(parsed);
  return rounded > 0 ? rounded : fallbackValue;
}

export function resolveExternalLinkExpiresAt(
  stepConfig: unknown,
  startedAt: Date = new Date()
): Date | null {
  const config = (stepConfig && typeof stepConfig === 'object' ? stepConfig : {}) as Record<string, unknown>;
  const durationMinutes = parsePositiveInteger(config.external_link_duration_minutes, 0);
  if (durationMinutes <= 0) return null;
  return new Date(startedAt.getTime() + durationMinutes * 60_000);
}

export function isExternalLinkAccessible(params: {
  status: string;
  expiresAt?: Date | null;
  now?: Date;
}): boolean {
  if (params.status !== 'running') return false;
  if (!params.expiresAt) return true;
  const now = params.now ?? new Date();
  return now.getTime() <= params.expiresAt.getTime();
}

export function resolveExpiredOutput(stepConfig: unknown): string {
  const config = (stepConfig && typeof stepConfig === 'object' ? stepConfig : {}) as Record<string, unknown>;
  const configured =
    typeof config.external_link_expired_output === 'string'
      ? config.external_link_expired_output.trim()
      : '';
  if (configured) return configured;

  const outputs = Array.isArray(config.outputs) ? config.outputs : ['Submit', 'Cancel'];
  if (outputs.length >= 2 && typeof outputs[1] === 'string') return outputs[1];
  if (outputs.includes('Cancel')) return 'Cancel';
  const lastOutput = outputs[outputs.length - 1];
  return typeof lastOutput === 'string' ? lastOutput : 'Cancel';
}

export function resolveExternalLinkFieldsForStep(
  step: { step_type?: string | null; config?: unknown },
  existing?: {
    external_token?: string | null;
    external_token_expires_at?: Date | null;
    started_at?: Date | null;
  }
): { external_token?: string; external_token_expires_at?: Date | null } {
  const config = (step.config as Record<string, unknown>) || {};
  if (step.step_type !== 'edit_form' || config.allow_external_assignment !== true) {
    return {};
  }

  const startedAt = new Date();
  if (existing?.external_token) {
    return {
      external_token: existing.external_token,
      external_token_expires_at:
        existing.external_token_expires_at ??
        resolveExternalLinkExpiresAt(step.config, existing.started_at ?? startedAt),
    };
  }

  return {
    external_token: crypto.randomUUID(),
    external_token_expires_at: resolveExternalLinkExpiresAt(step.config, startedAt),
  };
}
