import { cn } from "@/lib/utils";
import type { FormPage } from "@/lib/formConfig";

export interface FormPageStepperProps {
  pages: FormPage[];
  currentIndex: number;
  onPageChange: (index: number) => void;
  /** Optional label for each step. Defaults to page.title or "Page {n}" */
  getStepLabel?: (page: FormPage, index: number) => string;
  className?: string;
  /** Optional brand/primary color (e.g. company portal color). When set, stepper uses it instead of theme primary. */
  primaryColor?: string;
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
  primaryColor,
}: FormPageStepperProps) {
  if (pages.length === 0 || pages.length === 1) return null;
  const safeIndex = Math.min(Math.max(0, currentIndex), pages.length - 1);
  const useCustomColor = Boolean(primaryColor);
  const wrapperStyle = useCustomColor && primaryColor
    ? ({ "--portal-primary": primaryColor } as React.CSSProperties)
    : undefined;
  const stepWidthPercent = 100 / pages.length;
  const trackInset = `${stepWidthPercent / 2}%`;
  const trackSpan = `${100 - stepWidthPercent}%`;

  return (
    <div
      className={cn("w-full min-w-0", className)}
      role="tablist"
      aria-label="Form pages"
      style={wrapperStyle}
    >
      {/* Track line in a fixed-height strip (h-7) so it's vertically centered; -mb-7 overlaps bullets on top.
          Track runs from first bullet center to last bullet center. */}
      <div className="relative h-7 flex items-center -mb-7">
        <div
          className="absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-muted"
          style={{ left: trackInset, right: trackInset }}
        />
        <div
          className={cn(
            "absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full transition-all duration-200",
            !useCustomColor && "bg-primary"
          )}
          style={{
            left: trackInset,
            width:
              pages.length <= 1
                ? "0"
                : `calc(${safeIndex / (pages.length - 1)} * ${trackSpan})`,
            ...(useCustomColor && primaryColor ? { backgroundColor: primaryColor } : {}),
          }}
        />
      </div>
      {/* Equal-width columns so long titles share space and wrap instead of truncating. */}
      <div className="relative flex w-full min-w-0">
        {pages.map((page, idx) => {
          const isActive = idx === safeIndex;
          const isPast = idx < safeIndex;
          const label = getStepLabel(page, idx);
          const stepStyle =
            useCustomColor && primaryColor && (isActive || isPast)
              ? {
                  borderColor: primaryColor,
                  backgroundColor: primaryColor,
                  color: "#fff",
                }
              : undefined;
          return (
            <div key={page.id} className="flex min-w-0 flex-1 flex-col items-center px-0.5 sm:px-1">
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-label={label}
                tabIndex={isActive ? 0 : -1}
                onClick={() => onPageChange(idx)}
                style={stepStyle}
                className={cn(
                  "relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                  isActive && !useCustomColor &&
                    "border-primary bg-primary text-primary-foreground scale-110 shadow-md focus-visible:ring-ring",
                  isActive && useCustomColor && "scale-110 shadow-md focus-visible:ring-[var(--portal-primary)]",
                  !isActive && !isPast && !useCustomColor &&
                    "border-muted-foreground/50 bg-background hover:border-muted-foreground hover:bg-muted/50 focus-visible:ring-ring",
                  !isActive && !isPast && useCustomColor &&
                    "border-muted-foreground/50 bg-background hover:border-[var(--portal-primary)] hover:bg-[var(--portal-primary)]/10 focus-visible:ring-[var(--portal-primary)]",
                  isPast && !useCustomColor &&
                    "border-primary bg-primary text-primary-foreground focus-visible:ring-ring"
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
                  "mt-1.5 w-full min-w-0 text-center text-[10px] leading-tight font-medium sm:text-xs sm:leading-snug line-clamp-2 break-words [overflow-wrap:anywhere]",
                  isActive && !useCustomColor && "text-foreground",
                  !isActive && "text-muted-foreground"
                )}
                style={useCustomColor && isActive && primaryColor ? { color: primaryColor } : undefined}
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
