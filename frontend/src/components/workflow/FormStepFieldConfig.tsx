import { ChevronRight, GripVertical, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
    otherFields: { id: string; name: string }[];
    onUpdate: (step: WorkflowStep) => void;
}

export function FormStepFieldConfig({ item, step, otherFields, onUpdate }: FormStepFieldConfigProps) {
    const fieldConfig = step.config.form_fields?.[item.id] || {
        shown: false,
        editable: false,
        readonly: false,
        required: false,
        visibility_condition: null,
        required_condition: null,
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
                    <div className="grid grid-cols-3 gap-2">
                        <label className={cn(
                            "flex items-center gap-2 p-2 rounded-md border text-xs font-medium cursor-pointer transition-colors",
                            fieldConfig.editable ? "bg-primary/5 border-primary/20 text-primary" : "hover:bg-accent hover:text-accent-foreground",
                            fieldConfig.readonly && "opacity-50 cursor-not-allowed"
                        )}>
                            <Checkbox
                                checked={fieldConfig.editable}
                                disabled={fieldConfig.readonly}
                                onCheckedChange={(checked) => updateConfig({ editable: !!checked, readonly: false })}
                                className="h-3.5 w-3.5"
                            />
                            Editable
                        </label>

                        <label className={cn(
                            "flex items-center gap-2 p-2 rounded-md border text-xs font-medium cursor-pointer transition-colors",
                            fieldConfig.readonly ? "bg-primary/5 border-primary/20 text-primary" : "hover:bg-accent hover:text-accent-foreground",
                            fieldConfig.editable && "opacity-50 cursor-not-allowed"
                        )}>
                            <Checkbox
                                checked={fieldConfig.readonly}
                                disabled={fieldConfig.editable}
                                onCheckedChange={(checked) => updateConfig({ readonly: !!checked, editable: false })}
                                className="h-3.5 w-3.5"
                            />
                            Read-only
                        </label>

                        <label className={cn(
                            "flex items-center gap-2 p-2 rounded-md border text-xs font-medium cursor-pointer transition-colors",
                            fieldConfig.required ? "bg-primary/5 border-primary/20 text-primary" : "hover:bg-accent hover:text-accent-foreground"
                        )}>
                            <Checkbox
                                checked={fieldConfig.required}
                                onCheckedChange={(checked) => updateConfig({ required: !!checked })}
                                className="h-3.5 w-3.5"
                            />
                            Required
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

                    {/* Advanced Conditions */}
                    <Collapsible className="group">
                        <CollapsibleTrigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="w-full flex items-center justify-between p-2 h-auto text-xs font-medium border border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 hover:text-primary rounded-md group-data-[state=open]:rounded-b-none transition-all"
                            >
                                <div className="flex items-center gap-1.5">
                                    <ChevronRight className="h-3.5 w-3.5 transition-transform duration-200 group-data-[state=open]:rotate-90" />
                                    Advanced Conditions
                                </div>
                            </Button>
                        </CollapsibleTrigger>

                        <CollapsibleContent>
                            <div className="p-3 bg-muted/30 border border-t-0 border-border rounded-b-md space-y-3">
                                {/* Visibility Condition */}
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-medium text-muted-foreground">Visibility Condition</Label>
                                    <div className="flex gap-2">
                                        <Select
                                            value={fieldConfig.visibility_condition?.field_id || "none"}
                                            onValueChange={(value) => {
                                                const newCondition = value === "none" ? null : {
                                                    field_id: value,
                                                    operator: "has_value"
                                                };
                                                updateConfig({ visibility_condition: newCondition });
                                            }}
                                        >
                                            <SelectTrigger className="h-8 text-xs bg-background">
                                                <SelectValue placeholder="Always Visible" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">Always Visible</SelectItem>
                                                {otherFields.map(f => (
                                                    <SelectItem key={f.id} value={f.id}>If {f.name}...</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>

                                        {fieldConfig.visibility_condition && (
                                            <Select
                                                value={fieldConfig.visibility_condition.operator}
                                                onValueChange={(value) => {
                                                    updateConfig({
                                                        visibility_condition: {
                                                            ...fieldConfig.visibility_condition,
                                                            operator: value,
                                                        },
                                                    });
                                                }}
                                            >
                                                <SelectTrigger className="h-8 text-xs w-[110px] bg-background">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="has_value">Has Value</SelectItem>
                                                    <SelectItem value="is_true">Is True</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        )}
                                    </div>
                                </div>

                                {/* Required Condition */}
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-medium text-muted-foreground">Required Condition</Label>
                                    <div className="flex gap-2">
                                        <Select
                                            value={fieldConfig.required_condition?.field_id || "none"}
                                            onValueChange={(value) => {
                                                const newCondition = value === "none" ? null : {
                                                    field_id: value,
                                                    operator: "has_value"
                                                };
                                                updateConfig({ required_condition: newCondition });
                                            }}
                                        >
                                            <SelectTrigger className="h-8 text-xs bg-background">
                                                <SelectValue placeholder="Always Required (if checked)" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">Always Required (if checked above)</SelectItem>
                                                {otherFields.map(f => (
                                                    <SelectItem key={f.id} value={f.id}>If {f.name}...</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>

                                        {fieldConfig.required_condition && (
                                            <Select
                                                value={fieldConfig.required_condition.operator}
                                                onValueChange={(value) => {
                                                    updateConfig({
                                                        required_condition: {
                                                            ...fieldConfig.required_condition,
                                                            operator: value,
                                                        },
                                                    });
                                                }}
                                            >
                                                <SelectTrigger className="h-8 text-xs w-[110px] bg-background">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="has_value">Has Value</SelectItem>
                                                    <SelectItem value="is_true">Is True</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </CollapsibleContent>
                    </Collapsible>
                </div>
            )}
        </div>
    );
}
