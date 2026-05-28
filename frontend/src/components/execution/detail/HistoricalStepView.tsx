import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, ArrowLeft, ChevronDown, ChevronUp, CheckCircle, Clock, User } from "lucide-react";
import { format } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { api } from "@/lib/api";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "@/hooks/use-toast";
import { FieldRenderer } from "../form/FieldRenderer";
import { getStepExecutionStyles } from "@/lib/stepTypeColors";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const FIXED_FORM_PRIMARY_COLOR = "#2A5CE5";

interface HistoricalStepViewProps {
  step: any;
  executionData: any[];
  onReturnToActive: () => void;
  onFileView: (url: string, name: string, path: string) => void;
  isExecutionCompleted?: boolean;
}

const normalizeStepExplanation = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined;
  const raw = typeof value === "string" ? value : String(value);
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  const plainText = trimmed
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return plainText ? trimmed : undefined;
};

export const HistoricalStepView = ({
  step,
  executionData,
  onReturnToActive,
  onFileView,
  isExecutionCompleted = false
}: HistoricalStepViewProps) => {
  const { t, language } = useLanguage();
  const dateLocale = language === "fr" ? fr : enUS;
  const stepData = step?.step_data || {};
  const historicalStepStyle = getStepExecutionStyles(step?.workflow_steps?.step_type);
  const stepMeta = (stepData && typeof stepData === "object" && !Array.isArray(stepData))
    ? (stepData._step_meta as Record<string, any> | undefined)
    : undefined;
  const openedAt = step?.started_at ?? stepMeta?.opened_at;
  const closedAt = step?.completed_at ?? stepMeta?.closed_at;
  const closedBy = stepMeta?.closed_by_name ?? stepMeta?.closed_by_email ?? stepMeta?.closed_by_user_id;
  const isClosed = Boolean(closedAt);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [isExplanationOpen, setIsExplanationOpen] = useState(false);
  
  // Get form configuration from step to apply same settings (like compact_mode for arrays)
  const stepConfig = step?.workflow_steps?.config || {};
  const stepExplanation = normalizeStepExplanation(stepConfig.explanation);
  const formFields = (stepConfig.form_fields || {}) as Record<string, any>;

  // Show decision information if this is a decision step
  const isDecisionStep = step?.workflow_steps?.step_type === 'decision';
  const decisionChoice = step?.decision_choice;
  const decisionComment = stepData?.decision_comment;

  // Helper function to check if a value is empty (for read-only display)
  const hasValue = (value: any): boolean => {
    if (value === null || value === undefined) return false;
    if (typeof value === "string" && value.trim() === "") return false;
    if (Array.isArray(value) && value.length === 0) return false;
    // Keep other values including 0, false, etc. as they are valid values
    return true;
  };

  if (!executionData || executionData.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        <p>{t("executionHistoricalStep.noDataStructure")}</p>
      </div>
    );
  }

  // Flatten all fields to find children easily
  const allFields = executionData.flatMap((eds: any) => eds.data_structures?.fields || []);

  // Generate signed URLs for file and signature fields
  useEffect(() => {
    const generateSignedUrls = async () => {
      const urls: Record<string, string> = {};
      
      // Flatten all fields to find file and signature fields
      const allFieldsFlat = executionData.flatMap((eds: any) => eds.data_structures?.fields || []);
      
      // Find all file and signature fields with values
      const fileFields = allFieldsFlat.filter((field: any) => {
        const fieldType = field.field_type || field.type;
        return (fieldType === 'file' || fieldType === 'signature') && stepData[field.id];
      });

      // Helper to generate a signed URL for a single file path
      const generateUrlForPath = async (filePath: string, originalName?: string): Promise<{ key: string; url: string } | null> => {
        if (filePath.startsWith('http')) {
          return { key: filePath, url: filePath };
        }
        const displayName = originalName || filePath.split('/').pop()?.replace(/^\d+_/, '') || undefined;
        try {
          const res = await api.post<{ signedUrl?: string }>('/api/files/signed-url', {
            bucket: 'documents',
            path: filePath,
            ...(displayName ? { filename: displayName } : {}),
          });
          if (res?.signedUrl) return { key: filePath, url: res.signedUrl };
        } catch (err) {
          console.error(`Failed to generate signed URL for path ${filePath}:`, err);
        }
        return null;
      };

      // Generate signed URLs for each file/signature field
      const urlPromises: Promise<{ key: string; url: string } | null>[] = [];

      fileFields.forEach((field: any) => {
        const value = stepData[field.id];
        if (!value) return;

        let filePath: string | null = null;
        let originalName: string | undefined;
        if (typeof value === 'string') {
          filePath = value;
        } else if (value && typeof value === 'object' && 'value' in value) {
          filePath = value.value;
          originalName = value.original_name;
        }

        if (filePath) {
          urlPromises.push(generateUrlForPath(filePath, originalName).then(result => {
            if (result) return { key: field.id, url: result.url };
            return null;
          }));
        }
      });

      // Also handle file sub-fields inside array items
      const arrayFields = allFieldsFlat.filter((field: any) => {
        const fieldType = field.field_type || field.type;
        return fieldType === 'array' && !field.parent_item_id && stepData[field.id];
      });

      for (const arrayField of arrayFields) {
        const rawArrayValue = stepData[arrayField.id];
        // Array field data may be wrapped as { value: [...] } after migration
        const arrayValue = rawArrayValue && typeof rawArrayValue === 'object' && !Array.isArray(rawArrayValue) && Array.isArray(rawArrayValue.value)
          ? rawArrayValue.value
          : rawArrayValue;
        if (!Array.isArray(arrayValue)) continue;

        const childFileFields = allFieldsFlat.filter((f: any) => {
          const ft = f.field_type || f.type;
          return f.parent_item_id === arrayField.id && (ft === 'file' || ft === 'signature');
        });

        for (const childField of childFileFields) {
          for (const item of arrayValue) {
            const childVal = item[childField.id];
            if (!childVal) continue;
            const childFilePath = typeof childVal === 'string' ? childVal : childVal?.value;
            const childOriginalName = typeof childVal === 'object' ? childVal?.original_name : undefined;
            if (childFilePath && typeof childFilePath === 'string') {
              urlPromises.push(generateUrlForPath(childFilePath, childOriginalName));
            }
          }
        }
      }

      const results = await Promise.all(urlPromises);
      for (const result of results) {
        if (result) urls[result.key] = result.url;
      }

      setSignedUrls(urls);
    };

    if (executionData.length > 0) {
      generateSignedUrls();
    }
  }, [executionData, stepData]);

  useEffect(() => {
    setIsExplanationOpen(false);
  }, [step?.id]);

  const handleFileView = async (url: string, name: string, path: string) => {
    // If it's a signed URL already, just view it
    if (url.startsWith('http')) {
      onFileView(url, name, path);
      return;
    }

    try {
      const res = await api.post<{ signedUrl?: string }>('/api/files/signed-url', {
        bucket: 'documents',
        path,
        ...(name ? { filename: name } : {}),
      });
      if (res?.signedUrl) onFileView(res.signedUrl, name, path);
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to load file",
        variant: "destructive",
      });
    }
  };

  const getSignedUrl = useCallback(async (path: string, filename?: string): Promise<string | null> => {
    if (path.startsWith('http')) return path;
    try {
      const res = await api.post<{ signedUrl?: string }>('/api/files/signed-url', {
        bucket: 'documents',
        path: path.replace(/^\/+/, ''),
        ...(filename ? { filename } : {}),
      });
      return res?.signedUrl || null;
    } catch {
      return null;
    }
  }, []);

  return (
    <div className="space-y-3 sm:space-y-4 w-full min-w-0 max-w-full overflow-hidden">
      <Card
        className="w-full min-w-0 max-w-full overflow-x-hidden"
        style={{
          borderColor: historicalStepStyle.borderColor,
          backgroundColor: historicalStepStyle.backgroundColor,
        }}
      >
        <CardHeader className="pb-2 sm:pb-3 px-2 sm:px-3 md:px-4 lg:px-6 min-w-0 max-w-full">
          <CardTitle className="flex items-center gap-2 text-sm sm:text-base md:text-lg break-words min-w-0 max-w-full">
            <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" style={{ color: historicalStepStyle.textColor }} />
            <span className="min-w-0 max-w-full">Viewing Historical Step</span>
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm break-words min-w-0 max-w-full">
            You are viewing data from a previous step.{!isExecutionCompleted && " Click the button below to return to the active step."}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0 px-2 sm:px-3 md:px-4 lg:px-6 pb-2 sm:pb-3 md:pb-4 lg:pb-6 min-w-0 max-w-full overflow-x-hidden">
          {!isExecutionCompleted && (
            <Button
              onClick={onReturnToActive}
              className="w-full sm:w-auto"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t("executionHistoricalStep.returnToActive")}
            </Button>
          )}
        </CardContent>
      </Card>
      <Card className="w-full min-w-0 max-w-full overflow-x-hidden">
        <CardHeader className="pb-2 sm:pb-3 px-2 sm:px-3 md:px-4 lg:px-6 min-w-0 max-w-full">
          <CardTitle className="text-sm sm:text-base md:text-lg break-words min-w-0 max-w-full">
            {step?.workflow_steps?.name} - {t("executionHistoricalStep.historicalDataTitle")}
          </CardTitle>
          <CardDescription className="text-xs sm:text-sm min-w-0 max-w-full">
            <div className="mt-1 grid grid-cols-1 sm:grid-cols-3 gap-1.5 sm:gap-2">
              <div className="flex items-start gap-2 min-w-0 rounded-md border bg-muted/30 px-2 py-1.5">
                <Clock className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="text-[11px] font-medium text-muted-foreground">{t("executionHistoricalStep.openedAt")}</div>
                  <div className="text-xs break-words">
                    {openedAt ? format(new Date(openedAt), "PPpp", { locale: dateLocale }) : t("executionHistoricalStep.unknownDate")}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2 min-w-0 rounded-md border bg-muted/30 px-2 py-1.5">
                <CheckCircle className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="text-[11px] font-medium text-muted-foreground">{t("executionHistoricalStep.closedAt")}</div>
                  <div className="text-xs break-words">
                    {closedAt ? format(new Date(closedAt), "PPpp", { locale: dateLocale }) : t("executionHistoricalStep.unknownDate")}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2 min-w-0 rounded-md border bg-muted/30 px-2 py-1.5">
                <User className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="text-[11px] font-medium text-muted-foreground">{t("executionHistoricalStep.closedBy")}</div>
                  <div className="text-xs break-words">{closedBy || t("executionHistoricalStep.unknownCloser")}</div>
                </div>
              </div>
            </div>
          </CardDescription>
          {stepExplanation && !isClosed && (
            <Collapsible open={isExplanationOpen} onOpenChange={setIsExplanationOpen}>
              <div className="rounded-md border bg-muted/30 px-2 py-1.5">
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1 w-full justify-between text-[11px] font-medium text-muted-foreground"
                  >
                    <span>{t("executionHistoricalStep.stepExplanation")}</span>
                    {isExplanationOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-1">
                  <div
                    className="ql-editor !p-0 text-xs leading-snug [&_p]:!my-0 [&_ul]:!my-0 [&_ol]:!my-0 [&_li]:!my-0 [&_h1]:!my-0 [&_h2]:!my-0 [&_h3]:!my-0 [&_blockquote]:!my-0"
                    dangerouslySetInnerHTML={{ __html: stepExplanation }}
                  />
                </CollapsibleContent>
              </div>
            </Collapsible>
          )}
        </CardHeader>
        <CardContent className="px-2 sm:px-3 md:px-4 lg:px-6 pb-2 sm:pb-3 md:pb-4 lg:pb-6 min-w-0 max-w-full">
          <div className="space-y-6 min-w-0 overflow-hidden">
            {isDecisionStep && (decisionChoice || decisionComment) && (
              <div className="p-4 bg-muted/50 rounded-lg border border-border space-y-3">
                <h3 className="text-sm font-semibold">{t("executionHistoricalStep.decisionInformation")}</h3>
                {decisionChoice && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">{t("executionHistoricalStep.decisionChoice")}</p>
                    <Badge variant="secondary" className="text-xs">
                      {decisionChoice}
                    </Badge>
                  </div>
                )}
                {decisionComment && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-2">Decision Comment:</p>
                    <div className="p-3 bg-background rounded-md border border-border">
                      <p className="text-sm text-foreground whitespace-pre-wrap break-words">{decisionComment}</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {executionData.map((eds: any) => {
              const ds: any = eds.data_structures;
              const fields: any[] = (ds?.fields ?? []) || [];

              // Filter out child fields (handled by parents)
              const rootFields = fields.filter((f: any) => !f.parent_item_id);

              return (
                <div key={eds.id} className="space-y-4 min-w-0 overflow-hidden">
                  <div>
                    <h3 className="text-lg font-semibold">{ds?.name || "Data Structure"}</h3>
                    {ds?.description && (
                      <p className="text-sm text-muted-foreground mt-1">{ds.description}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-4 min-w-0">
                    {rootFields.map((field: any) => {
                      const fieldType = field.field_type || field.type;
                      const rawValue = stepData[field.id];
                      // Array fields store data as { value: [...] } — unwrap for ArrayField component
                      const value = fieldType === 'array' && rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue) && Array.isArray(rawValue.value)
                        ? rawValue.value
                        : rawValue;
                      // Even if no value, we might want to show it as disabled field, 
                      // or hide it if it's truly empty and user prefers clean view. 
                      // The previous logic hid empty fields. 
                      // However, to show "read only value the same way as when it's possible to edit", 
                      // usually implies seeing the form. 
                      // But historical usually means "what was data". 
                      // I will keep the filter for "hasValue" or explicit false/0 to avoid cluttering history with nulls.
                      // EXCEPT Boolean, which should show "False" (unchecked) if present in schema but null in data? 
                      // Actually, if it's history, we usually only show what Was filled.
                      // Let's stick to showing fields that have values defined in stepData or are required?

                      // Actually, the user asked "i would like to see the readonly valye the same way".
                      // If I hide it, they don't see it. 
                      // I'll show it if it has a value using my hasValue check.
                      if (!hasValue(value)) return null;

                      // Get field config for this field to apply settings like compact_mode
                      const fieldConfig = formFields[field.id];

                      return (
                        <div key={field.id}>
                          <FieldRenderer
                            field={field}
                            value={value}
                            onChange={() => { }} // Read-only
                            disabled={true}
                            primaryColor={FIXED_FORM_PRIMARY_COLOR}
                            childFields={allFields}
                            fieldConfig={fieldConfig}
                            getSignedUrl={getSignedUrl}
                            renderChild={(childField, childValue, onChildChange, hideLabel, required) => {
                              const cfType = childField.field_type || childField.type;
                              const isFileChild = cfType === 'file' || cfType === 'signature';
                              const cfFilePath = isFileChild && childValue ? (typeof childValue === 'string' ? childValue : childValue?.value) : null;
                              return (
                                <FieldRenderer
                                  field={childField}
                                  value={childValue}
                                  onChange={() => { }}
                                  disabled={true}
                                  required={required}
                                  labelPosition={hideLabel ? "hidden" : "top"}
                                  primaryColor={FIXED_FORM_PRIMARY_COLOR}
                                  signedUrl={isFileChild && cfFilePath ? signedUrls[cfFilePath] : signedUrls[childField.id]}
                                  onViewFile={handleFileView}
                                />
                              );
                            }}
                            onViewFile={handleFileView}
                            signedUrl={signedUrls[field.id]}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};


