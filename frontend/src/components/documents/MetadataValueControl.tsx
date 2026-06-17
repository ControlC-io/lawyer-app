import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** Matches API / Prisma `FilesMetadataKey` fields used for value UI. */
export type FileMetadataKey = {
  id: string;
  name: string | null;
  value_kind: "free_text" | "predefined_list" | "system_reference";
  allowed_values?: unknown;
  /** True for system fields (Person, Document Type) backed by their own tables. */
  system?: boolean;
};

/** Options for system_reference keys: stored value is the id, displayed as the label. */
export function parseSystemOptions(raw: unknown): Array<{ value: string; label: string }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ value: string; label: string }> = [];
  for (const x of raw) {
    if (x && typeof x === "object" && typeof (x as { value?: unknown }).value === "string") {
      const o = x as { value: string; label?: unknown };
      out.push({ value: o.value, label: typeof o.label === "string" ? o.label : o.value });
    }
  }
  return out;
}

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
  // System reference (Person, Document Type): dropdown of {value:id, label}.
  if (metaKey?.value_kind === "system_reference") {
    const sysOpts = parseSystemOptions(metaKey.allowed_values);
    const inList = sysOpts.some((o) => o.value === value);
    return (
      <Select value={inList ? value : undefined} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id} className={cn("h-9 flex-1 min-w-0", className)}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {sysOpts.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

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
