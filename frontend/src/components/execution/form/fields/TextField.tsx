import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface TextFieldProps {
  field: any;
  value: any;
  onChange: (value: any) => void;
  disabled?: boolean;
  required?: boolean;
  labelPosition?: "top" | "side" | "hidden";
  primaryColor?: string;
}

export const TextField = ({ field, value, onChange, disabled, required, labelPosition = "top", primaryColor }: TextFieldProps) => {
  const wrapperStyle = primaryColor ? ({ "--portal-primary": primaryColor } as React.CSSProperties) : undefined;
  const label = labelPosition !== "hidden" ? (
    <Label className={`text-sm font-medium flex items-center gap-1 ${labelPosition === "side" ? "w-32 shrink-0" : ""}`}>
      {field.label || field.name || field.id}
      {required && <span className="text-destructive">*</span>}
    </Label>
  ) : null;

  const input = (
    <Input
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder={field.placeholder}
      type={field.type === "email" ? "email" : field.type === "password" ? "password" : "text"}
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

