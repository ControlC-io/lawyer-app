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
  const [ocrTriggeredFiles, setOcrTriggeredFiles] = useState<Record<string, boolean>>({});
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, string[]>>({});
  const [loadingDynamicOptions, setLoadingDynamicOptions] = useState<Record<string, boolean>>({});
  const [dynamicOptionsErrors, setDynamicOptionsErrors] = useState<Record<string, { message: string; type: 'api_error' | 'format_error' }>>({});
  const [openPopovers, setOpenPopovers] = useState<Record<string, boolean>>({});
  const [selectedMultipleOptions, setSelectedMultipleOptions] = useState<Record<string, string[]>>({});
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [validationComments, setValidationComments] = useState<Record<string, string>>({});
  const [decisionComments, setDecisionComments] = useState<Record<string, string>>({});

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
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

  const getSignedUrl = async (filePath: string, filename?: string): Promise<string | null> => {
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
        ...(typeof filename === "string" && filename.length > 0 ? { filename } : {}),
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

  const extractStoredValue = (rawValue: any) => {
    if (rawValue && typeof rawValue === "object" && "value" in rawValue) {
      return rawValue.value;
    }
    return rawValue;
  };

  const getCurrentFieldValue = (executionDataId: string, fieldId: string) => {
    const editingKey = `${executionDataId}-${fieldId}`;
    if (editingValues[editingKey] !== undefined) {
      return extractStoredValue(editingValues[editingKey]);
    }
    const executionRow = executionDataStructures.find((entry: any) => entry.id === executionDataId);
    const rawValue = (executionRow?.values as Record<string, any> | undefined)?.[fieldId];
    return extractStoredValue(rawValue);
  };

  const resolveBoundParamValue = (executionDataId: string, queryParam: { value?: string; mode?: "static" | "bind" }) => {
    const rawValue = (queryParam.value || "").trim();
    if (!rawValue) return "";

    if (queryParam.mode !== "bind") {
      return rawValue;
    }

    const templateMatch = rawValue.match(/^\{\{(.+)\}\}$/);
    const boundFieldId = (templateMatch?.[1] || rawValue).trim();
    if (!boundFieldId) return "";

    const boundValue = getCurrentFieldValue(executionDataId, boundFieldId);
    return boundValue == null ? "" : String(boundValue);
  };

  const parseKeyValuePairs = (raw: unknown): Array<{ key: string; value: string; mode?: "static" | "bind" }> => {
    let parsed = raw;
    if (typeof raw === "string") {
      try {
        parsed = JSON.parse(raw);
      } catch {
        return [];
      }
    }

    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item) => item && typeof item === "object")
      .map((item: any) => ({
        key: typeof item.key === "string" ? item.key : "",
        value: typeof item.value === "string" ? item.value : "",
        mode: item.mode === "bind" ? "bind" : "static",
      }))
      .filter((item) => item.key.trim().length > 0);
  };

  const buildDynamicRequestUrl = (
    apiUrl: string,
    apiParams: unknown,
    fieldQueryParams: unknown,
    executionDataId: string
  ) => {
    const isAbsoluteUrl = /^https?:\/\//i.test(apiUrl);
    const parsedUrl = new URL(apiUrl, "http://placeholder.local");

    const mergedParams = new URLSearchParams(parsedUrl.search);
    parseKeyValuePairs(apiParams).forEach((param) => {
      mergedParams.set(param.key, param.value);
    });
    parseKeyValuePairs(fieldQueryParams).forEach((param) => {
      mergedParams.set(param.key, resolveBoundParamValue(executionDataId, param));
    });

    parsedUrl.search = mergedParams.toString();
    if (isAbsoluteUrl) {
      return parsedUrl.toString();
    }

    return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
  };

  const fetchDynamicOptionsForField = async (fieldId: string) => {
    const fieldInfo = findFieldDefinition(fieldId);
    const field = fieldInfo?.def;
    const executionDataId = fieldInfo?.execRow?.id;
    const apiConfigId = field?.api_configuration_id;

    if (!field || !executionDataId || field.options_source !== "dynamic" || !apiConfigId) {
      console.error(`No dynamic API configuration found for field ${fieldId}`);
      return;
    }

    setLoadingDynamicOptions((prev) => ({ ...prev, [fieldId]: true }));
    setDynamicOptionsErrors((prev) => {
      const updated = { ...prev };
      delete updated[fieldId];
      return updated;
    });

    try {
      if (!companyId) throw new Error("Company not set");
      const configs = await api.get<{
        id: string;
        api_url: string;
        api_method?: string;
        api_headers?: unknown;
        api_params?: unknown;
      }[]>(`/api/companies/${companyId}/api-configurations`);

      const apiConfig = Array.isArray(configs) ? configs.find((c) => c.id === apiConfigId) : null;
      if (!apiConfig) {
        throw new Error("API configuration not found");
      }

      const requestUrl = buildDynamicRequestUrl(
        apiConfig.api_url,
        apiConfig.api_params,
        field.api_query_params,
        executionDataId
      );

      const headers: Record<string, string> = {};
      parseKeyValuePairs(apiConfig.api_headers).forEach(({ key, value }) => {
        headers[key] = value;
      });

      const response = await fetch(requestUrl, {
        method: apiConfig.api_method || "GET",
        headers: { "Content-Type": "application/json", ...headers },
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      if (!Array.isArray(data)) {
        throw new Error("API response must be an array");
      }

      const options = data.map((item: any) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          return item.value || item.label || item.name || String(item);
        }
        return String(item);
      });

      setDynamicOptions((prev) => ({ ...prev, [fieldId]: options }));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to fetch options";
      setDynamicOptionsErrors((prev) => ({
        ...prev,
        [fieldId]: {
          message,
          type: message.includes("API") ? "api_error" : "format_error",
        },
      }));
      setDynamicOptions((prev) => {
        const updated = { ...prev };
        delete updated[fieldId];
        return updated;
      });
    } finally {
      setLoadingDynamicOptions((prev) => {
        const updated = { ...prev };
        delete updated[fieldId];
        return updated;
      });
    }
  };

  // Seed array items from execution data the first time each array field is
  // seen. This effect re-runs on every refetch (e.g. after a signature/file
  // upload calls invalidateQueries), so it must only initialize fields that
  // aren't already in local state — otherwise it would overwrite the user's
  // unsaved array edits with stale DB values.
  useEffect(() => {
    if (!executionDataStructures) return;

    setArrayItems((prev) => {
      const next = { ...prev };
      let changed = false;

      for (const eds of executionDataStructures) {
        const values = (eds.values as Record<string, any>) || {};
        const ds: any = eds.data_structures;
        const fields: any[] = (ds?.fields ?? []) as any[];

        for (const field of fields) {
          const fieldType = field.field_type || field.type;
          if (fieldType !== "array" || field.parent_item_id) continue;
          // Already seeded (and possibly edited locally) — never clobber it.
          if (next[field.id] !== undefined) continue;

          const currentValue = values[field.id]?.value;
          if (currentValue && Array.isArray(currentValue)) {
            // Ensure all items have unique IDs (for backward compatibility)
            next[field.id] = currentValue.map((item: any) =>
              item._id ? item : { ...item, _id: crypto.randomUUID() }
            );
            changed = true;
          }
        }
      }

      return changed ? next : prev;
    });
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
            const originalName =
              rawValue && typeof rawValue === "object" && "original_name" in rawValue
                ? (rawValue as { original_name?: string }).original_name
                : undefined;
            if (fileValue && typeof fileValue === "string") {
              const cacheKey = `${eds.id}-${field.id}`;
              const displayName =
                typeof originalName === "string" && originalName.length > 0
                  ? originalName
                  : fileValue.split("/").pop()?.replace(/^\d+_/, "") ?? undefined;
              const signedUrl = await getSignedUrl(fileValue, displayName);
              if (signedUrl) {
                newSignedUrls[cacheKey] = signedUrl;
              }
            }
          }

          // Handle file sub-fields inside array items
          if (fieldType === "array" && !field.parent_item_id) {
            const arrayValue = values[field.id]?.value;
            if (arrayValue && Array.isArray(arrayValue)) {
              // Find child fields that are file type
              const childFileFields = fields.filter(
                (f) => f.parent_item_id === field.id && ((f.field_type || f.type) === "file" || (f.field_type || f.type) === "signature")
              );
              for (const childField of childFileFields) {
                for (const item of arrayValue) {
                  const childVal = item[childField.id];
                  if (!childVal) continue;
                  const childFilePath = typeof childVal === "string" ? childVal : childVal?.value;
                  const childOriginalName = typeof childVal === "object" ? childVal?.original_name : undefined;
                  if (childFilePath && typeof childFilePath === "string") {
                    const displayName =
                      typeof childOriginalName === "string" && childOriginalName.length > 0
                        ? childOriginalName
                        : childFilePath.split("/").pop()?.replace(/^\d+_/, "") ?? undefined;
                    const signedUrl = await getSignedUrl(childFilePath, displayName);
                    if (signedUrl) {
                      // Key by storage path so FileField can look it up
                      newSignedUrls[childFilePath] = signedUrl;
                    }
                  }
                }
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

  /** Convert ArrayBuffer to base64 in chunks to avoid "Maximum call stack size exceeded" on large files (e.g. PDFs). */
  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 8192;
    let binary = "";
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
      binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
    }
    return btoa(binary);
  };

  const handleFileUpload = async (fieldId: string, file: File, ocrEnabled?: boolean) => {
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
      const base64 = arrayBufferToBase64(buf);
      const body: Record<string, any> = { field_name: fieldName, file_base64: base64, file_name: file.name, mime_type: file.type };
      if (ocrEnabled) {
        body.ocr = 'true';
      }
      const res = await api.post<{ file_path?: string }>(
        `/api/files/workflows/executions/${executionId}/files`,
        body,
        { apiKey: apiKey ?? undefined }
      );
      const filePath = res?.file_path;
      if (!filePath) {
        throw new Error("No file_path returned from upload");
      }
      const signedUrl = await getSignedUrl(filePath, file.name);
      // Refetch is async; ExecutionDataPanel prefers editingValues over DB for display.
      setEditingValues((prev) => ({
        ...prev,
        [cacheKey]: { value: filePath, original_name: file.name },
      }));
      if (signedUrl) {
        setSignedUrls((prev) => ({ ...prev, [cacheKey]: signedUrl }));
      }
      if (ocrEnabled) {
        setOcrTriggeredFiles((prev) => ({ ...prev, [fieldId]: true }));
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
    await fetchDynamicOptionsForField(fieldId);
  };

  /**
   * Upload a file for use as an array child field value.
   * Unlike handleFileUpload, this does NOT update execution data directly —
   * the caller is responsible for passing the result to onChildChange.
   */
  const uploadFileForArrayChild = async (
    childFieldId: string,
    file: File,
    parentFieldName: string,
    childFieldName: string,
  ): Promise<{ value: string; original_name: string; signedUrl?: string }> => {
    if (!file || !apiKey) throw new Error("File or API key missing");
    setUploadingFiles((prev) => ({ ...prev, [childFieldId]: true }));
    try {
      const buf = await file.arrayBuffer();
      const base64 = arrayBufferToBase64(buf);
      const body: Record<string, any> = {
        field_name: parentFieldName,
        sub_field_name: childFieldName,
        file_base64: base64,
        file_name: file.name,
        mime_type: file.type,
      };
      const res = await api.post<{ file_path?: string }>(
        `/api/files/workflows/executions/${executionId}/files`,
        body,
        { apiKey: apiKey ?? undefined }
      );
      const storagePath = res?.file_path;
      if (!storagePath) throw new Error("No file_path returned from upload");
      const signedUrl = await getSignedUrl(storagePath, file.name);
      if (signedUrl) {
        setSignedUrls((prev) => ({ ...prev, [storagePath]: signedUrl }));
      }
      toast({ title: "File uploaded successfully", description: file.name });
      return { value: storagePath, original_name: file.name, signedUrl: signedUrl ?? undefined };
    } finally {
      setUploadingFiles((prev) => ({ ...prev, [childFieldId]: false }));
    }
  };

  /**
   * Delete a file from storage without modifying execution data.
   * Used for array child file fields where the caller manages the data update via onChildChange.
   */
  const deleteFileFromStorage = async (filePath: string): Promise<void> => {
    // Remove the cached signed URL
    setSignedUrls((prev) => {
      const updated = { ...prev };
      delete updated[filePath];
      return updated;
    });
  };

  const handleFileDelete = async (fieldId: string, filePath: string) => {
    const info = findFieldDefinition(fieldId);
    if (!info?.def?.name || !apiKey) return;
    const row = info.execRow as { id: string; values?: Record<string, any> };
    const currentValues = ((row as any).values ?? {}) as Record<string, any>;
    const currentValueObj = currentValues[fieldId] || {};
    const currentFilePath = typeof currentValueObj === "string" ? currentValueObj : (currentValueObj.value ?? currentValueObj);
    if (currentFilePath !== filePath) return;
    // Backend stores this as the field's .value; send null so DB has value: null and persists correctly
    const payload: any = null;
    try {
      await api.put(
        `/api/workflows/executions/${executionId}/data`,
        { data: { [info.def.name]: payload } },
        { apiKey: apiKey ?? undefined }
      );
      // Use the same query key as useExecutionData so the execution detail view gets fresh data
      const executionQueryKey =
        companyId != null
          ? ["workflow_execution", executionId, companyId]
          : ["workflow_execution", executionId];
      queryClient.invalidateQueries({ queryKey: executionQueryKey });
      queryClient.invalidateQueries({ queryKey: ["execution_data_structures", executionId] });
      // Wait for refetch so the cache is updated before showing success; avoids file reappearing on refresh
      await queryClient.refetchQueries({ queryKey: executionQueryKey });
      const editingKey = `${row.id}-${fieldId}`;
      setEditingValues((prev) => {
        const next = { ...prev };
        delete next[editingKey];
        return next;
      });
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
    ocrTriggeredFiles,
    signedUrls,
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
    pendingConnectionRef,
    handleFileUpload,
    updateValueMutation,
    validateValueMutation,
    handleValueChange,
    handleValidationCommentChange,
    handleSaveValue,
    getSignedUrl,
    retryDynamicOptions,
    handleFileDelete,
    uploadFileForArrayChild,
    deleteFileFromStorage,
  };
};

