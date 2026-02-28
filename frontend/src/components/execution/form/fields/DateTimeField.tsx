import { useState } from "react";
import { format } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { Calendar as CalendarIcon, Clock } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface DateTimeFieldProps {
    field: any;
    value: any;
    onChange: (value: any) => void;
    disabled?: boolean;
    required?: boolean;
    labelPosition?: "top" | "side";
    primaryColor?: string;
}

export const DateTimeField = ({ field, value, onChange, disabled, required, labelPosition = "top", primaryColor }: DateTimeFieldProps) => {
    const [open, setOpen] = useState(false);
    const { t, language } = useLanguage();
    const dateLocale = language === "fr" ? fr : enUS;
    const wrapperStyle = primaryColor ? ({ "--portal-primary": primaryColor } as React.CSSProperties) : undefined;

    // Helper to parse date string or object
    // Supports ISO strings and generic date objects
    const parseDate = (val: any): Date | undefined => {
        if (!val) return undefined;
        if (val instanceof Date) return val;
        // Try to parse string
        const d = new Date(val);
        if (!isNaN(d.getTime())) return d;
        return undefined;
    };

    const currentDate = parseDate(value);

    const handleDateSelect = (date: Date | undefined) => {
        if (!date) {
            onChange(null);
            return;
        }

        // Preserve time from current value if possible, otherwise default to 00:00
        const newDate = new Date(date);
        if (currentDate) {
            newDate.setHours(currentDate.getHours());
            newDate.setMinutes(currentDate.getMinutes());
        } else {
            newDate.setHours(0);
            newDate.setMinutes(0);
        }

        onChange(newDate.toISOString());
    };

    const handleTimeChange = (timeStr: string) => {
        if (!currentDate) return;

        const [hours, minutes] = timeStr.split(':').map(Number);
        if (isNaN(hours) || isNaN(minutes)) return;

        const newDate = new Date(currentDate);
        newDate.setHours(hours);
        newDate.setMinutes(minutes);

        onChange(newDate.toISOString());
    };

    const label = (
        <Label className={`text-sm font-medium flex items-center gap-1 ${labelPosition === "side" ? "w-32 shrink-0" : ""}`}>
            {field.label || field.name || field.id}
            {required && <span className="text-destructive">*</span>}
        </Label>
    );

    const dateTimePicker = (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <div className="flex gap-1">
                    <Button
                        variant="outline"
                        className={cn(
                            "flex-1 justify-start text-left font-normal portal-primary-btn",
                            !currentDate && "text-muted-foreground"
                        )}
                        onClick={() => !disabled && setOpen(true)}
                        disabled={disabled}
                        data-portal-color={primaryColor ? "true" : undefined}
                    >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {currentDate ? format(currentDate, "dd/MM/yyyy HH:mm", { locale: dateLocale }) : <span>{t("executionForm.pickDateTime")}</span>}
                    </Button>
                </div>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                    mode="single"
                    selected={currentDate}
                    onSelect={handleDateSelect}
                    initialFocus
                    fromYear={1900}
                    toYear={2100}
                />
                <div className="p-3 border-t border-border">
                    <Label className="text-xs mb-2 block">Time</Label>
                    <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        <Input
                            type="time"
                            className="w-full"
                            value={currentDate ? format(currentDate, "HH:mm") : ""}
                            onChange={(e) => handleTimeChange(e.target.value)}
                            disabled={!currentDate}
                        />
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );

    if (labelPosition === "side") {
        return (
            <div className="space-y-1.5 w-full" style={wrapperStyle}>
                <div className="flex items-center gap-3">
                    {label}
                    <div className="flex-1 min-w-0">
                        {dateTimePicker}
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
            {dateTimePicker}
            {field.description && (
                <p className="text-xs text-muted-foreground">{field.description}</p>
            )}
        </div>
    );
};
