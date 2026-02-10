import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, Upload, File, Eye, X, Camera } from "lucide-react";
import { useRef } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "@/hooks/use-toast";

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
}

// Helper function to convert allowed_file_types to accept attribute
const getAcceptAttribute = (allowedTypes?: string[]): string => {
  if (!allowedTypes || allowedTypes.length === 0) {
    return ""; // Allow all file types
  }

  const mimeTypeMap: Record<string, string[]> = {
    image: ["image/*"],
    pdf: ["application/pdf"],
    document: ["application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    video: ["video/*"],
    audio: ["audio/*"],
  };

  const acceptTypes: string[] = [];
  allowedTypes.forEach((type) => {
    if (mimeTypeMap[type.toLowerCase()]) {
      acceptTypes.push(...mimeTypeMap[type.toLowerCase()]);
    } else if (type.startsWith(".")) {
      // If it's a file extension like ".pdf", convert to MIME type
      const ext = type.toLowerCase().substring(1);
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
      if (extToMime[ext]) {
        acceptTypes.push(extToMime[ext]);
      } else {
        acceptTypes.push(type); // Use as-is if we don't have a mapping
      }
    } else {
      acceptTypes.push(type); // Use as-is
    }
  });

  return acceptTypes.join(",");
};

// Helper function to validate file type
const validateFileType = (file: File, allowedTypes?: string[]): boolean => {
  if (!allowedTypes || allowedTypes.length === 0) {
    return true; // No restrictions
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
      return fileMimeType.startsWith("video/");
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
  signedUrl
}: FileFieldProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();
  const getFileName = (filePath: string, originalName?: string) => {
    // If we have the original name stored, use it
    if (originalName) {
      return originalName;
    }
    
    if (!filePath) return "Uploaded file";
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
  
  // Extract file path and original name from value
  const filePath = typeof value === 'string' ? value : (value?.value || value);
  const originalName = typeof value === 'string' ? undefined : value?.original_name;
  const fileName = filePath ? getFileName(filePath, originalName) : "";

  const allowedTypes = field.allowed_file_types;
  const acceptAttribute = getAcceptAttribute(allowedTypes);
  const allowsImages = !allowedTypes || allowedTypes.some(type => type.toLowerCase() === "image" || type.toLowerCase().startsWith("image"));

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
  };

  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileChange(e);
  };

  const handleRemove = async () => {
    // Delete from storage if onDelete callback is provided
    if (onDelete && filePath) {
      try {
        await onDelete(filePath);
      } catch (error) {
        console.error('Error deleting file from storage:', error);
        toast({
          title: "Warning",
          description: "File removed from form but may still exist in storage",
          variant: "destructive",
        });
      }
    }
    
    // Remove from UI and update state
    onChange(null);
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium flex items-center gap-1">
        {field.label || field.name || field.id}
        {required && <span className="text-destructive">*</span>}
      </Label>

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

        {filePath ? (
          <div className="flex-1 flex items-center gap-2 p-2 border rounded-md bg-muted/50">
            <File className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm flex-1 truncate" title={fileName}>
              {fileName}
            </span>
            <div className="flex items-center gap-1">
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
        ) : (
          isMobile && allowsImages ? (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => inputRef.current?.click()}
                disabled={disabled || isUploading}
              >
                {isUploading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                {isUploading ? "Uploading..." : "Choose File"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => cameraInputRef.current?.click()}
                disabled={disabled || isUploading}
              >
                {isUploading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4 mr-2" />
                )}
                {isUploading ? "Uploading..." : "Camera"}
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => inputRef.current?.click()}
              disabled={disabled || isUploading}
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              {isUploading ? "Uploading..." : "Upload File"}
            </Button>
          )
        )}
      </div>

      {field.description && (
        <p className="text-xs text-muted-foreground">{field.description}</p>
      )}
    </div>
  );
};

