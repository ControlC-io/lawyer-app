import { useState } from "react";
import { format } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { Calendar as CalendarIcon } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface DateFieldProps {
  field: any;
  value: any;
  onChange: (value: any) => void;
  disabled?: boolean;
  required?: boolean;
  labelPosition?: "top" | "side" | "hidden";
  primaryColor?: string;
}

export const DateField = ({ field, value, onChange, disabled, required, labelPosition = "top", primaryColor }: DateFieldProps) => {
  const [open, setOpen] = useState(false);
  const { t, language } = useLanguage();
  const dateLocale = language === "fr" ? fr : enUS;
  const wrapperStyle = primaryColor ? ({ "--portal-primary": primaryColor } as React.CSSProperties) : undefined;

  // Parse value to Date object if it exists
  // Handle DD/MM/YYYY format as well as ISO format
  const parseDate = (val: string): Date | undefined => {
    // Try DD/MM/YYYY format first
    const ddmmyyyy = val.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (ddmmyyyy) {
      const [, day, month, year] = ddmmyyyy;
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }
    // Fallback to standard Date parsing (ISO format, etc.)
    return new Date(val);
  };

  const dateValue = value ? (typeof value === "string" ? parseDate(value) : value) : undefined;
  const validDate = dateValue && dateValue instanceof Date && !isNaN(dateValue.getTime()) ? dateValue : undefined;

  const handleSelect = (date: Date | undefined) => {
    onChange(date ? format(date, "yyyy-MM-dd") : null);
    setOpen(false);
  };

  const label = labelPosition !== "hidden" ? (
    <Label className={`text-sm font-medium flex items-center gap-1 ${labelPosition === "side" ? "w-32 shrink-0" : ""}`}>
      {field.label || field.name || field.id}
      {required && <span className="text-destructive">*</span>}
    </Label>
  ) : null;

  const datePicker = (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="flex gap-1">
          <Button
            variant="outline"
            className={cn(
              "flex-1 justify-start text-left font-normal portal-primary-btn",
              !validDate && "text-muted-foreground"
            )}
            onClick={() => !disabled && setOpen(true)}
            disabled={disabled}
            data-portal-color={primaryColor ? "true" : undefined}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {validDate ? format(validDate, "dd/MM/yyyy", { locale: dateLocale }) : <span>{t("executionForm.pickDate")}</span>}
          </Button>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={validDate}
          onSelect={handleSelect}
          initialFocus
          fromYear={1900}
          toYear={2100}
        />
      </PopoverContent>
    </Popover>
  );

  if (labelPosition === "side") {
    return (
      <div className="space-y-1.5 w-full" style={wrapperStyle}>
        <div className="flex items-center gap-3">
          {label}
          <div className="flex-1 min-w-0">
            {datePicker}
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
      {datePicker}
      {field.description && (
        <p className="text-xs text-muted-foreground">{field.description}</p>
      )}
    </div>
  );
};

