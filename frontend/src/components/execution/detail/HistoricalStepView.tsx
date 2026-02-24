import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, ArrowLeft, Eye } from "lucide-react";
import { format } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { api } from "@/lib/api";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "@/hooks/use-toast";
import { FieldRenderer } from "../form/FieldRenderer";

interface HistoricalStepViewProps {
  step: any;
  executionData: any[];
  onReturnToActive: () => void;
  onFileView: (url: string, name: string, path: string) => void;
  isExecutionCompleted?: boolean;
}

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
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [multipleFilesSignedUrls, setMultipleFilesSignedUrls] = useState<Record<string, Record<number, string>>>({});
  
  // Get form configuration from step to apply same settings (like compact_mode for arrays)
  const stepConfig = step?.workflow_steps?.config || {};
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
      const multipleUrls: Record<string, Record<number, string>> = {};
      
      // Flatten all fields to find file and signature fields
      const allFieldsFlat = executionData.flatMap((eds: any) => eds.data_structures?.fields || []);
      
      // Find all file and signature fields with values
      const fileFields = allFieldsFlat.filter((field: any) => {
        const fieldType = field.field_type || field.type;
        return (fieldType === 'file' || fieldType === 'multiple_files' || fieldType === 'signature') && stepData[field.id];
      });

      // Generate signed URLs for each file/signature field
      await Promise.all(
        fileFields.map(async (field: any) => {
          const value = stepData[field.id];
          const fieldType = field.field_type || field.type;
          
          if (!value) return;

          // Handle multiple_files fields (arrays)
          if (fieldType === 'multiple_files') {
            // Extract file paths and original names from value
            let filePaths: string[] = [];
            let originalNames: (string | undefined)[] = [];

            if (Array.isArray(value)) {
              if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
                filePaths = value.map((item: any) => item.value || item);
                originalNames = value.map((item: any) => item.original_name);
              } else {
                filePaths = value;
                originalNames = new Array(value.length).fill(undefined);
              }
            } else if (value && typeof value === 'object' && 'value' in value) {
              filePaths = Array.isArray(value.value) ? value.value : [value.value];
              originalNames = Array.isArray(value.original_name) ? value.original_name : new Array(filePaths.length).fill(undefined);
            } else if (typeof value === 'string') {
              filePaths = [value];
              originalNames = [undefined];
            }

            const fieldUrls: Record<number, string> = {};
            await Promise.all(
              filePaths.map(async (filePath: string, index: number) => {
                if (!filePath) return;

                if (filePath.startsWith('http')) {
                  fieldUrls[index] = filePath;
                  return;
                }

                const displayName = originalNames[index] || filePath.split('/').pop()?.replace(/^\d+_/, '') || undefined;
                try {
                  const res = await api.post<{ signedUrl?: string }>('/api/files/signed-url', {
                    bucket: 'documents',
                    path: filePath,
                    ...(displayName ? { filename: displayName } : {}),
                  });
                  if (res?.signedUrl) fieldUrls[index] = res.signedUrl;
                } catch (err) {
                  console.error(`Failed to generate signed URL for field ${field.id}, file ${index}:`, err);
                }
              })
            );

            if (Object.keys(fieldUrls).length > 0) {
              multipleUrls[field.id] = fieldUrls;
            }
            return;
          }

          // Handle single file and signature fields
          // Value can be a string (path) or an object with value and original_name
          let filePath: string | null = null;
          let originalName: string | undefined;
          if (typeof value === 'string') {
            filePath = value;
          } else if (value && typeof value === 'object' && 'value' in value) {
            filePath = value.value;
            originalName = value.original_name;
          }

          if (!filePath) return;

          if (filePath.startsWith('http')) {
            urls[field.id] = filePath;
            return;
          }

          const displayName = originalName || filePath.split('/').pop()?.replace(/^\d+_/, '') || undefined;
          try {
            const res = await api.post<{ signedUrl?: string }>('/api/files/signed-url', {
              bucket: 'documents',
              path: filePath,
              ...(displayName ? { filename: displayName } : {}),
            });
            if (res?.signedUrl) urls[field.id] = res.signedUrl;
          } catch (err) {
            console.error(`Failed to generate signed URL for field ${field.id}:`, err);
          }
        })
      );

      setSignedUrls(urls);
      setMultipleFilesSignedUrls(multipleUrls);
    };

    if (executionData.length > 0) {
      generateSignedUrls();
    }
  }, [executionData, stepData]);

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

  return (
    <div className="space-y-3 sm:space-y-4 w-full min-w-0 max-w-full overflow-hidden">
      <Card className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20 w-full min-w-0 max-w-full overflow-x-hidden">
        <CardHeader className="pb-2 sm:pb-3 px-2 sm:px-3 md:px-4 lg:px-6 min-w-0 max-w-full">
          <CardTitle className="flex items-center gap-2 text-sm sm:text-base md:text-lg break-words min-w-0 max-w-full">
            <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
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
          <CardDescription className="text-xs sm:text-sm break-words min-w-0 max-w-full">
            {t("executionHistoricalStep.snapshotDescription")}{" "}
            {step?.completed_at
              ? format(new Date(step.completed_at), "PPpp", { locale: dateLocale })
              : t("executionHistoricalStep.unknownDate")}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-2 sm:px-3 md:px-4 lg:px-6 pb-2 sm:pb-3 md:pb-4 lg:pb-6 min-w-0 max-w-full overflow-x-hidden">
          <div className="space-y-6">
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
                <div key={eds.id} className="space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold">{ds?.name || "Data Structure"}</h3>
                    {ds?.description && (
                      <p className="text-sm text-muted-foreground mt-1">{ds.description}</p>
                    )}
                  </div>

                  <div className="space-y-4">
                    {rootFields.map((field: any) => {
                      const value = stepData[field.id];
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

                      const fieldType = field.field_type || field.type;
                      const isMultipleFiles = fieldType === 'multiple_files';

                      // Get field config for this field to apply settings like compact_mode
                      const fieldConfig = formFields[field.id];
                      
                      return (
                        <div key={field.id}>
                          <FieldRenderer
                            field={field}
                            value={value}
                            onChange={() => { }} // Read-only
                            disabled={true}
                            childFields={allFields}
                            fieldConfig={fieldConfig}
                            renderChild={(childField, childValue, onChildChange, hideLabel, required) => {
                              const childFieldType = childField.field_type || childField.type;
                              const isChildMultipleFiles = childFieldType === 'multiple_files';
                              return (
                                <FieldRenderer
                                  field={childField}
                                  value={childValue}
                                  onChange={() => { }}
                                  disabled={true}
                                  required={required}
                                  labelPosition={hideLabel ? "hidden" : "top"}
                                  signedUrl={!isChildMultipleFiles ? signedUrls[childField.id] : undefined}
                                  signedUrls={isChildMultipleFiles ? multipleFilesSignedUrls[childField.id] : undefined}
                                  onViewFile={handleFileView}
                                  // Recursion for deeper nesting if supported
                                />
                              );
                            }}
                            onViewFile={handleFileView}
                            signedUrl={!isMultipleFiles ? signedUrls[field.id] : undefined}
                            signedUrls={isMultipleFiles ? multipleFilesSignedUrls[field.id] : undefined}
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


