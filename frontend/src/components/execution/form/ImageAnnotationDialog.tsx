import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas, FabricImage, PencilBrush, Textbox } from "fabric";
import type { FabricObject } from "fabric";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useLanguage } from "@/contexts/LanguageContext";
import { Loader2, MousePointer2, Pencil, Type, Undo2, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const MAX_EDIT_WIDTH = 1600;
const MAX_EDIT_HEIGHT = 1000;
const ANNOTATION_COLOR_PALETTE = [
  "#0f172a", // slate-900
  "#334155", // slate-700
  "#dc2626", // red-600
  "#ea580c", // orange-600
  "#ca8a04", // yellow-600
  "#16a34a", // green-600
  "#059669", // emerald-600
  "#0891b2", // cyan-600
  "#2563eb", // blue-600
  "#4f46e5", // indigo-600
  "#7c3aed", // violet-600
  "#a21caf", // fuchsia-700
  "#db2777", // pink-600
  "#be123c", // rose-700
  "#6b7280", // gray-500
  "#ffffff", // white
] as const;

export type ImageAnnotationTool = "draw" | "text" | "select";

export interface ImageAnnotationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string;
  filename: string;
  onSave: (file: File) => void | Promise<void>;
}

function buildOutputFilename(filename: string): string {
  const base = filename.replace(/[/\\?#]+/g, "_").replace(/^\.+/, "") || "image";
  const withoutExt = base.replace(/\.[^.]+$/i, "");
  return `${withoutExt || "image"}_edited.png`;
}

const loadImageElement = async (url: string): Promise<HTMLImageElement> => {
  const loadWithCrossOrigin = (crossOrigin?: "anonymous") =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      if (crossOrigin) {
        img.crossOrigin = crossOrigin;
      }
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("image_load"));
      img.src = url;
    });

  try {
    return await loadWithCrossOrigin("anonymous");
  } catch {
    // Some signed URLs do not expose CORS headers; fallback still lets editing work.
    return await loadWithCrossOrigin();
  }
};

const waitForUsableContainer = async (
  container: HTMLDivElement,
  signal: () => boolean,
): Promise<void> => {
  const started = Date.now();
  while (!signal()) {
    const rect = container.getBoundingClientRect();
    if (rect.width > 20 && rect.height > 20) return;
    if (Date.now() - started > 1500) return;
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  }
};

export function ImageAnnotationDialog({
  open,
  onOpenChange,
  imageUrl,
  filename,
  onSave,
}: ImageAnnotationDialogProps) {
  const { t } = useLanguage();
  const tRef = useRef(t);
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const fabricRef = useRef<Canvas | null>(null);
  const backgroundRef = useRef<FabricImage | null>(null);
  const [canvasReady, setCanvasReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [exportHint, setExportHint] = useState<string | null>(null);
  const [tool, setTool] = useState<ImageAnnotationTool>("draw");
  const [strokeColor, setStrokeColor] = useState("#e11d48");
  const [strokeWidth, setStrokeWidth] = useState(4);

  const str = useCallback((key: string) => String(t(`imageAnnotation.${key}`)), [t]);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  useEffect(() => {
    if (!open) {
      setTool("draw");
      setCanvasReady(false);
      setLoading(false);
      setSaving(false);
      setLoadError(null);
      setExportHint(null);
      return;
    }

    const container = containerEl;
    if (!container || !imageUrl) return;

    let cancelled = false;
    let createdCanvas: Canvas | null = null;
    let createdCanvasEl: HTMLCanvasElement | null = null;

    const run = async () => {
      setLoading(true);
      setCanvasReady(false);
      setLoadError(null);
      setExportHint(null);
      try {
        await waitForUsableContainer(container, () => cancelled);
        if (cancelled) return;

        const imgEl = await loadImageElement(imageUrl);
        if (cancelled) return;

        const iw = imgEl.naturalWidth || imgEl.width;
        const ih = imgEl.naturalHeight || imgEl.height;
        if (!iw || !ih) throw new Error("image_size");

        const isSmallScreen = window.innerWidth < 640;
        const maxW = Math.min(
          MAX_EDIT_WIDTH,
          Math.max(isSmallScreen ? 280 : 320, window.innerWidth - (isSmallScreen ? 24 : 80)),
        );
        const maxH = Math.min(
          MAX_EDIT_HEIGHT,
          Math.max(isSmallScreen ? 280 : 240, window.innerHeight * (isSmallScreen ? 0.62 : 0.5)),
        );
        const scale = Math.min(maxW / iw, maxH / ih, 1);
        const cw = Math.round(iw * scale);
        const ch = Math.round(ih * scale);

        const el = document.createElement("canvas");
        el.className = "max-w-full touch-none";
        container.appendChild(el);
        createdCanvasEl = el;

        const canvas = new Canvas(el, {
          width: cw,
          height: ch,
          enableRetinaScaling: true,
        });
        createdCanvas = canvas;

        const bg = new FabricImage(imgEl, {
          originX: "center",
          originY: "center",
          left: cw / 2,
          top: ch / 2,
          selectable: false,
          evented: false,
          hasControls: false,
          hasBorders: false,
          lockMovementX: true,
          lockMovementY: true,
        });
        bg.set({ scaleX: scale, scaleY: scale });
        canvas.add(bg);
        canvas.sendObjectToBack(bg);
        backgroundRef.current = bg;

        const brush = new PencilBrush(canvas);
        brush.color = strokeColor;
        brush.width = strokeWidth;
        canvas.freeDrawingBrush = brush;
        canvas.isDrawingMode = true;

        fabricRef.current = canvas;
        if (!cancelled) {
          setCanvasReady(true);
        }
      } catch {
        if (!cancelled) {
          setLoadError(String(tRef.current("imageAnnotation.inlineLoadFailure")));
          toast({
            title: String(tRef.current("imageAnnotation.loadFailedTitle")),
            description: String(tRef.current("imageAnnotation.loadFailedDescription")),
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
      backgroundRef.current = null;
      fabricRef.current = null;
      if (createdCanvas) {
        void createdCanvas.dispose();
        createdCanvas = null;
      }
      if (createdCanvasEl && createdCanvasEl.parentNode) {
        createdCanvasEl.parentNode.removeChild(createdCanvasEl);
      }
      createdCanvasEl = null;
      if (container) {
        // Defensive: drop any leftover Fabric wrapper nodes from the host container.
        while (container.firstChild) {
          container.removeChild(container.firstChild);
        }
      }
    };
  }, [open, imageUrl, onOpenChange, containerEl]);

  useEffect(() => {
    const c = fabricRef.current;
    if (!c || !canvasReady) return;

    if (tool === "draw") {
      c.isDrawingMode = true;
      const brush = new PencilBrush(c);
      brush.color = strokeColor;
      brush.width = strokeWidth;
      c.freeDrawingBrush = brush;
      c.defaultCursor = "crosshair";
    } else {
      c.isDrawingMode = false;
      c.defaultCursor = tool === "text" ? "text" : "default";
    }
    c.requestRenderAll();
  }, [tool, strokeColor, strokeWidth, canvasReady]);

  useEffect(() => {
    const c = fabricRef.current;
    if (!c || !canvasReady || tool !== "text") return;

    const handler = (opt: { target?: FabricObject; e: Event }) => {
      if (opt.target) return;
      const ev = opt.e as PointerEvent | MouseEvent;
      const p = c.getPointer(ev);
      const label = str("defaultText");
      const tb = new Textbox(label, {
        left: p.x,
        top: p.y,
        fontSize: 20,
        fill: strokeColor,
        width: Math.min(280, c.getWidth() - p.x - 8),
        editable: true,
      });
      c.add(tb);
      c.setActiveObject(tb);
      // Enter text-edit mode on next frame so Fabric has mounted controls/textarea.
      window.requestAnimationFrame(() => {
        tb.enterEditing();
        tb.hiddenTextarea?.focus();
        tb.selectAll();
      });
      c.requestRenderAll();
      setTool("select");
    };

    c.on("mouse:down", handler);
    return () => {
      c.off("mouse:down", handler);
    };
  }, [tool, canvasReady, strokeColor, str]);

  useEffect(() => {
    const c = fabricRef.current;
    if (!c || !canvasReady) return;

    const onDblClick = (opt: { target?: FabricObject }) => {
      const target = opt.target;
      if (!(target instanceof Textbox)) return;
      c.setActiveObject(target);
      window.requestAnimationFrame(() => {
        target.enterEditing();
        target.hiddenTextarea?.focus();
        target.selectAll();
      });
      c.requestRenderAll();
    };

    c.on("mouse:dblclick", onDblClick);
    return () => {
      c.off("mouse:dblclick", onDblClick);
    };
  }, [canvasReady]);

  const handleUndo = () => {
    const c = fabricRef.current;
    const bg = backgroundRef.current;
    if (!c || !bg) return;
    const objs = c.getObjects();
    if (objs.length <= 1) return;
    const last = objs[objs.length - 1];
    if (last === bg) return;
    c.remove(last);
    c.discardActiveObject();
    c.requestRenderAll();
  };

  const handleClearAnnotations = () => {
    const c = fabricRef.current;
    const bg = backgroundRef.current;
    if (!c || !bg) return;
    const toRemove = c.getObjects().filter((o) => o !== bg);
    c.remove(...toRemove);
    c.discardActiveObject();
    c.requestRenderAll();
  };

  const handleSave = async () => {
    const c = fabricRef.current;
    if (!c) return;
    setSaving(true);
    try {
      const wasDrawing = c.isDrawingMode;
      c.isDrawingMode = false;
      c.discardActiveObject();
      c.requestRenderAll();

      const blob = await c.toBlob({ format: "png", multiplier: 1 });
      if (!blob) {
        throw new Error("export");
      }
      const outName = buildOutputFilename(filename);
      const file = new File([blob], outName, { type: "image/png" });
      await onSave(file);
      c.isDrawingMode = wasDrawing;
      onOpenChange(false);
    } catch {
      setExportHint(str("inlineExportFailure"));
      toast({
        title: str("exportFailedTitle"),
        description: str("exportFailedDescription"),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
      <DialogContent
        className="h-[100dvh] max-h-[100dvh] w-screen max-w-none gap-3 overflow-y-auto rounded-none border-0 p-3 sm:h-auto sm:max-h-[92vh] sm:w-full sm:max-w-[min(95vw,1100px)] sm:rounded-lg sm:border sm:p-6"
        onInteractOutside={(e) => {
          // Keep editor open when Fabric focuses its hidden textarea outside dialog subtree.
          e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (saving) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{str("title")}</DialogTitle>
          <DialogDescription>{str("dialogDescription")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <ToggleGroup
            type="single"
            value={tool}
            onValueChange={(v) => {
              if (v) setTool(v as ImageAnnotationTool);
            }}
            disabled={!canvasReady || loading || saving}
            className="justify-start"
          >
            <ToggleGroupItem
              value="draw"
              aria-label={str("toolDraw")}
              title={str("toolDraw")}
              className="h-10 w-10"
            >
              <Pencil className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem
              value="text"
              aria-label={str("toolText")}
              title={str("toolText")}
              className="h-10 w-10"
            >
              <Type className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem
              value="select"
              aria-label={str("toolSelect")}
              title={str("toolSelect")}
              className="h-10 w-10"
            >
              <MousePointer2 className="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap">{str("color")}</Label>
              <div className="grid grid-cols-8 gap-1.5 sm:gap-1.5">
                {ANNOTATION_COLOR_PALETTE.map((color) => {
                  const isSelected = strokeColor.toLowerCase() === color.toLowerCase();
                  return (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setStrokeColor(color)}
                      disabled={!canvasReady || loading || saving}
                      className={`h-7 w-7 rounded-full border sm:h-5 sm:w-5 ${
                        color === "#ffffff" ? "border-slate-300" : "border-transparent"
                      } ${isSelected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}
                      style={{ backgroundColor: color }}
                      aria-label={`${str("color")} ${color}`}
                      aria-pressed={isSelected}
                    />
                  );
                })}
              </div>
            </div>
            <div className="flex min-w-[160px] max-w-[260px] flex-1 flex-col gap-1">
              <Label className="text-xs">{str("strokeWidth")}</Label>
              <Slider
                value={[strokeWidth]}
                min={1}
                max={48}
                step={1}
                onValueChange={(v) => setStrokeWidth(v[0] ?? 4)}
                disabled={!canvasReady || loading || saving}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10"
              onClick={handleUndo}
              disabled={!canvasReady || loading || saving}
              title={str("undo")}
            >
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10"
              onClick={handleClearAnnotations}
              disabled={!canvasReady || loading || saving}
              title={str("clearAnnotations")}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="relative flex min-h-[260px] justify-center overflow-auto rounded-md border bg-muted/30 p-2 sm:min-h-[200px]">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}
          <div ref={setContainerEl} className="flex items-center justify-center" />
        </div>
        {loadError ? <p className="text-sm text-destructive">{loadError}</p> : null}
        {exportHint && !loadError ? <p className="text-xs text-muted-foreground">{exportHint}</p> : null}
        <p className="text-xs text-muted-foreground">{str("supportedFormatsHint")}</p>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {str("cancel")}
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={!canvasReady || loading || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : str("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
