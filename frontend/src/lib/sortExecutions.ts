export type SortOption = "newest" | "name_asc" | "name_desc";

/** Minimal shape needed for sorting; real executions have many more fields. */
interface SortableExecution {
  name?: string | null;
}

/**
 * Returns a new array sorted per `sortBy`.
 * - "newest": returns the input order unchanged (backend already sorts by
 *   created_at desc).
 * - "name_asc" / "name_desc": sorts by execution `name` (case-insensitive,
 *   locale-aware). Executions with no name (null/undefined/empty/whitespace)
 *   always sink to the bottom regardless of direction. Ties keep their original
 *   incoming order (stable).
 */
export function sortExecutions<T extends SortableExecution>(
  executions: T[],
  sortBy: SortOption
): T[] {
  if (sortBy === "newest") return [...executions];

  const hasName = (e: T) => !!e.name && e.name.trim().length > 0;
  const direction = sortBy === "name_asc" ? 1 : -1;

  // Decorate with original index so we can keep ties stable across direction.
  return executions
    .map((execution, index) => ({ execution, index }))
    .sort((a, b) => {
      const aHasName = hasName(a.execution);
      const bHasName = hasName(b.execution);

      // Unnamed always sinks to the bottom, regardless of direction.
      if (aHasName !== bHasName) return aHasName ? -1 : 1;
      if (!aHasName && !bHasName) return a.index - b.index;

      const cmp = a.execution.name!.localeCompare(b.execution.name!, undefined, {
        sensitivity: "base",
      });
      if (cmp !== 0) return cmp * direction;

      // Stable tie-break: preserve incoming order.
      return a.index - b.index;
    })
    .map((entry) => entry.execution);
}
