export type WorkflowStepType = "start" | "end" | "decision" | "action" | "edit_form" | "file";

const FALLBACK_STEP_TYPE: WorkflowStepType = "action";

export const STEP_TYPE_COLORS: Record<WorkflowStepType, string> = {
  start: "#34D399",
  end: "#FB7185",
  decision: "#FBBF24",
  action: "#38BDF8",
  edit_form: "#A78BFA",
  file: "#94A3B8",
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeHex(value: string): string {
  const cleaned = value.trim().replace("#", "");
  if (!/^[0-9A-Fa-f]{3}$|^[0-9A-Fa-f]{6}$/.test(cleaned)) {
    return STEP_TYPE_COLORS[FALLBACK_STEP_TYPE];
  }
  const full = cleaned.length === 3
    ? cleaned.split("").map((char) => `${char}${char}`).join("")
    : cleaned;
  return `#${full.toUpperCase()}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = normalizeHex(hex).replace("#", "");
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function toRgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
}

function mix(hex: string, otherHex: string, ratio: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(otherHex);
  const t = clamp(ratio, 0, 1);
  const r = Math.round(a.r * (1 - t) + b.r * t);
  const g = Math.round(a.g * (1 - t) + b.g * t);
  const bMixed = Math.round(a.b * (1 - t) + b.b * t);
  return `#${[r, g, bMixed].map((n) => n.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

export function resolveWorkflowStepType(stepType?: string | null): WorkflowStepType {
  if (!stepType) return FALLBACK_STEP_TYPE;
  if (Object.prototype.hasOwnProperty.call(STEP_TYPE_COLORS, stepType)) {
    return stepType as WorkflowStepType;
  }
  return FALLBACK_STEP_TYPE;
}

export function getStepTypeBaseColor(stepType?: string | null): string {
  return STEP_TYPE_COLORS[resolveWorkflowStepType(stepType)];
}

export function getStepNodeStyles(stepType?: string | null) {
  const base = getStepTypeBaseColor(stepType);
  return {
    backgroundColor: mix(base, "#FFFFFF", 0.78),
    borderColor: mix(base, "#000000", 0.18),
    textColor: mix(base, "#000000", 0.42),
    ringColor: base,
    shadowColor: toRgba(base, 0.36),
  };
}

export function getStepToolbarIconColor(stepType?: string | null): string {
  return getStepTypeBaseColor(stepType);
}

export function getStepExecutionStyles(stepType?: string | null) {
  const base = getStepTypeBaseColor(stepType);
  return {
    borderColor: toRgba(base, 0.52),
    backgroundColor: toRgba(base, 0.14),
    textColor: mix(base, "#000000", 0.24),
    ringColor: toRgba(base, 0.6),
    completedDotColor: base,
    runningDotColor: base,
    completedIconColor: "#FFFFFF",
  };
}
