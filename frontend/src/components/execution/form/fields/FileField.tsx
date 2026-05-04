import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, Upload, File, Eye, X, Camera, Video, PenLine, Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "@/hooks/use-toast";
import { ImageAnnotationDialog } from "../ImageAnnotationDialog";
import { useLanguage } from "@/contexts/LanguageContext";

interface FileFieldProps {
  field: any;
  value: any; // File path string or object with value and original_name
  onChange: (value: any) => void;
  onUpload: (file: File) => void;
  onView: (url: string, name: string, path: string) => void;
  onDelete?: (filePath: string) => Promise<void>; // Optional function to delete file from storage
  disabled?: boolean;
  required?: boolean;
  isUploading?: boolean;
  signedUrl?: string;
  primaryColor?: string;
  labelPosition?: "top" | "side" | "hidden";
}

// MIME types and corresponding extensions for native file picker (accept attribute).
// Including both helps OS file dialogs grey out / filter invalid files.
const MIME_TO_EXTENSIONS: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/gif": [".gif"],
  "image/webp": [".webp"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
};

// Helper function to convert allowed_file_types to accept attribute (MIME + extensions so native picker greys out invalid files)
const getAcceptAttribute = (allowedTypes?: string[]): string => {
  if (!allowedTypes || allowedTypes.length === 0) {
    return ""; // Allow all file types
  }
  if (allowedTypes.some((t) => t?.toLowerCase() === "all")) {
    return ""; // "All" means no restriction
  }

  const mimeTypeMap: Record<string, string[]> = {
    image: ["image/*"],
    pdf: ["application/pdf"],
    document: ["application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    video: ["video/*"],
    audio: ["audio/*"],
  };

  const extToMime: Record<string, string> = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };

  const parts = new Set<string>();
  allowedTypes.forEach((type) => {
    if (mimeTypeMap[type.toLowerCase()]) {
      mimeTypeMap[type.toLowerCase()].forEach((mime) => {
        parts.add(mime);
        (MIME_TO_EXTENSIONS[mime] ?? []).forEach((ext) => parts.add(ext));
      });
    } else if (type.startsWith(".")) {
      const ext = type.toLowerCase();
      parts.add(ext);
      if (extToMime[ext.substring(1)]) {
        parts.add(extToMime[ext.substring(1)]);
      }
    } else {
      parts.add(type);
      if (MIME_TO_EXTENSIONS[type]) {
        MIME_TO_EXTENSIONS[type].forEach((ext) => parts.add(ext));
      }
    }
  });

  return [...parts].join(",");
};

// Helper function to validate file type
const validateFileType = (file: File, allowedTypes?: string[]): boolean => {
  if (!allowedTypes || allowedTypes.length === 0) {
    return true; // No restrictions
  }
  if (allowedTypes.some((t) => t?.toLowerCase() === "all")) {
    return true; // "All" means allow any file type
  }

  const fileExtension = "." + file.name.split(".").pop()?.toLowerCase();
  const fileMimeType = file.type.toLowerCase();

  return allowedTypes.some((type) => {
    const normalizedType = type.toLowerCase();
    
    // Check for special types
    if (normalizedType === "image") {
      return fileMimeType.startsWith("image/");
    }
    if (normalizedType === "pdf") {
      return fileMimeType === "application/pdf" || fileExtension === ".pdf";
    }
    if (normalizedType === "document") {
      return fileMimeType.includes("word") || fileMimeType.includes("excel") || 
             fileMimeType.includes("spreadsheet") || fileExtension.match(/\.(doc|docx|xls|xlsx)$/);
    }
    if (normalizedType === "video") {
      if (fileMimeType.startsWith("video/")) return true;
      return /\.(mp4|webm|mov|mkv|m4v|3gp|3g2)$/i.test(file.name);
    }
    if (normalizedType === "audio") {
      return fileMimeType.startsWith("audio/");
    }
    
    // Check for file extension match
    if (type.startsWith(".")) {
      return fileExtension === normalizedType;
    }
    
    // Check for MIME type match
    return fileMimeType === normalizedType || fileMimeType.includes(normalizedType);
  });
};

const portalFileTriggerProps = (primaryColor?: string) =>
  primaryColor ? { "data-portal-file-trigger": "" as const } : {};

const getUploadButtonLabel = (allowedTypes?: string[]): string => {
  if (!allowedTypes || allowedTypes.length === 0) {
    return "Upload File";
  }

  const normalizedTypes = Array.from(
    new Set(
      allowedTypes
        .map((type) => type?.toLowerCase().trim())
        .filter((type): type is string => Boolean(type)),
    ),
  );

  if (normalizedTypes.length === 0 || normalizedTypes.includes("all")) {
    return "Upload File";
  }

  if (normalizedTypes.length !== 1) {
    return "Upload File";
  }

  const [onlyType] = normalizedTypes;
  if (onlyType === "image" || onlyType.startsWith("image/")) {
    return "Upload Photo";
  }
  if (onlyType === "video" || onlyType.startsWith("video/")) {
    return "Upload Video";
  }
  if (onlyType === "pdf" || onlyType === "application/pdf" || onlyType === ".pdf") {
    return "Upload PDF";
  }

  return "Upload File";
};

/** Filename or path segment — used for inline image preview */
const looksLikeImageFilename = (nameOrPath: string): boolean => {
  if (!nameOrPath) return false;
  const base = nameOrPath.split("?")[0].split("/").pop() || "";
  return /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(base);
};

/** Raster images only — SVG is not supported in the bitmap editor */
const looksLikeRasterImageFilename = (nameOrPath: string): boolean => {
  if (!nameOrPath) return false;
  const base = nameOrPath.split("?")[0].split("/").pop() || "";
  return /\.(png|jpe?g|gif|webp|bmp|avif)$/i.test(base);
};

const coerceFileValueObject = (raw: unknown): Record<string, unknown> => {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return { ...(raw as Record<string, unknown>) };
  }
  return {};
};

/** Last-dot split: `report.tar.gz` → stem `report.tar`, extension `.gz`. */
const splitStemAndExtension = (displayName: string): { stem: string; extension: string } => {
  const base = displayName.split("/").pop()?.split("?")[0] ?? displayName;
  const lastDot = base.lastIndexOf(".");
  if (lastDot <= 0 || lastDot >= base.length - 1) {
    return { stem: base, extension: "" };
  }
  return { stem: base.slice(0, lastDot), extension: base.slice(lastDot) };
};

export const FileField = ({
  field,
  value,
  onChange,
  onUpload,
  onView,
  onDelete,
  disabled,
  required,
  isUploading,
  signedUrl,
  primaryColor,
  labelPosition = "top"
}: FileFieldProps) => {
  const { t } = useLanguage();
  const fileTriggerProps = portalFileTriggerProps(primaryColor);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoCameraInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();
  const [annotateOpen, setAnnotateOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [stemDraft, setStemDraft] = useState("");
  const [lockedExtension, setLockedExtension] = useState("");
  const getFileName = (filePath: string, originalName?: string) => {
    // If we have the original name stored, use it
    if (originalName) {
      return originalName;
    }
    
    if (!filePath || typeof filePath !== 'string') return "Uploaded file";
    try {
      // Extract filename from path
      const pathWithoutQuery = filePath.split('?')[0];
      const fileNameWithTimestamp = pathWithoutQuery.split('/').pop() || "";
      const fileName = fileNameWithTimestamp.replace(/^\d+_/, '');
      return fileName;
    } catch (error) {
      // If extraction fails, return default
      const pathWithoutQuery = filePath.split('?')[0];
      return pathWithoutQuery.split('/').pop()?.replace(/^\d+_/, '') || "Uploaded file";
    }
  };

  // Extract file path and original name from value; only treat non-empty string as valid path
  const rawPath = typeof value === 'string' ? value : (value?.value ?? value);
  const filePath =
    typeof rawPath === 'string' && rawPath.length > 0 ? rawPath : null;
  const originalName = typeof value === "string" ? undefined : value?.original_name;
  const fileName = filePath ? getFileName(filePath, originalName) : "";
  const showImagePreview =
    Boolean(filePath && signedUrl && looksLikeImageFilename(fileName || filePath));

  useEffect(() => {
    setIsRenaming(false);
    setAnnotateOpen(false);
  }, [filePath]);

  useEffect(() => {
    if (isRenaming) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [isRenaming]);

  const allowedTypes: string[] | undefined = field.allowed_file_types;
  const acceptAttribute = getAcceptAttribute(allowedTypes);
  const uploadButtonLabel = getUploadButtonLabel(allowedTypes);
  const typeAllows = (token: "image" | "video") =>
    !allowedTypes ||
    allowedTypes.length === 0 ||
    allowedTypes.some((type) => {
      const x = type.toLowerCase();
      if (x === "all") return true;
      if (token === "image") return x === "image" || x.startsWith("image/");
      return x === "video" || x.startsWith("video/");
    });
  const allowsImages = typeAllows("image");
  const allowsVideos = typeAllows("video");
  const showMobileCaptureRow = isMobile && (allowsImages || allowsVideos);
  const canAnnotateImage =
    allowsImages &&
    Boolean(filePath && signedUrl && looksLikeRasterImageFilename(fileName || filePath)) &&
    !disabled;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (validateFileType(file, allowedTypes)) {
        onUpload(file);
      } else {
        toast({
          title: "Invalid file type",
          description: `File "${file.name}" is not allowed. Allowed types: ${allowedTypes?.join(", ") || "all"}`,
          variant: "destructive",
        });
      }
    }
    // Reset input
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    if (cameraInputRef.current) {
      cameraInputRef.current.value = "";
    }
    if (videoCameraInputRef.current) {
      videoCameraInputRef.current.value = "";
    }
  };

  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileChange(e);
  };

  const handleRemove = async () => {
    // Delete from backend/storage first when callback is provided; only clear UI on success
    if (onDelete && filePath) {
      try {
        await onDelete(filePath);
      } catch (error) {
        console.error('Error deleting file:', error);
        toast({
          title: "Error deleting file",
          description: "File could not be deleted. It will remain in the form.",
          variant: "destructive",
        });
        return;
      }
    }

    // Remove from UI and update state (only reached when delete succeeded or no onDelete)
    onChange(null);
  };

  const persistDisplayName = (nextOriginalName: string) => {
    if (!filePath) return;
    onChange({
      ...coerceFileValueObject(value),
      value: filePath,
      original_name: nextOriginalName,
    });
  };

  const persistStemAndExtension = (stem: string) => {
    if (!filePath) return;
    const ext = lockedExtension;
    const trimmedStem = stem.trim();
    const fallbackFull = getFileName(filePath);
    const { stem: fallbackStem } = splitStemAndExtension(fallbackFull);
    const finalStem = trimmedStem.length > 0 ? trimmedStem : fallbackStem || "file";
    persistDisplayName(finalStem + ext);
  };

  const toggleRenaming = () => {
    if (disabled || !filePath) return;
    if (isRenaming) {
      persistStemAndExtension(stemDraft);
      setIsRenaming(false);
      return;
    }
    const { stem, extension } = splitStemAndExtension(fileName);
    setLockedExtension(extension);
    setStemDraft(stem);
    setIsRenaming(true);
  };

  const handleRenameBlur = () => {
    if (!isRenaming || !filePath || disabled) return;
    persistStemAndExtension(stemDraft);
    setIsRenaming(false);
  };

  return (
    <div className="space-y-1.5 w-full">
      {canAnnotateImage && (
        <ImageAnnotationDialog
          open={annotateOpen}
          onOpenChange={setAnnotateOpen}
          imageUrl={signedUrl!}
          filename={fileName || filePath || "image.png"}
          onSave={(file) => {
            void Promise.resolve(onUpload(file));
          }}
        />
      )}
      {labelPosition !== "hidden" && (
        <Label className="text-sm font-medium flex items-center gap-1">
          {field.label || field.name || field.id}
          {required && <span className="text-destructive">*</span>}
        </Label>
      )}

      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
          disabled={disabled || isUploading}
          accept={acceptAttribute}
        />
        {isMobile && allowsImages && (
          <Input
            ref={cameraInputRef}
            type="file"
            className="hidden"
            onChange={handleCameraCapture}
            disabled={disabled || isUploading}
            accept="image/*"
            capture="environment"
          />
        )}
        {isMobile && allowsVideos && (
          <Input
            ref={videoCameraInputRef}
            type="file"
            className="hidden"
            onChange={handleCameraCapture}
            disabled={disabled || isUploading}
            accept="video/*"
            capture="environment"
          />
        )}

        {filePath ? (
          <div className="flex min-w-0 flex-1 flex-wrap items-start gap-3 rounded-md border bg-muted/50 p-2 sm:flex-nowrap sm:items-center">
            {showImagePreview ? (
              <img
                src={signedUrl}
                alt={fileName ? `Preview: ${fileName}` : "File preview"}
                className="h-28 w-28 shrink-0 rounded-md border bg-background object-contain p-1 sm:h-36 sm:w-36"
              />
            ) : (
              <File className="h-8 w-8 shrink-0 text-muted-foreground sm:h-10 sm:w-10" />
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-1">
                  {!disabled && (
                    <Button
                      type="button"
                      variant={isRenaming ? "secondary" : "ghost"}
                      size="icon"
                      className="h-8 w-8"
                      onMouseDown={(e) => {
                        // Avoid input blur firing first (would persist + exit rename, then click would re-open).
                        if (isRenaming) e.preventDefault();
                      }}
                      onClick={() => toggleRenaming()}
                      title={isRenaming ? "Done renaming" : "Rename file"}
                    >
                      <PenLine className="h-4 w-4" />
                    </Button>
                  )}
                  {isRenaming && !disabled ? (
                    <div className="flex min-w-0 flex-1 items-center gap-0.5 rounded-md border border-input bg-background px-2 py-1">
                      <Input
                        ref={renameInputRef}
                        type="text"
                        className="h-8 min-w-0 flex-1 border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                        value={stemDraft}
                        onChange={(e) => setStemDraft(e.target.value)}
                        onBlur={handleRenameBlur}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            (e.target as HTMLInputElement).blur();
                          }
                          if (e.key === "Escape") {
                            e.preventDefault();
                            const { stem } = splitStemAndExtension(fileName);
                            setStemDraft(stem);
                            setIsRenaming(false);
                          }
                        }}
                        title="File name (without extension)"
                        aria-label="File name without extension"
                      />
                      {lockedExtension ? (
                        <span className="shrink-0 select-none text-sm tabular-nums text-muted-foreground">
                          {lockedExtension}
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-sm" title={fileName}>
                      {fileName}
                    </span>
                  )}
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-1">
                  {canAnnotateImage && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setAnnotateOpen(true)}
                      title={String(t("imageAnnotation.title"))}
                      aria-label={String(t("imageAnnotation.title"))}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  {signedUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => onView(signedUrl, fileName, filePath)}
                      title="View file"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  )}
                  {!disabled && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={handleRemove}
                      title="Remove file"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : showMobileCaptureRow ? (
            <div className="flex flex-wrap gap-2 w-full">
              <Button
                type="button"
                variant="outline"
                className="flex-1 min-w-[7rem] portal-primary-btn"
                onClick={() => inputRef.current?.click()}
                disabled={disabled || isUploading}
                data-portal-color={primaryColor ? "true" : undefined}
                {...fileTriggerProps}
              >
                {isUploading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                {isUploading ? "Uploading..." : uploadButtonLabel}
              </Button>
              {allowsImages && (
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 min-w-[7rem] portal-primary-btn"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={disabled || isUploading}
                  data-portal-color={primaryColor ? "true" : undefined}
                  {...fileTriggerProps}
                >
                  {isUploading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Camera className="h-4 w-4 mr-2" />
                  )}
                  {isUploading ? "Uploading..." : "Camera"}
                </Button>
              )}
              {allowsVideos && (
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 min-w-[7rem] portal-primary-btn"
                  onClick={() => videoCameraInputRef.current?.click()}
                  disabled={disabled || isUploading}
                  data-portal-color={primaryColor ? "true" : undefined}
                  {...fileTriggerProps}
                >
                  {isUploading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Video className="h-4 w-4 mr-2" />
                  )}
                  {isUploading ? "Uploading..." : "Record video"}
                </Button>
              )}
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="w-full portal-primary-btn"
              onClick={() => inputRef.current?.click()}
              disabled={disabled || isUploading}
              data-portal-color={primaryColor ? "true" : undefined}
              {...fileTriggerProps}
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              {isUploading ? "Uploading..." : uploadButtonLabel}
            </Button>
        )}
      </div>

      {field.description && (
        <p className="text-xs text-muted-foreground">{field.description}</p>
      )}
    </div>
  );
};

