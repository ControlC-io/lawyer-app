import { useRef, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Pen, X, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SignatureFieldProps {
  field: any;
  value: any;
  onChange: (value: any) => void;
  onUpload: (file: File) => void;
  onView?: (url: string, name: string, path: string) => void;
  labelPosition?: "top" | "side";
  disabled?: boolean;
  required?: boolean;
  isUploading?: boolean;
  signedUrl?: string;
  primaryColor?: string;
}

export const SignatureField = ({
  field,
  value,
  onChange,
  onUpload,
  onView,
  disabled,
  required,
  labelPosition = "top",
  isUploading,
  signedUrl,
  primaryColor,
}: SignatureFieldProps) => {
  const wrapperStyle = primaryColor ? ({ "--portal-primary": primaryColor } as React.CSSProperties) : undefined;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size - use fixed dimensions for consistency
    const canvasWidth = canvas.offsetWidth || 600;
    const canvasHeight = 300;
    canvas.width = canvasWidth * window.devicePixelRatio;
    canvas.height = canvasHeight * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Set drawing styles
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // If there's an existing signature, load it
    if (value && signedUrl) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        const aspectRatio = img.width / img.height;
        let drawWidth = canvasWidth;
        let drawHeight = canvasHeight;

        if (aspectRatio > 1) {
          drawHeight = canvasWidth / aspectRatio;
        } else {
          drawWidth = canvasHeight * aspectRatio;
        }

        const x = (canvasWidth - drawWidth) / 2;
        const y = (canvasHeight - drawHeight) / 2;

        ctx.drawImage(img, x, y, drawWidth, drawHeight);
        setHasSignature(true);
      };
      img.onerror = () => {
        // If image fails to load, just clear the canvas
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        setHasSignature(false);
      };
      img.src = signedUrl;
    } else if (!value) {
      // Clear canvas if no value
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      setHasSignature(false);
    }
  }, [value, signedUrl]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (disabled || isUploading) return;
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || disabled || isUploading) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = "touches" in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = "touches" in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
      setHasSignature(true);
      saveSignature();
    }
  };

  const saveSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `signature_${Date.now()}.png`, { type: "image/png" });
        onUpload(file);
      }
    }, "image/png");
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    onChange(null);
  };

  return (
    <div className={cn("space-y-1.5 w-full", labelPosition === "side" && "flex items-start gap-4")} style={wrapperStyle}>
      <Label className={cn(
        "text-sm font-medium flex items-center gap-1",
        labelPosition === "side" && "min-w-[120px] pt-2"
      )}>
        {field.label || field.name || field.id}
        {required && <span className="text-destructive">*</span>}
      </Label>

      <div className={cn("space-y-2", labelPosition === "side" && "flex-1")}>
        <div className="relative border-2 border-dashed rounded-lg bg-white overflow-hidden">
          <canvas
            ref={canvasRef}
            className="w-full h-[300px] cursor-crosshair touch-none"
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={stopDrawing}
            style={{ touchAction: "none" }}
          />
          {!hasSignature && !value && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center text-muted-foreground">
                <Pen className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Sign here</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {value && (
            <>
              {!disabled && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={clearSignature}
                  disabled={isUploading}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear
                </Button>
              )}
            </>
          )}
          {isUploading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Uploading signature...</span>
            </div>
          )}
        </div>
      </div>

      {field.description && (
        <p className="text-xs text-muted-foreground">{field.description}</p>
      )}
    </div>
  );
};

