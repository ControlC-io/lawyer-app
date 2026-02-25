import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type UserOption = { id: string; email: string; full_name: string | null };
type GroupOption = { id: string; name: string; description?: string | null };

interface PermissionTargetPickerProps {
  users: UserOption[];
  groups: GroupOption[];
  selectedUsers: string[];
  selectedGroups: string[];
  onSelectedUsersChange: (ids: string[]) => void;
  onSelectedGroupsChange: (ids: string[]) => void;
  labels?: {
    users?: string;
    groups?: string;
    usersPlaceholder?: string;
    groupsPlaceholder?: string;
  };
  allowNoneOption?: boolean;
  noneLabel?: string;
  confirmBeforeRemove?: boolean;
}

type RemovalTarget = { type: "user" | "group"; id: string; label: string } | null;

export function PermissionTargetPicker({
  users,
  groups,
  selectedUsers,
  selectedGroups,
  onSelectedUsersChange,
  onSelectedGroupsChange,
  labels,
  allowNoneOption = false,
  noneLabel = "None",
  confirmBeforeRemove = false,
}: PermissionTargetPickerProps) {
  const [removalTarget, setRemovalTarget] = useState<RemovalTarget>(null);

  const availableUsers = useMemo(
    () => users.filter((user) => !selectedUsers.includes(user.id)),
    [users, selectedUsers]
  );
  const availableGroups = useMemo(
    () => groups.filter((group) => !selectedGroups.includes(group.id)),
    [groups, selectedGroups]
  );

  const removeTarget = (target: Exclude<RemovalTarget, null>) => {
    if (target.type === "user") {
      onSelectedUsersChange(selectedUsers.filter((id) => id !== target.id));
      return;
    }

    onSelectedGroupsChange(selectedGroups.filter((id) => id !== target.id));
  };

  const requestRemoveTarget = (target: Exclude<RemovalTarget, null>) => {
    if (!confirmBeforeRemove) {
      removeTarget(target);
      return;
    }
    setRemovalTarget(target);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-medium">{labels?.users ?? "Users"}</Label>
        <Select
          onValueChange={(value) => {
            if (allowNoneOption && value === "none") {
              onSelectedUsersChange([]);
              return;
            }
            if (!selectedUsers.includes(value)) {
              onSelectedUsersChange([...selectedUsers, value]);
            }
          }}
          value={allowNoneOption && selectedUsers.length === 0 ? "none" : undefined}
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder={labels?.usersPlaceholder ?? "Select users..."} />
          </SelectTrigger>
          <SelectContent>
            {allowNoneOption && <SelectItem value="none">{noneLabel}</SelectItem>}
            {availableUsers.map((user) => (
              <SelectItem key={user.id} value={user.id}>
                {user.full_name || user.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedUsers.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedUsers.map((userId) => {
              const user = users.find((u) => u.id === userId);
              const label = user?.full_name || user?.email || userId;
              return (
                <Badge key={userId} variant="secondary" className="flex items-center gap-1 text-xs">
                  {label}
                  <X
                    className="h-3 w-3 cursor-pointer hover:text-destructive"
                    onClick={() => requestRemoveTarget({ type: "user", id: userId, label })}
                  />
                </Badge>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-medium">{labels?.groups ?? "Groups"}</Label>
        <Select
          onValueChange={(value) => {
            if (allowNoneOption && value === "none") {
              onSelectedGroupsChange([]);
              return;
            }
            if (!selectedGroups.includes(value)) {
              onSelectedGroupsChange([...selectedGroups, value]);
            }
          }}
          value={allowNoneOption && selectedGroups.length === 0 ? "none" : undefined}
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder={labels?.groupsPlaceholder ?? "Select groups..."} />
          </SelectTrigger>
          <SelectContent>
            {allowNoneOption && <SelectItem value="none">{noneLabel}</SelectItem>}
            {availableGroups.map((group) => (
              <SelectItem key={group.id} value={group.id}>
                {group.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedGroups.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedGroups.map((groupId) => {
              const group = groups.find((g) => g.id === groupId);
              const label = group?.name || groupId;
              return (
                <Badge key={groupId} variant="secondary" className="flex items-center gap-1 text-xs">
                  {label}
                  <X
                    className="h-3 w-3 cursor-pointer hover:text-destructive"
                    onClick={() => requestRemoveTarget({ type: "group", id: groupId, label })}
                  />
                </Badge>
              );
            })}
          </div>
        )}
      </div>

      <AlertDialog open={!!removalTarget} onOpenChange={(open) => !open && setRemovalTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove access?</AlertDialogTitle>
            <AlertDialogDescription>
              {removalTarget
                ? `${removalTarget.label} will lose this permission.`
                : "This entry will lose this permission."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (removalTarget) removeTarget(removalTarget);
                setRemovalTarget(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
