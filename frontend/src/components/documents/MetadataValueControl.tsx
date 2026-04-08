import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** Matches API / Prisma `FilesMetadataKey` fields used for value UI. */
export type FileMetadataKey = {
  id: string;
  name: string | null;
  value_kind: "free_text" | "predefined_list";
  allowed_values?: unknown;
};

export function parseAllowedValuesList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const t = x.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

type Props = {
  metaKey: FileMetadataKey | null | undefined;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  id?: string;
};

/**
 * Renders a select for predefined-list keys (when options exist) or a text input for free text.
 */
export function MetadataValueControl({
  metaKey,
  value,
  onChange,
  placeholder = "Value",
  className,
  disabled,
  id,
}: Props) {
  const opts = metaKey ? parseAllowedValuesList(metaKey.allowed_values) : [];
  const useSelect = metaKey?.value_kind === "predefined_list" && opts.length > 0;

  if (useSelect) {
    const inList = opts.includes(value);
    return (
      <Select
        value={inList ? value : undefined}
        onValueChange={onChange}
        disabled={disabled}
      >
        <SelectTrigger id={id} className={cn("h-9 flex-1 min-w-0", className)}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {opts.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <Input
      id={id}
      className={cn("h-9 flex-1 min-w-0", className)}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
    />
  );
}
