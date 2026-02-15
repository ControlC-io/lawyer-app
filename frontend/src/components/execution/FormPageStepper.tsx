import { cn } from "@/lib/utils";
import type { FormPage } from "@/lib/formConfig";

export interface FormPageStepperProps {
  pages: FormPage[];
  currentIndex: number;
  onPageChange: (index: number) => void;
  /** Optional label for each step. Defaults to page.title or "Page {n}" */
  getStepLabel?: (page: FormPage, index: number) => string;
  className?: string;
}

/**
 * Bullet step progress bar for form pages: horizontal row of clickable steps
 * with a track line. Current step is filled; past steps show a checkmark; future steps are outlined.
 */
export function FormPageStepper({
  pages,
  currentIndex,
  onPageChange,
  getStepLabel = (page, idx) => page.title || `Page ${idx + 1}`,
  className,
}: FormPageStepperProps) {
  if (pages.length === 0 || pages.length === 1) return null;
  const safeIndex = Math.min(Math.max(0, currentIndex), pages.length - 1);

  return (
    <div className={cn("w-full", className)} role="tablist" aria-label="Form pages">
      {/* Track line in a fixed-height strip (h-7) so it's vertically centered; -mb-7 overlaps bullets on top.
          Track runs from first bullet center to last bullet center (inset by half bullet + padding ≈ 1.5rem). */}
      <div className="relative h-7 flex items-center px-2 -mb-7">
        <div className="absolute left-6 right-6 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-muted" />
        <div
          className="absolute left-6 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-primary transition-all duration-200"
          style={{
            width:
              pages.length <= 1
                ? "0"
                : `calc(${safeIndex / (pages.length - 1)} * (100% - 3rem))`,
          }}
        />
      </div>
      {/* Bullets + labels; bullets sit in the same vertical space as the line strip */}
      <div className="relative flex w-full justify-between">
        {pages.map((page, idx) => {
          const isActive = idx === safeIndex;
          const isPast = idx < safeIndex;
          const label = getStepLabel(page, idx);
          return (
            <div key={page.id} className="flex flex-col items-center -translate-x-1">
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-label={label}
                tabIndex={isActive ? 0 : -1}
                onClick={() => onPageChange(idx)}
                className={cn(
                  "relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  isActive &&
                    "border-primary bg-primary text-primary-foreground scale-110 shadow-md",
                  !isActive && !isPast &&
                    "border-muted-foreground/50 bg-background hover:border-muted-foreground hover:bg-muted/50",
                  isPast &&
                    "border-primary bg-primary text-primary-foreground"
                )}
              >
                {isPast && !isActive ? (
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <span className="text-xs font-semibold">{idx + 1}</span>
                )}
              </button>
              <span
                className={cn(
                  "mt-1.5 text-center text-xs font-medium max-w-[72px] sm:max-w-[90px] truncate block",
                  isActive ? "text-foreground" : "text-muted-foreground"
                )}
                title={label}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
