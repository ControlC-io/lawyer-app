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

type OutputRow = { id: string; value: string };

function newRowId() {
  return crypto.randomUUID();
}

function rowsFromStrings(values: string[]): OutputRow[] {
  return values.map((value) => ({ id: newRowId(), value }));
}

export function DecisionOutputsDialog({
  open,
  initialOutputs = ["Yes", "No"],
  onCancel,
  onConfirm,
}: DecisionOutputsDialogProps) {
  const [rows, setRows] = useState<OutputRow[]>(() => rowsFromStrings(initialOutputs));
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    setRows(rowsFromStrings(initialOutputs));
    setError("");
  }, [open, initialOutputs]);

  const outputs = useMemo(() => rows.map((r) => r.value), [rows]);
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
            {rows.map((row, index) => (
              <div key={row.id} className="flex items-center gap-3">
                <div className="flex-1 space-y-1">
                  <Label htmlFor={`decision-output-${row.id}`}>Output {index + 1}</Label>
                  <Input
                    id={`decision-output-${row.id}`}
                    value={row.value}
                    onChange={(e) => {
                      const value = e.target.value;
                      setRows((prev) => prev.map((r, i) => (i === index ? { ...r, value } : r)));
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
                    if (rows.length <= 2) return;
                    setRows((prev) => prev.filter((_, i) => i !== index));
                  }}
                  disabled={rows.length <= 2}
                  title={rows.length <= 2 ? "At least 2 outputs are required" : "Remove output"}
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
                setRows((prev) => [...prev, { id: newRowId(), value: `Output ${prev.length + 1}` }]);
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

