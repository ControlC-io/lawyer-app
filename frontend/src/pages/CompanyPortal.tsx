import { useEffect, useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { FieldRenderer } from "@/components/execution/form/FieldRenderer";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FileViewer } from "@/components/execution/FileViewer";
import { cn } from "@/lib/utils";
import {
  getFormPagesFromConfig,
  evaluateFieldRules,
  validateAllFields,
  type FieldRule,
  type FieldValidationRule,
} from "@/lib/formConfig";
import { FormPageStepper } from "@/components/execution/FormPageStepper";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PortalInfo {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  portal_description: string | null;
  portal_primary_color: string | null;
}

interface PortalWorkflow {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
}

interface WorkflowDetail {
  workflow: {
    id: string;
    name: string;
    description: string | null;
    icon: string | null;
    data_structure: any;
  };
  first_step: {
    id: string;
    name: string;
    config: any;
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CompanyPortal() {
  const { slug } = useParams<{ slug: string }>();

  // Portal info
  const [portal, setPortal] = useState<PortalInfo | null>(null);
  const [workflows, setWorkflows] = useState<PortalWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected workflow
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [workflowDetail, setWorkflowDetail] = useState<WorkflowDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Form state
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [formPageIndex, setFormPageIndex] = useState(0);

  // File preview
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<{ url: string; name: string } | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [signedUrlsMultiple, setSignedUrlsMultiple] = useState<Record<string, Record<number, string>>>({});

  // Primary color from portal
  const primaryColor = portal?.portal_primary_color || "#3B82F6";

  // Fetch portal info + workflows
  useEffect(() => {
    if (!slug) return;
    const fetchPortal = async () => {
      try {
        setLoading(true);
        const [portalData, workflowsData] = await Promise.all([
          api.get<PortalInfo>(`/api/portal/${slug}`, { skipAuth: true }),
          api.get<PortalWorkflow[]>(`/api/portal/${slug}/workflows`, { skipAuth: true }),
        ]);
        setPortal(portalData);
        setWorkflows(workflowsData);
      } catch (err: any) {
        setError(err.message || "Portal not found");
      } finally {
        setLoading(false);
      }
    };
    fetchPortal();
  }, [slug]);

  // Fetch workflow detail when selected
  useEffect(() => {
    if (!selectedWorkflowId || !slug) return;
    const fetchDetail = async () => {
      try {
        setLoadingDetail(true);
        const detail = await api.get<WorkflowDetail>(
          `/api/portal/${slug}/workflows/${selectedWorkflowId}`,
          { skipAuth: true }
        );
        setWorkflowDetail(detail);
        setFormData({});
        setErrors({});
        setFormPageIndex(0);
      } catch (err: any) {
        toast({
          title: "Error",
          description: err.message || "Failed to load workflow",
          variant: "destructive",
        });
        setSelectedWorkflowId(null);
      } finally {
        setLoadingDetail(false);
      }
    };
    fetchDetail();
  }, [selectedWorkflowId, slug]);

  // ---------------------------------------------------------------------------
  // File upload helpers (same pattern as ExternalForm)
  // ---------------------------------------------------------------------------

  const generateSignedUrl = async (filePath: string): Promise<string | null> => {
    try {
      if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
        if (filePath.includes("?token=")) return filePath;
        const urlMatch = filePath.match(/\/storage\/v1\/object\/public\/documents\/(.+)$/);
        if (urlMatch) filePath = urlMatch[1];
        else return filePath;
      }
      const data = await api.post<{ signedUrl: string }>(
        "/api/files/signed-url",
        { bucket: "documents", path: filePath, expiresIn: 3600 },
        { skipAuth: true }
      );
      return data?.signedUrl || null;
    } catch {
      return null;
    }
  };

  const handleViewFile = async (url: string, name: string, path: string) => {
    if (url && url.startsWith("http")) {
      setPreviewFile({ url, name });
      setIsPreviewOpen(true);
      return;
    }
    const signedUrl = await generateSignedUrl(path);
    if (signedUrl) {
      setPreviewFile({ url: signedUrl, name });
      setIsPreviewOpen(true);
    }
  };

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  const validateForm = () => {
    if (!workflowDetail) return false;
    const stepConfig = workflowDetail.first_step.config || {};
    const formFields = stepConfig.form_fields || {};
    const extFieldRules = (stepConfig.field_rules as FieldRule[] | undefined) ?? [];
    const newErrors: Record<string, string> = {};
    let isValid = true;

    const fields = workflowDetail.workflow.data_structure?.fields
      ?? (Array.isArray(workflowDetail.workflow.data_structure) ? workflowDetail.workflow.data_structure : []);

    Object.keys(formFields).forEach((fieldId) => {
      const config = formFields[fieldId];
      if (config.shown === false) return;
      if (!evaluateFieldRules(fieldId, "visibility", extFieldRules, formData, true)) return;
      const isRequired = evaluateFieldRules(fieldId, "required", extFieldRules, formData, false);
      if (!isRequired) return;
      const value = formData[fieldId];
      if (value === undefined || value === null || value === "") {
        const fieldDef = fields.find((f: any) => f.id === fieldId);
        newErrors[fieldId] = `${fieldDef?.name || "Field"} is required`;
        isValid = false;
      }
    });

    const fieldValidations = (stepConfig.field_validations as FieldValidationRule[] | undefined) ?? [];
    if (fieldValidations.length > 0) {
      const validationErrors = validateAllFields(fieldValidations, formData);
      for (const [fieldId, fieldErrors] of Object.entries(validationErrors)) {
        const fieldDef = fields.find((f: any) => f.id === fieldId);
        newErrors[fieldId] = `${fieldDef?.name || "Field"}: ${fieldErrors.join(", ")}`;
        isValid = false;
      }
    }

    setErrors(newErrors);
    return isValid;
  };

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  const handleSubmit = async () => {
    if (!validateForm() || !workflowDetail || !slug) return;
    try {
      setSubmitting(true);
      const result = await api.post<{
        success?: boolean;
        validation?: { is_valid?: boolean; validation_comment?: string };
      }>(
        `/api/portal/${slug}/workflows/${workflowDetail.workflow.id}/submit`,
        { data: formData },
        { skipAuth: true }
      );

      if (result?.success === false && result?.validation?.is_valid === false) {
        toast({
          title: "Validation Failed",
          description: result.validation.validation_comment || "The submitted data did not pass validation.",
          variant: "destructive",
        });
        return;
      }

      setCompleted(true);
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to submit form",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Field renderer helper
  // ---------------------------------------------------------------------------

  const allFields = useMemo(() => {
    if (!workflowDetail) return [];
    const ds = workflowDetail.workflow.data_structure;
    if (!ds) return [];
    if (Array.isArray(ds)) return ds;
    return ds.fields || [];
  }, [workflowDetail]);

  const fieldRules = useMemo<FieldRule[]>(() => {
    return (workflowDetail?.first_step?.config?.field_rules as FieldRule[] | undefined) ?? [];
  }, [workflowDetail]);

  const renderField = (fieldId: string, labelPosition: "top" | "side" = "top") => {
    const fieldDef = allFields.find((f: any) => f.id === fieldId);
    if (!fieldDef) return null;

    const handleFileUpload = async (file: File) => {
      try {
        const fd = new FormData();
        fd.append("file", file);
        const uploadResult = await api.postFormData<{ path: string; original_name?: string }>(
          "/api/files/upload",
          fd,
          { skipAuth: true }
        );
        const signedUrl = await generateSignedUrl(uploadResult.path);
        const fieldType = fieldDef.field_type || fieldDef.type;

        if (fieldType === "multiple_files") {
          setFormData((prev) => {
            const current = prev[fieldId];
            let currentFiles: string[] = [];
            let currentOriginalNames: string[] = [];
            if (current && typeof current === "object" && "value" in current) {
              currentFiles = Array.isArray(current.value) ? current.value : [current.value];
              currentOriginalNames = Array.isArray(current.original_name) ? current.original_name : [];
            } else if (Array.isArray(current)) {
              currentFiles = current;
            } else if (current) {
              currentFiles = [current];
            }
            const newFiles = [...currentFiles, uploadResult.path];
            const newOriginalNames = [...currentOriginalNames, uploadResult.original_name || file.name];
            if (signedUrl) {
              setSignedUrlsMultiple((p) => ({
                ...p,
                [fieldId]: { ...(p[fieldId] || {}), [newFiles.length - 1]: signedUrl },
              }));
            }
            return {
              ...prev,
              [fieldId]: { value: newFiles, original_name: newOriginalNames },
            };
          });
        } else {
          setFormData((prev) => ({
            ...prev,
            [fieldId]: { value: uploadResult.path, original_name: uploadResult.original_name || file.name },
          }));
          if (signedUrl) setSignedUrls((prev) => ({ ...prev, [fieldId]: signedUrl }));
        }
      } catch (err: any) {
        toast({
          title: "Upload Failed",
          description: err.message || "Failed to upload file",
          variant: "destructive",
        });
      }
    };

    const fieldType = fieldDef.field_type || fieldDef.type;
    const isMultipleFiles = fieldType === "multiple_files";

    return (
      <div className="space-y-2" key={fieldId}>
        <FieldRenderer
          field={fieldDef}
          value={formData[fieldId]}
          onChange={(val) => {
            setFormData((prev) => ({ ...prev, [fieldId]: val }));
            if (errors[fieldId]) {
              setErrors((prev) => {
                const newErrs = { ...prev };
                delete newErrs[fieldId];
                return newErrs;
              });
            }
          }}
          onUpload={handleFileUpload}
          onViewFile={handleViewFile}
          signedUrl={signedUrls[fieldId]}
          signedUrls={isMultipleFiles ? signedUrlsMultiple[fieldId] : undefined}
          disabled={submitting}
          required={evaluateFieldRules(fieldId, "required", fieldRules, formData, false)}
          labelPosition={labelPosition}
        />
        {errors[fieldId] && <p className="text-sm text-red-500">{errors[fieldId]}</p>}
      </div>
    );
  };

  // ---------------------------------------------------------------------------
  // Render: Loading
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: primaryColor }} />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Error / not found
  // ---------------------------------------------------------------------------

  if (error || !portal) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
        <Card className="w-full max-w-md text-center py-8">
          <CardHeader>
            <div className="mx-auto bg-red-100 p-3 rounded-full w-fit mb-4">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <CardTitle>Portal Not Found</CardTitle>
            <CardDescription>{error || "This portal does not exist or is not available."}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Success
  // ---------------------------------------------------------------------------

  if (completed) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
        <Card className="w-full max-w-md text-center py-8">
          <CardHeader>
            <div className="mx-auto p-3 rounded-full w-fit mb-4" style={{ backgroundColor: `${primaryColor}20` }}>
              <svg className="w-6 h-6" fill="none" stroke={primaryColor} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <CardTitle>Thank You!</CardTitle>
            <CardDescription>Your response has been recorded successfully.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={() => {
                setCompleted(false);
                setSelectedWorkflowId(null);
                setWorkflowDetail(null);
                setFormData({});
                setErrors({});
              }}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to portal
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Form view (workflow selected)
  // ---------------------------------------------------------------------------

  if (selectedWorkflowId && workflowDetail) {
    const stepConfig = workflowDetail.first_step.config || {};
    const formPages = getFormPagesFromConfig(stepConfig);
    const formFields = stepConfig.form_fields || {};
    const hasPages = formPages.length > 0 && formPages.some((p: any) => p.blocks.length > 0);

    // Collect visible fields for fallback
    const visibleFieldIds = hasPages
      ? (() => {
          const ids = new Set<string>();
          formPages.forEach((p: any) => p.blocks.forEach((b: any) => b.columns_content.forEach((c: any) => c.forEach((fid: string) => ids.add(fid)))));
          return Array.from(ids);
        })()
      : Object.keys(formFields).filter((fid) => formFields[fid]?.shown !== false);

    const sortedFields = [...allFields]
      .sort((a: any, b: any) => (a.position ?? 999999) - (b.position ?? 999999))
      .filter((f: any) => visibleFieldIds.includes(f.id))
      .map((f: any) => f.id);

    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="bg-white border-b">
          <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedWorkflowId(null);
                setWorkflowDetail(null);
                setFormData({});
                setErrors({});
              }}
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <div className="flex items-center gap-3">
              {portal.logo_url && (
                <img src={portal.logo_url} alt={portal.name} className="h-8 w-8 object-contain rounded" />
              )}
              <span className="text-sm text-muted-foreground">{portal.name}</span>
            </div>
          </div>
        </header>

        <div className="max-w-3xl mx-auto py-8 px-4">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900">{workflowDetail.workflow.name}</h1>
            {workflowDetail.workflow.description && (
              <p className="mt-2 text-gray-600">{workflowDetail.workflow.description}</p>
            )}
          </div>

          {loadingDetail ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin" style={{ color: primaryColor }} />
            </div>
          ) : hasPages ? (
            <Card>
              <CardContent className="p-6">
                <FormPageStepper
                  pages={formPages}
                  currentIndex={formPageIndex}
                  onPageChange={setFormPageIndex}
                  getStepLabel={(page: any, idx: number) => page.title || `Page ${idx + 1}`}
                  className="mb-6"
                />
                <form onSubmit={(e) => e.preventDefault()} className="w-full space-y-6">
                  {(() => {
                    const idx = Math.min(Math.max(0, formPageIndex), formPages.length - 1);
                    const page = formPages[idx];
                    if (!page) return null;
                    return (
                      <div key={page.id} className="space-y-4">
                        {page.blocks.map((block: any) => (
                          <div key={block.id} className={cn(block.compact ? "space-y-2" : "space-y-4")}>
                            {block.title && (
                              <div className={cn(block.compact ? "pt-1 pb-0.5" : "pt-2 pb-1")}>
                                <h3 className={cn("font-semibold border-b", block.compact ? "text-sm pb-0.5" : "text-base pb-1")}>{block.title}</h3>
                              </div>
                            )}
                            <div
                              className={cn(
                                "grid",
                                block.compact ? "gap-2" : "gap-4",
                                block.columns === 1 ? "grid-cols-1"
                                  : block.columns === 2 ? "grid-cols-1 md:grid-cols-2"
                                  : block.columns === 3 ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                                  : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                              )}
                            >
                              {block.columns_content.map((column: string[], colIndex: number) => {
                                const columnName = block.column_names?.[colIndex];
                                const labelPosition = block.label_positions?.[colIndex] || "top";
                                const content = (
                                  <div className={cn(block.compact ? "space-y-2" : "space-y-3 sm:space-y-4")}>
                                    {column.map((fieldUuid: string) => renderField(fieldUuid, labelPosition))}
                                  </div>
                                );
                                if (columnName) {
                                  return (
                                    <div key={colIndex} className={cn("border rounded-md bg-muted/20", block.compact ? "p-2" : "p-3")}>
                                      <div className={cn("border-b", block.compact ? "mb-1 pb-1" : "mb-2 pb-2")}>
                                        <h4 className={cn("font-semibold", block.compact ? "text-xs" : "text-sm")}>{columnName}</h4>
                                      </div>
                                      {content}
                                    </div>
                                  );
                                }
                                return <div key={colIndex}>{content}</div>;
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </form>

                {formPages.length > 1 && (
                  <div className="flex items-center justify-between gap-4 mt-4 pt-4 border-t">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
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
                      disabled={formPageIndex >= formPages.length - 1}
                      onClick={() => setFormPageIndex((i) => Math.min(formPages.length - 1, i + 1))}
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                )}

                <div className="pt-4">
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={handleSubmit}
                    disabled={submitting}
                    style={{ backgroundColor: primaryColor }}
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
          ) : (
            /* Fallback: simple list rendering */
            <Card>
              <CardContent className="p-6 space-y-6">
                {sortedFields.map((fieldId: string) => renderField(fieldId))}
                <div className="pt-4">
                  <Button
                    className="w-full"
                    size="lg"
                    onClick={handleSubmit}
                    disabled={submitting}
                    style={{ backgroundColor: primaryColor }}
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
          )}
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

  // ---------------------------------------------------------------------------
  // Render: Portal landing (workflow list)
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Portal header */}
      <header className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-8 text-center">
          {portal.logo_url && (
            <img
              src={portal.logo_url}
              alt={portal.name}
              className="h-16 w-16 object-contain rounded-lg mx-auto mb-4"
            />
          )}
          <h1 className="text-3xl font-bold text-gray-900">{portal.name}</h1>
          {portal.portal_description && (
            <p className="mt-3 text-gray-600 max-w-2xl mx-auto">{portal.portal_description}</p>
          )}
        </div>
      </header>

      {/* Workflow list */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {workflows.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No forms available at the moment.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {workflows.map((wf) => (
              <Card
                key={wf.id}
                className="cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-opacity-50"
                style={{ borderColor: "transparent" }}
                onClick={() => setSelectedWorkflowId(wf.id)}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = primaryColor)}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "transparent")}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3">
                    {wf.icon && <span className="text-2xl">{wf.icon}</span>}
                    <CardTitle className="text-lg">{wf.name}</CardTitle>
                  </div>
                </CardHeader>
                {wf.description && (
                  <CardContent className="pt-0">
                    <p className="text-sm text-muted-foreground line-clamp-2">{wf.description}</p>
                  </CardContent>
                )}
                <CardContent className="pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    style={{ borderColor: primaryColor, color: primaryColor }}
                  >
                    Fill out form
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
