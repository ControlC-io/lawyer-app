import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface BooleanFieldProps {
  field: any;
  value: any;
  onChange: (value: any) => void;
  disabled?: boolean;
  required?: boolean;
  labelPosition?: "top" | "side" | "hidden";
}

export const BooleanField = ({ field, value, onChange, disabled, required, labelPosition = "top" }: BooleanFieldProps) => {
  // Boolean fields always have label beside (checkbox pattern), unless hidden
  return (
    <div className="flex items-center gap-2 py-1.5">
      <Checkbox
        id={`field-${field.id}`}
        checked={!!value}
        onCheckedChange={onChange}
        disabled={disabled}
      />
      {labelPosition !== "hidden" && (
        <div className="space-y-1">
          <Label
            htmlFor={`field-${field.id}`}
            className="text-sm font-medium flex items-center gap-1 cursor-pointer"
          >
            {field.label || field.name || field.id}
            {required && <span className="text-destructive">*</span>}
          </Label>
          {field.description && (
            <p className="text-xs text-muted-foreground">{field.description}</p>
          )}
        </div>
      )}
    </div>
  );
};

