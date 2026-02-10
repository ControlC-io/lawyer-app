import { Circle, Square, Diamond, FileEdit, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface ToolbarProps {
  onAddStep: (stepType: "start" | "end" | "decision" | "action" | "edit_form" | "file") => void;
}

const tools = [
  { type: "start" as const, icon: Circle, label: "Start", color: "text-green-600" },
  { type: "end" as const, icon: Circle, label: "End", color: "text-red-600" },
  { type: "decision" as const, icon: Diamond, label: "Decision", color: "text-yellow-600" },
  { type: "action" as const, icon: Square, label: "Action", color: "text-blue-600" },
  { type: "edit_form" as const, icon: FileEdit, label: "Form", color: "text-purple-600" },
  { type: "file" as const, icon: FolderOpen, label: "File", color: "text-orange-600" },
];

export function Toolbar({ onAddStep }: ToolbarProps) {
  return (
    <div className="w-32 border-r border-border bg-card flex flex-col items-center gap-3 py-6">
      {tools.map((tool) => (
        <button
          key={tool.type}
          onClick={() => onAddStep(tool.type)}
          className="flex flex-col items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-accent transition-colors w-full"
        >
          <tool.icon className={`h-7 w-7 ${tool.color}`} />
          <span className="text-xs font-medium text-foreground">{tool.label}</span>
        </button>
      ))}
    </div>
  );
}
