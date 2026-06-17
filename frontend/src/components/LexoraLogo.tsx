import { cn } from "@/lib/utils";

type LexoraLogoProps = {
  className?: string;
};

/** Lexora brand mark — scales of justice, modern legal-tech. */
export function LexoraLogo({ className }: LexoraLogoProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      role="img"
      aria-label="Lexora"
    >
      {/* Central pillar + base */}
      <path
        d="M12 4v16M9 20h6"
        className="stroke-primary"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Balance beam */}
      <path
        d="M5 9h14"
        className="stroke-primary"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Pivot gem */}
      <circle
        cx="12"
        cy="4"
        r="1.5"
        className="fill-[hsl(var(--brand-secondary))]"
      />
      {/* Left chain */}
      <path
        d="M6 9v5"
        className="stroke-primary/70"
        strokeWidth="1"
        strokeLinecap="round"
      />
      {/* Right chain */}
      <path
        d="M18 9v5"
        className="stroke-primary/70"
        strokeWidth="1"
        strokeLinecap="round"
      />
      {/* Left pan arc */}
      <path
        d="M3.5 14q2.5 3 5 0"
        className="stroke-[hsl(var(--brand-secondary))]"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
      {/* Right pan arc */}
      <path
        d="M15.5 14q2.5 3 5 0"
        className="stroke-[hsl(var(--brand-secondary))]"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
