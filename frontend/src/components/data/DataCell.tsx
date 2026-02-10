import { useState } from "react";
import { format } from "date-fns";
import { Check, ChevronDown, ExternalLink, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { api } from "@/lib/api";
import { useLanguage } from "@/contexts/LanguageContext";

export type DataTableField = {
  id: string;
  name: string;
  field_type: string;
  options?: Record<string, unknown> | null;
};

interface DataCellProps {
  field: DataTableField;
  value: unknown;
  className?: string;
  /** Optional: when provided with attachment, popover can remove the attachment. */
  recordId?: string;
  fieldId?: string;
  onSaveCell?: (value: unknown) => void;
  /** For link fields: preferred display text (e.g. primary field values) instead of "N linked". */
  linkDisplayValue?: string | null;
}

/** Read-only cell display by field type. */
export function DataCell({ field, value, className, recordId, fieldId, onSaveCell, linkDisplayValue }: DataCellProps) {
  const { t } = useLanguage();
  const type = field.field_type || "text";

  const isEmpty =
    value === null ||
    value === undefined ||
    value === "" ||
    (type === "link" && Array.isArray(value) && value.length === 0);
  if (isEmpty) {
    return (
      <span className={cn("text-muted-foreground italic", className)}>
        {t("data.empty")}
      </span>
    );
  }

  switch (type) {
    case "text":
    case "url":
    case "email":
      return (
        <span className={cn("truncate block max-w-[200px]", className)} title={String(value)}>
          {String(value)}
        </span>
      );

    case "number":
      return (
        <span className={className}>
          {typeof value === "number" ? value : Number(value)}
        </span>
      );

    case "date": {
      try {
        const d = typeof value === "string" ? new Date(value) : value as Date;
        if (d instanceof Date && !isNaN(d.getTime())) {
          return <span className={className}>{format(d, "yyyy-MM-dd")}</span>;
        }
      } catch {
        // fallthrough
      }
      return <span className={className}>{String(value)}</span>;
    }

    case "datetime": {
      try {
        const d = typeof value === "string" ? new Date(value) : value as Date;
        if (d instanceof Date && !isNaN(d.getTime())) {
          return <span className={cn("truncate block max-w-[200px]", className)} title={format(d, "PPp")}>{format(d, "yyyy-MM-dd HH:mm")}</span>;
        }
      } catch {
        // fallthrough
      }
      return <span className={className}>{String(value)}</span>;
    }

    case "time": {
      if (value === null || value === undefined || value === "") return <span className={cn("text-muted-foreground italic", className)}>{t("data.empty")}</span>;
      if (typeof value === "string" && /^\d{1,2}:\d{2}(:\d{2})?$/.test(value)) return <span className={className}>{value}</span>;
      try {
        const d = typeof value === "string" ? new Date("1970-01-01T" + value) : value as Date;
        if (d instanceof Date && !isNaN(d.getTime())) return <span className={className}>{format(d, "HH:mm")}</span>;
      } catch {
        // fallthrough
      }
      return <span className={className}>{String(value)}</span>;
    }

    case "checkbox":
    case "boolean":
      return (
        <span className={cn("inline-flex items-center justify-center", className)}>
          {value === true || value === "true" || value === 1 ? (
            <Check className="h-4 w-4 text-primary" />
          ) : (
            <span className="text-muted-foreground italic">{t("data.empty")}</span>
          )}
        </span>
      );

    case "select": {
      const choices = getChoices(field);
      const label = choices.length ? (choices.find((c) => c === value) ?? String(value)) : String(value);
      return <span className={cn("truncate block max-w-[180px]", className)} title={label}>{label}</span>;
    }

    case "multiselect": {
      const choices = getChoices(field);
      const arr = Array.isArray(value) ? value : [value];
      const labels = arr.map((v) => (choices.length ? (choices.find((c) => c === v) ?? String(v)) : String(v)));
      return (
        <span className={cn("truncate block max-w-[200px]", className)} title={labels.join(", ")}>
          {labels.join(", ")}
        </span>
      );
    }

    case "link": {
      const ids = Array.isArray(value) ? value : value ? [value] : [];
      const count = ids.filter((id): id is string => typeof id === "string").length;
      if (count === 0) {
        return (
          <span className={cn("text-muted-foreground italic", className)}>
            {t("data.empty")}
          </span>
        );
      }
      const label = linkDisplayValue ?? (t("data.linkedRecords") as string).replace("{{count}}", String(count));
      return <span className={cn("truncate block max-w-[180px]", className)} title={label}>{label}</span>;
    }

    case "attachment":
    case "file": {
      if (typeof value !== "string" || !value) return <span className={cn("text-muted-foreground italic", className)}>{t("data.empty")}</span>;
      const isUrl = value.startsWith("http") || value.startsWith("/");
      const filename = value.split("/").pop() || "File";
      if (isUrl) {
        return (
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className={cn("text-primary hover:underline truncate block max-w-[180px]", className)}
          >
            {filename}
          </a>
        );
      }
      return (
        <AttachmentViewButton
          path={value}
          filename={filename}
          className={className}
          onRemove={typeof onSaveCell === "function" ? () => onSaveCell(null) : undefined}
        />
      );
    }

    case "html": {
      if (typeof value !== "string" || !value.trim()) return <span className={cn("text-muted-foreground italic", className)}>{t("data.empty")}</span>;
      return (
        <span
          className={cn("max-w-[240px] line-clamp-2 text-sm [&>img]:max-w-full", className)}
          dangerouslySetInnerHTML={{ __html: value }}
        />
      );
    }

    case "formula":
    case "lookup":
      return <span className={cn("truncate block max-w-[200px]", className)}>{String(value)}</span>;

    default:
      return <span className={cn("truncate block max-w-[200px]", className)}>{String(value)}</span>;
  }
}

function AttachmentViewButton({
  path,
  filename,
  className,
  onRemove,
}: {
  path: string;
  filename: string;
  className?: string;
  onRemove?: () => void;
}) {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);

  const openInNewTab = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setLoading(true);
    try {
      const { signedUrl } = await api.post<{ signedUrl: string }>("/api/files/signed-url", {
        bucket: "documents",
        path,
        expiresIn: 31536000,
      });
      if (signedUrl) window.open(signedUrl, "_blank");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn("flex items-center gap-0.5 min-w-0 max-w-[220px]", className)}>
      <Button
        variant="link"
        size="sm"
        className="h-auto p-0 font-normal text-primary truncate max-w-[180px] justify-start shrink min-w-0"
        onClick={(e) => {
          e.stopPropagation();
          openInNewTab();
        }}
        disabled={loading}
      >
        {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1 shrink-0" /> : <ExternalLink className="h-3 w-3 mr-1 shrink-0" />}
        <span className="truncate">{filename}</span>
      </Button>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={(e) => e.stopPropagation()}
            aria-label={t("data.details")}
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72" onClick={(e) => e.stopPropagation()}>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground">{t("data.details")}</p>
              <p className="text-sm font-medium truncate mt-0.5" title={filename}>{filename}</p>
              <p className="text-xs text-muted-foreground truncate mt-1" title={path}>{path}</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2"
                onClick={() => openInNewTab()}
                disabled={loading}
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
                {t("data.openInNewTab")}
              </Button>
              {onRemove && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    onRemove();
                    setPopoverOpen(false);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t("data.removeAttachment")}
                </Button>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function getChoices(field: DataTableField): string[] {
  const opts = field.options;
  if (!opts || typeof opts !== "object") return [];
  if (Array.isArray((opts as { choices?: unknown }).choices)) {
    return ((opts as { choices: unknown[] }).choices).map((c) => (typeof c === "string" ? c : String((c as { value?: string }).value ?? c)));
  }
  if (Array.isArray((opts as { options?: unknown }).options)) {
    return ((opts as { options: unknown[] }).options).map((c) => (typeof c === "string" ? c : String((c as { value?: string }).value ?? c)));
  }
  return [];
}
