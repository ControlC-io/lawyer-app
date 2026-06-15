import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCompanyId } from "@/hooks/useCompanyId";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import MetadataDocumentView from "@/components/documents/MetadataDocumentView";
import DocumentPermissionRules from "@/components/documents/DocumentPermissionRules";
import { api } from "@/lib/api";
import { FileText, Shield } from "lucide-react";

interface PersonSummary {
  id: string;
  full_name: string;
  root_folder_id: string | null;
}

export default function DocumentManagement() {
  const companyId = useCompanyId();
  const { hasPermission } = useAuth();
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const personId = searchParams.get("personId");
  const [activePerson, setActivePerson] = useState<PersonSummary | null>(null);

  const canManage = hasPermission("documents.manage");

  useEffect(() => {
    if (!companyId || !personId) {
      setActivePerson(null);
      return;
    }
    let cancelled = false;
    void api
      .get<PersonSummary>(`/api/companies/${companyId}/persons/${personId}`)
      .then((person) => {
        if (!cancelled) setActivePerson(person);
      })
      .catch(() => {
        if (!cancelled) setActivePerson(null);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, personId]);

  if (!companyId) {
    return (
      <div className="p-4">
        <Card>
          <CardContent className="flex items-center justify-center py-12 text-muted-foreground">
            {String(t("documents.noCompany"))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-4 h-[calc(100vh-3.5rem)] flex flex-col">
      <div className="mb-3">
        <h1 className="text-2xl font-bold mb-0.5">{String(t("documents.title"))}</h1>
        <p className="text-sm text-muted-foreground">{String(t("documents.subtitle"))}</p>
        {activePerson && (
          <p className="text-sm mt-2 text-primary font-medium">
            {String(t("documents.personContext", { name: activePerson.full_name }))}
          </p>
        )}
      </div>

      <Tabs defaultValue="documents" className="flex-1 flex flex-col min-h-0">
        <TabsList className="self-start mb-3">
          <TabsTrigger value="documents" className="gap-1.5">
            <FileText className="h-4 w-4" />
            {String(t("sidebar.documents"))}
          </TabsTrigger>
          {canManage && (
            <TabsTrigger value="access-rules" className="gap-1.5">
              <Shield className="h-4 w-4" />
              {String(t("documents.accessRules"))}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="documents" className="flex-1 min-h-0 min-w-0 mt-0 overflow-hidden">
          <MetadataDocumentView
            companyId={companyId}
            canManage={canManage}
            defaultFolderId={activePerson?.root_folder_id ?? null}
            personLabel={activePerson?.full_name ?? null}
          />
        </TabsContent>

        {canManage && (
          <TabsContent value="access-rules" className="flex-1 min-h-0 mt-0">
            <DocumentPermissionRules companyId={companyId} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
