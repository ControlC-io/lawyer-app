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
  getPortalTheme,
  normalizePortalPrimaryColor,
  withPortalAlpha,
} from "@/lib/portalTheme";
import {
  getFormPagesFromConfig,
  evaluateFieldRules,
  validateAllFields,
  type FieldRule,
  type FieldValidationRule,
} from "@/lib/formConfig";
import { FormPageStepper } from "@/components/execution/FormPageStepper";
import {
  getPortalLanguageDisplay,
  getPortalStartLabel,
  type PortalLanguageCode,
} from "@/lib/portalLanguages";

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
  default_language?: PortalLanguageCode;
  enabled_languages?: PortalLanguageCode[];
}

interface PortalWorkflow {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
}

interface WorkflowDetail {
  selected_language?: PortalLanguageCode;
  default_language?: PortalLanguageCode;
  enabled_languages?: PortalLanguageCode[];
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
  const [selectedLanguage, setSelectedLanguage] = useState<PortalLanguageCode>("en");

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
  const primaryColor = normalizePortalPrimaryColor(portal?.portal_primary_color);
  const theme = getPortalTheme(primaryColor);
  const softBorderColor = theme.softBorder;

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

  // Fetch portal info
  useEffect(() => {
    if (!slug) return;
    const fetchPortal = async () => {
      try {
        setLoading(true);
        const portalData = await api.get<PortalInfo>(`/api/portal/${slug}`, { skipAuth: true });
        const storageKey = `portal-language-${slug}`;
        const defaultLanguage = portalData.default_language || "en";
        const enabledLanguages = portalData.enabled_languages || ["en"];
        const storedLanguage = localStorage.getItem(storageKey) as PortalLanguageCode | null;
        const nextLanguage = storedLanguage && enabledLanguages.includes(storedLanguage)
          ? storedLanguage
          : defaultLanguage;
        setPortal(portalData);
        setSelectedLanguage(nextLanguage);
      } catch (err: any) {
        setError(err.message || "Portal not found");
      } finally {
        setLoading(false);
      }
    };
    fetchPortal();
  }, [slug]);

  // Fetch workflows with selected language
  useEffect(() => {
    if (!slug || !selectedLanguage) return;
    const fetchWorkflows = async () => {
      try {
        const workflowsData = await api.get<PortalWorkflow[]>(
          `/api/portal/${slug}/workflows?lang=${encodeURIComponent(selectedLanguage)}`,
          { skipAuth: true }
        );
        setWorkflows(workflowsData);
      } catch (err: any) {
        setError(err.message || "Portal not found");
      }
    };
    fetchWorkflows();
  }, [slug, selectedLanguage]);

  // Fetch workflow detail when selected
  useEffect(() => {
    if (!selectedWorkflowId || !slug) return;
    const fetchDetail = async () => {
      try {
        setLoadingDetail(true);
        const detail = await api.get<WorkflowDetail>(
          `/api/portal/${slug}/workflows/${selectedWorkflowId}?lang=${encodeURIComponent(selectedLanguage)}`,
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
  }, [selectedWorkflowId, slug, selectedLanguage]);

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

  const uploadFileToPortal = async (file: File) => {
    if (!workflowDetail || !slug) return null;
    const fd = new FormData();
    fd.append("file", file);
    const uploadResult = await api.postFormData<{ path: string; original_name?: string }>(
      `/api/portal/${slug}/workflows/${workflowDetail.workflow.id}/upload`,
      fd,
      { skipAuth: true }
    );
    const signedUrl = await generateSignedUrl(uploadResult.path);
    return { ...uploadResult, signedUrl };
  };

  const renderField = (fieldId: string, labelPosition: "top" | "side" = "top") => {
    const fieldDef = allFields.find((f: any) => f.id === fieldId);
    if (!fieldDef) return null;
    const fieldConfig = fieldConfigs[fieldId];
    if (fieldConfig?.shown === false) return null;
    if (!evaluateFieldRules(fieldId, "visibility", fieldRules, currentValues, true)) return null;

    const handleFileUpload = async (file: File) => {
      try {
        const result = await uploadFileToPortal(file);
        if (!result) return;
        setFormData((prev) => ({
          ...prev,
          [fieldId]: { value: result.path, original_name: result.original_name || file.name },
        }));
        if (result.signedUrl) setSignedUrls((prev) => ({ ...prev, [fieldId]: result.signedUrl! }));
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
          fieldConfig={fieldConfig}
          getSignedUrl={generateSignedUrl}
          childFields={allFields}
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
              try {
                const result = await uploadFileToPortal(file);
                if (!result) return;
                if (result.signedUrl) {
                  setSignedUrls((prev) => ({ ...prev, [result.path]: result.signedUrl! }));
                }
                onChildChange({
                  value: result.path,
                  original_name: result.original_name || file.name,
                });
                return result.signedUrl;
              } catch (err: any) {
                toast({
                  title: "Upload Failed",
                  description: err.message || "Failed to upload file",
                  variant: "destructive",
                });
              }
            };

            return (
              <FieldRenderer
                field={childField}
                value={childValue}
                onChange={onChildChange}
                disabled={isDisabled}
                required={isRequired}
                labelPosition={hideLabel ? "hidden" : "top"}
                primaryColor={primaryColor}
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
        {errors[fieldId] && <p className="text-sm text-red-500">{errors[fieldId]}</p>}
      </div>
    );
  };

  const renderLanguageSelector = (className?: string) => {
    const enabledLanguages = portal?.enabled_languages || ["en"];

    return (
      <div className={cn("flex flex-wrap items-center justify-center gap-2", className)}>
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
                : { borderColor: softBorderColor }
            }
            onClick={() => {
              setSelectedLanguage(languageCode);
              if (slug) localStorage.setItem(`portal-language-${slug}`, languageCode);
            }}
            aria-pressed={selectedLanguage === languageCode}
          >
            {getPortalLanguageDisplay(languageCode)}
          </button>
        ))}
      </div>
    );
  };

  // ---------------------------------------------------------------------------
  // Render: Loading
  // ---------------------------------------------------------------------------

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
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: primaryColor }} />
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Error / not found
  // ---------------------------------------------------------------------------

  if (error || !portal) {
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
      <div
        className="flex min-h-screen items-center justify-center bg-slate-50 p-4"
        style={{
          ...theme.rootStyle,
          backgroundImage: `radial-gradient(circle at 50% 0%, ${theme.softBackground} 0%, transparent 45%)`,
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <Card className="w-full max-w-md border-0 py-8 text-center shadow-xl">
          <CardHeader>
            <div className="mx-auto mb-4 w-fit rounded-full p-3" style={{ backgroundColor: withPortalAlpha(primaryColor, 0.14) }}>
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
              className="rounded-xl border transition-colors hover:bg-slate-100"
              style={{ borderColor: softBorderColor, color: primaryColor }}
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
    <div
      className="min-h-screen flex flex-col antialiased"
      style={{
        ...theme.rootStyle,
        background:
          "linear-gradient(180deg, rgba(248,250,252,1) 0%, rgba(241,245,249,1) 45%, rgba(248,250,252,1) 100%)",
        fontFamily: "'DM Sans', sans-serif",
        fontWeight: 400,
      }}
    >
      <style>{`
.portal-back-btn { border-color: ${softBorderColor}; color: ${primaryColor}; background-color: rgba(255,255,255,0.8); }
.portal-back-btn:hover { background-color: ${withPortalAlpha(primaryColor, 0.1)} !important; color: ${primaryColor} !important; border-color: ${primaryColor} !important; }
.portal-form input:focus-visible,
.portal-form textarea:focus-visible,
.portal-form select:focus-visible { --tw-ring-color: ${primaryColor}; box-shadow: 0 0 0 4px ${withPortalAlpha(primaryColor, 0.2)}; }
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
.portal-form-shell { border: 1px solid ${softBorderColor}; box-shadow: 0 20px 60px -38px ${withPortalAlpha(primaryColor, 0.45)}; }
`}</style>
        {/* Header — soft company-color border */}
        <header className="border-b bg-white/80 backdrop-blur-md" style={{ borderBottomColor: softBorderColor }}>
          <div className="mx-auto flex w-full max-w-5xl items-center gap-4 px-4 py-4">
            <Button
              variant="ghost"
              size="sm"
              className="portal-back-btn rounded-xl border font-normal"
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
            <div className="flex items-center gap-3 rounded-xl bg-white/75 px-3 py-2">
              {logoSrc && (
                <img src={logoSrc} alt={portal.name} className="h-8 w-8 object-contain rounded-md" />
              )}
              <span className="text-sm text-gray-600 font-medium">{portal.name}</span>
            </div>
            <div className="flex-1" />
            {renderLanguageSelector()}
            <div className="flex-1" />
          </div>
        </header>

        <div className="mx-auto flex-1 w-full max-w-5xl px-4 py-10">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{workflowDetail.workflow.name}</h1>
            {workflowDetail.workflow.description && (
              <p className="mx-auto mt-3 max-w-2xl text-slate-600">{workflowDetail.workflow.description}</p>
            )}
          </div>

          {loadingDetail ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin" style={{ color: primaryColor }} />
            </div>
          ) : hasPages ? (
            <Card className="portal-form-shell overflow-hidden rounded-2xl border-0 bg-white/95">
              <CardContent className="p-7 md:p-9">
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
                  <div className="mt-6 flex items-center justify-between gap-4 border-t pt-5">
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

                {(formPages.length <= 1 || formPageIndex >= formPages.length - 1) && (
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
                )}
              </CardContent>
            </Card>
          ) : (
            /* Fallback: simple list rendering */
            <Card className="portal-form-shell overflow-hidden rounded-2xl border-0 bg-white/95">
              <CardContent className="p-7 md:p-9">
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
        <footer className="mt-auto border-t bg-white/85 py-4 backdrop-blur-md" style={{ borderColor: softBorderColor }}>
          <div className="mx-auto flex max-w-5xl flex-col items-center justify-center gap-3 px-4 text-sm text-gray-500 sm:flex-row">
            <span>This portal has been created with</span>
            <a
              href="https://picobello.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 font-normal text-gray-600 hover:text-gray-800 transition-colors"
            >
              <img
                src="/logo.png"
                alt="Picobello"
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
    <div
      className="min-h-screen flex flex-col antialiased"
      style={{
        ...theme.rootStyle,
        background:
          "linear-gradient(180deg, rgba(248,250,252,1) 0%, rgba(241,245,249,1) 45%, rgba(248,250,252,1) 100%)",
        fontFamily: "'DM Sans', sans-serif",
        fontWeight: 400,
      }}
    >
      <style>{`
.portal-workflow-card { border-color: ${softBorderColor}; }
.portal-workflow-card:hover { border-color: ${primaryColor}; box-shadow: 0 20px 50px -36px ${withPortalAlpha(primaryColor, 0.58)}; transform: translateY(-2px); }
.portal-workflow-cta { border-color: ${softBorderColor}; color: ${primaryColor}; background: ${withPortalAlpha(primaryColor, 0.08)}; }
.portal-workflow-card:hover .portal-workflow-cta { border-color: ${primaryColor}; background: ${primaryColor}; color: #fff; }
`}</style>
      {/* Portal header — company-color border */}
      <header className="relative overflow-hidden border-b bg-white/85 backdrop-blur-md" style={{ borderBottomColor: primaryColor }}>
        <div className="relative mx-auto max-w-5xl px-4 py-10">
          <div className="flex flex-col items-center justify-center gap-5 text-center">
            {logoSrc && (
              <div className="inline-flex h-28 w-28 items-center justify-center rounded-3xl border bg-white shadow-sm sm:h-32 sm:w-32" style={{ borderColor: softBorderColor }}>
                <img
                  src={logoSrc}
                  alt={portal.name}
                  className="h-20 w-20 rounded-xl object-contain sm:h-24 sm:w-24"
                />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
                {portal.name}
              </h1>
            </div>
          </div>
          <div className="mt-6 flex justify-center">
            {renderLanguageSelector()}
          </div>
          {portal.portal_description?.trim() && (
            <p className="mx-auto mt-4 max-w-2xl text-center text-base leading-relaxed text-slate-600 sm:text-lg">
              {portal.portal_description}
            </p>
          )}
        </div>
      </header>

      {/* Workflow list */}
      <main className="mx-auto flex-1 w-full max-w-5xl px-4 py-10">
        {workflows.length === 0 ? (
          <Card className="mx-auto max-w-2xl rounded-2xl border-0 bg-white/90 py-6 text-center shadow-lg">
            <CardContent className="space-y-2">
              <p className="text-base font-medium text-slate-800">No forms available right now</p>
              <p className="text-sm text-slate-500">Please check back later or contact your organization.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {workflows.map((wf) => (
              <Card
                key={wf.id}
                className="portal-workflow-card group cursor-pointer rounded-2xl border bg-white/95 p-5 transition-all duration-200"
                onClick={() => setSelectedWorkflowId(wf.id)}
              >
                <div className="mb-4 flex items-center gap-3">
                  <span
                    className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border"
                    style={{ borderColor: softBorderColor, background: withPortalAlpha(primaryColor, 0.08), color: primaryColor }}
                  >
                    {renderIcon(wf.icon || "", "h-5 w-5", Folder)}
                  </span>
                  <CardTitle className="line-clamp-2 text-lg font-semibold text-slate-900">{wf.name}</CardTitle>
                </div>
                {wf.description && (
                  <p className="line-clamp-3 min-h-[3.5rem] text-sm text-slate-600">{wf.description}</p>
                )}
                <div className="mt-5 flex items-center justify-between">
                  <span className="text-xs uppercase tracking-[0.16em] text-slate-500">
                    {getPortalStartLabel(selectedLanguage)}
                  </span>
                  <span
                    className="portal-workflow-cta inline-flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors"
                    aria-label="Start"
                  >
                    <Play className="h-4 w-4 fill-current" />
                  </span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t bg-white/85 py-4 backdrop-blur-md" style={{ borderColor: softBorderColor }}>
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-center gap-3 px-4 text-sm text-gray-500 sm:flex-row">
          <span>This portal has been created with</span>
          <a
            href="https://picobello.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 font-normal text-gray-600 hover:text-gray-800 transition-colors"
          >
            <img
              src="/logo.png"
              alt="Picobello"
              className="h-[20px] w-[60px] object-contain grayscale"
            />
          </a>
        </div>
      </footer>
    </div>
  );
}
