import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

const DOCUMENTS_BUCKET = "documents";

export const useExecutionForm = (
  executionId: string,
  executionDataStructures: any[],
  executionSteps: any[],
  apiKey?: string | null,
  companyId?: string | null
) => {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  const [editingValues, setEditingValues] = useState<Record<string, any>>({});
  const [arrayItems, setArrayItems] = useState<Record<string, any[]>>({});
  const [uploadingFiles, setUploadingFiles] = useState<Record<string, boolean>>({});
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [multipleFilesSignedUrls, setMultipleFilesSignedUrls] = useState<Record<string, Record<number, string>>>({});
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, string[]>>({});
  const [loadingDynamicOptions, setLoadingDynamicOptions] = useState<Record<string, boolean>>({});
  const [dynamicOptionsErrors, setDynamicOptionsErrors] = useState<Record<string, { message: string; type: 'api_error' | 'format_error' }>>({});
  const [openPopovers, setOpenPopovers] = useState<Record<string, boolean>>({});
  const [selectedMultipleOptions, setSelectedMultipleOptions] = useState<Record<string, string[]>>({});
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [validationComments, setValidationComments] = useState<Record<string, string>>({});
  const [decisionComments, setDecisionComments] = useState<Record<string, string>>({});

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const fetchAttemptsRef = useRef<Record<string, boolean>>({});
  const pendingConnectionRef = useRef<{ targetStepId?: string; choice?: string } | null>(null);

  // Helper function to sanitize a file path for Supabase Storage
  // This handles legacy files that might have special characters
  const sanitizeFilePath = (path: string): string => {
    // Split path into directory and filename
    const parts = path.split('/');
    const filename = parts.pop() || '';
    const directory = parts.join('/');
    
    // Sanitize only the filename part
    const sanitizedFilename = filename
      .normalize('NFD') // Decompose accented characters (è -> e + `)
      .replace(/[\u0300-\u036f]/g, '') // Remove combining diacritical marks
      .replace(/[<>:"/\\|?*\x00-\x1f,;=+&%$#@!~`{}[\]()]/g, '_') // Replace all special chars with underscore
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .replace(/_{2,}/g, '_') // Replace multiple underscores with single
      .replace(/^_+|_+$/g, '') // Remove leading/trailing underscores
      || 'file'; // Fallback if name becomes empty
    
    return directory ? `${directory}/${sanitizedFilename}` : sanitizedFilename;
  };

  const getSignedUrl = async (filePath: string): Promise<string | null> => {
    try {
      if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
        if (filePath.includes("?token=")) return filePath;
        const urlMatch = filePath.match(/\/storage\/v1\/object\/public\/documents\/(.+)$/);
        if (urlMatch) filePath = urlMatch[1];
        else return filePath;
      }
      const sanitizedPath = sanitizeFilePath(filePath);
      const res = await api.post<{ signedUrl?: string }>("/api/files/signed-url", {
        bucket: DOCUMENTS_BUCKET,
        path: sanitizedPath,
        expiresIn: 604800, // 7 days (matches MinIO/S3 maximum)
      });
      return res?.signedUrl ?? null;
    } catch (error) {
      console.error("Error generating signed URL:", error);
      return null;
    }
  };

  const findFieldDefinition = (fieldId: string) => {
    if (!executionDataStructures) return null as any;
    for (const eds of executionDataStructures) {
      const ds: any = eds.data_structures;
      const fields: any[] = (ds?.fields ?? []) as any[];
      const def = fields.find((f) => f.id === fieldId);
      if (def) {
        return { execRow: eds, def };
      }
    }
    return null;
  };

  // Initialize array items from execution data when it loads
  useEffect(() => {
    if (!executionDataStructures) return;

    const newArrayItems: Record<string, any[]> = {};
    for (const eds of executionDataStructures) {
      const values = (eds.values as Record<string, any>) || {};
      const ds: any = eds.data_structures;
      const fields: any[] = (ds?.fields ?? []) as any[];

      for (const field of fields) {
        const fieldType = field.field_type || field.type;
        if (fieldType === "array" && !field.parent_item_id) {
          const currentValue = values[field.id]?.value;
          if (currentValue && Array.isArray(currentValue)) {
            // Ensure all items have unique IDs (for backward compatibility)
            const itemsWithIds = currentValue.map((item: any) => {
              if (!item._id) {
                return { ...item, _id: crypto.randomUUID() };
              }
              return item;
            });
            newArrayItems[field.id] = itemsWithIds;
          }
        }
      }
    }

    if (Object.keys(newArrayItems).length > 0) {
      setArrayItems((prev) => ({ ...prev, ...newArrayItems }));
    }
  }, [executionDataStructures]);

  // Generate signed URLs for file fields
  useEffect(() => {
    if (!executionDataStructures) return;

    const generateSignedUrls = async () => {
      const newSignedUrls: Record<string, string> = {};

      for (const eds of executionDataStructures) {
        const values = (eds.values as Record<string, any>) || {};
        const ds: any = eds.data_structures;
        const fields: any[] = (ds?.fields ?? []) as any[];

        for (const field of fields) {
          const fieldType = field.field_type || field.type;
          if (fieldType === "file" || fieldType === "signature") {
            const rawValue = values[field.id];
            const fileValue =
              rawValue && typeof rawValue === "object" && "value" in rawValue
                ? (rawValue as { value?: string }).value
                : rawValue;
            if (fileValue && typeof fileValue === "string") {
              const cacheKey = `${eds.id}-${field.id}`;

              // Generate signed URL (will be cached by state)
              const signedUrl = await getSignedUrl(fileValue);
              if (signedUrl) {
                newSignedUrls[cacheKey] = signedUrl;
              }
            }
          } else if (fieldType === "multiple_files") {
            // Normalize value: can be array of paths, object { value: paths }, or array of { value, original_name }
            const raw = values[field.id];
            let filePaths: string[] = [];
            if (Array.isArray(raw)) {
              if (raw.length > 0 && typeof raw[0] === "object" && raw[0] !== null) {
                filePaths = raw.map((item: any) => item.value ?? item);
              } else {
                filePaths = raw;
              }
            } else if (raw && typeof raw === "object" && "value" in raw) {
              filePaths = Array.isArray(raw.value) ? raw.value : [raw.value];
            }
            if (filePaths.length > 0) {
              const cacheKey = `${eds.id}-${field.id}`;
              const signedUrlsMap: Record<number, string> = {};

              for (let i = 0; i < filePaths.length; i++) {
                const filePath = filePaths[i];
                if (filePath && typeof filePath === "string") {
                  const signedUrl = await getSignedUrl(filePath);
                  if (signedUrl) {
                    signedUrlsMap[i] = signedUrl;
                  }
                }
              }

              if (Object.keys(signedUrlsMap).length > 0) {
                setMultipleFilesSignedUrls((prev) => ({ ...prev, [cacheKey]: signedUrlsMap }));
              }
            }
          }
        }
      }

      if (Object.keys(newSignedUrls).length > 0) {
        setSignedUrls((prev) => {
          // Only update if there are new URLs to avoid unnecessary re-renders
          const hasNew = Object.keys(newSignedUrls).some(key => prev[key] !== newSignedUrls[key]);
          return hasNew ? { ...prev, ...newSignedUrls } : prev;
        });
      }
    };

    generateSignedUrls();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [executionDataStructures]);

  // Fetch dynamic options for fields with options_source === "dynamic"
  useEffect(() => {
    if (!executionDataStructures) return;

    const fetchDynamicOptions = async () => {
      // Collect all fields that need dynamic options
      const fieldsToFetch: Array<{ fieldId: string; apiConfigId: string }> = [];

      for (const eds of executionDataStructures) {
        const ds: any = eds.data_structures;
        const fields: any[] = (ds?.fields ?? []) as any[];

        for (const field of fields) {
          const fieldType = field.field_type || field.type;
          const optionsSource = field.options_source;
          const apiConfigId = field.api_configuration_id;

          // Check if this field needs dynamic options
          if (
            (fieldType === "option" || fieldType === "multiple_option") &&
            optionsSource === "dynamic" &&
            apiConfigId &&
            !fetchAttemptsRef.current[field.id] // Only fetch if not already attempted
          ) {
            fieldsToFetch.push({ fieldId: field.id, apiConfigId });
          }
        }
      }

      // Fetch options for each field
      for (const { fieldId, apiConfigId } of fieldsToFetch) {
        // Mark as attempted to prevent duplicate fetches
        fetchAttemptsRef.current[fieldId] = true;

        // Set loading state
        setLoadingDynamicOptions((prev) => ({ ...prev, [fieldId]: true }));
        setDynamicOptionsErrors((prev) => {
          const updated = { ...prev };
          delete updated[fieldId];
          return updated;
        });

        try {
          if (!companyId) throw new Error("Company not set");
          const configs = await api.get<{ id: string; api_url: string; api_method?: string; api_headers?: unknown }[]>(`/api/companies/${companyId}/api-configurations`);
          const apiConfig = Array.isArray(configs) ? configs.find((c) => c.id === apiConfigId) : null;
          if (!apiConfig) {
            throw new Error("API configuration not found");
          }

          // Parse headers
          let headers: Record<string, string> = {};
          if (apiConfig.api_headers) {
            const parsedHeaders = typeof apiConfig.api_headers === 'string'
              ? JSON.parse(apiConfig.api_headers)
              : apiConfig.api_headers;

            if (Array.isArray(parsedHeaders)) {
              parsedHeaders.forEach((h: { key: string; value: string }) => {
                if (h.key && h.value) {
                  headers[h.key] = h.value;
                }
              });
            }
          }

          // Make API request
          const method = apiConfig.api_method || "GET";
          const url = apiConfig.api_url;

          const fetchOptions: RequestInit = {
            method,
            headers: {
              "Content-Type": "application/json",
              ...headers,
            },
          };

          const response = await fetch(url, fetchOptions);

          if (!response.ok) {
            throw new Error(`API request failed: ${response.status} ${response.statusText}`);
          }

          const data = await response.json();

          // Validate response format - should be an array of strings
          if (!Array.isArray(data)) {
            throw new Error("API response must be an array");
          }

          // Convert all items to strings (in case API returns objects with value/label)
          const options = data.map((item: any) => {
            if (typeof item === "string") {
              return item;
            } else if (typeof item === "object" && item !== null) {
              // Handle objects with value or label property
              return item.value || item.label || item.name || String(item);
            }
            return String(item);
          });

          // Store options
          setDynamicOptions((prev) => ({ ...prev, [fieldId]: options }));
        } catch (error: any) {
          console.error(`Error fetching dynamic options for field ${fieldId}:`, error);

          // Store error
          setDynamicOptionsErrors((prev) => ({
            ...prev,
            [fieldId]: {
              message: error.message || "Failed to fetch options",
              type: error.message?.includes("API") ? "api_error" : "format_error",
            },
          }));

          // Clear options on error
          setDynamicOptions((prev) => {
            const updated = { ...prev };
            delete updated[fieldId];
            return updated;
          });
        } finally {
          // Clear loading state
          setLoadingDynamicOptions((prev) => {
            const updated = { ...prev };
            delete updated[fieldId];
            return updated;
          });
        }
      }
    };

    fetchDynamicOptions();
  }, [executionDataStructures, companyId]);

  const handleFileUpload = async (fieldId: string, file: File) => {
    if (!file || !apiKey) return;
    setUploadingFiles((prev) => ({ ...prev, [fieldId]: true }));
    try {
      const info = findFieldDefinition(fieldId);
      if (!info?.def?.name) throw new Error("Field not found");
      const fieldName = info.def.name;
      const row = info.execRow;
      const cacheKey = `${row.id}-${fieldId}`;
      const fieldType = info.def.field_type || info.def.type;
      const buf = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      const res = await api.post<{ file_path?: string }>(
        `/api/files/workflows/executions/${executionId}/files`,
        { field_name: fieldName, file_base64: base64, file_name: file.name, mime_type: file.type },
        { apiKey: apiKey ?? undefined }
      );
      const filePath = res?.file_path;
      const signedUrl = filePath ? await getSignedUrl(filePath) : null;
      if (fieldType === "multiple_files" && signedUrl) {
        const currentSignedUrls = multipleFilesSignedUrls[cacheKey] || {};
        setMultipleFilesSignedUrls((prev) => ({ ...prev, [cacheKey]: { ...currentSignedUrls, 0: signedUrl } }));
      } else if (signedUrl) {
        setSignedUrls((prev) => ({ ...prev, [cacheKey]: signedUrl }));
      }
      queryClient.invalidateQueries({ queryKey: ["workflow_execution", executionId] });
      queryClient.invalidateQueries({ queryKey: ["execution_data_structures", executionId] });
      toast({ title: "File uploaded successfully", description: file.name });
    } catch (error: unknown) {
      toast({
        title: "Error uploading file",
        description: error instanceof Error ? error.message : "Upload failed",
        variant: "destructive",
      });
    } finally {
      setUploadingFiles((prev) => ({ ...prev, [fieldId]: false }));
    }
  };

  const updateValueMutation = useMutation({
    mutationFn: async ({ executionDataId, fieldId, newValue }: { executionDataId: string; fieldId: string; newValue: any }) => {
      const info = findFieldDefinition(fieldId);
      if (!info?.def?.name || !apiKey) throw new Error("Field not found or API key missing");
      await api.put(
        `/api/workflows/executions/${executionId}/data`,
        { data: { [info.def.name]: newValue } },
        { apiKey: apiKey ?? undefined }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflow_execution", executionId] });
      queryClient.invalidateQueries({ queryKey: ["execution_data_structures", executionId] });
      toast({ title: "Value updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error updating value", description: error.message, variant: "destructive" });
    },
  });

  const validateValueMutation = useMutation({
    mutationFn: async ({ executionDataId, fieldId, comment }: { executionDataId: string; fieldId: string; comment?: string }) => {
      if (!profile?.id || !apiKey) throw new Error("No user logged in or API key missing");
      const info = findFieldDefinition(fieldId);
      if (!info?.def?.name) throw new Error("Field not found");
      const eds = executionDataStructures.find((e: any) => e.id === executionDataId);
      const currentVal = (eds?.values as Record<string, any>)?.[fieldId];
      const updated = {
        ...currentVal,
        validated_by: profile.id,
        validated_at: new Date().toISOString(),
        validation_comment: comment || null,
      };
      await api.put(
        `/api/workflows/executions/${executionId}/data`,
        { data: { [info.def.name]: updated } },
        { apiKey: apiKey ?? undefined }
      );
    },
    onSuccess: (_, variables) => {
      // Clear the comment for this field after successful validation
      setValidationComments((prev) => {
        const updated = { ...prev };
        delete updated[`${variables.executionDataId}-${variables.fieldId}`];
        return updated;
      });
      queryClient.invalidateQueries({ queryKey: ["execution_data_structures", executionId] });
      toast({
        title: "Value validated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error validating value",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleValueChange = (key: string, newValue: any) => {
    setEditingValues((prev) => ({ ...prev, [key]: newValue }));
  };

  const handleValidationCommentChange = (key: string, comment: string) => {
    setValidationComments((prev) => ({ ...prev, [key]: comment }));
  };

  const handleSaveValue = (executionDataId: string, fieldId: string) => {
    const key = `${executionDataId}-${fieldId}`;
    const newValue = editingValues[key];
    if (newValue !== undefined) {
      updateValueMutation.mutate({ executionDataId, fieldId, newValue });
      setEditingValues((prev) => {
        const updated = { ...prev };
        delete updated[key];
        return updated;
      });
    }
  };

  // Function to retry fetching dynamic options for a field
  const retryDynamicOptions = async (fieldId: string) => {
    // Reset fetch attempt flag to allow retry
    fetchAttemptsRef.current[fieldId] = false;

    // Find the field and its API configuration
    let apiConfigId: string | null = null;
    for (const eds of executionDataStructures) {
      const ds: any = eds.data_structures;
      const fields: any[] = (ds?.fields ?? []) as any[];
      const field = fields.find((f) => f.id === fieldId);
      if (field && field.options_source === "dynamic" && field.api_configuration_id) {
        apiConfigId = field.api_configuration_id;
        break;
      }
    }

    if (!apiConfigId) {
      console.error(`No API configuration found for field ${fieldId}`);
      return;
    }

    // Mark as attempted
    fetchAttemptsRef.current[fieldId] = true;

    // Set loading state
    setLoadingDynamicOptions((prev) => ({ ...prev, [fieldId]: true }));
    setDynamicOptionsErrors((prev) => {
      const updated = { ...prev };
      delete updated[fieldId];
      return updated;
    });

    try {
      if (!companyId) throw new Error("Company not set");
      const configs = await api.get<{ id: string; api_url: string; api_method?: string; api_headers?: unknown }[]>(`/api/companies/${companyId}/api-configurations`);
      const apiConfig = Array.isArray(configs) ? configs.find((c) => c.id === apiConfigId) : null;
      if (!apiConfig) throw new Error("API configuration not found");
      let headers: Record<string, string> = {};
      if (apiConfig.api_headers) {
        const parsed = typeof apiConfig.api_headers === "string" ? JSON.parse(apiConfig.api_headers) : apiConfig.api_headers;
        if (Array.isArray(parsed)) parsed.forEach((h: { key: string; value: string }) => { if (h.key && h.value) headers[h.key] = h.value; });
      }
      const response = await fetch(apiConfig.api_url, {
        method: apiConfig.api_method || "GET",
        headers: { "Content-Type": "application/json", ...headers },
      });
      if (!response.ok) throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error("API response must be an array");
      const options = data.map((item: any) =>
        typeof item === "string" ? item : (item && typeof item === "object" ? item.value || item.label || item.name || String(item) : String(item))
      );
      setDynamicOptions((prev) => ({ ...prev, [fieldId]: options }));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to fetch options";
      setDynamicOptionsErrors((prev) => ({ ...prev, [fieldId]: { message: msg, type: msg.includes("API") ? "api_error" : "format_error" } }));
      setDynamicOptions((prev) => { const u = { ...prev }; delete u[fieldId]; return u; });
    } finally {
      setLoadingDynamicOptions((prev) => { const u = { ...prev }; delete u[fieldId]; return u; });
    }
  };

  const handleFileDelete = async (fieldId: string, filePath: string) => {
    const info = findFieldDefinition(fieldId);
    if (!info?.def?.name || !apiKey) return;
    const row = info.execRow as { id: string; values?: Record<string, any> };
    const fieldType = info.def.field_type || info.def.type;
    const currentValues = ((row as any).values ?? {}) as Record<string, any>;
    const currentValueObj = currentValues[fieldId] || {};
    let updatedValue: any;
    if (fieldType === "multiple_files") {
      const currentFileArray = Array.isArray(currentValueObj.value) ? currentValueObj.value : (currentValueObj.value ? [currentValueObj.value] : []);
      const currentOriginalNames = Array.isArray(currentValueObj.original_name) ? currentValueObj.original_name : (currentValueObj.original_name ? [currentValueObj.original_name] : []);
      const fileIndex = currentFileArray.findIndex((p: string) => p === filePath);
      if (fileIndex === -1) return;
      const newFileArray = currentFileArray.filter((_: any, i: number) => i !== fileIndex);
      const newOriginalNames = currentOriginalNames.filter((_: any, i: number) => i !== fileIndex);
      updatedValue = { ...currentValueObj, value: newFileArray.length > 0 ? newFileArray : null, original_name: newOriginalNames.length > 0 ? newOriginalNames : undefined };
    } else {
      const currentFilePath = typeof currentValueObj === "string" ? currentValueObj : (currentValueObj.value ?? currentValueObj);
      if (currentFilePath !== filePath) return;
      updatedValue = { ...currentValueObj, value: null, original_name: undefined };
    }
    try {
      await api.put(
        `/api/workflows/executions/${executionId}/data`,
        { data: { [info.def.name]: updatedValue } },
        { apiKey: apiKey ?? undefined }
      );
      queryClient.invalidateQueries({ queryKey: ["workflow_execution", executionId] });
      queryClient.invalidateQueries({ queryKey: ["execution_data_structures", executionId] });
      toast({ title: "File deleted successfully", description: "File has been removed from form" });
    } catch (error: unknown) {
      console.error("Error deleting file:", error);
      toast({
        title: "Error deleting file",
        description: error instanceof Error ? error.message : "Failed to delete file",
        variant: "destructive",
      });
      throw error;
    }
  };

  return {
    editingValues,
    setEditingValues,
    arrayItems,
    setArrayItems,
    uploadingFiles,
    signedUrls,
    multipleFilesSignedUrls,
    dynamicOptions,
    setDynamicOptions,
    loadingDynamicOptions,
    setLoadingDynamicOptions,
    dynamicOptionsErrors,
    setDynamicOptionsErrors,
    openPopovers,
    setOpenPopovers,
    selectedMultipleOptions,
    setSelectedMultipleOptions,
    selectedOptions,
    setSelectedOptions,
    validationComments,
    setValidationComments,
    decisionComments,
    setDecisionComments,
    fileInputRefs,
    fetchAttemptsRef,
    pendingConnectionRef,
    handleFileUpload,
    updateValueMutation,
    validateValueMutation,
    handleValueChange,
    handleValidationCommentChange,
    handleSaveValue,
    getSignedUrl,
    retryDynamicOptions,
    handleFileDelete
  };
};

