import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Database,
  HardDrive,
  ScanText,
  Scissors,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Upload,
  Brain,
  Tag,
  ArrowRight,
  Info,
  FileText,
  History,
  Settings2,
  AlertTriangle,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface HealthData {
  status: "ok" | "error";
  database: "connected" | "disconnected";
  storage: "connected" | "disconnected";
  ocr: { enabled: boolean; provider: string };
  pdfSplit: { geminiConfigured: boolean };
  message?: string;
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 rounded-full shrink-0",
        ok
          ? "bg-emerald-500 shadow-[0_0_6px_1px_rgba(16,185,129,0.5)]"
          : "bg-red-500"
      )}
    />
  );
}

function ServiceCard({
  icon: Icon,
  label,
  ok,
  detail,
}: {
  icon: React.ElementType;
  label: string;
  ok: boolean;
  detail?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3">
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
          ok ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <StatusDot ok={ok} />
          <span className="text-sm font-medium">{label}</span>
        </div>
        {detail && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{detail}</p>
        )}
      </div>
      <Badge
        variant={ok ? "default" : "destructive"}
        className={cn(
          "text-xs shrink-0",
          ok &&
            "bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400"
        )}
      >
        {ok ? "OK" : "Down"}
      </Badge>
    </div>
  );
}

function StepCard({
  icon: Icon,
  step,
  title,
  children,
  accent,
}: {
  icon: React.ElementType;
  step: number;
  title: string;
  children: React.ReactNode;
  accent: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold",
            accent
          )}
        >
          {step}
        </div>
        <div className="mt-1 w-px flex-1 bg-border last:hidden" />
      </div>
      <div className="pb-5 pt-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-sm font-semibold">{title}</span>
        </div>
        <div className="text-xs text-muted-foreground leading-relaxed space-y-1">
          {children}
        </div>
      </div>
    </div>
  );
}

function Pill({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <code
      className={cn(
        "inline-block rounded px-1.5 py-0.5 text-[10px] font-mono leading-none",
        color ?? "bg-muted text-foreground/80"
      )}
    >
      {children}
    </code>
  );
}

function SectionTitle({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <h3 className="text-sm font-semibold">{children}</h3>
    </div>
  );
}

const EVENT_TYPES = [
  { key: "FILE_UPLOADED", desc: "File created and stored" },
  { key: "OCR_REQUESTED", desc: "OCR queued" },
  { key: "OCR_STARTED", desc: "Mistral call began" },
  { key: "OCR_COMPLETED", desc: "Markdown saved" },
  { key: "OCR_FAILED", desc: "Error stored" },
  { key: "METADATA_CHANGED", desc: "Manual edit" },
  { key: "METADATA_AI_APPLIED", desc: "AI extraction written" },
  { key: "METADATA_AI_EXTRACT_FAILED", desc: "AI extraction error" },
  { key: "FILE_RENAMED", desc: "Name changed (manual or AI)" },
];

export default function InfoPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  async function fetchHealth() {
    try {
      const data = await api.get<HealthData>("/api/health", { skipAuth: true });
      setHealth(data);
    } catch {
      setHealth({
        status: "error",
        database: "disconnected",
        storage: "disconnected",
        ocr: { enabled: false, provider: "mistral" },
        pdfSplit: { geminiConfigured: false },
        message: "Could not reach backend",
      });
    } finally {
      setLoading(false);
      setLastChecked(new Date());
    }
  }

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 30_000);
    return () => clearInterval(interval);
  }, []);

  const allOk = health?.status === "ok";

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Info className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">System Info</h1>
            <p className="text-xs text-muted-foreground">
              Service status &amp; document processing reference
            </p>
          </div>
        </div>
        <button
          onClick={() => { setLoading(true); fetchHealth(); }}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          {lastChecked ? (
            <span>Updated {lastChecked.toLocaleTimeString()}</span>
          ) : (
            <span>Checking…</span>
          )}
        </button>
      </div>

      {/* Service status */}
      <Card>
        <CardHeader className="pb-3 pt-4 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <span
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full",
                allOk ? "bg-emerald-500/15" : "bg-red-500/15"
              )}
            >
              {allOk ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <XCircle className="h-3.5 w-3.5 text-red-500" />
              )}
            </span>
            Services
            {health?.message && (
              <span className="ml-2 text-xs font-normal text-destructive">
                {health.message}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <ServiceCard
            icon={Database}
            label="Database"
            ok={health?.database === "connected"}
            detail="PostgreSQL · Prisma ORM"
          />
          <ServiceCard
            icon={HardDrive}
            label="Object Storage"
            ok={health?.storage === "connected"}
            detail="MinIO (S3-compatible)"
          />
          <ServiceCard
            icon={ScanText}
            label="OCR"
            ok={!!health?.ocr.enabled}
            detail={`Provider: ${health?.ocr.provider ?? "—"} · model: mistral-ocr-latest`}
          />
          <ServiceCard
            icon={Scissors}
            label="PDF Split AI"
            ok={!!health?.pdfSplit.geminiConfigured}
            detail="Gemini 2.5 Flash · page-range suggestions"
          />
        </CardContent>
      </Card>

      {/* OCR Pipeline */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ScanText className="h-4 w-4 text-blue-500" />
            OCR Pipeline
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-2">
          <StepCard icon={Upload} step={1} title="Upload & validate" accent="bg-blue-500/15 text-blue-600 dark:text-blue-400">
            <p>File stored in MinIO. Accepted types: PDF, PNG, JPG, TIFF, WebP. Hard limit: <Pill>50 MB</Pill>.</p>
          </StepCard>

          <StepCard icon={ScanText} step={2} title="Mistral OCR" accent="bg-blue-500/15 text-blue-600 dark:text-blue-400">
            <p>
              The file buffer is base64-encoded and sent to the Mistral OCR API
              (<Pill>POST /v1/ocr</Pill>) with model <Pill>mistral-ocr-latest</Pill> (overridable via <Pill>OCR_MODEL</Pill>).
            </p>
            <p>
              Each page is returned as Markdown with headings <Pill>#Page N over M</Pill>. Pages are
              joined into one markdown string.
            </p>
            <p className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />
              Retries: 3 attempts · backoff 1 s → 3 s → 9 s · timeout 120 s per attempt.
              Rate-limit (429) and 5xx trigger retry; 401/403 fail immediately.
            </p>
          </StepCard>

          <StepCard icon={Database} step={3} title="Store result" accent="bg-blue-500/15 text-blue-600 dark:text-blue-400">
            <p>
              On success: <Pill>ocr_markdown</Pill>, <Pill>ocr_status = completed</Pill>,{" "}
              <Pill>ocr_processed_at</Pill>, <Pill>ocr_provider</Pill>, <Pill>ocr_model</Pill> saved to <Pill>file</Pill> row.
            </p>
            <p>
              On failure: <Pill>ocr_status = failed</Pill> + <Pill>ocr_error</Pill> message stored.
            </p>
            <p>
              If metadata extraction was queued before OCR finished (field{" "}
              <Pill>ocr_pending_metadata_key_ids</Pill> is set), extraction runs automatically
              right after OCR completes.
            </p>
          </StepCard>
        </CardContent>
      </Card>

      {/* Metadata extraction */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Tag className="h-4 w-4 text-violet-500" />
            AI Metadata Extraction
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-2">
          <StepCard icon={Settings2} step={1} title="Configuration — Document Types & Metadata Keys" accent="bg-violet-500/15 text-violet-600 dark:text-violet-400">
            <p>
              Each <strong>Document Type</strong> defines which <strong>Metadata Keys</strong> to
              extract and an optional <strong>Naming Instruction</strong> (a template string with
              placeholders, e.g.{" "}
              <Pill className="bg-violet-500/10">{"{{date}} - {{client}} - Invoice"}</Pill>).
            </p>
            <p>
              Each <strong>Metadata Key</strong> has a <em>value kind</em>:{" "}
              <Pill>free_text</Pill> (any string) or <Pill>predefined_list</Pill> (fixed set of
              allowed values). Only keys belonging to the document's type are extracted.
            </p>
          </StepCard>

          <StepCard icon={Brain} step={2} title="Gemini extraction prompt" accent="bg-violet-500/15 text-violet-600 dark:text-violet-400">
            <p>
              OCR markdown is truncated to <Pill>900 000 chars</Pill> (head 85% + tail 15% preserved).
              Gemini receives:
            </p>
            <ul className="list-disc list-inside space-y-0.5 mt-1">
              <li>A list of metadata key UUIDs with their label and value constraints</li>
              <li>A reference date (<Pill>yyyy-mm-dd</Pill>) for interpreting relative dates</li>
              <li>Instruction to return a single flat JSON object keyed by UUID</li>
            </ul>
            <p className="mt-1">
              Model: <Pill>gemini-2.5-flash</Pill> (overridable via <Pill>GEMINI_MODEL</Pill>) ·
              timeout 120 s · 3 retries with 1 s → 3 s → 9 s backoff.
            </p>
          </StepCard>

          <StepCard icon={Tag} step={3} title="Validation & write" accent="bg-violet-500/15 text-violet-600 dark:text-violet-400">
            <p>
              For <Pill>predefined_list</Pill> keys the extracted value is checked against the
              allowed-values list. If it doesn't match, that key is silently skipped (no failure).
            </p>
            <p>
              Valid values are upserted into <Pill>files_metadata_values</Pill> (fields:{" "}
              <Pill>files_id</Pill>, <Pill>metadata_id</Pill>, <Pill>value</Pill>,{" "}
              <Pill>company_id</Pill>). Event <Pill>METADATA_AI_APPLIED</Pill> logged to history.
            </p>
          </StepCard>

          <StepCard icon={Pencil} step={4} title="AI file renaming" accent="bg-violet-500/15 text-violet-600 dark:text-violet-400">
            <p>
              When the Document Type has <strong>naming instructions</strong>, Gemini receives a
              second prompt: the OCR text + instructions + current filename and returns{" "}
              <Pill>{"{ name: \"...\" }"}</Pill> (no extension).
            </p>
            <p>
              The proposed base name is sanitized (accents removed, illegal chars stripped,
              whitespace collapsed) and recombined with the original extension.
            </p>
            <p>
              <Pill>file.name</Pill> is updated and a <Pill>FILE_RENAMED</Pill> event is appended.
            </p>
          </StepCard>
        </CardContent>
      </Card>

      {/* PDF Split */}
      <Card>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Scissors className="h-4 w-4 text-orange-500" />
            PDF Split
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-2">
          <StepCard icon={FileText} step={1} title="Select source PDF" accent="bg-orange-500/15 text-orange-600 dark:text-orange-400">
            <p>
              User picks an existing document. Its OCR markdown is loaded (same{" "}
              <Pill>900 000 char</Pill> cap, tail preserved).
            </p>
          </StepCard>

          <StepCard icon={Brain} step={2} title="Gemini suggests segments" accent="bg-orange-500/15 text-orange-600 dark:text-orange-400">
            <p>
              Prompt includes all available <strong>Document Types</strong> with their metadata
              key constraints and naming instructions. Gemini returns a JSON array, one entry per
              logical document:
            </p>
            <pre className="mt-1.5 rounded bg-muted px-2 py-1.5 text-[10px] leading-relaxed overflow-x-auto whitespace-pre-wrap">
{`{
  "name": "2024-01-15 - Acme - Invoice",   // suggested filename (no ext)
  "document_type_id": "<uuid>",
  "start_page": 1,
  "end_page": 3,
  "metadata": { "<key-uuid>": "value", ... }
}`}
            </pre>
            <p className="mt-1">
              Page boundaries are derived from the <Pill>#Page N over M</Pill> headings in the OCR.
              Segments must not overlap; gaps are allowed for non-document pages.
            </p>
          </StepCard>

          <StepCard icon={Scissors} step={3} title="Apply split with pdf-lib" accent="bg-orange-500/15 text-orange-600 dark:text-orange-400">
            <p>
              Page ranges are validated (1-based, non-overlapping). <Pill>pdf-lib</Pill> extracts
              each range into a new PDF buffer. Each child is stored in MinIO, a new{" "}
              <Pill>file</Pill> row is created, and the AI-suggested metadata and filename are
              pre-populated.
            </p>
          </StepCard>

          <StepCard icon={Tag} step={4} title="Review & confirm" accent="bg-orange-500/15 text-orange-600 dark:text-orange-400">
            <p>
              The user sees a preview of each segment with its suggested name and metadata. They
              can adjust any field before confirming. Confirmed segments inherit the parent file's
              access rules.
            </p>
          </StepCard>
        </CardContent>
      </Card>

      {/* Two columns: File History + Config */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* File history events */}
        <Card>
          <CardHeader className="pb-3 pt-4 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />
              File History Events
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-1">
              {EVENT_TYPES.map((e) => (
                <div key={e.key} className="flex items-baseline gap-2">
                  <Pill>{e.key}</Pill>
                  <span className="text-xs text-muted-foreground">{e.desc}</span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Events are appended to <Pill>file_history_events</Pill>. Actor is the user UUID or{" "}
              <Pill>null</Pill> for system-triggered actions. Failures are logged but never throw.
            </p>
          </CardContent>
        </Card>

        {/* Configuration */}
        <Card>
          <CardHeader className="pb-3 pt-4 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <div>
              <p className="text-xs font-medium text-foreground/60 uppercase tracking-wide mb-1.5">OCR</p>
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <Pill>OCR_API_KEY</Pill>
                  <span className="text-muted-foreground">required</span>
                </div>
                <div className="flex justify-between text-xs">
                  <Pill>OCR_MODEL</Pill>
                  <span className="text-muted-foreground">default: mistral-ocr-latest</span>
                </div>
                <div className="flex justify-between text-xs">
                  <Pill>OCR_API_URL</Pill>
                  <span className="text-muted-foreground">default: api.mistral.ai</span>
                </div>
              </div>
            </div>
            <div className="border-t pt-3">
              <p className="text-xs font-medium text-foreground/60 uppercase tracking-wide mb-1.5">AI (Metadata + Split)</p>
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <Pill>GEMINI_API_KEY</Pill>
                  <span className="text-muted-foreground">required</span>
                </div>
                <div className="flex justify-between text-xs">
                  <Pill>GEMINI_MODEL</Pill>
                  <span className="text-muted-foreground">default: gemini-2.5-flash</span>
                </div>
              </div>
            </div>
            <div className="border-t pt-3">
              <p className="text-xs font-medium text-foreground/60 uppercase tracking-wide mb-1.5">Limits</p>
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Max file size</span>
                  <Pill>50 MB</Pill>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Max OCR chars to AI</span>
                  <Pill>900 000</Pill>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">AI request timeout</span>
                  <Pill>120 s</Pill>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Retry backoff</span>
                  <Pill>1 s → 3 s → 9 s</Pill>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
