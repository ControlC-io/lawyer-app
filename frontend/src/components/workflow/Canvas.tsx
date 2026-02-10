import { useState, useRef, useEffect, useMemo } from "react";
import { WorkflowStep, WorkflowConnection } from "@/pages/WorkflowEditor";
import { WorkflowNode } from "./WorkflowNode";
import { ConnectionDialog } from "./ConnectionDialog";
import { CanvasComment, CanvasCommentData } from "./CanvasComment";

interface CanvasProps {
  steps: WorkflowStep[];
  connections: WorkflowConnection[];
  selectedStep: WorkflowStep | null;
  onSelectStep: (step: WorkflowStep | null) => void;
  onUpdateStep: (step: WorkflowStep) => void;
  onDeleteStep: (stepId: string) => void;
  onDuplicateStep: (stepId: string) => void;
  onAddConnection: (sourceId: string, targetId: string, outputName: string) => void;
  onUpdateConnection: (connectionId: string, config: { color: string; style: "solid" | "dashed" }) => void;
  onDeleteConnection: (connectionId: string) => void;
  comments?: CanvasCommentData[];
  onUpdateComments?: (comments: CanvasCommentData[]) => void;
  readOnly?: boolean;
  highlightedStepId?: string | null;
  hideEditButton?: boolean;
}

// Helper to create a path with rounded corners
function createRoundedPath(points: { x: number; y: number }[], radius: number = 12): string {
  if (points.length < 2) return "";
  let path = `M ${points[0].x} ${points[0].y}`;

  for (let i = 1; i < points.length - 1; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];

    // Vector p0->p1
    const v1 = { x: p1.x - p0.x, y: p1.y - p0.y };
    const len1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);

    // Vector p1->p2
    const v2 = { x: p2.x - p1.x, y: p2.y - p1.y };
    const len2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

    // Clamped radius
    const r = Math.min(radius, len1 / 2, len2 / 2);

    // Start of curve (move back from p1 along v1)
    const start = {
      x: p1.x - (v1.x / len1) * r,
      y: p1.y - (v1.y / len1) * r
    };

    // End of curve (move forward from p1 along v2)
    const end = {
      x: p1.x + (v2.x / len2) * r,
      y: p1.y + (v2.y / len2) * r
    };

    path += ` L ${start.x} ${start.y}`;
    path += ` Q ${p1.x} ${p1.y}, ${end.x} ${end.y}`;
  }

  const last = points[points.length - 1];
  path += ` L ${last.x} ${last.y}`;
  return path;
}

// Smart path calculation that switches between Bezier and Orthogonal routing
function calculateSmartPath(
  start: { x: number; y: number },
  end: { x: number; y: number },
  steps: WorkflowStep[],
  laneOffsetIndex: number = 0
): { path: string; endAngle: number; labelPos: { x: number; y: number } } {
  const dx = end.x - start.x;

  // Use Bezier for forward connections (standard flow)
  if (dx >= -20) {
    const curvature = Math.min(Math.max(Math.abs(dx) * 0.5, 60), 300);
    const cp1 = { x: start.x + curvature, y: start.y };
    const cp2 = { x: end.x - curvature, y: end.y };
    const path = `M ${start.x} ${start.y} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${end.x} ${end.y}`;
    const angle = (Math.atan2(end.y - cp2.y, end.x - cp2.x) * 180) / Math.PI;

    // Calculate midpoint for label (t=0.5)
    const t = 0.5;
    const labelX = Math.pow(1 - t, 3) * start.x + 3 * Math.pow(1 - t, 2) * t * cp1.x + 3 * (1 - t) * Math.pow(t, 2) * cp2.x + Math.pow(t, 3) * end.x;
    const labelY = Math.pow(1 - t, 3) * start.y + 3 * Math.pow(1 - t, 2) * t * cp1.y + 3 * (1 - t) * Math.pow(t, 2) * cp2.y + Math.pow(t, 3) * end.y;

    return { path, endAngle: angle, labelPos: { x: labelX, y: labelY } };
  }

  // For backward connections, use orthogonal routing that avoids nodes

  const xMin = end.x;
  const xMax = start.x;

  // Find obstacles in the horizontal range
  const obstacles = steps.filter(s => {
    const sX = s.position_x; // Center X
    return sX > xMin - 64 && sX < xMax + 64;
  });

  // Calculate a safe Y level
  let maxY = Math.max(start.y, end.y);

  obstacles.forEach(s => {
    const bottomY = s.position_y + 80; // 64 (half height) + 16 margin
    if (bottomY > maxY) {
      maxY = bottomY;
    }
  });

  // Add final padding for the lane, plus offset for overlapping connections
  const laneSpacing = 15;
  const laneY = maxY + 40 + (laneOffsetIndex * laneSpacing);

  // Stagger horizontal lines to prevent vertical segment overlap
  const horizontalOffset = 40 + ((laneOffsetIndex % 5) * 10);

  const points = [
    start,
    { x: start.x + horizontalOffset, y: start.y },
    { x: start.x + horizontalOffset, y: laneY },
    { x: end.x - horizontalOffset, y: laneY },
    { x: end.x - horizontalOffset, y: end.y },
    end
  ];

  // Calculate label position
  const p2 = points[2];
  const p3 = points[3];
  const labelX = (p2.x + p3.x) / 2;
  const labelY = laneY;

  const path = createRoundedPath(points, 16);
  return { path, endAngle: 0, labelPos: { x: labelX, y: labelY } };
}

// Helper functions for position calculation (moved outside component to be used in pre-calc)
const getStepCenter = (step: WorkflowStep, draggingStep: string | null, draggingPos: { x: number, y: number } | null, livePositions: Map<string, { x: number, y: number }>) => {
  // Use live position if dragging, otherwise use stored position
  if (draggingStep === step.id && draggingPos) {
    return draggingPos;
  }
  const livePos = livePositions.get(step.id);
  if (livePos) {
    return livePos;
  }
  return { x: step.position_x, y: step.position_y };
};

const getStepHalfWidth = (stepType: string) => {
  return stepType === "decision" ? 80 : 64;
};

const getOutputPosition = (step: WorkflowStep, outputName: string, center: { x: number, y: number }) => {
  const halfWidth = getStepHalfWidth(step.step_type);

  if (step.step_type === "decision" || step.step_type === "edit_form") {
    const outputs = step.config.outputs ||
      (step.step_type === "edit_form" ? ["Submit", "Cancel"] :
        ["Yes", "No"]);
    const index = outputs.indexOf(outputName);
    const totalOutputs = outputs.length;

    const spacing = 128 / (totalOutputs + 1);
    const yOffset = spacing * (index + 1) - 64;

    return { x: center.x + halfWidth, y: center.y + yOffset };
  }

  return { x: center.x + halfWidth, y: center.y };
};

const getInputPosition = (step: WorkflowStep, center: { x: number, y: number }) => {
  const halfWidth = getStepHalfWidth(step.step_type);
  return { x: center.x - halfWidth, y: center.y };
};

export function Canvas({
  steps,
  connections,
  selectedStep,
  onSelectStep,
  onUpdateStep,
  onDeleteStep,
  onDuplicateStep,
  onAddConnection,
  onUpdateConnection,
  onDeleteConnection,
  comments = [],
  onUpdateComments,
  readOnly = false,
  highlightedStepId = null,
  hideEditButton = false,
}: CanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [draggingStep, setDraggingStep] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [connectingFrom, setConnectingFrom] = useState<{ stepId: string; outputName: string } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [spacePressed, setSpacePressed] = useState(false);
  const draggingPosRef = useRef<{ x: number; y: number } | null>(null);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const tempConnectionRef = useRef<{ x: number; y: number } | null>(null);
  const [tempConnectionPos, setTempConnectionPos] = useState<{ x: number; y: number } | null>(null);
  const [selectedConnection, setSelectedConnection] = useState<WorkflowConnection | null>(null);
  const [hoveredConnection, setHoveredConnection] = useState<string | null>(null);
  const [hoveredStep, setHoveredStep] = useState<string | null>(null);
  const rafScheduledRef = useRef(false);
  
  // Comment state
  const [draggingComment, setDraggingComment] = useState<string | null>(null);
  const [commentDragOffset, setCommentDragOffset] = useState({ x: 0, y: 0 });
  const draggingCommentPosRef = useRef<{ x: number; y: number } | null>(null);
  const [commentDragPosition, setCommentDragPosition] = useState<{ x: number; y: number } | null>(null);

  // Track live positions for immediate updates
  const livePositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map());

  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent, step: WorkflowStep) => {
    // Don't allow dragging in read-only mode
    if (readOnly) return;
    
    // Don't start dragging if panning or right-clicking
    if (e.button !== 0 || isPanning || spacePressed) return;

    // Don't start dragging the node if we are in the middle of creating a connection
    // This prevents the target node from moving when clicking to complete a connection
    if (connectingFrom) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    setDraggingStep(step.id);
    setDragOffset({
      x: (e.clientX - rect.left - pan.x) / zoom - step.position_x,
      y: (e.clientY - rect.top - pan.y) / zoom - step.position_y,
    });
    const initialPos = { x: step.position_x, y: step.position_y };
    draggingPosRef.current = initialPos;
    setDragPosition(initialPos);
    livePositionsRef.current.set(step.id, initialPos);
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    // Right-click or middle-click for panning
    if (e.button === 1 || e.button === 2 || (e.button === 0 && spacePressed)) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      const deltaX = e.clientX - panStart.x;
      const deltaY = e.clientY - panStart.y;
      setPan((prev) => ({
        x: prev.x + deltaX,
        y: prev.y + deltaY,
      }));
      setPanStart({ x: e.clientX, y: e.clientY });
      return;
    }

    if (!draggingStep) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const step = steps.find((s) => s.id === draggingStep);
    if (!step) return;

    const newX = (e.clientX - rect.left - pan.x) / zoom - dragOffset.x;
    const newY = (e.clientY - rect.top - pan.y) / zoom - dragOffset.y;

    // Update live position immediately - use state to trigger re-render
    const newPos = { x: newX, y: newY };
    draggingPosRef.current = newPos;
    livePositionsRef.current.set(draggingStep, newPos);

    // Update state immediately for instant feedback
    setDragPosition(newPos);
  };

  const handleMouseUp = () => {
    // Persist final position to parent state
    if (draggingStep && draggingPosRef.current) {
      const step = steps.find((s) => s.id === draggingStep);
      if (step) {
        onUpdateStep({
          ...step,
          position_x: draggingPosRef.current.x,
          position_y: draggingPosRef.current.y,
        });
      }
    }
    setDraggingStep(null);
    setDragPosition(null);
    setIsPanning(false);
    rafScheduledRef.current = false;
    draggingPosRef.current = null;
    tempConnectionRef.current = null;
    livePositionsRef.current.clear();
  };

  const performZoomRef = useRef<((e: WheelEvent) => void) | null>(null);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent event from bubbling to page
    if (performZoomRef.current) {
      performZoomRef.current(e.nativeEvent);
    }
  };

  const handleCenter = () => {
    if (steps.length === 0) {
      setPan({ x: 0, y: 0 });
      setZoom(1);
      return;
    }

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const minX = Math.min(...steps.map((s) => s.position_x));
    const maxX = Math.max(...steps.map((s) => s.position_x));
    const minY = Math.min(...steps.map((s) => s.position_y));
    const maxY = Math.max(...steps.map((s) => s.position_y));

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const width = maxX - minX + 400;
    const height = maxY - minY + 400;

    const scaleX = rect.width / width;
    const scaleY = rect.height / height;
    const newZoom = Math.min(scaleX, scaleY, 1);

    setPan({
      x: rect.width / 2 - centerX * newZoom,
      y: rect.height / 2 - centerY * newZoom,
    });
    setZoom(newZoom);
  };

  // Center view on initial load
  const hasCenteredRef = useRef(false);
  useEffect(() => {
    if (!hasCenteredRef.current && steps.length > 0) {
      // Small delay to ensure canvas dimensions are ready
      const timer = setTimeout(() => {
        handleCenter();
        hasCenteredRef.current = true;
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [steps]);

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (readOnly) return;
    
    if (e.target === canvasRef.current || e.target === svgRef.current || e.target === containerRef.current) {
      onSelectStep(null);
      if (connectingFrom) {
        setConnectingFrom(null);
        tempConnectionRef.current = null;
        setTempConnectionPos(null);
        setIsDraggingConnection(false);
      }
    }
  };

  const handleStartConnection = (stepId: string, outputName: string, event: React.MouseEvent) => {
    if (readOnly) return;
    
    setConnectingFrom({ stepId, outputName });
    setIsDraggingConnection(false);

    // Initialize the temp connection line immediately at the cursor position
    if (canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const pos = {
        x: (event.clientX - rect.left - pan.x) / zoom,
        y: (event.clientY - rect.top - pan.y) / zoom,
      };
      tempConnectionRef.current = pos;
      setTempConnectionPos(pos);
    }
  };

  const handleEndConnection = (targetStepId: string) => {
    // If connecting to the same node (e.g. initial click release), ignore
    if (connectingFrom && connectingFrom.stepId === targetStepId) {
      return;
    }

    if (connectingFrom && connectingFrom.stepId !== targetStepId) {
      onAddConnection(connectingFrom.stepId, targetStepId, connectingFrom.outputName);
    }
    setConnectingFrom(null);
    tempConnectionRef.current = null;
    setTempConnectionPos(null);
    setIsDraggingConnection(false);
  };

  // Wrapper for helpers to use current state
  const getStepCenterWrapper = (step: WorkflowStep) => {
    // Use ref to get the absolute latest position, reducing lag between mouse and render
    return getStepCenter(step, draggingStep, draggingPosRef.current || dragPosition, livePositionsRef.current);
  };

  const getOutputPositionWrapper = (step: WorkflowStep, outputName: string) => {
    const center = getStepCenterWrapper(step);
    return getOutputPosition(step, outputName, center);
  };

  const getInputPositionWrapper = (step: WorkflowStep) => {
    const center = getStepCenterWrapper(step);
    return getInputPosition(step, center);
  };

  // Handle keyboard for space+drag panning
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement).isContentEditable) {
        return;
      }

      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        setSpacePressed(true);
        if (canvasRef.current) {
          canvasRef.current.style.cursor = "grab";
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setSpacePressed(false);
        if (canvasRef.current) {
          canvasRef.current.style.cursor = "";
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  const [isDraggingConnection, setIsDraggingConnection] = useState(false);

  // Global mouse handlers for dragging and panning
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      // Don't clear dragging step if we are completing a connection (this prevents node from jumping)
      // The actual node position update happens in handleMouseUp (local), which is called before this global one

      // Persist final comment position to parent state
      if (draggingComment && draggingCommentPosRef.current && onUpdateComments) {
        const comment = comments.find((c) => c.id === draggingComment);
        if (comment) {
          handleUpdateComment({
            ...comment,
            position_x: draggingCommentPosRef.current.x,
            position_y: draggingCommentPosRef.current.y,
          });
        }
      }

      setDraggingStep(null);
      setDraggingComment(null);
      setCommentDragPosition(null);
      setIsPanning(false);
      draggingPosRef.current = null;
      draggingCommentPosRef.current = null;

      // Only clear connection state if we were dragging (mouse button down)
      // If we are just moving the mouse (click-move-click), don't clear
      if (connectingFrom && isDraggingConnection) {
        tempConnectionRef.current = null;
        setTempConnectionPos(null);
        setConnectingFrom(null);
        setIsDraggingConnection(false);
      }
    };

    const handleGlobalMouseMove = (e: MouseEvent) => {
      // Live update temporary connection preview
      if (connectingFrom && canvasRef.current) {
        // If mouse is down, we are dragging. If up, we are in click-click mode
        if (e.buttons === 1) {
          setIsDraggingConnection(true);
        }

        const rect = canvasRef.current.getBoundingClientRect();
        const pos = {
          x: (e.clientX - rect.left - pan.x) / zoom,
          y: (e.clientY - rect.top - pan.y) / zoom,
        };
        tempConnectionRef.current = pos;
        setTempConnectionPos(pos);
      }

      // Live update node position while dragging
      if (draggingStep && canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        const step = steps.find((s) => s.id === draggingStep);
        if (!step) return;
        const newX = (e.clientX - rect.left - pan.x) / zoom - dragOffset.x;
        const newY = (e.clientY - rect.top - pan.y) / zoom - dragOffset.y;
        const newPos = { x: newX, y: newY };
        draggingPosRef.current = newPos;
        livePositionsRef.current.set(draggingStep, newPos);

        // Update state immediately for instant feedback
        setDragPosition(newPos);
      }

      // Live update comment position while dragging
      if (draggingComment && canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        const comment = comments.find((c) => c.id === draggingComment);
        if (!comment) return;
        const newX = (e.clientX - rect.left - pan.x) / zoom - commentDragOffset.x;
        const newY = (e.clientY - rect.top - pan.y) / zoom - commentDragOffset.y;
        const newPos = { x: newX, y: newY };
        draggingCommentPosRef.current = newPos;

        // Update state immediately for instant feedback
        setCommentDragPosition(newPos);
      }

      // Handle panning
      if (isPanning) {
        const deltaX = e.clientX - panStart.x;
        const deltaY = e.clientY - panStart.y;
        setPan((prev) => ({
          x: prev.x + deltaX,
          y: prev.y + deltaY,
        }));
        setPanStart({ x: e.clientX, y: e.clientY });
      }
    };

    document.addEventListener("mouseup", handleGlobalMouseUp);
    document.addEventListener("mousemove", handleGlobalMouseMove);
    return () => {
      document.removeEventListener("mouseup", handleGlobalMouseUp);
      document.removeEventListener("mousemove", handleGlobalMouseMove);
    };
  }, [connectingFrom, draggingStep, dragOffset, pan, zoom, steps, isPanning, panStart, draggingComment, commentDragOffset, comments, onUpdateComments]);

  // Prevent context menu on right-click (for panning)
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      if (canvasRef.current?.contains(e.target as Node)) {
        e.preventDefault();
      }
    };
    document.addEventListener("contextmenu", handleContextMenu);
    return () => {
      document.removeEventListener("contextmenu", handleContextMenu);
    };
  }, []);

  // Prevent page scrolling when wheel event occurs on canvas
  useEffect(() => {
    // Update the ref function when zoom/pan changes
    performZoomRef.current = (e: WheelEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const zoomSensitivity = 0.05;
      const delta = e.deltaY > 0 ? (1 - zoomSensitivity) : (1 + zoomSensitivity);
      const currentZoom = zoom;
      const newZoom = Math.min(Math.max(0.1, currentZoom * delta), 3);

      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      setPan((prev) => ({
        x: mouseX - (mouseX - prev.x) * (newZoom / currentZoom),
        y: mouseY - (mouseY - prev.y) * (newZoom / currentZoom),
      }));

      setZoom(newZoom);
    };

    const handleWheelCapture = (e: WheelEvent) => {
      // Check if the wheel event is happening over the canvas
      if (canvasRef.current && canvasRef.current.contains(e.target as Node)) {
        e.preventDefault();
        e.stopPropagation();
        if (performZoomRef.current) {
          performZoomRef.current(e);
        }
      }
    };

    // Use capture phase to catch the event before it bubbles to prevent page scroll
    document.addEventListener("wheel", handleWheelCapture, { passive: false, capture: true });
    return () => {
      document.removeEventListener("wheel", handleWheelCapture, { capture: true });
    };
  }, [zoom, pan]);

  // Calculate backward connection indices for layout
  const backwardConnectionIndices = useMemo(() => {
    const indices = new Map<string, number>();
    let backwardCounter = 0;

    connections.forEach(conn => {
      const sourceStep = steps.find((s) => s.id === conn.source_step_id);
      const targetStep = steps.find((s) => s.id === conn.target_step_id);
      if (!sourceStep || !targetStep) return;

      // We need to use the raw position for layout stability, not dragging position
      const start = getOutputPosition(sourceStep, conn.output_name, { x: sourceStep.position_x, y: sourceStep.position_y });
      const end = getInputPosition(targetStep, { x: targetStep.position_x, y: targetStep.position_y });

      if (end.x - start.x < -20) {
        indices.set(conn.id, backwardCounter++);
      }
    });
    return indices;
  }, [connections, steps]);

  // Sort connections so hovered one or ones connected to hovered step are on top
  const sortedConnections = useMemo(() => {
    return [...connections].sort((a, b) => {
      // Check if connection is related to hovered step
      const isAHovered = a.id === hoveredConnection ||
        (hoveredStep && (a.source_step_id === hoveredStep || a.target_step_id === hoveredStep));
      const isBHovered = b.id === hoveredConnection ||
        (hoveredStep && (b.source_step_id === hoveredStep || b.target_step_id === hoveredStep));

      if (isAHovered && !isBHovered) return 1;
      if (!isAHovered && isBHovered) return -1;
      return 0;
    });
  }, [connections, hoveredConnection, hoveredStep]);

  // Comment handlers
  const handleAddComment = () => {
    if (!onUpdateComments || readOnly) return;
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Add comment at center of visible canvas
    const centerX = (rect.width / 2 - pan.x) / zoom;
    const centerY = (rect.height / 2 - pan.y) / zoom;

    const newComment: CanvasCommentData = {
      id: crypto.randomUUID(),
      content: "# New Comment\n\nDouble-click to edit...",
      position_x: centerX - 100,
      position_y: centerY - 75,
      color: "#fef08a",
      width: 200,
      height: 150,
    };

    onUpdateComments([...comments, newComment]);
  };

  const handleUpdateComment = (updatedComment: CanvasCommentData) => {
    if (!onUpdateComments) return;
    onUpdateComments(
      comments.map((c) => (c.id === updatedComment.id ? updatedComment : c))
    );
  };

  const handleDeleteComment = (commentId: string) => {
    if (!onUpdateComments) return;
    onUpdateComments(comments.filter((c) => c.id !== commentId));
  };

  const handleCommentMouseDown = (e: React.MouseEvent, comment: CanvasCommentData) => {
    if (readOnly) return;
    
    // Don't start dragging if panning or right-clicking
    if (e.button !== 0 || isPanning || spacePressed) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    setDraggingComment(comment.id);
    setCommentDragOffset({
      x: (e.clientX - rect.left - pan.x) / zoom - comment.position_x,
      y: (e.clientY - rect.top - pan.y) / zoom - comment.position_y,
    });
    const initialPos = { x: comment.position_x, y: comment.position_y };
    draggingCommentPosRef.current = initialPos;
    setCommentDragPosition(initialPos);
  };

  return (
    <div
      ref={canvasRef}
      className="w-full h-full bg-gradient-to-br from-background to-muted/20 relative overflow-hidden"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseDown={handleCanvasMouseDown}
      onClick={handleCanvasClick}
      onWheel={handleWheel}
      style={{
        backgroundImage: "radial-gradient(hsl(var(--muted-foreground) / 0.1) 1px, transparent 1px)",
        backgroundSize: `${20 * zoom}px ${20 * zoom}px`,
        backgroundPosition: `${pan.x}px ${pan.y}px`,
        cursor: isPanning || spacePressed ? "grabbing" : "default",
        touchAction: "none" // Prevent touch scrolling
      }}
    >
      {/* Zoom controls */}
      <div className="absolute top-4 right-4 flex flex-col gap-2 z-50">
        <button
          onClick={() => setZoom((z) => Math.min(z * 1.2, 3))}
          className="w-10 h-10 bg-background border border-border rounded-lg shadow-lg hover:bg-accent transition-colors flex items-center justify-center text-lg font-bold"
          title="Zoom In"
        >
          +
        </button>
        <button
          onClick={() => setZoom((z) => Math.max(z * 0.8, 0.1))}
          className="w-10 h-10 bg-background border border-border rounded-lg shadow-lg hover:bg-accent transition-colors flex items-center justify-center text-lg font-bold"
          title="Zoom Out"
        >
          −
        </button>
        <button
          onClick={handleCenter}
          className="w-10 h-10 bg-background border border-border rounded-lg shadow-lg hover:bg-accent transition-colors flex items-center justify-center text-xs font-bold"
          title="Center View"
        >
          ⊙
        </button>
        <div className="w-10 h-10 bg-background border border-border rounded-lg shadow-lg flex items-center justify-center text-[10px] font-mono">
          {Math.round(zoom * 100)}%
        </div>
        {!readOnly && onUpdateComments && (
          <button
            onClick={handleAddComment}
            className="w-10 h-10 bg-background border border-border rounded-lg shadow-lg hover:bg-accent transition-colors flex items-center justify-center text-xl"
            title="Add Comment"
          >
            📝
          </button>
        )}
      </div>

      {/* Pan hint - only show in edit mode */}
      {!readOnly && (
        <div className="absolute top-4 left-4 bg-background/90 border border-border rounded-lg px-3 py-2 text-sm z-50">
          Space + Left Click to pan
        </div>
      )}

      <div
        ref={containerRef}
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "0 0",
          width: "100%",
          height: "100%",
          position: "absolute",
        }}
      >
        {/* SVG for connections - covers entire canvas area */}
        <svg
          ref={svgRef}
          className="absolute inset-0 pointer-events-none"
          style={{
            width: "100%",
            height: "100%",
            zIndex: 10,
            overflow: "visible"
          }}
        >
          {/* Render connections with smart routing */}
          {sortedConnections.map((connection, index) => {
            const sourceStep = steps.find((s) => s.id === connection.source_step_id);
            const targetStep = steps.find((s) => s.id === connection.target_step_id);
            if (!sourceStep || !targetStep) return null;

            const start = getOutputPositionWrapper(sourceStep, connection.output_name);
            const end = getInputPositionWrapper(targetStep);
            const isHovered = hoveredConnection === connection.id;
            const isStepHovered = hoveredStep && (connection.source_step_id === hoveredStep || connection.target_step_id === hoveredStep);
            const isHighlighted = isHovered || isStepHovered;

            const connConfig = connection.config || {
              color: "hsl(var(--primary))",
              style: "solid" as const
            };

            // Use calculated backward index for unique lane assignment
            const laneOffset = backwardConnectionIndices.get(connection.id) || 0;

            // Pass steps for obstacle avoidance
            const { path, endAngle, labelPos } = calculateSmartPath(start, end, steps, laneOffset);

            return (
              <g
                key={connection.id}
                className="group"
                onMouseEnter={() => setHoveredConnection(connection.id)}
                onMouseLeave={() => setHoveredConnection(null)}
              >
                {/* Invisible wide path for easier clicking */}
                <path
                  d={path}
                  stroke="transparent"
                  strokeWidth={isHighlighted ? "30" : "15"}
                  fill="none"
                  className={`pointer-events-auto ${readOnly ? "cursor-default" : "cursor-pointer"} ${connectingFrom ? "pointer-events-none" : ""}`}
                  onClick={(e) => {
                    if (readOnly) return;
                    e.stopPropagation();
                    setSelectedConnection(connection);
                  }}
                />
                {/* Shadow/outline for better visibility */}
                <path
                  d={path}
                  stroke={isHighlighted ? "hsl(var(--background))" : "hsl(var(--background))"}
                  strokeWidth={isHighlighted ? "8" : "6"}
                  fill="none"
                  className="pointer-events-none"
                  opacity={isHighlighted ? "1" : "0.8"}
                />
                {/* Main connection path */}
                <path
                  d={path}
                  stroke={connConfig.color}
                  strokeWidth={isHighlighted ? "4" : "3"}
                  strokeDasharray={connConfig.style === "dashed" ? "4,4" : "0"}
                  fill="none"
                  className="pointer-events-none"
                  style={{ filter: isHighlighted ? "brightness(1.2)" : "none" }}
                />
                {/* Flow animation - subtle moving dash */}
                <path
                  d={path}
                  stroke="white"
                  strokeWidth={isHighlighted ? "4" : "3"}
                  strokeDasharray="10 10"
                  fill="none"
                  className="pointer-events-none animate-flow opacity-30"
                />
                {/* Arrow */}
                <polygon
                  points={isHighlighted ? "-10,-6 2,0 -10,6" : "-8,-4 0,0 -8,4"}
                  fill={connConfig.color}
                  transform={`translate(${end.x}, ${end.y}) rotate(${endAngle})`}
                  className="pointer-events-none"
                  style={{ filter: isHighlighted ? "brightness(1.2)" : "none" }}
                />
                {/* Label */}
                {connection.output_name && connection.output_name !== "default" && (
                  <foreignObject
                    x={labelPos.x - 50}
                    y={labelPos.y - 12}
                    width={100}
                    height={24}
                    className="pointer-events-none overflow-visible"
                  >
                    <div className={`flex items-center justify-center w-full h-full transition-transform duration-200 ${isHighlighted ? 'scale-110' : ''}`}>
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-medium text-white shadow-sm border border-white/20 whitespace-nowrap max-w-[100px] truncate"
                        style={{
                          backgroundColor: connConfig.color,
                          filter: isHighlighted ? "brightness(1.2)" : "none",
                          boxShadow: isHighlighted ? "0 4px 12px -2px rgba(0,0,0,0.2)" : "none"
                        }}
                      >
                        {connection.output_name}
                      </span>
                    </div>
                  </foreignObject>
                )}
              </g>
            );
          })}

          {/* Temporary connection preview */}
          {connectingFrom && tempConnectionPos && (() => {
            const sourceStep = steps.find((s) => s.id === connectingFrom.stepId);
            if (!sourceStep) return null;
            const start = getOutputPositionWrapper(sourceStep, connectingFrom.outputName);
            const end = tempConnectionPos;
            const { path, endAngle } = calculateSmartPath(start, end, steps);
            return (
              <g>
                <path
                  d={path}
                  stroke="hsl(var(--primary))"
                  strokeWidth="2"
                  strokeDasharray="5,5"
                  fill="none"
                  opacity="0.7"
                />
                <polygon
                  points="-8,-4 0,0 -8,4"
                  fill="hsl(var(--primary))"
                  transform={`translate(${end.x}, ${end.y}) rotate(${endAngle})`}
                  className="pointer-events-none"
                  opacity="0.7"
                />
              </g>
            );
          })()}
        </svg>

        {/* Render workflow nodes */}
        {steps.map((step) => {
          const live = draggingStep === step.id ? (draggingPosRef.current || dragPosition) : null;
          const displayStep = live ? { ...step, position_x: live.x, position_y: live.y } : step;
          return (
            <WorkflowNode
              key={step.id}
              step={displayStep}
              isSelected={selectedStep?.id === step.id}
              isHighlighted={highlightedStepId === step.id}
              onMouseDown={(e) => handleMouseDown(e, step)}
              onDelete={() => onDeleteStep(step.id)}
              onEdit={() => onSelectStep(step)}
              onDuplicate={() => onDuplicateStep(step.id)}
              onStartConnection={handleStartConnection}
              onEndConnection={handleEndConnection}
              isConnecting={connectingFrom !== null}
              onMouseEnter={() => setHoveredStep(step.id)}
              onMouseLeave={() => setHoveredStep(null)}
              readOnly={readOnly}
              hideEditButton={hideEditButton}
            />
          );
        })}

        {/* Render canvas comments */}
        {comments.map((comment) => {
          const liveComment = draggingComment === comment.id && draggingCommentPosRef.current
            ? { ...comment, position_x: draggingCommentPosRef.current.x, position_y: draggingCommentPosRef.current.y }
            : comment;
          return (
            <CanvasComment
              key={comment.id}
              comment={liveComment}
              onUpdate={handleUpdateComment}
              onDelete={handleDeleteComment}
              onMouseDown={handleCommentMouseDown}
              readOnly={readOnly}
              isDragging={draggingComment === comment.id}
            />
          );
        })}
      </div>

      {/* Connection dialog */}
      {selectedConnection && (
        <ConnectionDialog
          open={true}
          config={selectedConnection.config || { color: "hsl(var(--primary))", style: "solid" }}
          onClose={() => setSelectedConnection(null)}
          onSave={(config) => {
            onUpdateConnection(selectedConnection.id, config);
            setSelectedConnection(null);
          }}
          onDelete={() => {
            onDeleteConnection(selectedConnection.id);
            setSelectedConnection(null);
          }}
        />
      )}
    </div>
  );
}
