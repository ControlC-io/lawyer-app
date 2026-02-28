import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface NumberFieldProps {
  field: any;
  value: any;
  onChange: (value: any) => void;
  disabled?: boolean;
  required?: boolean;
  labelPosition?: "top" | "side" | "hidden";
  primaryColor?: string;
}

export const NumberField = ({ field, value, onChange, disabled, required, labelPosition = "top", primaryColor }: NumberFieldProps) => {
  const wrapperStyle = primaryColor ? ({ "--portal-primary": primaryColor } as React.CSSProperties) : undefined;
  const label = labelPosition !== "hidden" ? (
    <Label className={`text-sm font-medium flex items-center gap-1 ${labelPosition === "side" ? "w-32 shrink-0" : ""}`}>
      {field.label || field.name || field.id}
      {required && <span className="text-destructive">*</span>}
    </Label>
  ) : null;

  const input = (
    <Input
      type="number"
      value={value ?? ""}
      onChange={(e) => {
        const val = e.target.value;
        onChange(val === "" ? null : Number(val));
      }}
      disabled={disabled}
      placeholder={field.placeholder}
      className="w-full"
    />
  );

  if (labelPosition === "side") {
    return (
      <div className="space-y-1.5 w-full" style={wrapperStyle}>
        <div className="flex items-center gap-3">
          {label}
          <div className="flex-1 min-w-0">
            {input}
          </div>
        </div>
        {field.description && (
          <p className="text-xs text-muted-foreground ml-[calc(8rem+0.75rem)]">{field.description}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1.5 w-full" style={wrapperStyle}>
      {label}
      {input}
      {field.description && (
        <p className="text-xs text-muted-foreground">{field.description}</p>
      )}
    </div>
  );
};

