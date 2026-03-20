import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

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

export interface DecisionOutputsDialogProps {
  open: boolean;
  initialOutputs?: string[];
  onCancel: () => void;
  onConfirm: (outputs: string[]) => void;
}

function normalizeOutputs(outputs: string[]) {
  return outputs.map((o) => o.trim()).filter((o) => o.length > 0);
}

export function DecisionOutputsDialog({
  open,
  initialOutputs = ["Yes", "No"],
  onCancel,
  onConfirm,
}: DecisionOutputsDialogProps) {
  const [outputs, setOutputs] = useState<string[]>(initialOutputs);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    setOutputs(initialOutputs);
    setError("");
  }, [open, initialOutputs]);

  const normalized = useMemo(() => normalizeOutputs(outputs), [outputs]);

  const validation = useMemo(() => {
    if (normalized.length < 2) return { ok: false, message: "Please provide at least 2 outputs." };

    const seen = new Set<string>();
    for (const out of normalized) {
      const key = out.toLowerCase();
      if (seen.has(key)) return { ok: false, message: "Output names must be unique." };
      seen.add(key);
    }

    return { ok: true as const, message: "" };
  }, [normalized]);

  const canConfirm = validation.ok;

  const handleConfirm = () => {
    setError("");
    if (!canConfirm) {
      setError(validation.message);
      return;
    }
    onConfirm(normalized);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onCancel();
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Decision outputs</DialogTitle>
          <DialogDescription>
            Enter the possible outputs for this decision node. Minimum 2.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-3">
            {outputs.map((output, index) => (
              <div key={`${index}-${output}`} className="flex items-center gap-3">
                <div className="flex-1 space-y-1">
                  <Label htmlFor={`decision-output-${index}`}>Output {index + 1}</Label>
                  <Input
                    id={`decision-output-${index}`}
                    value={output}
                    onChange={(e) => {
                      const value = e.target.value;
                      setOutputs((prev) => prev.map((o, i) => (i === index ? value : o)));
                    }}
                    placeholder={`Output ${index + 1}`}
                  />
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() => {
                    if (outputs.length <= 2) return;
                    setOutputs((prev) => prev.filter((_, i) => i !== index));
                  }}
                  disabled={outputs.length <= 2}
                  title={outputs.length <= 2 ? "At least 2 outputs are required" : "Remove output"}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex justify-between items-center gap-3">
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() => {
                setOutputs((prev) => [...prev, `Output ${prev.length + 1}`]);
              }}
            >
              <Plus className="h-4 w-4" />
              Add output
            </Button>

            <div className="text-sm text-muted-foreground">
              {normalized.length} / {Math.max(2, normalized.length)} outputs
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          {!error && !validation.ok && <p className="text-sm text-destructive">{validation.message}</p>}
        </div>

        <DialogFooter className="flex justify-between">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>
            Create decision
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

