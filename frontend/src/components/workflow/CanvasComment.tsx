import { useState, useRef, useEffect } from "react";
import { Trash2, Edit2, GripVertical, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";

export interface CanvasCommentData {
  id: string;
  content: string;
  position_x: number;
  position_y: number;
  color?: string;
  width?: number;
  height?: number;
}

interface CanvasCommentProps {
  comment: CanvasCommentData;
  onUpdate: (comment: CanvasCommentData) => void;
  onDelete: (id: string) => void;
  onMouseDown: (e: React.MouseEvent, comment: CanvasCommentData) => void;
  readOnly?: boolean;
  isDragging?: boolean;
}

const STICKY_NOTE_COLORS = [
  { name: "Yellow", value: "#fef08a" },
  { name: "Pink", value: "#fbcfe8" },
  { name: "Blue", value: "#bfdbfe" },
  { name: "Green", value: "#bbf7d0" },
  { name: "Orange", value: "#fed7aa" },
  { name: "Purple", value: "#e9d5ff" },
];

export function CanvasComment({
  comment,
  onUpdate,
  onDelete,
  onMouseDown,
  readOnly = false,
  isDragging = false,
}: CanvasCommentProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const commentRef = useRef<HTMLDivElement>(null);

  const color = comment.color || "#fef08a";
  const width = comment.width || 200;
  const height = comment.height || 150;

  // Ensure positions are valid numbers for CSS
  const safePositionX = typeof comment.position_x === 'number' && !isNaN(comment.position_x) ? comment.position_x : 0;
  const safePositionY = typeof comment.position_y === 'number' && !isNaN(comment.position_y) ? comment.position_y : 0;

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(editContent.length, editContent.length);
    }
  }, [isEditing]);

  const handleSave = () => {
    onUpdate({
      ...comment,
      content: editContent.trim(),
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditContent(comment.content);
    setIsEditing(false);
  };

  const handleColorChange = (newColor: string) => {
    onUpdate({
      ...comment,
      color: newColor,
    });
    setShowColorPicker(false);
  };

  const handleResize = (e: React.MouseEvent) => {
    if (readOnly) return;
    e.stopPropagation();
    
    const startX = e.clientX;
    const startY = e.clientY;
    const startWidth = width;
    const startHeight = height;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      const newWidth = Math.max(150, startWidth + deltaX);
      const newHeight = Math.max(100, startHeight + deltaY);

      onUpdate({
        ...comment,
        width: newWidth,
        height: newHeight,
      });
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  return (
    <div
      ref={commentRef}
      className={`absolute group ${isDragging ? "opacity-50" : ""}`}
      style={{
        left: `${safePositionX}px`,
        top: `${safePositionY}px`,
        width: `${width}px`,
        height: `${height}px`,
        zIndex: 5,
      }}
    >
      {/* Sticky note */}
      <div
        className="relative h-full rounded-lg shadow-lg border-2 border-gray-300 overflow-hidden"
        style={{
          backgroundColor: color,
          boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.2), 0 2px 4px -1px rgba(0, 0, 0, 0.1)",
        }}
      >
        {/* Header - drag handle */}
        {!readOnly && (
          <div
            className="absolute top-0 left-0 right-0 h-8 bg-black/5 border-b border-black/10 flex items-center justify-between px-2 cursor-move"
            onMouseDown={(e) => onMouseDown(e, comment)}
          >
            <div className="flex items-center gap-1 text-gray-600">
              <GripVertical className="h-4 w-4" />
            </div>
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {!isEditing && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 hover:bg-black/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowColorPicker(!showColorPicker);
                    }}
                  >
                    <div className="w-4 h-4 rounded-full border-2 border-gray-600" style={{ backgroundColor: color }} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 hover:bg-black/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsEditing(true);
                    }}
                  >
                    <Edit2 className="h-3 w-3 text-gray-600" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 hover:bg-red-500/20"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(comment.id);
                    }}
                  >
                    <Trash2 className="h-3 w-3 text-red-600" />
                  </Button>
                </>
              )}
              {isEditing && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 hover:bg-green-500/20"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSave();
                    }}
                  >
                    <Check className="h-3 w-3 text-green-600" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 hover:bg-red-500/20"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCancel();
                    }}
                  >
                    <X className="h-3 w-3 text-red-600" />
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Color picker dropdown */}
        {showColorPicker && (
          <div
            className="absolute top-8 right-2 bg-white rounded-lg shadow-xl border border-gray-200 p-2 z-50"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="grid grid-cols-3 gap-2">
              {STICKY_NOTE_COLORS.map((c) => (
                <button
                  key={c.value}
                  className="w-8 h-8 rounded-lg border-2 border-gray-300 hover:scale-110 transition-transform"
                  style={{ backgroundColor: c.value }}
                  onClick={() => handleColorChange(c.value)}
                  title={c.name}
                />
              ))}
            </div>
          </div>
        )}

        {/* Content area */}
        <div className={`h-full ${readOnly ? "p-3" : "pt-10 p-3"} overflow-y-auto`}>
          {isEditing ? (
            <textarea
              ref={textareaRef}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full h-full bg-transparent border-none outline-none resize-none text-sm text-gray-800 placeholder-gray-500"
              placeholder="Write your comment here... (Markdown supported)"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div className="prose prose-sm max-w-none text-gray-800 markdown-content">
              <ReactMarkdown>{comment.content || "*Empty comment*"}</ReactMarkdown>
            </div>
          )}
        </div>

        {/* Resize handle */}
        {!readOnly && !isEditing && (
          <div
            className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize opacity-0 group-hover:opacity-100 transition-opacity"
            onMouseDown={handleResize}
          >
            <div className="absolute bottom-1 right-1 w-3 h-3 border-r-2 border-b-2 border-gray-400" />
          </div>
        )}
      </div>
    </div>
  );
}
