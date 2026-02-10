import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { FieldRenderer } from "@/components/execution/form/FieldRenderer";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FileViewer } from "@/components/execution/FileViewer";
import { cn } from "@/lib/utils";

interface ExecutionData {
    execution_step_id: string;
    execution_id: string;
    workflow_step_id: string;
    status: string;
    step_config: any;
    workflow_name: string;
    company_id: string;
    data_structure: any;
}

export const ExternalForm = () => {
    const { token } = useParams<{ token: string }>();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [completed, setCompleted] = useState(false);
    const [data, setData] = useState<ExecutionData | null>(null);
    const [formData, setFormData] = useState<Record<string, any>>({});
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    const [previewFile, setPreviewFile] = useState<{ url: string; name: string } | null>(null);
    const [signedUrls, setSignedUrls] = useState<Record<string, string>>({}); // fieldId -> signedUrl for single files
    const [signedUrlsMultiple, setSignedUrlsMultiple] = useState<Record<string, Record<number, string>>>({}); // fieldId -> {index -> signedUrl} for multiple files

    useEffect(() => {
        if (!token) return;

        const fetchData = async () => {
            try {
                setLoading(true);
                const stepData = await api.get<ExecutionData>(`/api/external/steps/${token}`, { skipAuth: true });
                setData(stepData);
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

    const validateForm = () => {
        if (!data) return false;

        const formFields = data.step_config?.form_fields || {};
        const newErrors: Record<string, string> = {};
        let isValid = true;

        // Get all fields definition
        const fields = data.data_structure?.fields || [];

        Object.keys(formFields).forEach(fieldId => {
            const config = formFields[fieldId];
            if (config.shown === false) return;
            if (!config.required) return;

            const value = formData[fieldId];
            // Simple validation for required fields
            if (value === undefined || value === null || value === "") {
                const fieldDef = fields.find((f: any) => f.id === fieldId);
                newErrors[fieldId] = `${fieldDef?.name || 'Field'} is required`;
                isValid = false;
            }
        });

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
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (completed) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
                <Card className="w-full max-w-md text-center py-8">
                    <CardHeader>
                        <div className="mx-auto bg-green-100 p-3 rounded-full w-fit mb-4">
                            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
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
            <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
                <Card className="w-full max-w-md text-center py-8">
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

    // Helper to render fields
    const renderField = (fieldId: string, labelPosition: "top" | "side" = "top") => {
        const fieldDef = allFields.find((f: any) => f.id === fieldId);

        if (!fieldDef) return null;

        const handleFileUpload = async (file: File) => {
            try {
                // Set uploading state for this specific field if possible
                // For now, global submitting state or we'd need per-field state
                // Ideally FieldRenderer supports individual loading, but we are passing props.
                // We'll trust the user interface feedback for now or could add local state map.

                const formDataUpload = new FormData();
                formDataUpload.append('token', token!);
                formDataUpload.append('file', file);

                const uploadResult = await api.postFormData<{ path: string; fullPath?: string; original_name?: string }>(
                    '/api/files/upload',
                    formDataUpload,
                    { skipAuth: true }
                );

                const signedUrl = await generateSignedUrl(uploadResult.path);

                // Update form data with the file path and original name
                const fieldType = fieldDef.field_type || fieldDef.type;
                if (fieldType === "multiple_files") {
                    // For multiple_files, append to array
                    setFormData(prev => {
                        const currentValue = prev[fieldId];
                        let currentFiles: string[] = [];
                        let currentOriginalNames: string[] = [];
                        
                        if (currentValue && typeof currentValue === 'object' && 'value' in currentValue) {
                            currentFiles = Array.isArray(currentValue.value) ? currentValue.value : [currentValue.value];
                            currentOriginalNames = Array.isArray(currentValue.original_name) ? currentValue.original_name : [];
                        } else if (Array.isArray(currentValue)) {
                            currentFiles = currentValue;
                        } else if (currentValue) {
                            currentFiles = [currentValue];
                        }
                        
                        const newFiles = [...currentFiles, uploadResult.path];
                        const newOriginalNames = [...currentOriginalNames, uploadResult.original_name || file.name];
                        
                        // Update signed URLs for multiple files
                        if (signedUrl) {
                            setSignedUrlsMultiple(prev => {
                                const current = prev[fieldId] || {};
                                const newIndex = newFiles.length - 1;
                                return {
                                    ...prev,
                                    [fieldId]: {
                                        ...current,
                                        [newIndex]: signedUrl
                                    }
                                };
                            });
                        }
                        
                        return { 
                            ...prev, 
                            [fieldId]: {
                                value: newFiles,
                                original_name: newOriginalNames
                            }
                        };
                    });
                } else {
                    // For single file, replace value with object containing path and original name
                    setFormData(prev => ({ 
                        ...prev, 
                        [fieldId]: {
                            value: uploadResult.path,
                            original_name: uploadResult.original_name || file.name
                        }
                    }));

                    // Store signed URL for single file
                    if (signedUrl) {
                        setSignedUrls(prev => ({
                            ...prev,
                            [fieldId]: signedUrl
                        }));
                    }
                }

                toast({
                    title: "Success",
                    description: "File uploaded successfully"
                });

            } catch (error: unknown) {
                console.error("Upload error:", error);
                toast({
                    title: "Upload Failed",
                    description: error instanceof Error ? error.message : "Failed to upload file",
                    variant: "destructive"
                });
            }
        };

        const fieldType = fieldDef.field_type || fieldDef.type;
        const isMultipleFiles = fieldType === "multiple_files";
        const signedUrl = signedUrls[fieldId];
        const signedUrlsForField = signedUrlsMultiple[fieldId] || {};

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
                    signedUrls={isMultipleFiles ? signedUrlsForField : undefined}
                    // Basic props
                    disabled={submitting}
                    required={data.step_config?.form_fields?.[fieldId]?.required}
                    labelPosition={labelPosition}
                // We might need to mock or omit some complex props like dynamicOptions for external view for now
                // unless we expose those APIs publicly too
                />
                {errors[fieldId] && (
                    <p className="text-sm text-red-500">{errors[fieldId]}</p>
                )}
            </div>
        );
    };

    const formFields = data.step_config?.form_fields || {};
    const formBlocks = (data.step_config?.form_blocks || []) as Array<{
        id: string;
        title?: string;
        columns: 1 | 2 | 3 | 4;
        columns_content: string[][];
        column_names?: string[];
        label_positions?: ("top" | "side")[];
        compact?: boolean;
    }>;

    // If form_blocks exist, only show fields that are in the blocks
    // Otherwise, only show fields that are explicitly in formFields (not just all fields)
    let visibleFieldIds: string[];
    
    if (formBlocks && formBlocks.length > 0) {
        // Collect all field IDs from blocks
        const fieldIdsInBlocks = new Set<string>();
        formBlocks.forEach((block) => {
            block.columns_content.forEach((column) => {
                column.forEach((fieldId) => fieldIdsInBlocks.add(fieldId));
            });
        });
        visibleFieldIds = Array.from(fieldIdsInBlocks);
    } else {
        // Only show fields that are explicitly in formFields and not hidden
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

    // If form_blocks exist, use block-based rendering
    if (formBlocks && formBlocks.length > 0) {
        return (
            <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
                <div className="max-w-3xl mx-auto">
                    <div className="text-center mb-8">
                        <h1 className="text-3xl font-bold text-gray-900">{data.workflow_name}</h1>
                        <p className="mt-2 text-gray-600">Please complete the form below</p>
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle>Fill required fields to continue</CardTitle>
                        </CardHeader>
                        <CardContent className="p-6">
                            <form onSubmit={e => e.preventDefault()} className="w-full space-y-6">
                                {formBlocks.map((block) => (
                                    <div key={block.id} className={cn(block.compact ? "space-y-2" : "space-y-4")}>
                                        {/* Block Title */}
                                        {block.title && (
                                            <div className={cn(block.compact ? "pt-1 pb-0.5" : "pt-2 pb-1")}>
                                                <h3 className={cn("font-semibold border-b", block.compact ? "text-sm pb-0.5" : "text-base pb-1")}>{block.title}</h3>
                                            </div>
                                        )}
                                        {/* Block Columns */}
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
                                                
                                                // If column has a name, wrap it in a group with background
                                                if (columnName) {
                                                    return (
                                                        <div key={colIndex} className={cn("border rounded-md bg-muted/20", block.compact ? "p-2" : "p-3")}>
                                                            <div className={cn("border-b", block.compact ? "mb-1 pb-1" : "mb-2 pb-2")}>
                                                                <h4 className={cn("font-semibold", block.compact ? "text-xs" : "text-sm")}>{columnName}</h4>
                                                            </div>
                                                            {columnContent}
                                                        </div>
                                                    );
                                                }
                                                
                                                return (
                                                    <div key={colIndex}>
                                                        {columnContent}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </form>

                            <div className="pt-4">
                                <Button
                                    className="w-full"
                                    size="lg"
                                    onClick={handleSubmit}
                                    disabled={submitting}
                                >
                                    {submitting ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Submitting...
                                        </>
                                    ) : (
                                        "Submit"
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
    }

    // Fallback to simple list rendering
    return (
        <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-gray-900">{data.workflow_name}</h1>
                    <p className="mt-2 text-gray-600">Please complete the form below</p>
                </div>

                <Card>
                    <CardContent className="p-6 space-y-6">
                        {visibleFields.map(fieldId => renderField(fieldId))}

                        <div className="pt-4">
                            <Button
                                className="w-full"
                                size="lg"
                                onClick={handleSubmit}
                                disabled={submitting}
                            >
                                {submitting ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Submitting...
                                    </>
                                ) : (
                                    "Submit"
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
