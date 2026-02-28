import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
interface BooleanFieldProps {
  field: any;
  value: any;
  onChange: (value: any) => void;
  disabled?: boolean;
  required?: boolean;
  labelPosition?: "top" | "side" | "hidden";
  /** When set (e.g. portal primary color), checkbox and accent elements use this color */
  primaryColor?: string;
}

export const BooleanField = ({ field, value, onChange, disabled, required, labelPosition = "top", primaryColor }: BooleanFieldProps) => {
  const wrapperStyle = primaryColor
    ? ({ "--portal-primary": primaryColor, "--portal-primary-foreground": "#ffffff" } as React.CSSProperties)
    : undefined;

  const checkboxClassName = primaryColor
    ? "border-[var(--portal-primary)] data-[state=checked]:bg-[var(--portal-primary)] data-[state=checked]:text-[var(--portal-primary-foreground)] focus-visible:ring-[var(--portal-primary)]"
    : undefined;

  return (
    <div className="flex items-center gap-2 py-1.5 w-full" style={wrapperStyle}>
      <Checkbox
        id={`field-${field.id}`}
        checked={!!value}
        onCheckedChange={onChange}
        disabled={disabled}
        className={checkboxClassName}
      />
      {labelPosition !== "hidden" && (
        <div className="space-y-1">
          <Label
            htmlFor={`field-${field.id}`}
            className="text-sm font-medium flex items-center gap-1 cursor-pointer"
          >
            {field.label || field.name || field.id}
            {required && (
              <span className={primaryColor ? "text-[var(--portal-primary)]" : "text-destructive"}>*</span>
            )}
          </Label>
          {field.description && (
            <p className="text-xs text-muted-foreground">{field.description}</p>
          )}
        </div>
      )}
    </div>
  );
};

