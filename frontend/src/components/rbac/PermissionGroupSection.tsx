import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import type { PermissionGroup } from "@/hooks/useRoles";

interface PermissionGroupSectionProps {
  group: PermissionGroup;
  selectedPermissions: string[];
  onToggle: (key: string) => void;
  disabled?: boolean;
}

export function PermissionGroupSection({
  group,
  selectedPermissions,
  onToggle,
  disabled,
}: PermissionGroupSectionProps) {
  const [open, setOpen] = useState(true);
  const selectedCount = group.permissions.filter((p) =>
    selectedPermissions.includes(p.key),
  ).length;
  const allSelected = selectedCount === group.permissions.length;

  const toggleAll = () => {
    if (disabled) return;
    if (allSelected) {
      group.permissions.forEach((p) => {
        if (selectedPermissions.includes(p.key)) onToggle(p.key);
      });
    } else {
      group.permissions.forEach((p) => {
        if (!selectedPermissions.includes(p.key)) onToggle(p.key);
      });
    }
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full py-2 px-1 hover:bg-muted/50 rounded-md transition-colors group">
        <ChevronRight
          className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        />
        <span className="font-medium text-sm">{group.domain}</span>
        <span className="text-xs text-muted-foreground ml-auto tabular-nums">
          {selectedCount}/{group.permissions.length}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="pl-6 space-y-3 pb-3 pt-1">
        {group.permissions.length > 1 && (
          <div className="flex items-center gap-3 pb-1 border-b border-border/50">
            <Checkbox
              id={`${group.domain}-all`}
              checked={allSelected}
              onCheckedChange={toggleAll}
              disabled={disabled}
              className="mt-0.5"
            />
            <Label
              htmlFor={`${group.domain}-all`}
              className="text-xs font-medium text-muted-foreground cursor-pointer select-none"
            >
              Select all
            </Label>
          </div>
        )}
        {group.permissions.map((perm) => (
          <div key={perm.key} className="flex items-start gap-3">
            <Checkbox
              id={perm.key}
              checked={selectedPermissions.includes(perm.key)}
              onCheckedChange={() => onToggle(perm.key)}
              disabled={disabled}
              className="mt-0.5"
            />
            <div className="grid gap-0.5">
              <Label htmlFor={perm.key} className="text-sm font-medium cursor-pointer leading-tight">
                {perm.label}
              </Label>
              <p className="text-xs text-muted-foreground leading-relaxed">{perm.description}</p>
            </div>
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
