import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Check, ChevronsUpDown, Loader2, RefreshCw, X, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface OptionFieldProps {
  field: any;
  value: any;
  onChange: (value: any) => void;
  disabled?: boolean;
  required?: boolean;
  labelPosition?: "top" | "side" | "hidden";
  primaryColor?: string;
  dynamicOptions?: string[];
  isLoadingDynamic?: boolean;
  dynamicError?: { message: string; type: string };
  onRetryDynamic?: () => void;
}

interface OptionItem {
  value: string;
  label: string;
}

export const OptionField = ({ 
  field, 
  value, 
  onChange, 
  disabled, 
  required,
  labelPosition = "top",
  primaryColor,
  dynamicOptions,
  isLoadingDynamic,
  dynamicError,
  onRetryDynamic
}: OptionFieldProps) => {
  const [open, setOpen] = useState(false);
  const wrapperStyle = primaryColor ? ({ "--portal-primary": primaryColor } as React.CSSProperties) : undefined;
  // Check both field_type and type for compatibility
  const fieldType = field.field_type || field.type || "option";
  const isMultiple = fieldType === "multiple_option";
  
  // Get options based on source
  const getOptions = (): OptionItem[] => {
    if (field.options_source === "dynamic") {
      return (dynamicOptions || []).map((option) => ({ value: option, label: option }));
    }
    return (field.options || []).map((opt: any) => {
      if (typeof opt === "string") {
        return { value: opt, label: opt };
      }
      const value = typeof opt?.value === "string" && opt.value.trim()
        ? opt.value
        : typeof opt?.label === "string"
          ? opt.label
          : "";
      const label = typeof opt?.label === "string" && opt.label.trim()
        ? opt.label
        : value;
      return { value, label };
    });
  };

  const options = getOptions();
  const getLabelByValue = (optionValue: string) => options.find((opt) => opt.value === optionValue)?.label || optionValue;
  const isDynamic = field.options_source === "dynamic";
  const hasFetchedOptions = isDynamic && (dynamicOptions !== undefined && dynamicOptions.length > 0);
  const shouldShowFetchButton = isDynamic && !hasFetchedOptions && !isLoadingDynamic && !dynamicError;
  // For read-only dynamic fields, just show the value
  const isReadOnlyDynamic = disabled && isDynamic && !hasFetchedOptions;

  if (isMultiple) {
    const selectedValues = Array.isArray(value) ? value : (value ? [value] : []);
    
    const handleSelect = (optionValue: string) => {
      const newValues = selectedValues.includes(optionValue)
        ? selectedValues.filter((v: string) => v !== optionValue)
        : [...selectedValues, optionValue];
      onChange(newValues);
    };

    const handleRemove = (optionValue: string) => {
      onChange(selectedValues.filter((v: string) => v !== optionValue));
    };

    return (
      <div className="space-y-1.5 w-full" style={wrapperStyle}>
        {labelPosition !== "hidden" && (
          <Label className="text-sm font-medium flex items-center gap-1">
            {field.label || field.name || field.id}
            {required && <span className="text-destructive">*</span>}
            {isLoadingDynamic && <Loader2 className="h-3 w-3 animate-spin ml-1" />}
            {dynamicError && !disabled && (
               <Button 
                 variant="ghost" 
                 size="icon" 
                 className="h-4 w-4 ml-1" 
                 onClick={(e) => { e.preventDefault(); onRetryDynamic?.(); }}
                 title="Retry loading options"
               >
                 <RefreshCw className="h-3 w-3" />
               </Button>
            )}
            {!dynamicError && hasFetchedOptions && !disabled && !isLoadingDynamic && (
               <Button 
                 variant="ghost" 
                 size="icon" 
                 className="h-4 w-4 ml-1" 
                 onClick={(e) => { e.preventDefault(); onRetryDynamic?.(); }}
                 title="Refresh options"
               >
                 <RefreshCw className="h-3 w-3" />
               </Button>
            )}
          </Label>
        )}
        
        {isReadOnlyDynamic ? (
          // Read-only mode: just show the selected values
          <div className="flex flex-wrap gap-2">
            {selectedValues.length > 0 ? (
              selectedValues.map((val: string) => (
                <Badge key={val} variant="secondary">
                  {val}
                </Badge>
              ))
            ) : (
              <span className="text-sm text-muted-foreground">No value</span>
            )}
          </div>
        ) : shouldShowFetchButton ? (
          <Button
            variant="outline"
            className="w-full portal-primary-btn"
            onClick={(e) => { e.preventDefault(); onRetryDynamic?.(); }}
            disabled={disabled || isLoadingDynamic}
            data-portal-color={primaryColor ? "true" : undefined}
          >
            <Download className="mr-2 h-4 w-4" />
            Fetch Options
          </Button>
        ) : (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="w-full justify-between min-h-[2.5rem] h-auto portal-primary-btn"
                disabled={disabled || isLoadingDynamic}
                data-portal-color={primaryColor ? "true" : undefined}
              >
                <span className="truncate">
                  {isLoadingDynamic 
                    ? "Loading options..." 
                    : selectedValues.length === 0 
                    ? "Select options..." 
                    : `${selectedValues.length} selected`}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
          <PopoverContent
            className={cn("w-full p-0", primaryColor && "portal-primary-options")}
            style={primaryColor ? { ["--portal-primary" as string]: primaryColor } : undefined}
            align="start"
          >
            <Command>
              <CommandInput placeholder="Search options..." disabled={isLoadingDynamic} />
              <CommandList>
                {isLoadingDynamic ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : options.length === 0 ? (
                  <CommandEmpty>
                    {dynamicError ? "Failed to load options" : "No options available"}
                  </CommandEmpty>
                ) : (
                  <>
                    <CommandEmpty>No option found.</CommandEmpty>
                    <CommandGroup className="max-h-60 overflow-auto">
                      {options.map((option) => (
                        <CommandItem
                          key={option.value}
                          value={option.label}
                          onSelect={() => handleSelect(option.value)}
                          className={cn(primaryColor && "use-portal-primary")}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedValues.includes(option.value) ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {option.label}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        )}

        {selectedValues.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {selectedValues.map((val: string) => (
              <Badge key={val} variant="secondary" className="flex items-center gap-1">
                {getLabelByValue(val)}
                {!disabled && (
                  <X
                    className="h-3 w-3 cursor-pointer hover:text-destructive"
                    onClick={() => handleRemove(val)}
                  />
                )}
              </Badge>
            ))}
          </div>
        )}

        {dynamicError && (
          <p className="text-xs text-destructive">{dynamicError.message}</p>
        )}
        {field.description && (
          <p className="text-xs text-muted-foreground">{field.description}</p>
        )}
      </div>
    );
  }

  // Single select
  const selectedValue = value || "";
  const selectedOption = options.find((opt) => opt.value === selectedValue);
  
  // For disabled/read-only fields, show the value even if options haven't loaded or value isn't in options
  const displayValue = disabled 
    ? (selectedValue || (isLoadingDynamic ? "Loading options..." : "No value"))
    : (isLoadingDynamic ? "Loading options..." : selectedOption?.label || "Select an option...");

  const handleSingleSelect = (optionValue: string) => {
    onChange(optionValue);
    setOpen(false);
  };

  return (
    <div className="space-y-1.5 w-full" style={wrapperStyle}>
      {labelPosition !== "hidden" && (
        <Label className="text-sm font-medium flex items-center gap-1">
          {field.label || field.name || field.id}
          {required && <span className="text-destructive">*</span>}
          {isLoadingDynamic && <Loader2 className="h-3 w-3 animate-spin ml-1" />}
          {dynamicError && !disabled && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-4 w-4 ml-1" 
                onClick={(e) => { e.preventDefault(); onRetryDynamic?.(); }}
                title="Retry loading options"
              >
                <RefreshCw className="h-3 w-3" />
              </Button>
          )}
          {!dynamicError && hasFetchedOptions && !disabled && !isLoadingDynamic && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-4 w-4 ml-1" 
                onClick={(e) => { e.preventDefault(); onRetryDynamic?.(); }}
                title="Refresh options"
              >
                <RefreshCw className="h-3 w-3" />
              </Button>
          )}
        </Label>
      )}
      
      {isReadOnlyDynamic ? (
        // Read-only mode: just show the current value
        <Input
          readOnly
          value={selectedValue || ""}
          className="bg-muted"
          placeholder="No value"
        />
      ) : shouldShowFetchButton ? (
        <Button
          variant="outline"
          className="w-full portal-primary-btn"
          onClick={(e) => { e.preventDefault(); onRetryDynamic?.(); }}
          disabled={disabled || isLoadingDynamic}
          data-portal-color={primaryColor ? "true" : undefined}
        >
          <Download className="mr-2 h-4 w-4" />
          Fetch Options
        </Button>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="w-full justify-between portal-primary-btn"
              disabled={disabled || isLoadingDynamic}
              data-portal-color={primaryColor ? "true" : undefined}
            >
              <span className="truncate">
                {displayValue}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
        <PopoverContent
          className={cn("w-full p-0", primaryColor && "portal-primary-options")}
          style={primaryColor ? { ["--portal-primary" as string]: primaryColor } : undefined}
          align="start"
        >
          <Command>
            <CommandInput placeholder="Search options..." disabled={isLoadingDynamic} />
            <CommandList>
              {isLoadingDynamic ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : options.length === 0 ? (
                <CommandEmpty>
                  {dynamicError ? "Failed to load options" : "No options available"}
                </CommandEmpty>
              ) : (
                <>
                  <CommandEmpty>No option found.</CommandEmpty>
                  <CommandGroup className="max-h-60 overflow-auto">
                    {options.map((option) => (
                      <CommandItem
                        key={option.value}
                        value={option.label}
                        onSelect={() => handleSingleSelect(option.value)}
                        className={cn(primaryColor && "use-portal-primary")}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            selectedValue === option.value ? "opacity-100" : "opacity-0"
                          )}
                        />
                        {option.label}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
            </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}

      {dynamicError && (
        <p className="text-xs text-destructive">{dynamicError.message}</p>
      )}
      {field.description && (
        <p className="text-xs text-muted-foreground">{field.description}</p>
      )}
    </div>
  );
};

