import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Trash2 } from "lucide-react";

interface ConnectionDialogProps {
  open: boolean;
  config: {
    color?: string;
    style?: "solid" | "dashed";
  };
  onClose: () => void;
  onSave: (config: { color: string; style: "solid" | "dashed" }) => void;
  onDelete: () => void;
}

const COLOR_OPTIONS = [
  { value: "hsl(var(--primary))", label: "Primary", class: "bg-primary" },
  { value: "hsl(var(--destructive))", label: "Red", class: "bg-destructive" },
  { value: "hsl(var(--chart-1))", label: "Blue", class: "bg-chart-1" },
  { value: "hsl(var(--chart-2))", label: "Green", class: "bg-chart-2" },
  { value: "hsl(var(--chart-3))", label: "Orange", class: "bg-chart-3" },
  { value: "hsl(var(--chart-4))", label: "Purple", class: "bg-chart-4" },
  { value: "hsl(var(--muted-foreground) / 0.3)", label: "Gray", class: "bg-muted-foreground/30" },
];

export function ConnectionDialog({ open, config, onClose, onSave, onDelete }: ConnectionDialogProps) {
  const [color, setColor] = useState(config.color || "hsl(var(--primary))");
  const [style, setStyle] = useState<"solid" | "dashed">(config.style || "solid");

  const handleSave = () => {
    onSave({ color, style });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Connection Properties</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          <div className="space-y-3">
            <Label>Color</Label>
            <RadioGroup value={color} onValueChange={setColor} className="grid grid-cols-2 gap-3">
              {COLOR_OPTIONS.map((option) => (
                <div key={option.value} className="flex items-center space-x-2">
                  <RadioGroupItem value={option.value} id={option.value} />
                  <label
                    htmlFor={option.value}
                    className="flex items-center gap-2 cursor-pointer flex-1"
                  >
                    <div className={`w-6 h-6 rounded border border-border ${option.class}`} />
                    <span className="text-sm">{option.label}</span>
                  </label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-3">
            <Label>Style</Label>
            <RadioGroup value={style} onValueChange={(v) => setStyle(v as "solid" | "dashed")} className="flex gap-4">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="solid" id="solid" />
                <label htmlFor="solid" className="flex items-center gap-2 cursor-pointer">
                  <div className="w-16 h-0.5 bg-foreground" />
                  <span className="text-sm">Solid</span>
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="dashed" id="dashed" />
                <label htmlFor="dashed" className="flex items-center gap-2 cursor-pointer">
                  <div className="w-16 h-0.5 border-t-2 border-dashed border-foreground" />
                  <span className="text-sm">Dashed</span>
                </label>
              </div>
            </RadioGroup>
          </div>
        </div>

        <DialogFooter className="flex justify-between">
          <Button variant="destructive" onClick={onDelete} className="gap-2">
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
