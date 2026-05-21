import { Button } from "@/components/ui/button";
import { Mail } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";

interface ExternalFormLinkBarProps {
  token: string;
  expiresAt?: string | null;
  onSendEmail: () => void;
}

export const ExternalFormLinkBar = ({ token, expiresAt, onSendEmail }: ExternalFormLinkBarProps) => {
  const { t } = useLanguage();
  const formUrl = `${window.location.origin}/external/form/${token}`;
  const formattedExpiry =
    expiresAt &&
    new Date(expiresAt).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });

  return (
    <div className="flex flex-col gap-1.5 p-2 bg-muted/50 rounded-md border text-xs">
      <div className="flex items-center gap-2">
        <span className="font-medium shrink-0">{t("executionDataPanel.externalLink")}</span>
        <code className="bg-background px-1 py-0.5 rounded border border-border flex-1 truncate select-all">
          {formUrl}
        </code>
        <div className="flex gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => {
            navigator.clipboard.writeText(formUrl);
            toast({ title: t("executionDataPanel.linkCopied") });
          }}
          title={t("executionDataPanel.copyLink")}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3 w-3"
          >
            <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
          </svg>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onSendEmail}
          title={t("executionDataPanel.sendLinkByEmail")}
        >
          <Mail className="h-3 w-3" />
        </Button>
        </div>
      </div>
      {formattedExpiry && (
        <p className="text-muted-foreground">
          Link expires {formattedExpiry}
        </p>
      )}
    </div>
  );
};
