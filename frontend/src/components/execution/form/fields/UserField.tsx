import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

interface UserFieldProps {
  field: any;
  value: any;
  onChange: (value: any) => void;
  companyId?: string;
  disabled?: boolean;
  required?: boolean;
  labelPosition?: "top" | "side" | "hidden";
  primaryColor?: string;
}

type CompanyUser = { id: string; email: string; full_name: string | null };

export const UserField = ({
  field,
  value,
  onChange,
  companyId,
  disabled,
  required,
  labelPosition = "top",
  primaryColor,
}: UserFieldProps) => {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const wrapperStyle = primaryColor ? ({ "--portal-primary": primaryColor } as React.CSSProperties) : undefined;

  useEffect(() => {
    if (!companyId) {
      setUsers([]);
      return;
    }

    let isCancelled = false;
    setLoading(true);
    setLoadError(null);
    api
      .get<CompanyUser[]>(`/api/companies/${companyId}/users`)
      .then((result) => {
        if (!isCancelled) {
          setUsers(Array.isArray(result) ? result : []);
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setLoadError("Failed to load users");
          setUsers([]);
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [companyId]);

  const selectedUserId = useMemo(() => {
    if (typeof value === "string") return value;
    if (value && typeof value === "object") {
      if (typeof value.id === "string") return value.id;
      if (typeof value.user_id === "string") return value.user_id;
      if (typeof value.value === "string") return value.value;
    }
    return "";
  }, [value]);

  const selectedUser = users.find((user) => user.id === selectedUserId);
  const selectedLabel = selectedUser
    ? selectedUser.full_name || selectedUser.email
    : selectedUserId || "Select a user...";

  return (
    <div className="space-y-1.5 w-full" style={wrapperStyle}>
      {labelPosition !== "hidden" && (
        <Label className="text-sm font-medium flex items-center gap-1">
          {field.label || field.name || field.id}
          {required && <span className="text-destructive">*</span>}
          {loading && <Loader2 className="h-3 w-3 animate-spin ml-1" />}
        </Label>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between portal-primary-btn"
            disabled={disabled || loading || !companyId}
            data-portal-color={primaryColor ? "true" : undefined}
          >
            <span className="truncate">
              {loading ? "Loading users..." : selectedLabel}
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
            <CommandInput placeholder="Search users..." disabled={loading} />
            <CommandList>
              {loading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  <CommandEmpty>{loadError ? loadError : "No users found"}</CommandEmpty>
                  <CommandGroup className="max-h-60 overflow-auto">
                    {users.map((user) => (
                      <CommandItem
                        key={user.id}
                        value={`${user.full_name || ""} ${user.email}`}
                        onSelect={() => {
                          onChange(user.id);
                          setOpen(false);
                        }}
                        className={cn(primaryColor && "use-portal-primary")}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            selectedUserId === user.id ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <span>{user.full_name || user.email}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {field.description && (
        <p className="text-xs text-muted-foreground">{field.description}</p>
      )}
    </div>
  );
};
