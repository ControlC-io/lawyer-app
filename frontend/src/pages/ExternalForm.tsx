import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { FieldRenderer } from "@/components/execution/form/FieldRenderer";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FileViewer } from "@/components/execution/FileViewer";
import { cn } from "@/lib/utils";
import { getFormPagesFromConfig, evaluateFieldRules, validateAllFields, type FieldRule, type FieldValidationRule } from "@/lib/formConfig";
import { FormPageStepper } from "@/components/execution/FormPageStepper";
import { ChevronLeft, ChevronRight, Send } from "lucide-react";
import { getPortalLanguageDisplay, type PortalLanguageCode } from "@/lib/portalLanguages";
import { getPortalTheme, normalizePortalPrimaryColor, withPortalAlpha } from "@/lib/portalTheme";

interface ExecutionData {
    execution_step_id: string;
    execution_id: string;
    workflow_step_id: string;
    status: string;
    step_config: any;
    workflow_name: string;
    company_id: string;
    data_structure: any;
    selected_language?: PortalLanguageCode;
    default_language?: PortalLanguageCode;
    enabled_languages?: PortalLanguageCode[];
}

export const ExternalForm = () => {
    const { token } = useParams<{ token: string }>();
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [completed, setCompleted] = useState(false);
    const [data, setData] = useState<ExecutionData | null>(null);
    const [formData, setFormData] = useState<Record<string, any>>({});
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [previewFile, setPreviewFile] = useState<{ url: string; name: string } | null>(null);
    const [signedUrls, setSignedUrls] = useState<Record<string, string>>({}); // fieldId -> signedUrl for files
    const [dynamicOptions, setDynamicOptions] = useState<Record<string, string[]>>({});
    const [loadingDynamicOptions, setLoadingDynamicOptions] = useState<Record<string, boolean>>({});
    const [dynamicOptionsErrors, setDynamicOptionsErrors] = useState<Record<string, { message: string; type: "api_error" | "format_error" }>>({});
    const [formPageIndex, setFormPageIndex] = useState(0);
    const [selectedLanguage, setSelectedLanguage] = useState<PortalLanguageCode>("en");
    const [enabledLanguages, setEnabledLanguages] = useState<PortalLanguageCode[]>(["en"]);
    const primaryColor = normalizePortalPrimaryColor("#3B82F6");
    const theme = getPortalTheme(primaryColor);

    const renderLanguageTags = () => (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
            {enabledLanguages.map((languageCode) => (
                <button
                    key={languageCode}
                    type="button"
                    className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                        selectedLanguage === languageCode
                            ? "text-slate-900"
                            : "bg-white/90 text-slate-700 hover:bg-slate-100",
                    )}
                    style={
                        selectedLanguage === languageCode
                            ? {
                                  backgroundColor: withPortalAlpha(primaryColor, 0.22),
                                  borderColor: withPortalAlpha(primaryColor, 0.45),
                              }
                            : { borderColor: theme.softBorder }
                    }
                    onClick={() => {
                        setSelectedLanguage(languageCode);
                        if (token) localStorage.setItem(`external-language-${token}`, languageCode);
                    }}
                    aria-pressed={selectedLanguage === languageCode}
                >
                    {getPortalLanguageDisplay(languageCode)}
                </button>
            ))}
        </div>
    );

    useEffect(() => {
        if (data) setFormPageIndex(0);
    }, [data?.execution_step_id]);

    useEffect(() => {
        if (!token) return;

        const fetchData = async () => {
            try {
                setLoading(true);
                const storageKey = `external-language-${token}`;
                const storedLanguage = localStorage.getItem(storageKey) as PortalLanguageCode | null;
                const langQuery = storedLanguage ? `?lang=${encodeURIComponent(storedLanguage)}` : "";
                const stepData = await api.get<ExecutionData>(`/api/external/steps/${token}${langQuery}`, { skipAuth: true });
                setData(stepData);
                const responseEnabled = stepData.enabled_languages?.length ? stepData.enabled_languages : ["en"];
                const responseDefault = stepData.default_language || "en";
                const nextLanguage = storedLanguage && responseEnabled.includes(storedLanguage)
                    ? storedLanguage
                    : responseDefault;
                setEnabledLanguages(responseEnabled);
                setSelectedLanguage(nextLanguage);
            } catch (error: unknown) {
                console.error("Error fetching form:", error);
                toast({
                    title: "Error",
                    description: error instanceof Error ? error.message : "Failed to load form",
                    variant: "destructive"
                });
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [token]);

    useEffect(() => {
        if (!token || !selectedLanguage) return;

        const fetchLocalizedData = async () => {
            try {
                const stepData = await api.get<ExecutionData>(
                    `/api/external/steps/${token}?lang=${encodeURIComponent(selectedLanguage)}`,
                    { skipAuth: true }
                );
                setData(stepData);
                if (stepData.enabled_languages?.length) {
                    setEnabledLanguages(stepData.enabled_languages);
                }
            } catch (error) {
                console.error("Error fetching localized form:", error);
            }
        };
        fetchLocalizedData();
    }, [token, selectedLanguage]);

    // Helper function to generate signed URL for a file path (for non-authenticated users)
    const generateSignedUrl = async (filePath: string): Promise<string | null> => {
        try {
            // Check if it's already a full URL
            if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
                if (filePath.includes('?token=')) {
                    return filePath; // Already a signed URL
                }
                // Try to extract path from public URL
                const urlMatch = filePath.match(/\/storage\/v1\/object\/public\/documents\/(.+)$/);
                if (urlMatch) {
                    filePath = urlMatch[1];
                } else {
                    return filePath; // Return as-is if we can't extract
                }
            }

            const signedUrlData = await api.post<{ signedUrl: string }>(
                '/api/files/signed-url',
                { bucket: 'documents', path: filePath, expiresIn: 3600 },
                { skipAuth: true }
            );
            return signedUrlData?.signedUrl || null;
        } catch (error) {
            console.error('Error generating signed URL:', error);
            return null;
        }
    };

    // Handler for viewing files
    const handleViewFile = async (url: string, name: string, path: string) => {
        // If we already have a signed URL, use it
        if (url && url.startsWith('http')) {
            setPreviewFile({ url, name });
            setIsPreviewOpen(true);
            return;
        }

        // Otherwise, generate a signed URL
        const signedUrl = await generateSignedUrl(path);
        if (signedUrl) {
            setPreviewFile({ url: signedUrl, name });
            setIsPreviewOpen(true);
        } else {
            toast({
                title: "Error",
                description: "Failed to generate preview URL",
                variant: "destructive"
            });
        }
    };

    const normalizeRuleValue = (value: any) => {
        if (value && typeof value === "object" && "value" in value) {
            return value.value;
        }
        return value;
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

    const buildCurrentValues = (values: Record<string, any>): Record<string, any> => {
        const normalized: Record<string, any> = {};
        Object.entries(values).forEach(([fieldId, value]) => {
            normalized[fieldId] = normalizeRuleValue(value);
        });
        return normalized;
    };

    const hasRequiredValue = (value: any): boolean => {
        if (value === undefined || value === null) return false;
        if (typeof value === "string") return value.trim() !== "";
        if (Array.isArray(value)) return value.length > 0;
        if (typeof value === "object" && "value" in value) {
            const nestedValue = value.value;
            if (Array.isArray(nestedValue)) return nestedValue.length > 0;
            if (typeof nestedValue === "string") return nestedValue.trim() !== "";
            return nestedValue !== undefined && nestedValue !== null;
        }
        return true;
    };

    const validateForm = () => {
        if (!data) return false;

        const formFields = data.step_config?.form_fields || {};
        const extFieldRules = (data.step_config?.field_rules as FieldRule[] | undefined) ?? [];
        const currentValues = buildCurrentValues(formData);
        const newErrors: Record<string, string> = {};
        let isValid = true;

        // Get all fields definition
        const fields = data.data_structure?.fields || [];

        Object.keys(formFields).forEach(fieldId => {
            const config = formFields[fieldId];
            if (config.shown === false) return;

            // Check visibility via centralized rules
            if (!evaluateFieldRules(fieldId, "visibility", extFieldRules, currentValues, true)) return;

            // Check required (fully driven by centralized rules)
            const isRequired = evaluateFieldRules(fieldId, "required", extFieldRules, currentValues, false);
            if (!isRequired) return;

            const value = currentValues[fieldId];
            if (!hasRequiredValue(value)) {
                const fieldDef = fields.find((f: any) => f.id === fieldId);
                newErrors[fieldId] = `${fieldDef?.name || 'Field'} is required`;
                isValid = false;
            }
        });

        // Field-level validation rules (format, length, range, etc.)
        const fieldValidations = (data.step_config?.field_validations as FieldValidationRule[] | undefined) ?? [];
        if (fieldValidations.length > 0) {
            const validationErrors = validateAllFields(fieldValidations, currentValues);
            for (const [fieldId, fieldErrors] of Object.entries(validationErrors)) {
                const fieldDef = fields.find((f: any) => f.id === fieldId);
                newErrors[fieldId] = `${fieldDef?.name || "Field"}: ${fieldErrors.join(", ")}`;
                isValid = false;
            }
        }

        setErrors(newErrors);
        return isValid;
    };

    const handleSubmit = async () => {
        if (!validateForm() || !data) return;

        try {
            setSubmitting(true);

            // 1. Submit the data using an edge function to bypass RLS (since user is anon)
            // We need a specific edge function for external submission or use execute_sql via RPC if we want to risk it
            // actually, we should create a secure function 'complete_external_step'
            // But for now, let's try to see if we can use the existing 'process-automatic-step' pattern or similar
            // Wait, anon users cannot update workflow_execution_steps due to RLS.
            // We need a new RPC function `complete_step_with_token` to securely handle this.


            const submitResult = await api.post<{ success?: boolean; validation?: { is_valid?: boolean; validation_comment?: string } }>(
                `/api/external/steps/${token}/submit`,
                { data: formData },
                { skipAuth: true }
            );

            if (submitResult?.success === false && submitResult?.validation?.is_valid === false) {
                toast({
                    title: "Validation Failed",
                    description: submitResult?.validation?.validation_comment || "The submitted data did not pass validation.",
                    variant: "destructive"
                });
                return;
            }

            setCompleted(true);
            toast({
                title: "Success",
                description: "Form submitted successfully"
            });

        } catch (error: any) {
            console.error("Error submitting form:", error);
            toast({
                title: "Error",
                description: error.message || "Failed to submit form",
                variant: "destructive"
            });
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div
                className="flex min-h-screen items-center justify-center bg-slate-50"
                style={{
                    ...theme.rootStyle,
                    backgroundImage: `radial-gradient(circle at 15% 10%, ${theme.softBackground} 0%, transparent 40%)`,
                    fontFamily: "'DM Sans', sans-serif",
                }}
            >
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (completed) {
        return (
            <div
                className="flex min-h-screen items-center justify-center bg-slate-50 p-4"
                style={{
                    ...theme.rootStyle,
                    backgroundImage: `radial-gradient(circle at 50% 0%, ${theme.softBackground} 0%, transparent 50%)`,
                    fontFamily: "'DM Sans', sans-serif",
                }}
            >
                <Card className="w-full max-w-md border-0 py-8 text-center shadow-xl">
                    <CardHeader>
                        <div
                            className="mx-auto mb-4 w-fit rounded-full p-3"
                            style={{ backgroundColor: withPortalAlpha(primaryColor, 0.14) }}
                        >
                            <svg className="h-6 w-6" fill="none" stroke={primaryColor} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <CardTitle>Thank You</CardTitle>
                        <CardDescription>Your response has been recorded successfully.</CardDescription>
                    </CardHeader>
                </Card>
            </div>
        );
    }

    if (!data) {
        return (
            <div
                className="flex min-h-screen items-center justify-center bg-slate-50 p-4"
                style={{
                    ...theme.rootStyle,
                    backgroundImage: `radial-gradient(circle at 10% 20%, ${theme.softBackground} 0%, transparent 45%)`,
                    fontFamily: "'DM Sans', sans-serif",
                }}
            >
                <Card className="w-full max-w-md border-0 py-8 text-center shadow-xl">
                    <CardHeader>
                        <div className="mx-auto bg-red-100 p-3 rounded-full w-fit mb-4">
                            <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </div>
                        <CardTitle>Invalid Link</CardTitle>
                        <CardDescription>This link is invalid or has expired.</CardDescription>
                    </CardHeader>
                </Card>
            </div>
        );
    }

    // Helper to get fields list safely
    const getFieldsList = () => {
        if (!data?.data_structure) return [];
        // Handle array or object structure
        if (Array.isArray(data.data_structure)) {
            return data.data_structure;
        }
        return data.data_structure.fields || [];
    };

    const allFields = getFieldsList();
    const renderFieldRules = (data?.step_config?.field_rules as FieldRule[] | undefined) ?? [];
    const formFields = data.step_config?.form_fields || {};
    const currentValues = buildCurrentValues(formData);

    const resolveBoundParamValue = (
        queryParam: { value?: string; mode?: "static" | "bind" },
        values: Record<string, any>
    ) => {
        const rawValue = (queryParam.value || "").trim();
        if (!rawValue) return "";

        if (queryParam.mode !== "bind") {
            return rawValue;
        }

        const templateMatch = rawValue.match(/^\{\{(.+)\}\}$/);
        const boundFieldId = (templateMatch?.[1] || rawValue).trim();
        if (!boundFieldId) return "";

        const boundValue = values[boundFieldId];
        return boundValue == null ? "" : String(boundValue);
    };

    const buildDynamicRequestUrl = (
        apiUrl: string,
        apiParams: unknown,
        fieldQueryParams: unknown,
        values: Record<string, any>
    ) => {
        const isAbsoluteUrl = /^https?:\/\//i.test(apiUrl);
        const parsedUrl = new URL(apiUrl, "http://placeholder.local");
        const mergedParams = new URLSearchParams(parsedUrl.search);

        parseKeyValuePairs(apiParams).forEach((param) => {
            mergedParams.set(param.key, param.value);
        });
        parseKeyValuePairs(fieldQueryParams).forEach((param) => {
            mergedParams.set(param.key, resolveBoundParamValue(param, values));
        });

        parsedUrl.search = mergedParams.toString();
        if (isAbsoluteUrl) {
            return parsedUrl.toString();
        }
        return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
    };

    const fetchDynamicOptionsForField = async (fieldId: string) => {
        if (!data?.company_id) return;

        const fieldDef = allFields.find((field: any) => field.id === fieldId);
        if (!fieldDef || fieldDef.options_source !== "dynamic" || !fieldDef.api_configuration_id) {
            return;
        }

        setLoadingDynamicOptions((prev) => ({ ...prev, [fieldId]: true }));
        setDynamicOptionsErrors((prev) => {
            const updated = { ...prev };
            delete updated[fieldId];
            return updated;
        });

        try {
            const configs = await api.get<{
                id: string;
                api_url: string;
                api_method?: string;
                api_headers?: unknown;
                api_params?: unknown;
            }[]>(`/api/companies/${data.company_id}/api-configurations`, { skipAuth: true });

            const apiConfig = Array.isArray(configs)
                ? configs.find((config) => config.id === fieldDef.api_configuration_id)
                : null;
            if (!apiConfig) {
                throw new Error("API configuration not found");
            }

            const requestUrl = buildDynamicRequestUrl(
                apiConfig.api_url,
                apiConfig.api_params,
                fieldDef.api_query_params,
                buildCurrentValues(formData)
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

            const responseData = await response.json();
            if (!Array.isArray(responseData)) {
                throw new Error("API response must be an array");
            }

            const options = responseData.map((item: any) => {
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

    const uploadFile = async (file: File) => {
        try {
            const formDataUpload = new FormData();
            formDataUpload.append('token', token!);
            formDataUpload.append('file', file);

            const uploadResult = await api.postFormData<{ path: string; fullPath?: string; original_name?: string }>(
                '/api/files/upload',
                formDataUpload,
                { skipAuth: true }
            );

            const signedUrl = await generateSignedUrl(uploadResult.path);
            return { ...uploadResult, signedUrl };
        } catch (error: unknown) {
            console.error("Upload error:", error);
            toast({
                title: "Upload Failed",
                description: error instanceof Error ? error.message : "Failed to upload file",
                variant: "destructive"
            });
            return null;
        }
    };

    // Helper to render fields
    const renderField = (fieldId: string, labelPosition: "top" | "side" = "top") => {
        const fieldDef = allFields.find((f: any) => f.id === fieldId);

        if (!fieldDef) return null;

        const fieldConfig = formFields[fieldId];
        // Fields in blocks are visible by default (shown: true), but we still check if explicitly hidden
        if (fieldConfig?.shown === false) return null;

        // Check visibility via centralized rules
        if (!evaluateFieldRules(fieldId, "visibility", renderFieldRules, currentValues, true)) return null;

        const handleFileUpload = async (file: File) => {
            const uploadResult = await uploadFile(file);
            if (!uploadResult) return;

                // Update form data with the file path and original name
                // Replace value with object containing path and original name
                setFormData(prev => ({
                    ...prev,
                    [fieldId]: {
                        value: uploadResult.path,
                        original_name: uploadResult.original_name || file.name
                    }
                }));

                // Store signed URL
                if (uploadResult.signedUrl) {
                    setSignedUrls(prev => ({
                        ...prev,
                        [fieldId]: uploadResult.signedUrl!
                    }));
                }

                toast({
                    title: "Success",
                    description: "File uploaded successfully"
                });
        };

        const signedUrl = signedUrls[fieldId];

        return (
            <div className="space-y-2" key={fieldId}>
                <FieldRenderer
                    field={fieldDef}
                    value={formData[fieldId]}
                    onChange={(val) => {
                        setFormData(prev => ({ ...prev, [fieldId]: val }));
                        // Clear error when user types
                        if (errors[fieldId]) {
                            setErrors(prev => {
                                const newErrs = { ...prev };
                                delete newErrs[fieldId];
                                return newErrs;
                            });
                        }
                    }}
                    onUpload={handleFileUpload}
                    onViewFile={handleViewFile}
                    signedUrl={signedUrl}
                    disabled={submitting}
                    required={evaluateFieldRules(fieldId, "required", renderFieldRules, currentValues, false)}
                    labelPosition={labelPosition}
                    fieldConfig={fieldConfig}
                    getSignedUrl={generateSignedUrl}
                    childFields={allFields}
                    dynamicOptions={dynamicOptions[fieldId]}
                    isLoadingDynamic={loadingDynamicOptions[fieldId]}
                    dynamicError={dynamicOptionsErrors[fieldId]}
                    onRetryDynamic={() => fetchDynamicOptionsForField(fieldId)}
                    renderChild={(childField, childValue, onChildChange, hideLabel, requiredChild, readonly) => {
                        const isRequired =
                            requiredChild !== undefined ? requiredChild : (childField.required || false);
                        const isDisabled = submitting || !!readonly;
                        const childFieldType = childField.field_type || childField.type;
                        const isFileChild = childFieldType === "file";
                        const isSignatureChild = childFieldType === "signature";
                        const childFilePath =
                            (isFileChild || isSignatureChild) && childValue
                                ? typeof childValue === "string"
                                    ? childValue
                                    : childValue?.value
                                : null;

                        const uploadForChild = async (file: File) => {
                            const uploadResult = await uploadFile(file);
                            if (!uploadResult) return;
                            if (uploadResult.signedUrl) {
                                setSignedUrls((prev) => ({
                                    ...prev,
                                    [uploadResult.path]: uploadResult.signedUrl!,
                                }));
                            }
                            onChildChange({
                                value: uploadResult.path,
                                original_name: uploadResult.original_name || file.name,
                            });
                            return uploadResult.signedUrl;
                        };

                        return (
                            <FieldRenderer
                                field={childField}
                                value={childValue}
                                onChange={onChildChange}
                                disabled={isDisabled}
                                required={isRequired}
                                labelPosition={hideLabel ? "hidden" : "top"}
                                dynamicOptions={dynamicOptions[childField.id]}
                                isLoadingDynamic={loadingDynamicOptions[childField.id]}
                                dynamicError={dynamicOptionsErrors[childField.id]}
                                onRetryDynamic={() => fetchDynamicOptionsForField(childField.id)}
                                onUpload={isFileChild || isSignatureChild ? uploadForChild : undefined}
                                onViewFile={handleViewFile}
                                onDelete={
                                    isFileChild || isSignatureChild
                                        ? async (filePath: string) => {
                                              setSignedUrls((prev) => {
                                                  const next = { ...prev };
                                                  delete next[filePath];
                                                  return next;
                                              });
                                              onChildChange(null);
                                          }
                                        : undefined
                                }
                                signedUrl={
                                    (isFileChild || isSignatureChild) && childFilePath
                                        ? signedUrls[childFilePath]
                                        : signedUrls[childField.id]
                                }
                            />
                        );
                    }}
                />
                {errors[fieldId] && (
                    <p className="text-sm text-red-500">{errors[fieldId]}</p>
                )}
            </div>
        );
    };

    const formPages = getFormPagesFromConfig(data.step_config || {});

    // If form has page/block structure, collect field IDs from pages → blocks; otherwise from formFields
    let visibleFieldIds: string[];
    if (formPages.length > 0 && formPages.some((p) => p.blocks.length > 0)) {
        const fieldIdsInStructure = new Set<string>();
        formPages.forEach((page) => {
            page.blocks.forEach((block) => {
                block.columns_content.forEach((column) => {
                    column.forEach((fieldId) => fieldIdsInStructure.add(fieldId));
                });
            });
        });
        visibleFieldIds = Array.from(fieldIdsInStructure);
    } else {
        visibleFieldIds = Object.keys(formFields).filter(
            (fieldId) => formFields[fieldId]?.shown !== false
        );
    }

    // Sort fields by position if available, otherwise preserve order
    const sortedFields = [...allFields].sort((a: any, b: any) => {
        const posA = a.position ?? 999999;
        const posB = b.position ?? 999999;
        return posA - posB;
    });

    // Filter to only include visible fields and maintain sort order
    const visibleFields = sortedFields
        .filter((f: any) => visibleFieldIds.includes(f.id))
        .map((f: any) => f.id);

    // If form has page/block structure, use page → block → fields rendering (same as internal)
    if (formPages.length > 0 && formPages.some((p) => p.blocks.length > 0)) {
        return (
            <div
                className="min-h-screen px-4 py-12 sm:px-6 lg:px-8"
                style={{
                    ...theme.rootStyle,
                    background:
                        "linear-gradient(180deg, rgba(248,250,252,1) 0%, rgba(241,245,249,1) 45%, rgba(248,250,252,1) 100%)",
                    fontFamily: "'DM Sans', sans-serif",
                }}
            >
                <style>{`
.external-form-shell { border: 1px solid ${theme.softBorder}; box-shadow: 0 20px 60px -38px ${withPortalAlpha(primaryColor, 0.45)}; }
.external-form select:focus-visible,
.external-form input:focus-visible,
.external-form textarea:focus-visible { --tw-ring-color: ${primaryColor}; box-shadow: 0 0 0 4px ${withPortalAlpha(primaryColor, 0.2)}; }
.external-form button[role="combobox"] { border-color: ${theme.softBorder}; color: inherit; }
.external-form button[role="combobox"]:hover,
.external-form button[role="combobox"][data-state="open"] { background-color: ${primaryColor} !important; color: white !important; border-color: ${primaryColor} !important; }
.external-form-submit { background-color: ${primaryColor} !important; color: white !important; border: none; }
.external-form-submit:hover:not(:disabled) { filter: brightness(0.92); }
.external-form-pagination { border-color: ${theme.softBorder}; color: ${primaryColor}; }
.external-form-pagination:hover:not(:disabled) { background-color: ${primaryColor} !important; border-color: ${primaryColor} !important; color: white !important; }
`}</style>
                <div className="mx-auto max-w-5xl">
                    <div className="mb-10 text-center">
                        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">{data.workflow_name}</h1>
                        <p className="mx-auto mt-3 max-w-2xl text-slate-600">Please complete the form below</p>
                        {renderLanguageTags()}
                    </div>

                    <Card className="external-form-shell overflow-hidden rounded-2xl border-0 bg-white/95">
                        <CardHeader>
                            <CardTitle className="text-xl font-semibold text-slate-900">Fill required fields to continue</CardTitle>
                        </CardHeader>
                        <CardContent className="external-form p-7 md:p-9">
                            <FormPageStepper
                                pages={formPages}
                                currentIndex={formPageIndex}
                                onPageChange={setFormPageIndex}
                                getStepLabel={(page, idx) => page.title || `Page ${idx + 1}`}
                                className="mb-6"
                                primaryColor={primaryColor}
                            />
                            <form onSubmit={e => e.preventDefault()} className="w-full space-y-6">
                                {(() => {
                                    const currentIndex = Math.min(Math.max(0, formPageIndex), formPages.length - 1);
                                    const page = formPages[currentIndex];
                                    if (!page) return null;
                                    return (
                                        <div key={page.id} className="space-y-4">
                                            {page.blocks.map((block) => (
                                                <div key={block.id} className={cn(block.compact ? "space-y-2" : "space-y-4")}>
                                                    {block.title && (
                                                        <div className={cn(block.compact ? "pt-1 pb-0.5" : "pt-2 pb-1")}>
                                                            <h3
                                                                className={cn("border-b font-semibold text-slate-900", block.compact ? "text-sm pb-0.5" : "text-base pb-1")}
                                                                style={{ borderColor: theme.softBorder }}
                                                            >
                                                                {block.title}
                                                            </h3>
                                                        </div>
                                                    )}
                                                    <div
                                                        className={cn(
                                                            "grid",
                                                            block.compact ? "gap-2" : "gap-4",
                                                            block.columns === 1
                                                                ? "grid-cols-1"
                                                                : block.columns === 2
                                                                ? "grid-cols-1 md:grid-cols-2"
                                                                : block.columns === 3
                                                                ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                                                                : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                                                        )}
                                                    >
                                                        {block.columns_content.map((column, colIndex) => {
                                                            const columnName = block.column_names?.[colIndex];
                                                            const labelPosition = block.label_positions?.[colIndex] || "top";
                                                            const columnContent = (
                                                                <div className={cn(block.compact ? "space-y-2" : "space-y-3 sm:space-y-4")}>
                                                                    {column.map((fieldUuid) => renderField(fieldUuid, labelPosition))}
                                                                </div>
                                                            );
                                                            if (columnName) {
                                                                return (
                                                                    <div
                                                                        key={colIndex}
                                                                        className={cn("rounded-lg border bg-slate-50/60", block.compact ? "p-2" : "p-3")}
                                                                        style={{ borderColor: theme.softBorder }}
                                                                    >
                                                                        <div className={cn("border-b", block.compact ? "mb-1 pb-1" : "mb-2 pb-2")} style={{ borderColor: theme.softBorder }}>
                                                                            <h4 className={cn("font-semibold", block.compact ? "text-xs" : "text-sm")}>{columnName}</h4>
                                                                        </div>
                                                                        {columnContent}
                                                                    </div>
                                                                );
                                                            }
                                                            return <div key={colIndex}>{columnContent}</div>;
                                                        })}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })()}
                            </form>

                            {formPages.length > 1 && (
                                <div className="mt-6 flex items-center justify-between gap-4 border-t pt-5" style={{ borderColor: theme.softBorder }}>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="external-form-pagination"
                                        disabled={formPageIndex <= 0}
                                        onClick={() => setFormPageIndex((i) => Math.max(0, i - 1))}
                                    >
                                        <ChevronLeft className="h-4 w-4 mr-1" />
                                        Previous
                                    </Button>
                                    <span className="text-sm text-muted-foreground">
                                        {formPageIndex + 1} / {formPages.length}
                                    </span>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="external-form-pagination"
                                        disabled={formPageIndex >= formPages.length - 1}
                                        onClick={() => setFormPageIndex((i) => Math.min(formPages.length - 1, i + 1))}
                                    >
                                        Next
                                        <ChevronRight className="h-4 w-4 ml-1" />
                                    </Button>
                                </div>
                            )}

                            {(formPages.length <= 1 || formPageIndex >= formPages.length - 1) && (
                                <div className="pt-4">
                                    <Button
                                        className="external-form-submit w-full"
                                        size="lg"
                                        onClick={handleSubmit}
                                        disabled={submitting}
                                        aria-label="Submit"
                                    >
                                        {submitting ? (
                                            <Loader2 className="h-5 w-5 animate-spin" />
                                        ) : (
                                            <Send className="h-5 w-5" />
                                        )}
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* File Preview Dialog */}
                <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
                    <DialogContent className="max-w-6xl max-h-[90vh] p-0 overflow-hidden">
                        {previewFile && (
                            <div className="h-[85vh] overflow-hidden">
                                <FileViewer
                                    fileUrl={previewFile.url}
                                    fileName={previewFile.name}
                                    onClose={() => setIsPreviewOpen(false)}
                                    hideCloseButton={true}
                                />
                            </div>
                        )}
                    </DialogContent>
                </Dialog>
            </div>
        );
    }

    // Fallback to simple list rendering
    return (
        <div
            className="min-h-screen px-4 py-12 sm:px-6 lg:px-8"
            style={{
                ...theme.rootStyle,
                background:
                    "linear-gradient(180deg, rgba(248,250,252,1) 0%, rgba(241,245,249,1) 45%, rgba(248,250,252,1) 100%)",
                fontFamily: "'DM Sans', sans-serif",
            }}
        >
            <style>{`
.external-form-shell { border: 1px solid ${theme.softBorder}; box-shadow: 0 20px 60px -38px ${withPortalAlpha(primaryColor, 0.45)}; }
.external-form select:focus-visible,
.external-form input:focus-visible,
.external-form textarea:focus-visible { --tw-ring-color: ${primaryColor}; box-shadow: 0 0 0 4px ${withPortalAlpha(primaryColor, 0.2)}; }
.external-form button[role="combobox"] { border-color: ${theme.softBorder}; color: inherit; }
.external-form button[role="combobox"]:hover,
.external-form button[role="combobox"][data-state="open"] { background-color: ${primaryColor} !important; color: white !important; border-color: ${primaryColor} !important; }
.external-form-submit { background-color: ${primaryColor} !important; color: white !important; border: none; }
.external-form-submit:hover:not(:disabled) { filter: brightness(0.92); }
`}</style>
            <div className="mx-auto max-w-5xl">
                <div className="mb-10 text-center">
                    <h1 className="text-3xl font-semibold tracking-tight text-slate-900 md:text-4xl">{data.workflow_name}</h1>
                    <p className="mx-auto mt-3 max-w-2xl text-slate-600">Please complete the form below</p>
                    {renderLanguageTags()}
                </div>

                <Card className="external-form-shell overflow-hidden rounded-2xl border-0 bg-white/95">
                    <CardContent className="external-form space-y-6 p-7 md:p-9">
                        {visibleFields.map(fieldId => renderField(fieldId))}

                        <div className="pt-4">
                            <Button
                                className="external-form-submit w-full"
                                size="lg"
                                onClick={handleSubmit}
                                disabled={submitting}
                                aria-label="Submit"
                            >
                                {submitting ? (
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                ) : (
                                    <Send className="h-5 w-5" />
                                )}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* File Preview Dialog */}
            <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
                <DialogContent className="max-w-6xl max-h-[90vh] p-0 overflow-hidden">
                    {previewFile && (
                        <div className="h-[85vh] overflow-hidden">
                            <FileViewer
                                fileUrl={previewFile.url}
                                fileName={previewFile.name}
                                onClose={() => setIsPreviewOpen(false)}
                                hideCloseButton={true}
                            />
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
};
