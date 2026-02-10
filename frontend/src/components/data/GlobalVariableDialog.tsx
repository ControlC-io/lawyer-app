import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";

export const GLOBAL_VARIABLE_TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "time", label: "Time" },
  { value: "datetime", label: "Date & time" },
  { value: "boolean", label: "Boolean" },
  { value: "file", label: "File" },
  { value: "html", label: "HTML" },
] as const;

export type GlobalVariablePayload = {
  name: string;
  key: string | null;
  variable_type: string;
  position: number;
};

export type GlobalVariableToEdit = GlobalVariablePayload & { id: string };

interface GlobalVariableDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: GlobalVariablePayload) => Promise<void>;
  defaultPosition: number;
  variableToEdit?: GlobalVariableToEdit | null;
  onUpdate?: (id: string, payload: Omit<GlobalVariablePayload, "position">) => Promise<void>;
}

function slugFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "") || "";
}

export function GlobalVariableDialog({
  open,
  onOpenChange,
  onSubmit,
  defaultPosition,
  variableToEdit,
  onUpdate,
}: GlobalVariableDialogProps) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [variableType, setVariableType] = useState<string>("text");
  const [saving, setSaving] = useState(false);

  const isEditMode = !!variableToEdit;

  useEffect(() => {
    if (open && variableToEdit) {
      setName(variableToEdit.name);
      setKey(variableToEdit.key ?? "");
      setVariableType(variableToEdit.variable_type);
    }
    if (open && !variableToEdit) {
      setName("");
      setKey("");
      setVariableType("text");
    }
  }, [open, variableToEdit]);

  const handleNameChange = (value: string) => {
    setName(value);
    if (!isEditMode && !key) setKey(slugFromName(value));
  };

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload: GlobalVariablePayload = {
        name: name.trim(),
        key: key.trim() || null,
        variable_type: variableType,
        position: defaultPosition,
      };
      if (isEditMode && variableToEdit && onUpdate) {
        await onUpdate(variableToEdit.id, {
          name: payload.name,
          key: payload.key,
          variable_type: payload.variable_type,
        });
      } else {
        await onSubmit(payload);
      }
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? t("globalVariables.editVariable") : t("globalVariables.addVariable")}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? t("globalVariables.editVariableDescription")
              : t("globalVariables.addVariableDescription")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="gv-name">{t("globalVariables.variableName")}</Label>
            <Input
              id="gv-name"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder={t("globalVariables.variableName")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gv-key">{t("globalVariables.variableKey")}</Label>
            <Input
              id="gv-key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={t("globalVariables.variableKeyPlaceholder")}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("globalVariables.variableType")}</Label>
            <Select value={variableType} onValueChange={setVariableType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GLOBAL_VARIABLE_TYPES.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("data.cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || saving}>
            {saving ? "..." : t("data.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
