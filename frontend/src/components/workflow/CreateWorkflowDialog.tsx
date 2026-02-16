import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Wand2, Pencil } from "lucide-react";

interface CreateWorkflowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectManual: () => void;
  onSelectAI: () => void;
}

export function CreateWorkflowDialog({
  open,
  onOpenChange,
  onSelectManual,
  onSelectAI,
}: CreateWorkflowDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-w-[calc(100vw-2rem)] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Create New Workflow</DialogTitle>
          <DialogDescription>
            Choose how you want to create your workflow
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4 min-w-0">
          <div className="grid gap-3 min-w-0">
            <Button
              variant="outline"
              className="h-auto w-full flex flex-col items-start justify-start p-4 hover:bg-accent text-left whitespace-normal min-w-0"
              onClick={onSelectManual}
            >
              <div className="flex items-center gap-2 mb-2 w-full min-w-0">
                <Pencil className="h-5 w-5 flex-shrink-0" />
                <span className="font-semibold whitespace-normal break-words min-w-0 flex-1">Manual Creation</span>
              </div>
              <p className="text-sm text-muted-foreground text-left w-full break-words min-w-0 whitespace-normal">
                Build your workflow step by step with full control over every detail
              </p>
            </Button>
            <Button
              variant="outline"
              className="h-auto w-full flex flex-col items-start justify-start p-4 hover:bg-accent text-left whitespace-normal min-w-0"
              onClick={onSelectAI}
            >
              <div className="flex items-center gap-2 mb-2 w-full min-w-0">
                <Wand2 className="h-5 w-5 flex-shrink-0" />
                <span className="font-semibold whitespace-normal break-words min-w-0 flex-1">AI-Assisted Creation</span>
              </div>
              <p className="text-sm text-muted-foreground text-left w-full break-words min-w-0 whitespace-normal">
                Describe your workflow in natural language and let AI build it for you
              </p>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
