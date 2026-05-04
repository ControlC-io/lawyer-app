import { useEffect, useMemo, useState } from "react";
import fuzzysort from "fuzzysort";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

type Props = {
  companyId: string;
  metadataKeyId: string;
  selectedValues: string[];
  onChange: (values: string[]) => void;
  className?: string;
  triggerClassName?: string;
  placeholder: string;
  searchPlaceholder: string;
  emptyLabel: string;
  loadingLabel: string;
  clearLabel: string;
};

export function MetadataFreeTextFilterCombobox({
  companyId,
  metadataKeyId,
  selectedValues,
  onChange,
  className,
  triggerClassName,
  placeholder,
  searchPlaceholder,
  emptyLabel,
  loadingLabel,
  clearLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<string[]>([]);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    if (!metadataKeyId || !open) {
      setOptions([]);
      return;
    }
    let canceled = false;
    setLoading(true);
    const params = new URLSearchParams({ metadata_key_id: metadataKeyId });
    if (debouncedQuery) params.set("q", debouncedQuery);
    api
      .get<{ values: string[] }>(
        `/api/companies/${companyId}/documents/metadata-value-suggestions?${params.toString()}`,
      )
      .then((response) => {
        if (canceled) return;
        setOptions(Array.isArray(response?.values) ? response.values : []);
      })
      .catch(() => {
        if (canceled) return;
        setOptions([]);
      })
      .finally(() => {
        if (canceled) return;
        setLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [companyId, metadataKeyId, debouncedQuery, open]);

  const displayOptions = useMemo(() => {
    const deduped = Array.from(
      new Set(options.map((value) => value.trim()).filter(Boolean)),
    );
    const searched = debouncedQuery
      ? fuzzysort.go(debouncedQuery, deduped, { limit: 100 }).map((result) => result.target)
      : deduped;
    const selectedMissing = selectedValues.filter((value) => !searched.includes(value));
    return [...selectedMissing, ...searched];
  }, [debouncedQuery, options, selectedValues]);

  const triggerLabel = useMemo(() => {
    if (selectedValues.length === 0) return placeholder;
    if (selectedValues.length === 1) return selectedValues[0];
    return `${selectedValues[0]} +${selectedValues.length - 1}`;
  }, [placeholder, selectedValues]);

  const toggleValue = (value: string) => {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter((entry) => entry !== value));
      return;
    }
    onChange([...selectedValues, value]);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          className={cn("justify-between px-2", triggerClassName)}
          disabled={!metadataKeyId}
        >
          <span className="truncate text-left">{triggerLabel}</span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className={cn("w-[280px] p-0", className)}>
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={searchPlaceholder}
          />
          <CommandList>
            {loading ? (
              <div className="px-3 py-3 text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {loadingLabel}
              </div>
            ) : (
              <>
                <CommandEmpty>{emptyLabel}</CommandEmpty>
                {selectedValues.length > 0 && (
                  <div className="px-2 py-1 border-b">
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => onChange([])}
                    >
                      {clearLabel}
                    </Button>
                  </div>
                )}
                <CommandGroup>
                  {displayOptions.map((value) => {
                    const checked = selectedValues.includes(value);
                    return (
                      <CommandItem
                        key={value}
                        value={value}
                        onSelect={() => toggleValue(value)}
                        className="text-xs"
                      >
                        <Checkbox checked={checked} className="mr-2 h-3.5 w-3.5" />
                        <span className="truncate">{value}</span>
                        <Check className={cn("ml-auto h-3.5 w-3.5", checked ? "opacity-100" : "opacity-0")} />
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
