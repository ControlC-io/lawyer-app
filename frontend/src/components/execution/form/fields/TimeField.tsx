
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface TimeFieldProps {
    field: any;
    value: any;
    onChange: (value: any) => void;
    disabled?: boolean;
    required?: boolean;
    labelPosition?: "top" | "side" | "hidden";
}

export const TimeField = ({ field, value, onChange, disabled, required, labelPosition = "top" }: TimeFieldProps) => {
    const label = labelPosition !== "hidden" ? (
        <Label className={`text-sm font-medium flex items-center gap-1 ${labelPosition === "side" ? "w-32 shrink-0" : ""}`}>
            {field.label || field.name || field.id}
            {required && <span className="text-destructive">*</span>}
        </Label>
    ) : null;

    const input = (
        <div className="flex gap-1">
            <Input
                type="time"
                value={value ?? ""}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
                className="w-full"
            />
        </div>
    );

    if (labelPosition === "side") {
        return (
            <div className="space-y-1.5">
                <div className="flex items-center gap-3">
                    {label}
                    <div className="flex-1">
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
        <div className="space-y-1.5">
            {label}
            {input}
            {field.description && (
                <p className="text-xs text-muted-foreground">{field.description}</p>
            )}
        </div>
    );
};
