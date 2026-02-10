import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, Upload, File, Eye, X, Camera, FileArchive } from "lucide-react";
import { useRef, useState } from "react";
import JSZip from "jszip";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "@/hooks/use-toast";

interface MultipleFilesFieldProps {
  field: any;
  value: any; // Array of file paths or array of objects with path and original_name
  onChange: (value: any) => void;
  onUpload: (file: File) => void;
  onView: (url: string, name: string, path: string) => void;
  onDelete?: (filePath: string) => Promise<void>; // Optional function to delete file from storage
  disabled?: boolean;
  required?: boolean;
  isUploading?: boolean;
  signedUrls?: Record<number, string>; // Map of index to signed URL
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

export const MultipleFilesField = ({
  field,
  value,
  onChange,
  onUpload,
  onView,
  onDelete,
  disabled,
  required,
  isUploading,
  signedUrls = {}
}: MultipleFilesFieldProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobile();
  const [showCameraOption, setShowCameraOption] = useState(false);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);
  
  // Extract paths and original names
  // Value can be: 
  // - array of strings (paths) - legacy format
  // - object with {value: array of paths, original_name: array of names} - new format
  // - array of objects {value: path, original_name: name} - alternative format
  let filePaths: string[] = [];
  let originalNames: (string | undefined)[] = [];
  
  if (Array.isArray(value)) {
    // Check if it's array of objects or array of strings
    if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
      // Array of objects format
      filePaths = value.map((item: any) => item.value || item);
      originalNames = value.map((item: any) => item.original_name);
    } else {
      // Array of strings (legacy format)
      filePaths = value;
      originalNames = new Array(value.length).fill(undefined);
    }
  } else if (value && typeof value === 'object' && 'value' in value) {
    // Object format with value and original_name arrays
    filePaths = Array.isArray(value.value) ? value.value : [value.value];
    originalNames = Array.isArray(value.original_name) ? value.original_name : 
                   (value.original_name ? [value.original_name] : new Array(filePaths.length).fill(undefined));
  } else if (value) {
    // Single string value (legacy)
    filePaths = [value];
    originalNames = [undefined];
  }
  
  const allowedTypes = field.allowed_file_types;
  const acceptAttribute = getAcceptAttribute(allowedTypes);
  const allowsImages = !allowedTypes || allowedTypes.some(type => type.toLowerCase() === "image" || type.toLowerCase().startsWith("image"));

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const validFiles: File[] = [];
      const invalidFiles: string[] = [];

      Array.from(files).forEach((file) => {
        if (validateFileType(file, allowedTypes)) {
          validFiles.push(file);
        } else {
          invalidFiles.push(file.name);
        }
      });

      if (invalidFiles.length > 0) {
        toast({
          title: "Invalid file type",
          description: `The following files are not allowed: ${invalidFiles.join(", ")}`,
          variant: "destructive",
        });
      }

      if (validFiles.length > 0) {
        // Show success message for multiple files
        if (validFiles.length > 1) {
          toast({
            title: "Uploading files",
            description: `Uploading ${validFiles.length} file${validFiles.length > 1 ? 's' : ''}...`,
          });
        }

        // Upload all valid files
        validFiles.forEach((file) => {
          onUpload(file);
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

  const handleRemove = async (index: number) => {
    const filePathToRemove = filePaths[index];
    
    // Delete from storage if onDelete callback is provided
    if (onDelete && filePathToRemove) {
      try {
        await onDelete(filePathToRemove);
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
    const newPaths = filePaths.filter((_, i) => i !== index);
    const newOriginalNames = originalNames.filter((_, i) => i !== index);
    
    // Update value - preserve structure if it was an object
    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
      // Array of objects format
      const newValue = value.filter((_, i) => i !== index);
      onChange(newValue.length > 0 ? newValue : null);
    } else if (value && typeof value === 'object' && 'value' in value) {
      // Object format with value and original_name arrays
      onChange({
        ...value,
        value: newPaths,
        original_name: newOriginalNames,
      });
    } else {
      // Simple array format
      onChange(newPaths.length > 0 ? newPaths : null);
    }
  };

  const handleDownloadAsZip = async () => {
    const indicesWithUrls = filePaths
      .map((_, index) => index)
      .filter((index) => signedUrls[index]);
    if (indicesWithUrls.length === 0) {
      toast({
        title: "Download unavailable",
        description: "File links are not ready yet. Please try again in a moment.",
        variant: "destructive",
      });
      return;
    }
    setIsDownloadingZip(true);
    try {
      const zip = new JSZip();
      const usedNames = new Set<string>();
      const makeUniqueName = (name: string): string => {
        let unique = name;
        let n = 1;
        while (usedNames.has(unique)) {
          const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
          const base = name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name;
          unique = `${base} (${n})${ext}`;
          n++;
        }
        usedNames.add(unique);
        return unique;
      };
      for (const index of indicesWithUrls) {
        const url = signedUrls[index];
        const fileName = makeUniqueName(getFileName(filePaths[index], originalNames[index]));
        if (url) {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`Failed to fetch ${fileName}`);
          const blob = await res.blob();
          zip.file(fileName, blob);
        }
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(zipBlob);
      a.download = `files-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      toast({
        title: "ZIP downloaded",
        description: `${indicesWithUrls.length} file(s) added to the archive.`,
      });
    } catch (err) {
      console.error("Error creating ZIP:", err);
      toast({
        title: "Download failed",
        description: "Could not create ZIP. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDownloadingZip(false);
    }
  };

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

  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium flex items-center gap-1">
        {field.label || field.name || field.id}
        {required && <span className="text-destructive">*</span>}
      </Label>

      <div className="space-y-2">
        <Input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileChange}
          disabled={disabled || isUploading}
          accept={acceptAttribute}
        />
        {isMobile && allowsImages && (
          <Input
            ref={cameraInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleCameraCapture}
            disabled={disabled || isUploading}
            accept="image/*"
            capture="environment"
          />
        )}

        {filePaths.length > 0 && (
          <div className="space-y-2">
            {Object.keys(signedUrls).length > 0 && (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto"
                  onClick={handleDownloadAsZip}
                  disabled={isDownloadingZip}
                  title="Download all files as ZIP"
                >
                  {isDownloadingZip ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <FileArchive className="h-4 w-4 mr-2" />
                  )}
                  {isDownloadingZip ? "Creating ZIP..." : "Download as ZIP"}
                </Button>
              </div>
            )}
            {filePaths.map((filePath: string, index: number) => {
              const fileName = getFileName(filePath, originalNames[index]);
              const signedUrl = signedUrls[index];

              return (
                <div key={index} className="flex-1 flex items-center gap-2 p-2 border rounded-md bg-muted/50">
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
                        onClick={() => handleRemove(index)}
                        title="Remove file"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!disabled && (isMobile && allowsImages ? (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => inputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              {isUploading ? "Uploading..." : "Choose Files (Multiple)"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => cameraInputRef.current?.click()}
              disabled={isUploading}
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
            disabled={isUploading}
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            {isUploading ? "Uploading..." : filePaths.length > 0 ? "Add More Files (Multiple)" : "Upload Files (Multiple)"}
          </Button>
        ))}
      </div>

      {field.description && (
        <p className="text-xs text-muted-foreground">{field.description}</p>
      )}
      <p className="text-xs text-muted-foreground italic">
        Tip: You can select multiple files at once
      </p>
    </div>
  );
};
