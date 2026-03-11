import { useEffect, useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { api, getApiBase } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, ChevronLeft, ChevronRight, Folder, Play, Send } from "lucide-react";
import { renderIcon } from "@/lib/iconUtils";
import { toast } from "@/hooks/use-toast";
import { FieldRenderer } from "@/components/execution/form/FieldRenderer";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
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
// Helpers
// ---------------------------------------------------------------------------

/** Softer border color from company primary (hex → rgba with alpha) */
function primaryBorderColor(hex: string, alpha = 0.28): string {
  const h = (hex || "#3B82F6").replace(/^#/, "");
  if (h.length !== 6 && h.length !== 3) return `rgba(0,0,0,${alpha})`;
  const r = h.length === 6 ? parseInt(h.slice(0, 2), 16) : parseInt(h[0] + h[0], 16);
  const g = h.length === 6 ? parseInt(h.slice(2, 4), 16) : parseInt(h[1] + h[1], 16);
  const b = h.length === 6 ? parseInt(h.slice(4, 6), 16) : parseInt(h[2] + h[2], 16);
  return `rgba(${r},${g},${b},${alpha})`;
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

  // Validation errors dialog (when submit clicked but form invalid)
  const [validationDialogOpen, setValidationDialogOpen] = useState(false);

  // File preview
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<{ url: string; name: string } | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  // Primary color from portal; softer variant for borders
  const primaryColor = portal?.portal_primary_color || "#3B82F6";
  const softBorderColor = primaryBorderColor(primaryColor);

  // Resolve logo src: use same base as API so logo request hits the same origin; cache-buster so new uploads show
  const apiBase = getApiBase();
  const [logoCacheBuster, setLogoCacheBuster] = useState(0);
  useEffect(() => {
    if (portal?.logo_url) setLogoCacheBuster((t) => t + 1);
  }, [portal?.id, portal?.logo_url]);
  const logoSrc =
    portal?.logo_url
      ? (portal.logo_url.startsWith("/") ? `${apiBase}${portal.logo_url}` : portal.logo_url) +
        (portal.logo_url.includes("?") ? "&" : "?") +
        `v=${logoCacheBuster}`
      : null;

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

  const normalizeRuleValue = (value: any) => {
    if (value && typeof value === "object" && "value" in value) {
      return value.value;
    }
    return value;
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
    if (!workflowDetail) return false;
    const stepConfig = workflowDetail.first_step.config || {};
    const formFields = stepConfig.form_fields || {};
    const extFieldRules = (stepConfig.field_rules as FieldRule[] | undefined) ?? [];
    const currentValues = buildCurrentValues(formData);
    const newErrors: Record<string, string> = {};
    let isValid = true;

    const fields = workflowDetail.workflow.data_structure?.fields
      ?? (Array.isArray(workflowDetail.workflow.data_structure) ? workflowDetail.workflow.data_structure : []);

    Object.keys(formFields).forEach((fieldId) => {
      const config = formFields[fieldId];
      if (config.shown === false) return;
      if (!evaluateFieldRules(fieldId, "visibility", extFieldRules, currentValues, true)) return;
      const isRequired = evaluateFieldRules(fieldId, "required", extFieldRules, currentValues, false);
      if (!isRequired) return;
      const value = currentValues[fieldId];
      if (!hasRequiredValue(value)) {
        const fieldDef = fields.find((f: any) => f.id === fieldId);
        newErrors[fieldId] = `${fieldDef?.name || "Field"} is required`;
        isValid = false;
      }
    });

    const fieldValidations = (stepConfig.field_validations as FieldValidationRule[] | undefined) ?? [];
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

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  const handleSubmit = async () => {
    if (!workflowDetail || !slug) return;
    const valid = validateForm();
    if (!valid) {
      setValidationDialogOpen(true);
      return;
    }
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
  const fieldConfigs = useMemo<Record<string, any>>(() => {
    return (workflowDetail?.first_step?.config?.form_fields as Record<string, any> | undefined) ?? {};
  }, [workflowDetail]);
  const currentValues = useMemo<Record<string, any>>(() => {
    return buildCurrentValues(formData);
  }, [formData]);

  const renderField = (fieldId: string, labelPosition: "top" | "side" = "top") => {
    const fieldDef = allFields.find((f: any) => f.id === fieldId);
    if (!fieldDef) return null;
    const fieldConfig = fieldConfigs[fieldId];
    if (fieldConfig?.shown === false) return null;
    if (!evaluateFieldRules(fieldId, "visibility", fieldRules, currentValues, true)) return null;

    const handleFileUpload = async (file: File) => {
      try {
        const fd = new FormData();
        fd.append("file", file);
        const uploadResult = await api.postFormData<{ path: string; original_name?: string }>(
          `/api/portal/${slug}/workflows/${workflowDetail.workflow.id}/upload`,
          fd,
          { skipAuth: true }
        );
        const signedUrl = await generateSignedUrl(uploadResult.path);
        setFormData((prev) => ({
          ...prev,
          [fieldId]: { value: uploadResult.path, original_name: uploadResult.original_name || file.name },
        }));
        if (signedUrl) setSignedUrls((prev) => ({ ...prev, [fieldId]: signedUrl }));
      } catch (err: any) {
        toast({
          title: "Upload Failed",
          description: err.message || "Failed to upload file",
          variant: "destructive",
        });
      }
    };

    return (
      <div className="space-y-2 w-full min-w-0" key={fieldId}>
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
          disabled={submitting}
          required={evaluateFieldRules(fieldId, "required", fieldRules, currentValues, false)}
          labelPosition={labelPosition}
          primaryColor={primaryColor}
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
              className="transition-colors"
              style={{ borderColor: primaryColor, color: primaryColor }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = `${primaryColor}20`;
                e.currentTarget.style.borderColor = primaryColor;
                e.currentTarget.style.color = primaryColor;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "";
                e.currentTarget.style.borderColor = primaryColor;
                e.currentTarget.style.color = primaryColor;
              }}
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
    <div className="min-h-screen flex flex-col antialiased" style={{ background: "#f5f5f5", fontFamily: "'DM Sans', sans-serif", fontWeight: 400 }}>
      <style>{`
.portal-back-btn { border-color: ${softBorderColor}; color: ${primaryColor}; }
.portal-back-btn:hover { background-color: ${primaryColor} !important; color: white !important; border-color: ${primaryColor} !important; }
.portal-form input:focus-visible,
.portal-form textarea:focus-visible,
.portal-form select:focus-visible { --tw-ring-color: ${primaryColor}; }
.portal-form .portal-primary-btn[data-portal-color="true"] { border-color: ${primaryColor}; color: ${primaryColor}; }
.portal-form .portal-primary-btn[data-portal-color="true"]:hover:not(:disabled),
.portal-form .portal-primary-btn[data-portal-color="true"][data-state="open"],
.portal-form .portal-primary-btn[data-portal-color="true"][aria-expanded="true"] {
  background-color: ${primaryColor} !important;
  color: white !important;
  border-color: ${primaryColor} !important;
}
.portal-form .portal-primary-btn[data-portal-color="true"]:focus-visible { --tw-ring-color: ${primaryColor}; }
.portal-form button[role="combobox"] { border-color: ${softBorderColor}; color: inherit; }
.portal-form button[role="combobox"]:hover,
.portal-form button[role="combobox"][data-state="open"] { background-color: ${primaryColor} !important; color: white !important; border-color: ${primaryColor} !important; }
.portal-form div.flex.gap-1[data-state] > button { border-color: ${softBorderColor}; color: inherit; }
.portal-form div.flex.gap-1[data-state] > button:hover,
.portal-form div.flex.gap-1[data-state="open"] > button { background-color: ${primaryColor} !important; color: white !important; border-color: ${primaryColor} !important; }
.portal-form button[data-portal-file-trigger] { border-color: ${primaryColor}; color: ${primaryColor}; }
.portal-form button[data-portal-file-trigger]:hover:not(:disabled) { background-color: ${primaryColor} !important; color: white !important; border-color: ${primaryColor} !important; }
.portal-primary-options .use-portal-primary[data-selected="true"],
.portal-primary-options .use-portal-primary:hover { background: ${primaryColor} !important; color: white !important; }
.portal-pagination-btn { border-color: ${softBorderColor}; color: ${primaryColor}; }
.portal-pagination-btn:hover:not(:disabled) { background-color: ${primaryColor} !important; color: white !important; border-color: ${primaryColor} !important; }
.portal-submit-btn { background-color: ${primaryColor} !important; color: white !important; border: none; }
.portal-submit-btn:hover:not(:disabled) { filter: brightness(0.92); }
.portal-submit-btn:focus-visible { outline: none; box-shadow: 0 0 0 2px white, 0 0 0 4px ${primaryColor}; }
`}</style>
        {/* Header — soft company-color border */}
        <header className="bg-white border-b" style={{ borderBottomColor: softBorderColor }}>
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              className="portal-back-btn border rounded-lg font-normal"
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
              {logoSrc && (
                <img src={logoSrc} alt={portal.name} className="h-8 w-8 object-contain rounded" />
              )}
              <span className="text-sm text-gray-500 font-normal">{portal.name}</span>
            </div>
          </div>
        </header>

        <div className="max-w-4xl mx-auto py-8 px-4 flex-1 w-full">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-normal text-gray-900">{workflowDetail.workflow.name}</h1>
            {workflowDetail.workflow.description && (
              <p className="mt-2 text-gray-600 font-light">{workflowDetail.workflow.description}</p>
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
                  primaryColor={primaryColor}
                />
                <form onSubmit={(e) => e.preventDefault()} className="portal-form w-full space-y-6">
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
                                <h3 className={cn("font-normal border-b", block.compact ? "text-sm pb-0.5" : "text-base pb-1")} style={{ borderColor: softBorderColor }}>{block.title}</h3>
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
                                        <h4 className={cn("font-normal", block.compact ? "text-xs" : "text-sm")}>{columnName}</h4>
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
                      className="portal-pagination-btn"
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
                      className="portal-pagination-btn"
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
                    className="w-full portal-submit-btn"
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
          ) : (
            /* Fallback: simple list rendering */
            <Card>
              <CardContent className="p-6">
                <form className="portal-form w-full space-y-6" onSubmit={(e) => e.preventDefault()}>
                {sortedFields.map((fieldId: string) => renderField(fieldId))}
                <div className="pt-4">
                  <Button
                    className="w-full portal-submit-btn"
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
                </form>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Validation errors dialog */}
        <Dialog open={validationDialogOpen} onOpenChange={setValidationDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Form has errors</DialogTitle>
              <DialogDescription>
                Please fix the following before submitting:
              </DialogDescription>
            </DialogHeader>
            <ul className="list-disc list-inside space-y-1.5 text-sm text-destructive">
              {Object.entries(errors).map(([fieldId, message]) => (
                <li key={fieldId}>{message}</li>
              ))}
            </ul>
            <DialogFooter>
              <Button
                onClick={() => setValidationDialogOpen(false)}
                className="portal-submit-btn"
              >
                OK
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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

        {/* Footer */}
        <footer className="mt-auto border-t bg-white py-4" style={{ borderColor: softBorderColor }}>
          <div className="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-center gap-3 text-sm text-gray-500 font-normal">
            <span>This portal has been created with</span>
            <a
              href="https://floowly.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 font-normal text-gray-600 hover:text-gray-800 transition-colors"
            >
              <img
                src="/logo.png"
                alt="Floowly"
                className="h-[20px] w-[60px] object-contain grayscale"
              />
            </a>
          </div>
        </footer>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Portal landing (workflow list)
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen flex flex-col antialiased" style={{ background: "#f5f5f5", fontFamily: "'DM Sans', sans-serif", fontWeight: 400 }}>
      {/* Portal header — company-color border */}
      <header className="relative overflow-hidden border-b bg-white" style={{ borderBottomColor: primaryColor }}>
        <div className="relative max-w-4xl mx-auto px-1.5 py-3">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6 text-center sm:text-left">
            {logoSrc && (
              <div className="flex-shrink-0 inline-flex items-center justify-center w-28 h-28 sm:w-32 sm:h-32 rounded-2xl bg-white">
                <img
                  src={logoSrc}
                  alt={portal.name}
                  className="h-20 w-20 sm:h-24 sm:w-24 object-contain rounded-xl"
                />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-3xl sm:text-4xl font-normal tracking-tight text-gray-900">
                {portal.name}
              </h1>
            </div>
          </div>
          {portal.portal_description?.trim() && (
            <p className="mt-4 text-center text-base sm:text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed font-light">
              {portal.portal_description}
            </p>
          )}
        </div>
      </header>

      {/* Workflow list */}
      <main className="max-w-4xl mx-auto px-4 py-8 flex-1">
        {workflows.length === 0 ? (
          <div className="text-center py-12 text-gray-500 font-normal">
            No forms available at the moment.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {workflows.map((wf) => (
              <Card
                key={wf.id}
                className="cursor-pointer transition-colors border flex flex-row items-center gap-4 p-4"
                style={{
                  borderColor: "rgb(228 228 231)",
                  borderWidth: "1px",
                  outline: "none",
                }}
                onClick={() => setSelectedWorkflowId(wf.id)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = primaryColor;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "rgb(228 228 231)";
                }}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  {wf.icon && <span className="flex-shrink-0">{renderIcon(wf.icon, "h-6 w-6", Folder)}</span>}
                  <div className="min-w-0">
                    <CardTitle className="text-lg font-normal">{wf.name}</CardTitle>
                    {wf.description && (
                      <p className="text-sm text-gray-500 line-clamp-2 mt-0.5 font-light">{wf.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex-shrink-0">
                  <span
                    className="inline-flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors"
                    style={{ borderColor: softBorderColor, color: primaryColor }}
                    aria-label="Start"
                  >
                    <Play className="h-5 w-5 fill-current" />
                  </span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t bg-white py-4" style={{ borderColor: softBorderColor }}>
        <div className="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-center gap-3 text-sm text-gray-500 font-normal">
          <span>This portal has been created with</span>
          <a
            href="https://floowly.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 font-normal text-gray-600 hover:text-gray-800 transition-colors"
          >
            <img
              src="/logo.png"
              alt="Floowly"
              className="h-[20px] w-[60px] object-contain grayscale"
            />
          </a>
        </div>
      </footer>
    </div>
  );
}
