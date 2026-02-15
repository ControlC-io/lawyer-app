import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { WorkflowStep } from "@/pages/WorkflowEditor";
import { cn } from "@/lib/utils";

interface FormStepFieldConfigProps {
    item: {
        id: string;
        name: string;
        data_structure_name: string;
        field_type?: string;
    };
    step: WorkflowStep;
    onUpdate: (step: WorkflowStep) => void;
}

export function FormStepFieldConfig({ item, step, onUpdate }: FormStepFieldConfigProps) {
    const fieldConfig = step.config.form_fields?.[item.id] || {
        shown: false,
        readonly: false,
        allowed_file_types: [],
        allow_ai_extraction: false,
    };

    const updateConfig = (updates: Partial<typeof fieldConfig>) => {
        const formFields = step.config.form_fields || {};
        onUpdate({
            ...step,
            config: {
                ...step.config,
                form_fields: {
                    ...formFields,
                    [item.id]: {
                        ...fieldConfig,
                        ...updates,
                    },
                },
            },
        });
    };

    return (
        <div className={cn(
            "border rounded-lg transition-all duration-200 bg-card",
            fieldConfig.shown ? "border-primary/50 shadow-sm" : "border-border hover:border-primary/20"
        )}>
            {/* Header */}
            <div className="p-3 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-sm truncate">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="truncate max-w-[120px]">{item.data_structure_name}</span>
                        {item.field_type && (
                            <>
                                <span className="text-muted-foreground/50">•</span>
                                <span className="capitalize">{item.field_type}</span>
                            </>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <Label htmlFor={`shown-${item.id}`} className="text-xs font-medium cursor-pointer">Show</Label>
                    <Checkbox
                        id={`shown-${item.id}`}
                        checked={fieldConfig.shown}
                        onCheckedChange={(checked) => updateConfig({ shown: !!checked })}
                        className="h-4 w-4"
                    />
                </div>
            </div>

            {/* Expanded Configuration */}
            {fieldConfig.shown && (
                <div className="px-3 pb-3 space-y-4 animate-in slide-in-from-top-1 fade-in duration-200">
                    <div className="h-px bg-border/50" />

                    {/* Main Options */}
                    <div className="flex gap-2">
                        <label className={cn(
                            "flex items-center gap-2 p-2 rounded-md border text-xs font-medium cursor-pointer transition-colors",
                            fieldConfig.readonly ? "bg-primary/5 border-primary/20 text-primary" : "hover:bg-accent hover:text-accent-foreground"
                        )}>
                            <Checkbox
                                checked={fieldConfig.readonly}
                                onCheckedChange={(checked) => updateConfig({ readonly: !!checked })}
                                className="h-3.5 w-3.5"
                            />
                            Read-only
                        </label>
                    </div>

                    {(item.field_type === 'file' || item.field_type === 'multiple_files') && (
                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium text-muted-foreground">Allowed File Types</Label>
                            <Input
                                className="h-8 text-xs bg-background"
                                placeholder="e.g. .pdf, .jpg, .png (leave empty for all)"
                                value={fieldConfig.allowed_file_types?.join(', ') || ''}
                                onChange={(e) => {
                                    const value = e.target.value;
                                    const types = value.split(',').map(t => t.trim()).filter(t => t);
                                    updateConfig({ allowed_file_types: types });
                                }}
                            />
                        </div>
                    )}

                </div>
            )}
        </div>
    );
}
