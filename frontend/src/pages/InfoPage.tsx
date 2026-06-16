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
  FileText,
  Brain,
  Tag,
  ArrowRight,
  Info,
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
        "inline-block h-2 w-2 rounded-full",
        ok ? "bg-emerald-500 shadow-[0_0_6px_1px_rgba(16,185,129,0.5)]" : "bg-red-500"
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
        {detail && <p className="mt-0.5 truncate text-xs text-muted-foreground">{detail}</p>}
      </div>
      <Badge
        variant={ok ? "default" : "destructive"}
        className={cn(
          "text-xs",
          ok && "bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400"
        )}
      >
        {ok ? "OK" : "Error"}
      </Badge>
    </div>
  );
}

const PIPELINE_STEPS = [
  {
    icon: Upload,
    title: "Upload",
    desc: "PDF or image uploaded via the UI. Stored in MinIO (S3-compatible) and a DB record created.",
  },
  {
    icon: ScanText,
    title: "OCR",
    desc: "Mistral Vision reads each page and returns structured text. Result is stored alongside the file.",
  },
  {
    icon: Brain,
    title: "AI Extraction",
    desc: "Gemini receives the OCR text + configured metadata keys and extracts field values (dates, names, references, etc.).",
  },
  {
    icon: Tag,
    title: "Metadata",
    desc: "Extracted values are validated against allowed values per key, then saved as files_metadata_values.",
  },
];

const SPLIT_STEPS = [
  {
    icon: FileText,
    title: "Select PDF",
    desc: "User picks an existing document. The full OCR text is loaded (capped at MAX_OCR_CHARS, tail preserved).",
  },
  {
    icon: Brain,
    title: "Gemini suggests ranges",
    desc: "AI proposes page-range segments with a label and pre-filled metadata per segment, returned as fenced JSON.",
  },
  {
    icon: Scissors,
    title: "Split",
    desc: "pdf-lib extracts each page range into a new PDF. Each child document is stored and linked to the parent.",
  },
  {
    icon: Tag,
    title: "Metadata applied",
    desc: "Each segment inherits the AI-suggested metadata. Users can review and adjust before confirming.",
  },
];

function Pipeline({
  title,
  steps,
  accent,
}: {
  title: string;
  steps: { icon: React.ElementType; title: string; desc: string }[];
  accent: string;
}) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-foreground/70 uppercase tracking-wider">{title}</h3>
      <div className="flex flex-wrap items-start gap-1">
        {steps.map((step, i) => (
          <div key={step.title} className="flex items-start gap-1">
            <div className="flex flex-col items-center rounded-lg border bg-card p-3 w-44">
              <div className={cn("mb-2 flex h-8 w-8 items-center justify-center rounded-md", accent)}>
                <step.icon className="h-4 w-4" />
              </div>
              <p className="text-xs font-semibold text-center">{step.title}</p>
              <p className="mt-1 text-[11px] text-muted-foreground text-center leading-snug">{step.desc}</p>
            </div>
            {i < steps.length - 1 && (
              <ArrowRight className="h-4 w-4 mt-5 shrink-0 text-muted-foreground/40" />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

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
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Info className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">System Info</h1>
            <p className="text-xs text-muted-foreground">Service status &amp; process overview</p>
          </div>
        </div>
        <button
          onClick={() => { setLoading(true); fetchHealth(); }}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          {lastChecked ? (
            <span>Last checked {lastChecked.toLocaleTimeString()}</span>
          ) : (
            <span>Checking…</span>
          )}
        </button>
      </div>

      {/* Status cards */}
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
              <span className="ml-2 text-xs font-normal text-destructive">{health.message}</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <ServiceCard
            icon={Database}
            label="Database"
            ok={health?.database === "connected"}
            detail="PostgreSQL via Prisma ORM"
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
            detail={`Provider: ${health?.ocr.provider ?? "—"}`}
          />
          <ServiceCard
            icon={Scissors}
            label="PDF Split (AI)"
            ok={!!health?.pdfSplit.geminiConfigured}
            detail="Gemini — page-range suggestions"
          />
        </CardContent>
      </Card>

      {/* Pipelines */}
      <Card>
        <CardHeader className="pb-3 pt-4 px-4">
          <CardTitle className="text-sm font-semibold">Document Pipelines</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-6">
          <Pipeline
            title="Upload → OCR → Metadata extraction"
            steps={PIPELINE_STEPS}
            accent="bg-blue-500/10 text-blue-500"
          />
          <div className="border-t" />
          <Pipeline
            title="PDF Split"
            steps={SPLIT_STEPS}
            accent="bg-violet-500/10 text-violet-500"
          />
        </CardContent>
      </Card>

      {/* Architecture note */}
      <Card className="bg-muted/40">
        <CardContent className="px-4 py-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Stack:</strong> React 18 + Vite (frontend) · Express + Prisma (backend) · PostgreSQL · MinIO · Mistral Vision (OCR) · Gemini (AI split &amp; metadata).
            All file I/O goes through <code className="text-[11px] bg-muted px-1 rounded">storage.service.ts</code> (MinIO wrapper).
            Document access is enforced by two independent layers: coarse RBAC (<code className="text-[11px] bg-muted px-1 rounded">lib/rbac.ts</code>) and fine-grained condition-based rules (<code className="text-[11px] bg-muted px-1 rounded">lib/documentAccess.ts</code>).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
