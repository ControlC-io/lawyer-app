import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  getProcessHistory,
  removeProcessRecord,
  clearFinishedProcesses,
  type ProcessRecord,
} from "@/lib/processHistory";
import { FileText, Loader2, CheckCircle2, XCircle, Clock, Play, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

function statusBadge(status: ProcessRecord["status"], t: (k: string) => string) {
  switch (status) {
    case "processing":
      return (
        <Badge variant="secondary" className="gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          {t("processHistory.statusProcessing")}
        </Badge>
      );
    case "review":
      return (
        <Badge className="gap-1 bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-300/40 hover:bg-amber-500/15">
          <Clock className="h-3 w-3" />
          {t("processHistory.statusReview")}
        </Badge>
      );
    case "completed":
      return (
        <Badge className="gap-1 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-300/40 hover:bg-emerald-500/15">
          <CheckCircle2 className="h-3 w-3" />
          {t("processHistory.statusCompleted")}
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircle className="h-3 w-3" />
          {t("processHistory.statusFailed")}
        </Badge>
      );
  }
}

function formatDate(ts: number, language: string): string {
  try {
    return new Date(ts).toLocaleString(language === "fr" ? "fr-FR" : "en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return new Date(ts).toLocaleString();
  }
}

export default function ProcessHistory() {
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const [records, setRecords] = useState<ProcessRecord[]>([]);

  const refresh = useCallback(() => setRecords(getProcessHistory()), []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleResume = (record: ProcessRecord) => {
    if (!record.reviewState) return;
    localStorage.setItem("split-pdf-review-state", JSON.stringify(record.reviewState));
    navigate("/documents/split-pdf");
  };

  const handleRemove = (id: string) => {
    removeProcessRecord(id);
    refresh();
  };

  const handleClearFinished = () => {
    clearFinishedProcesses();
    refresh();
  };

  const finishedCount = records.filter((r) => r.status === "completed" || r.status === "failed").length;

  return (
    <div className="space-y-4 py-2">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{String(t("processHistory.description"))}</p>
        {finishedCount > 0 && (
          <Button variant="outline" size="sm" onClick={handleClearFinished}>
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            {String(t("processHistory.clearFinished"))}
          </Button>
        )}
      </div>

      {records.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground gap-3">
          <FileText className="h-10 w-10 opacity-30" />
          <p className="text-sm">{String(t("processHistory.empty"))}</p>
          <Button variant="outline" size="sm" onClick={() => navigate("/documents/split-pdf")}>
            {String(t("processHistory.startSplit"))}
          </Button>
        </div>
      ) : (
        <div className="space-y-2 max-w-3xl">
          {records.map((record) => (
            <div
              key={record.id}
              className={cn(
                "flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border bg-card p-4",
                record.status === "review" && "border-amber-300/50 bg-amber-50/30 dark:bg-amber-950/10",
              )}
            >
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {statusBadge(record.status, (k) => String(t(k)))}
                  <span className="text-xs text-muted-foreground">
                    {formatDate(record.updatedAt, language)}
                  </span>
                </div>
                <p className="text-sm font-medium truncate" title={record.filename}>
                  {record.filename || "—"}
                </p>
                {record.status === "review" && record.reviewState && (
                  <p className="text-xs text-muted-foreground">
                    {String(t("processHistory.segmentCount")).replace("{{n}}", String(record.reviewState.segments.length))}
                    {" · "}
                    {String(t("processHistory.pageCount")).replace("{{n}}", String(record.reviewState.totalPages))}
                  </p>
                )}
                {record.status === "failed" && record.error && (
                  <p className="text-xs text-destructive truncate">{record.error}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {record.status === "review" && record.reviewState && (
                  <Button size="sm" className="h-8" onClick={() => handleResume(record)}>
                    <Play className="h-3.5 w-3.5 mr-1.5" />
                    {String(t("processHistory.resume"))}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => handleRemove(record.id)}
                  title={String(t("processHistory.remove"))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
