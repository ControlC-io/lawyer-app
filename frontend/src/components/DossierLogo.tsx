import { cn } from "@/lib/utils";

type DossierLogoProps = {
  className?: string;
};

/** Transparent brand mark — document + scales, no background box. */
export function DossierLogo({ className }: DossierLogoProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("shrink-0", className)}
      role="img"
      aria-hidden="true"
    >
      <path
        d="M8 3h7l5 5v13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"
        className="stroke-primary"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M15 3v5h5"
        className="stroke-primary"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M9 12h7M9 15h5"
        className="stroke-primary/70"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M12 17.5v2M9.5 17.5h5M9.5 17.5 8.25 16.25M14.5 17.5 15.75 16.25"
        className="stroke-[hsl(var(--brand-secondary))]"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
