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
const collator = new Intl.Collator(undefined, { sensitivity: "base" });

export function sortExecutions<T extends SortableExecution>(
  executions: T[],
  sortBy: SortOption
): T[] {
  if (sortBy === "newest") return [...executions];

  const hasName = (e: T) => !!e.name && e.name.trim().length > 0;
  const direction = sortBy === "name_asc" ? 1 : -1;

  // Array.prototype.sort is stable (ES2019+), so equal elements keep their
  // incoming order without manual index bookkeeping.
  return [...executions].sort((a, b) => {
    const aHasName = hasName(a);
    const bHasName = hasName(b);

    // Unnamed always sinks to the bottom, regardless of direction.
    if (aHasName !== bHasName) return aHasName ? -1 : 1;
    if (!aHasName) return 0;

    return collator.compare(a.name!, b.name!) * direction;
  });
}
