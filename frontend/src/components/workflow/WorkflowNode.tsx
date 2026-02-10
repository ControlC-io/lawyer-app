import { Trash2, Pencil, Copy, Hand, Zap, Bot, User } from "lucide-react";
import { WorkflowStep } from "@/pages/WorkflowEditor";
import { Button } from "@/components/ui/button";

interface WorkflowNodeProps {
  step: WorkflowStep;
  isSelected: boolean;
  isHighlighted?: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onDelete: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onStartConnection: (stepId: string, outputName: string, event: React.MouseEvent) => void;
  onEndConnection: (stepId: string) => void;
  isConnecting: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  readOnly?: boolean;
  hideEditButton?: boolean;
}

const nodeStyles = {
  start: {
    bg: "bg-emerald-100",
    borderColor: "border-emerald-400",
    textColor: "text-emerald-700",
    shadow: "shadow-emerald-200/50",
    shape: "rounded-full",
  },
  end: {
    bg: "bg-rose-100",
    borderColor: "border-rose-400",
    textColor: "text-rose-700",
    shadow: "shadow-rose-200/50",
    shape: "rounded-full",
  },
  decision: {
    bg: "bg-amber-100",
    borderColor: "border-amber-400",
    textColor: "text-amber-700",
    shadow: "shadow-amber-200/50",
    shape: "rounded-lg",
  },
  action: {
    bg: "bg-blue-100",
    borderColor: "border-blue-400",
    textColor: "text-blue-700",
    shadow: "shadow-blue-200/50",
    shape: "rounded-lg",
  },
  edit_form: {
    bg: "bg-violet-100",
    borderColor: "border-violet-400",
    textColor: "text-violet-700",
    shadow: "shadow-violet-200/50",
    shape: "rounded-lg",
  },
  file: {
    bg: "bg-orange-100",
    borderColor: "border-orange-400",
    textColor: "text-orange-700",
    shadow: "shadow-orange-200/50",
    shape: "rounded-lg",
  },
};

export function WorkflowNode({
  step,
  isSelected,
  isHighlighted = false,
  onMouseDown,
  onDelete,
  onEdit,
  onDuplicate,
  onStartConnection,
  onEndConnection,
  isConnecting,
  onMouseEnter,
  onMouseLeave,
  readOnly = false,
  hideEditButton = false,
}: WorkflowNodeProps) {
  const style = nodeStyles[step.step_type];
  const outputs = step.step_type === "decision"
    ? (step.config.outputs || ["Yes", "No"])
    : step.step_type === "edit_form"
      ? (step.config.outputs || ["Submit", "Cancel"])
      : ["default"];

  // Helper to determine if interaction should start a drag or a click connection
  const handleOutputMouseDown = (e: React.MouseEvent, outputName: string) => {
    e.stopPropagation();
    onStartConnection(step.id, outputName, e);
  };

  // Render configuration icons based on node type
  const renderConfigIcons = () => {
    // For action nodes: show action_type icon
    if (step.step_type === "action" || step.step_type === "file") {
      const actionType = step.action_type || "manual";
      if (actionType === "manual") {
        return (
          <div title="Manual action">
            <Hand className="h-3.5 w-3.5" />
          </div>
        );
      } else if (actionType === "automatic") {
        return (
          <div title="Automatic action">
            <Zap className="h-3.5 w-3.5" />
          </div>
        );
      } else if (actionType === "agent") {
        return (
          <div title="Agent action">
            <Bot className="h-3.5 w-3.5" />
          </div>
        );
      }
    }
    
    // For decision nodes: show decision_node_type icon(s)
    if (step.step_type === "decision") {
      const decisionType = step.decision_node_type || "Human";
      if (decisionType === "Human") {
        return (
          <div title="Human decision">
            <User className="h-3.5 w-3.5" />
          </div>
        );
      } else if (decisionType === "Agent") {
        return (
          <div title="Agent decision">
            <Bot className="h-3.5 w-3.5" />
          </div>
        );
      } else if (decisionType === "Agent + Human") {
        return (
          <div className="flex items-center gap-0.5" title="Agent + Human decision">
            <Bot className="h-3 w-3" />
            <User className="h-3 w-3" />
          </div>
        );
      }
    }
    
    return null;
  };

  return (
    <div
      className={`absolute ${readOnly ? "cursor-default" : "cursor-move"} group z-10 hover:z-20`}
      style={{
        left: step.position_x,
        top: step.position_y,
        transform: "translate(-50%, -50%)",
      }}
      onMouseDown={onMouseDown}
      onMouseUp={(e) => {
        if (readOnly) return;
        if (isConnecting) {
          e.stopPropagation();
          onEndConnection(step.id);
        }
      }}
      onDoubleClick={(e) => {
        if (readOnly) return;
        e.stopPropagation();
        onEdit();
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div
        className={`
          ${style.bg} ${style.shape}
          ${step.step_type === "decision" ? "w-40 h-32" : "w-32 h-32"}
          border-2 ${isHighlighted ? "border-primary border-4" : style.borderColor} shadow-md
          flex flex-col items-center justify-center relative
          transition-all duration-300
          ${isHighlighted ? "ring-4 ring-primary ring-offset-2 animate-pulse" : ""}
          ${isSelected ? `ring-2 ring-offset-2 ${style.borderColor} ${style.shadow}` : ""}
          ${!readOnly && !isHighlighted && !isSelected ? "hover:scale-105 hover:shadow-lg" : ""}
        `}
      >
        {/* Configuration icons - top right corner */}
        {(step.step_type === "action" || step.step_type === "decision" || step.step_type === "file") && (
          <div className={`absolute top-1.5 right-1.5 ${style.textColor} opacity-80 z-10`}>
            {renderConfigIcons()}
          </div>
        )}
        
        <p className={`${style.textColor} font-semibold text-center text-sm px-2 break-words ${(step.step_type === "action" || step.step_type === "decision" || step.step_type === "file") ? "pt-1" : ""}`}>
          {step.name}
        </p>
      </div>

      {/* Input handle - positioned based on node type - only in edit mode */}
      {!readOnly && step.step_type !== "start" && (
        <div
          className="group/handle absolute w-4 h-4 rounded-full bg-background border-2 border-primary cursor-pointer hover:bg-primary hover:scale-125 transition-all z-10 opacity-0 group-hover:opacity-100"
          style={{
            left: "-8px", // Half width (4/2) + 2px offset -> actually center on edge? -8px for center on edge (16px width / 2 = 8px)
            top: "50%",
            transform: "translateY(-50%)"
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (isConnecting) {
              onEndConnection(step.id);
            }
          }}
        >
          <div className="absolute right-full mr-2 px-2 py-1 bg-primary text-primary-foreground text-[10px] font-medium rounded shadow-md opacity-0 group-hover/handle:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
            Input
          </div>
        </div>
      )}

      {/* Output handles - positioned based on node type - only in edit mode */}
      {!readOnly && step.step_type !== "end" && (
        (step.step_type === "decision" || step.step_type === "edit_form") ? (
          // Decision and edit_form nodes: multiple outputs on the right side
          outputs.map((outputName, index) => {
            const totalOutputs = outputs.length;
            const spacing = 100 / (totalOutputs + 1);
            const topPercent = spacing * (index + 1);

            return (
              <div
                key={outputName}
                className="group/handle absolute w-4 h-4 rounded-full bg-background border-2 border-primary cursor-pointer hover:bg-primary hover:scale-125 transition-all z-10 flex items-center justify-center opacity-0 group-hover:opacity-100"
                style={{
                  right: "-8px",
                  top: `${topPercent}%`,
                  transform: "translateY(-50%)"
                }}
                onMouseDown={(e) => handleOutputMouseDown(e, outputName)}
              >
                <div className="absolute left-full ml-2 px-2 py-1 bg-primary text-primary-foreground text-[10px] font-medium rounded shadow-md opacity-0 group-hover/handle:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                  {outputName}
                </div>
              </div>
            );
          })
        ) : (
          // Start nodes: single output on the right
          <div
            className="group/handle absolute w-4 h-4 rounded-full bg-background border-2 border-primary cursor-pointer hover:bg-primary hover:scale-125 transition-all z-10 opacity-0 group-hover:opacity-100"
            style={{
              right: "-8px",
              top: "50%",
              transform: "translateY(-50%)"
            }}
            onMouseDown={(e) => handleOutputMouseDown(e, "default")}
          >
            <div className="absolute left-full ml-2 px-2 py-1 bg-primary text-primary-foreground text-[10px] font-medium rounded shadow-md opacity-0 group-hover/handle:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
              Output
            </div>
          </div>
        )
      )}

      {/* Edit, Duplicate and Delete buttons - visible on hover, side by side - only in edit mode */}
      {!readOnly && (
        <div className="absolute -top-2 -right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-20">
          {!hideEditButton && (
            <Button
              variant="secondary"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              title="Edit node"
            >
              <Pencil className="h-3 w-3" />
            </Button>
          )}
          <Button
            variant="secondary"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
            title="Duplicate node"
          >
            <Copy className="h-3 w-3" />
          </Button>
          <Button
            variant="destructive"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title="Delete node"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}
