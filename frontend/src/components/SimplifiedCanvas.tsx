import { useMemo, useState, useRef, useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface SimplifiedNode {
  id: string;
  nameKey: string;
  type: "start" | "action" | "decision" | "end";
  x: number;
  y: number;
}

interface SimplifiedConnection {
  id: string;
  from: string;
  to: string;
  fromOutput?: string;
  labelKey?: string;
}

// Helper to create a Bezier curve path
function createBezierPath(
  start: { x: number; y: number },
  end: { x: number; y: number }
): string {
  const dx = end.x - start.x;
  const curvature = Math.min(Math.max(Math.abs(dx) * 0.5, 60), 200);
  const cp1 = { x: start.x + curvature, y: start.y };
  const cp2 = { x: end.x - curvature, y: end.y };
  return `M ${start.x} ${start.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${end.x} ${end.y}`;
}

export function SimplifiedCanvas() {
  const { t } = useLanguage();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [nodes, setNodes] = useState<SimplifiedNode[]>([
    { id: "start", nameKey: "canvas.nodes.start", type: "start", x: 150, y: 200 },
    { id: "action1", nameKey: "canvas.nodes.fetchData", type: "action", x: 350, y: 200 },
    { id: "decision", nameKey: "canvas.nodes.validation", type: "decision", x: 550, y: 200 },
    { id: "action2", nameKey: "canvas.nodes.process", type: "action", x: 750, y: 120 },
    { id: "action3", nameKey: "canvas.nodes.reject", type: "action", x: 750, y: 280 },
    { id: "end", nameKey: "canvas.nodes.end", type: "end", x: 950, y: 200 },
  ]);

  const [connections, setConnections] = useState<SimplifiedConnection[]>([
    { id: "conn1", from: "start", to: "action1" },
    { id: "conn2", from: "action1", to: "decision" },
    { id: "conn3", from: "decision", to: "action2", fromOutput: "yes", labelKey: "canvas.labels.yes" },
    { id: "conn4", from: "decision", to: "action3", fromOutput: "no", labelKey: "canvas.labels.no" },
    { id: "conn5", from: "action2", to: "end" },
    { id: "conn6", from: "action3", to: "end" },
  ]);

  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [connectingFrom, setConnectingFrom] = useState<{ nodeId: string; outputName: string } | null>(null);
  const [tempConnectionPos, setTempConnectionPos] = useState<{ x: number; y: number } | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [nextNodeId, setNextNodeId] = useState(1);
  const justDraggedRef = useRef(false);
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);

  const nodeStyles = {
    start: {
      bg: "bg-emerald-100 dark:bg-emerald-900/30",
      borderColor: "border-emerald-400 dark:border-emerald-500",
      textColor: "text-emerald-700 dark:text-emerald-300",
      shape: "rounded-full",
      size: "w-24 h-24",
    },
    end: {
      bg: "bg-rose-100 dark:bg-rose-900/30",
      borderColor: "border-rose-400 dark:border-rose-500",
      textColor: "text-rose-700 dark:text-rose-300",
      shape: "rounded-full",
      size: "w-24 h-24",
    },
    decision: {
      bg: "bg-amber-100 dark:bg-amber-900/30",
      borderColor: "border-amber-400 dark:border-amber-500",
      textColor: "text-amber-700 dark:text-amber-300",
      shape: "rounded-lg",
      size: "w-32 h-24",
    },
    action: {
      bg: "bg-blue-100 dark:bg-blue-900/30",
      borderColor: "border-blue-400 dark:border-blue-500",
      textColor: "text-blue-700 dark:text-blue-300",
      shape: "rounded-lg",
      size: "w-32 h-24",
    },
  };

  const getNodePosition = (node: SimplifiedNode) => {
    if (node.type === "decision") {
      return { x: node.x, y: node.y - 12 };
    }
    return { x: node.x, y: node.y };
  };

  const getConnectionStart = (fromNode: SimplifiedNode, outputName?: string) => {
    const pos = getNodePosition(fromNode);
    const halfWidth = fromNode.type === "decision" ? 64 : 48;
    
    if (fromNode.type === "decision" && outputName) {
      const yOffset = outputName === "yes" ? -32 : 32;
      return { x: pos.x + halfWidth, y: pos.y + yOffset };
    }
    
    return { x: pos.x + halfWidth, y: pos.y };
  };

  const getConnectionEnd = (toNode: SimplifiedNode) => {
    const pos = getNodePosition(toNode);
    const halfWidth = toNode.type === "decision" ? 64 : 48;
    return { x: pos.x - halfWidth, y: pos.y };
  };

  const handleNodeMouseDown = (e: React.MouseEvent, node: SimplifiedNode) => {
    if (e.button !== 0 || connectingFrom) return;
    e.stopPropagation();
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    justDraggedRef.current = false;
    dragStartPosRef.current = { x: e.clientX, y: e.clientY };
    setDraggingNode(node.id);
    setDragOffset({
      x: e.clientX - rect.left - node.x,
      y: e.clientY - rect.top - node.y,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggingNode) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const node = nodes.find((n) => n.id === draggingNode);
      if (!node) return;

      // Check if we've moved enough to consider it a drag (more than 5px)
      if (dragStartPosRef.current) {
        const dx = Math.abs(e.clientX - dragStartPosRef.current.x);
        const dy = Math.abs(e.clientY - dragStartPosRef.current.y);
        if (dx > 5 || dy > 5) {
          justDraggedRef.current = true;
        }
      }

      const newX = e.clientX - rect.left - dragOffset.x;
      const newY = e.clientY - rect.top - dragOffset.y;

      setNodes((prev) =>
        prev.map((n) =>
          n.id === draggingNode ? { ...n, x: newX, y: newY } : n
        )
      );
    }

    if (connectingFrom) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const fromNode = nodes.find((n) => n.id === connectingFrom.nodeId);
      if (fromNode) {
        const start = getConnectionStart(fromNode, connectingFrom.outputName);
        setTempConnectionPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (draggingNode) {
      // Small delay to prevent click event from firing after drag
      setTimeout(() => {
        justDraggedRef.current = false;
        dragStartPosRef.current = null;
      }, 100);
      setDraggingNode(null);
      return;
    }
    
    dragStartPosRef.current = null;

    if (connectingFrom) {
      // Check if we clicked on a node
      const targetElement = e.target as HTMLElement;
      const nodeElement = targetElement.closest('[data-node-id]');
      
      if (nodeElement) {
        const targetNodeId = nodeElement.getAttribute('data-node-id');
        const fromNode = nodes.find((n) => n.id === connectingFrom.nodeId);
        const toNode = nodes.find((n) => n.id === targetNodeId);

        if (targetNodeId && fromNode && toNode && targetNodeId !== connectingFrom.nodeId) {
          // Check if connection already exists
          const exists = connections.some(
            (c) => c.from === connectingFrom.nodeId && c.to === targetNodeId
          );

          if (!exists) {
            const newConnection: SimplifiedConnection = {
              id: `conn-${Date.now()}`,
              from: connectingFrom.nodeId,
              to: targetNodeId,
              fromOutput: connectingFrom.outputName,
            };

            // Add label for decision nodes
            if (fromNode.type === "decision" && connectingFrom.outputName) {
              newConnection.labelKey = connectingFrom.outputName === "yes" 
                ? "canvas.labels.yes" 
                : "canvas.labels.no";
            }

            setConnections((prev) => [...prev, newConnection]);
          }
        }
      }

      setConnectingFrom(null);
      setTempConnectionPos(null);
    }
  };

  const handleOutputClick = (e: React.MouseEvent, nodeId: string, outputName: string = "default") => {
    e.stopPropagation();
    setConnectingFrom({ nodeId, outputName });
  };

  const handleInputClick = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    if (connectingFrom && connectingFrom.nodeId !== nodeId) {
      const fromNode = nodes.find((n) => n.id === connectingFrom.nodeId);
      const toNode = nodes.find((n) => n.id === nodeId);

      if (fromNode && toNode) {
        const exists = connections.some(
          (c) => c.from === connectingFrom.nodeId && c.to === nodeId
        );

        if (!exists) {
          const newConnection: SimplifiedConnection = {
            id: `conn-${Date.now()}`,
            from: connectingFrom.nodeId,
            to: nodeId,
            fromOutput: connectingFrom.outputName,
          };

          if (fromNode.type === "decision" && connectingFrom.outputName) {
            newConnection.labelKey = connectingFrom.outputName === "yes" 
              ? "canvas.labels.yes" 
              : "canvas.labels.no";
          }

          setConnections((prev) => [...prev, newConnection]);
        }
      }
      setConnectingFrom(null);
      setTempConnectionPos(null);
    }
  };

  const handleDeleteConnection = (e: React.MouseEvent, connectionId: string) => {
    e.stopPropagation();
    setConnections((prev) => prev.filter((c) => c.id !== connectionId));
  };

  const handleAddNode = (type: "start" | "action" | "decision" | "end", x: number, y: number) => {
    const newNode: SimplifiedNode = {
      id: `node-${nextNodeId}`,
      nameKey: `canvas.nodes.${type}`,
      type,
      x,
      y,
    };
    setNodes((prev) => [...prev, newNode]);
    setNextNodeId((prev) => prev + 1);
  };

  const handleDeleteNode = (nodeId: string) => {
    // Remove node and all its connections
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setConnections((prev) => prev.filter((c) => c.from !== nodeId && c.to !== nodeId));
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    // Don't do anything on canvas click - blocks are only added via the menu
    // This prevents accidental block creation when clicking on the canvas
    if (justDraggedRef.current) {
      justDraggedRef.current = false;
    }
  };

  // Cancel connection on escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && connectingFrom) {
        setConnectingFrom(null);
        setTempConnectionPos(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [connectingFrom]);

  return (
    <div className="w-full relative overflow-hidden rounded-lg border-2 border-border bg-gradient-to-br from-background to-muted/20 min-h-[400px]">
      {/* Grid background */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: "radial-gradient(hsl(var(--muted-foreground) / 0.15) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      />
      
      {/* Add Node Menu */}
      <div className="absolute top-4 left-4 z-50">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="bg-background/80 backdrop-blur-sm">
              <Plus className="h-4 w-4 mr-2" />
              {t("canvas.addNode") as string}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => handleAddNode("start", 200, 200)}>
              {t("canvas.nodes.start") as string}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleAddNode("action", 400, 200)}>
              {t("canvas.nodes.action") as string}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleAddNode("decision", 600, 200)}>
              {t("canvas.nodes.decision") as string}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleAddNode("end", 800, 200)}>
              {t("canvas.nodes.end") as string}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Container with responsive scaling */}
      <div className="w-full overflow-x-auto overflow-y-hidden pb-4">
        <div
          ref={canvasRef}
          className="relative mx-auto cursor-default"
          style={{ width: "1100px", height: "400px", minWidth: "1100px" }}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onClick={handleCanvasClick}
        >
          {/* SVG for connections */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ zIndex: 1, width: "1100px", height: "400px" }}
          >
            {connections.map((conn) => {
              const fromNode = nodes.find((n) => n.id === conn.from);
              const toNode = nodes.find((n) => n.id === conn.to);
              if (!fromNode || !toNode) return null;

              const start = getConnectionStart(fromNode, conn.fromOutput);
              const end = getConnectionEnd(toNode);

              // Adjust path for decision node outputs
              let adjustedEnd = end;
              const label = conn.labelKey ? (t(conn.labelKey) as string) : undefined;
              if (fromNode.type === "decision" && conn.fromOutput) {
                const yOffset = conn.fromOutput === "yes" ? -32 : 32;
                adjustedEnd = { x: end.x, y: fromNode.y + yOffset };
              }

              const path = createBezierPath(start, adjustedEnd);

              return (
                <g key={conn.id} className="group/conn">
                  <path
                    d={path}
                    fill="none"
                    stroke="hsl(var(--primary))"
                    strokeWidth="2"
                    className="opacity-60 group-hover/conn:opacity-100 group-hover/conn:stroke-destructive transition-all cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(t("canvas.deleteConnection") as string)) {
                        handleDeleteConnection(e as any, conn.id);
                      }
                    }}
                    style={{ pointerEvents: "all" }}
                    title={t("canvas.clickToDelete") as string}
                  />
                  {label && (
                    <text
                      x={(start.x + adjustedEnd.x) / 2}
                      y={(start.y + adjustedEnd.y) / 2 - 8}
                      className="fill-foreground text-xs font-medium pointer-events-none"
                      textAnchor="middle"
                      style={{ fontSize: "11px" }}
                    >
                      {label}
                    </text>
                  )}
                  {/* Arrow head */}
                  <polygon
                    points={`${adjustedEnd.x},${adjustedEnd.y} ${adjustedEnd.x - 8},${adjustedEnd.y - 4} ${adjustedEnd.x - 8},${adjustedEnd.y + 4}`}
                    fill="hsl(var(--primary))"
                    className="opacity-60"
                  />
                </g>
              );
            })}

            {/* Temporary connection line */}
            {connectingFrom && tempConnectionPos && (() => {
              const fromNode = nodes.find((n) => n.id === connectingFrom.nodeId);
              if (!fromNode) return null;
              const start = getConnectionStart(fromNode, connectingFrom.outputName);
              const path = createBezierPath(start, tempConnectionPos);
              return (
                <path
                  d={path}
                  fill="none"
                  stroke="hsl(var(--primary))"
                  strokeWidth="2"
                  strokeDasharray="5,5"
                  className="opacity-80"
                />
              );
            })()}
          </svg>

          {/* Nodes */}
          {nodes.map((node) => {
            const style = nodeStyles[node.type];
            const pos = getNodePosition(node);
            const isDragging = draggingNode === node.id;
            const isHovered = hoveredNode === node.id;
            const outputs = node.type === "decision" ? ["yes", "no"] : node.type === "start" ? ["default"] : [];
            
            return (
              <div
                key={node.id}
                data-node-id={node.id}
                className={`absolute group ${style.bg} ${style.shape} ${style.size} border-2 ${style.borderColor} shadow-md flex items-center justify-center transition-all duration-300 cursor-move ${
                  isDragging ? "scale-105 shadow-xl z-30" : isHovered ? "scale-105 shadow-lg z-20" : "hover:scale-105 hover:shadow-lg z-10"
                }`}
                style={{
                  left: pos.x,
                  top: pos.y,
                  transform: "translate(-50%, -50%)",
                }}
                onMouseDown={(e) => handleNodeMouseDown(e, node)}
                onClick={(e) => {
                  e.stopPropagation();
                  // Reset drag flag if it was just a click (not a drag)
                  if (!justDraggedRef.current) {
                    justDraggedRef.current = false;
                  }
                }}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
              >
                <p className={`${style.textColor} font-semibold text-center text-xs px-2 break-words pointer-events-none`}>
                  {t(node.nameKey) as string}
                </p>

                {/* Delete button */}
                <button
                  className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-50 hover:scale-110"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(t("canvas.deleteNode") as string)) {
                      handleDeleteNode(node.id);
                    }
                  }}
                  title={t("canvas.deleteNode") as string}
                >
                  <X className="h-3 w-3" />
                </button>

                {/* Input handle */}
                {node.type !== "start" && (
                  <div
                    className="absolute w-4 h-4 rounded-full bg-background border-2 border-primary cursor-pointer hover:bg-primary hover:scale-125 transition-all z-40 opacity-0 group-hover:opacity-100"
                    style={{
                      left: "-8px",
                      top: "50%",
                      transform: "translateY(-50%)",
                    }}
                    onClick={(e) => handleInputClick(e, node.id)}
                    onMouseEnter={() => setHoveredNode(node.id)}
                    title={t("canvas.inputHandle") as string}
                  />
                )}

                {/* Output handles */}
                {node.type !== "end" && (
                  <>
                    {node.type === "decision" ? (
                      outputs.map((outputName) => {
                        const yOffset = outputName === "yes" ? -32 : 32;
                        return (
                          <div
                            key={outputName}
                            className="absolute w-4 h-4 rounded-full bg-background border-2 border-primary cursor-pointer hover:bg-primary hover:scale-125 transition-all z-40 opacity-0 group-hover:opacity-100"
                            style={{
                              right: "-8px",
                              top: `calc(50% + ${yOffset}px)`,
                              transform: "translateY(-50%)",
                            }}
                            onClick={(e) => handleOutputClick(e, node.id, outputName)}
                            onMouseEnter={() => setHoveredNode(node.id)}
                            title={t("canvas.outputHandle") as string}
                          />
                        );
                      })
                    ) : (
                      <div
                        className="absolute w-4 h-4 rounded-full bg-background border-2 border-primary cursor-pointer hover:bg-primary hover:scale-125 transition-all z-40 opacity-0 group-hover:opacity-100"
                        style={{
                          right: "-8px",
                          top: "50%",
                          transform: "translateY(-50%)",
                        }}
                        onClick={(e) => handleOutputClick(e, node.id)}
                        onMouseEnter={() => setHoveredNode(node.id)}
                        title={t("canvas.outputHandle") as string}
                      />
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Instructions */}
      {connectingFrom && (
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-background/90 backdrop-blur-sm border border-border rounded-lg px-4 py-2 text-sm z-50">
          {t("canvas.connecting") as string} (ESC {t("canvas.toCancel") as string})
        </div>
      )}
    </div>
  );
}

