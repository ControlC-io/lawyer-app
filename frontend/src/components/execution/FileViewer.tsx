import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X, Download, File, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface FileViewerProps {
  fileUrl: string;
  fileName: string;
  onClose: () => void;
  hideCloseButton?: boolean;
}

export const FileViewer = ({ fileUrl, fileName, onClose, hideCloseButton = false }: FileViewerProps) => {
  const [fileType, setFileType] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Determine file type from file name extension
    const extension = fileName.split('.').pop()?.toLowerCase() || '';
    const mimeTypes: Record<string, string> = {
      'pdf': 'application/pdf',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'svg': 'image/svg+xml',
      'txt': 'text/plain',
      'csv': 'text/csv',
      'json': 'application/json',
      'xml': 'application/xml',
      'html': 'text/html',
      'md': 'text/markdown',
    };
    
    const detectedType = mimeTypes[extension] || '';
    setFileType(detectedType);
    
    // Load text files directly
    if (detectedType.startsWith('text/') || detectedType === 'application/json' || detectedType === 'application/xml') {
      setIsLoading(true);
      fetch(fileUrl)
        .then(response => {
          if (!response.ok) throw new Error('Failed to load file');
          return response.text();
        })
        .then(text => {
          setTextContent(text);
          setIsLoading(false);
        })
        .catch(err => {
          setError(err.message);
          setIsLoading(false);
        });
    }
  }, [fileName, fileUrl]);

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const canPreview = () => {
    if (!fileType) return false;
    return fileType.startsWith('image/') || fileType === 'application/pdf' || fileType.startsWith('text/');
  };

  const renderPreview = () => {
    if (error) {
      return (
        <div className="flex flex-col items-center justify-center h-full w-full p-8 text-center overflow-hidden">
          <File className="h-12 w-12 text-muted-foreground mb-4 flex-shrink-0" />
          <p className="text-sm text-muted-foreground mb-2">Unable to preview this file</p>
          <p className="text-xs text-muted-foreground mb-4">{error}</p>
          <Button onClick={handleDownload} variant="outline" className="flex-shrink-0">
            <Download className="h-4 w-4 mr-2" />
            Download File
          </Button>
        </div>
      );
    }

    if (!canPreview()) {
      return (
        <div className="flex flex-col items-center justify-center h-full w-full p-8 text-center overflow-hidden">
          <File className="h-12 w-12 text-muted-foreground mb-4 flex-shrink-0" />
          <p className="text-sm text-muted-foreground mb-2">Preview not available for this file type</p>
          <p className="text-xs text-muted-foreground mb-4 truncate max-w-full">{fileName}</p>
          <Button onClick={handleDownload} variant="outline" className="flex-shrink-0">
            <Download className="h-4 w-4 mr-2" />
            Download File
          </Button>
        </div>
      );
    }

    if (fileType.startsWith('image/')) {
      return (
        <div className="flex items-center justify-center h-full w-full p-4 bg-muted/20 overflow-hidden">
          <img
            src={fileUrl}
            alt={fileName}
            className="max-w-full max-h-full w-auto h-auto object-contain"
            style={{ maxHeight: '100%', maxWidth: '100%' }}
            onError={() => setError('Failed to load image')}
          />
        </div>
      );
    }

    if (fileType === 'application/pdf') {
      return (
        <div className="h-full w-full overflow-hidden">
          <iframe
            src={fileUrl}
            className="w-full h-full border-0"
            title={fileName}
            style={{ height: '100%', width: '100%' }}
            onError={() => setError('Failed to load PDF')}
          />
        </div>
      );
    }

    if (fileType.startsWith('text/') || fileType === 'application/json' || fileType === 'application/xml') {
      if (isLoading) {
        return (
          <div className="flex items-center justify-center h-full w-full overflow-hidden">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        );
      }
      
      if (textContent !== null) {
        return (
          <div className="h-full w-full overflow-hidden flex flex-col">
            <ScrollArea className="flex-1 min-h-0">
              <div className="p-4">
                <pre className="text-sm font-mono whitespace-pre-wrap break-words bg-muted/50 p-4 rounded-md border">
                  {textContent}
                </pre>
              </div>
            </ScrollArea>
          </div>
        );
      }
      
      return (
        <div className="flex items-center justify-center h-full w-full overflow-hidden">
          <p className="text-sm text-muted-foreground">Loading text content...</p>
        </div>
      );
    }

    return null;
  };

  return (
    <Card className="h-full flex flex-col overflow-hidden w-full max-w-full min-w-0">
      <CardHeader className="flex-shrink-0 border-b min-w-0 max-w-full">
        <div className="flex items-center justify-between min-w-0 max-w-full">
          <div className="flex-1 min-w-0 max-w-full">
            <CardTitle className="text-lg truncate min-w-0">{fileName}</CardTitle>
            <CardDescription className="truncate min-w-0">{fileType || 'Unknown file type'}</CardDescription>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-4">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              title="Download file"
            >
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
            {!hideCloseButton && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="h-8 w-8 p-0"
                title="Close viewer"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0 min-h-0 w-full max-w-full min-w-0">
        <div className="h-full w-full max-w-full min-w-0 overflow-hidden">
          {renderPreview()}
        </div>
      </CardContent>
    </Card>
  );
};

