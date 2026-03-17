/**
 * Tag color palette: Dot (vif), Fond (background), Texte (text).
 * Use these colors everywhere tags/statuses are displayed.
 */
export const TAG_COLORS = [
  { id: "bleu", label: "Bleu", dot: "#2a5ce5", bg: "#dce8fd", text: "#1a3fa0" },
  { id: "vert", label: "Vert", dot: "#00b87d", bg: "#c8f5e4", text: "#00623d" },
  { id: "orange", label: "Orange", dot: "#f97316", bg: "#fde9d0", text: "#7a2e00" },
  { id: "jaune", label: "Jaune", dot: "#eab308", bg: "#fdf5c2", text: "#6b4500" },
  { id: "rouge", label: "Rouge", dot: "#ef4444", bg: "#fee2e2", text: "#7f1d1d" },
  { id: "mauve", label: "Mauve", dot: "#7c3aed", bg: "#ede5fd", text: "#4c1d95" },
] as const;

export type TagColorId = (typeof TAG_COLORS)[number]["id"];

export interface TagColorSet {
  dot: string;
  bg: string;
  text: string;
}

/** Normalize hex for comparison (lowercase, 3 → 6 digits). */
function normalizeHex(hex: string): string {
  const h = (hex || "").replace(/^#/, "").toLowerCase();
  if (h.length === 3) {
    return "#" + h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  return "#" + h;
}

/**
 * Return the tag color set (dot, bg, text) for a given status color (hex).
 * If the hex matches one of the 6 palette dots, that palette is returned.
 * Otherwise a set is derived from the hex (dot = hex, bg/text approximated).
 */
export function getTagColors(statusColor: string | undefined): TagColorSet {
  if (!statusColor) {
    return { dot: "#94a3b8", bg: "#f1f5f9", text: "#475569" };
  }
  const normalized = normalizeHex(statusColor);
  const found = TAG_COLORS.find((p) => normalizeHex(p.dot) === normalized);
  if (found) {
    return { dot: found.dot, bg: found.bg, text: found.text };
  }
  // Fallback: use hex as dot, lighten for bg, darken for text (simple heuristic)
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  const mix = (v: number, amount: number) => Math.round(v + (255 - v) * amount);
  const darken = (v: number, amount: number) => Math.round(v * (1 - amount));
  const bgHex =
    "#" +
    [r, g, b]
      .map((c) => mix(c, 0.85))
      .map((c) => c.toString(16).padStart(2, "0"))
      .join("");
  const textHex =
    "#" +
    [r, g, b]
      .map((c) => darken(c, 0.4))
      .map((c) => c.toString(16).padStart(2, "0"))
      .join("");
  return { dot: normalized, bg: bgHex, text: textHex };
}

/** Default status color (Bleu dot). */
export const DEFAULT_STATUS_COLOR = TAG_COLORS[0].dot;
