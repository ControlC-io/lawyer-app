import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api } from "@/lib/api";
import { pollFileImportUntilDone } from "@/lib/ocrPoll";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { X, Loader2 } from "lucide-react";

export type DocumentImportJob = {
  id: string;
  companyId: string;
  fileNames: string[];
  phase: "uploading" | "processing" | "error";
  totalPercent: number;
  stepLabelKey: string;
  error?: string;
  background: boolean;
};

type StartParams = {
  companyId: string;
  formData: FormData;
  ocrAfterUpload: boolean;
  wantsExtract: boolean;
  onSuccess: () => void | Promise<void>;
};

type Ctx = {
  jobs: DocumentImportJob[];
  startImportJob: (params: StartParams) => string;
  setJobBackground: (jobId: string) => void;
  dismissJob: (jobId: string) => void;
};

const DocumentImportJobsContext = createContext<Ctx | null>(null);

export function DocumentImportJobsProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobs] = useState<DocumentImportJob[]>([]);
  const { toast } = useToast();
  const { t } = useLanguage();
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;

  const updateJob = useCallback((jobId: string, patch: Partial<DocumentImportJob>) => {
    setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, ...patch } : j)));
  }, []);

  const runJob = useCallback(
    async (jobId: string, params: StartParams) => {
      const { companyId, formData, ocrAfterUpload, wantsExtract, onSuccess } = params;
      const path = `/api/companies/${companyId}/documents/upload`;

      try {
        const result = await api.postFormDataWithProgress<{ files: Array<{ id: string; name: string }> }>(
          path,
          formData,
          {
            onUploadProgress: (ratio) => {
              updateJob(jobId, {
                phase: "uploading",
                totalPercent: Math.round(ratio * 30),
                stepLabelKey: "metadataDocuments.importStepUploading",
              });
            },
          },
        );

        const uploaded = result.files ?? [];
        if (uploaded.length === 0) throw new Error("Upload failed");

        updateJob(jobId, {
          phase: "processing",
          totalPercent: 30,
          fileNames: uploaded.map((f) => f.name),
          stepLabelKey: ocrAfterUpload
            ? wantsExtract
              ? "metadataDocuments.importStepOcrExtract"
              : "metadataDocuments.importStepOcr"
            : "metadataDocuments.importStepDone",
        });

        const ids = uploaded.map((f) => f.id);
        const total = ids.length;

        if (ocrAfterUpload) {
          let completed = 0;
          await Promise.all(
            ids.map(async (fileId) => {
              await pollFileImportUntilDone(fileId, wantsExtract);
              completed++;
              updateJob(jobId, {
                totalPercent: 30 + Math.round((70 * completed) / Math.max(total, 1)),
              });
            }),
          );
        } else {
          updateJob(jobId, { totalPercent: 100, stepLabelKey: "metadataDocuments.importStepDone" });
        }

        toast({
          title: String(t("metadataDocuments.uploadSuccess")),
          description: wantsExtract
            ? String(t("metadataDocuments.uploadExtractDone", { count: String(uploaded.length) }))
            : String(t("metadataDocuments.uploadFilesCount", { count: String(uploaded.length) })),
        });

        await onSuccess();

        setJobs((prev) => prev.filter((x) => x.id !== jobId));
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(t("metadataDocuments.importFailedGeneric"));
        updateJob(jobId, {
          phase: "error",
          error: msg,
          stepLabelKey: "metadataDocuments.importStepError",
          totalPercent: 100,
        });
        toast({
          title: String(t("splitPdf.error")),
          description: msg,
          variant: "destructive",
        });
      }
    },
    [t, toast, updateJob],
  );

  const startImportJob = useCallback(
    (params: StartParams) => {
      const jobId = crypto.randomUUID();
      const names: string[] = [];
      try {
        const raw = params.formData.getAll("file");
        for (const f of raw) {
          if (f instanceof File) names.push(f.name);
        }
      } catch {
        /* ignore */
      }

      setJobs((prev) => [
        ...prev,
        {
          id: jobId,
          companyId: params.companyId,
          fileNames: names,
          phase: "uploading",
          totalPercent: 0,
          stepLabelKey: "metadataDocuments.importStepUploading",
          background: false,
        },
      ]);

      void runJob(jobId, params);
      return jobId;
    },
    [runJob],
  );

  const setJobBackground = useCallback((jobId: string) => {
    setJobs((prev) => prev.map((j) => (j.id === jobId ? { ...j, background: true } : j)));
  }, []);

  const dismissJob = useCallback((jobId: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
  }, []);

  const value = useMemo(
    () => ({ jobs, startImportJob, setJobBackground, dismissJob }),
    [jobs, startImportJob, setJobBackground, dismissJob],
  );

  return (
    <DocumentImportJobsContext.Provider value={value}>
      {children}
      <ImportJobsFloatingBar jobs={jobs} onDismiss={dismissJob} />
    </DocumentImportJobsContext.Provider>
  );
}

function ImportJobsFloatingBar({
  jobs,
  onDismiss,
}: {
  jobs: DocumentImportJob[];
  onDismiss: (id: string) => void;
}) {
  const { t } = useLanguage();
  const active = jobs.filter((j) => j.phase === "uploading" || j.phase === "processing" || j.phase === "error");
  if (active.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex w-full max-w-md flex-col gap-2 pointer-events-none">
      {active.map((job) => (
        <Card
          key={job.id}
          className="pointer-events-auto shadow-lg border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
        >
          <CardContent className="p-4 pt-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">
                  {String(t("metadataDocuments.importJobTitle"))}
                  {job.fileNames.length > 0 && (
                    <span className="text-muted-foreground font-normal">
                      {" "}
                      ({job.fileNames.length})
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  {job.phase !== "error" && <Loader2 className="h-3 w-3 animate-spin shrink-0" />}
                  {job.error
                    ? job.error
                    : String(t(job.stepLabelKey as "metadataDocuments.importStepUploading"))}
                </p>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => onDismiss(job.id)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <Progress
              value={job.phase === "error" ? 100 : job.totalPercent}
              className={job.phase === "error" ? "opacity-60 [&>div]:bg-destructive" : ""}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function useDocumentImportJobs(): Ctx {
  const ctx = useContext(DocumentImportJobsContext);
  if (!ctx) {
    throw new Error("useDocumentImportJobs must be used within DocumentImportJobsProvider");
  }
  return ctx;
}
