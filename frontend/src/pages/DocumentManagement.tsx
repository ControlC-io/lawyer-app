import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCompanyId } from "@/hooks/useCompanyId";
import { useAuth } from "@/contexts/AuthContext";
import MetadataDocumentView from "@/components/documents/MetadataDocumentView";
import DocumentPermissionRules from "@/components/documents/DocumentPermissionRules";
import { FileText, Shield } from "lucide-react";

export default function DocumentManagement() {
  const companyId = useCompanyId();
  const { hasPermission } = useAuth();

  const canManageFiles = hasPermission("documents.manage_files");

  if (!companyId) {
    return (
      <div className="p-4">
        <Card>
          <CardContent className="flex items-center justify-center py-12 text-muted-foreground">
            Select a company to manage documents.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-4 h-[calc(100vh-3.5rem)] flex flex-col">
      <div className="mb-3">
        <h1 className="text-2xl font-bold mb-0.5">Document Management</h1>
        <p className="text-sm text-muted-foreground">Organize, tag, and control access to your documents</p>
      </div>

      <Tabs defaultValue="documents" className="flex-1 flex flex-col min-h-0">
        <TabsList className="self-start mb-3">
          <TabsTrigger value="documents" className="gap-1.5">
            <FileText className="h-4 w-4" />
            Documents
          </TabsTrigger>
          {canManageFiles && (
            <TabsTrigger value="access-rules" className="gap-1.5">
              <Shield className="h-4 w-4" />
              Access Rules
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="documents" className="flex-1 min-h-0 min-w-0 mt-0 overflow-hidden">
          <MetadataDocumentView companyId={companyId} canManageFiles={canManageFiles} />
        </TabsContent>

        {canManageFiles && (
          <TabsContent value="access-rules" className="flex-1 min-h-0 mt-0">
            <DocumentPermissionRules companyId={companyId} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
