import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, Eye, EyeOff, RefreshCw, Key, Shield, Users, Building, FileText, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useCompanyId } from "@/hooks/useCompanyId";

interface Company {
  id: string;
  name: string;
  api_key: string;
  created_at: string;
}

interface User {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
}

export default function OrganizationSettings() {
  const navigate = useNavigate();
  const companyId = useCompanyId();
  const [company, setCompany] = useState<Company | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showApiKey, setShowApiKey] = useState(false);
  const [regeneratingKey, setRegeneratingKey] = useState(false);

  const [metadataKeys, setMetadataKeys] = useState<Array<{ id: string; name: string }>>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [creatingKey, setCreatingKey] = useState(false);

  useEffect(() => {
    if (companyId) {
      fetchCompanyData();
      fetchUsers();
      fetchMetadataKeys();
    }
  }, [companyId]);

  const fetchCompanyData = async () => {
    try {
      const data = await api.get<Company>(`/api/companies/${companyId}`);
      setCompany(data);
    } catch (error) {
      console.error("Error fetching company data:", error);
      toast.error("Failed to load organization data");
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const data = await api.get<User[]>(`/api/companies/${companyId}/users`);
      setUsers(data || []);
    } catch (error) {
      console.error("Error fetching users:", error);
      toast.error("Failed to load users");
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied to clipboard`);
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
      toast.error("Failed to copy to clipboard");
    }
  };

  const regenerateApiKey = async () => {
    if (
      !confirm(
        "Are you sure you want to regenerate the API key? This will invalidate the current key and may break existing integrations."
      )
    ) {
      return;
    }
    setRegeneratingKey(true);
    try {
      const updated = await api.patch<Company>(`/api/companies/${companyId}`, {
        regenerate_api_key: true,
      });
      if (updated?.api_key) setCompany((c) => (c ? { ...c, api_key: updated.api_key } : null));
      toast.success("API key regenerated successfully");
    } catch (error) {
      console.error("Error regenerating API key:", error);
      toast.error("Failed to regenerate API key");
    } finally {
      setRegeneratingKey(false);
    }
  };

  const fetchMetadataKeys = async () => {
    try {
      const data = await api.get<{ id: string; name: string }[]>(
        `/api/companies/${companyId}/files-metadata-keys`
      );
      setMetadataKeys(data || []);
    } catch (error) {
      console.error("Error fetching metadata keys:", error);
      toast.error("Failed to load metadata keys");
    }
  };

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) return;
    setCreatingKey(true);
    try {
      await api.post(`/api/companies/${companyId}/files-metadata-keys`, {
        name: newKeyName.trim(),
      });
      toast.success("Metadata key created");
      setNewKeyName("");
      fetchMetadataKeys();
    } catch (error) {
      console.error("Error creating metadata key:", error);
      toast.error("Failed to create metadata key");
    } finally {
      setCreatingKey(false);
    }
  };

  const handleDeleteKey = async (id: string) => {
    if (
      !confirm(
        "Are you sure you want to delete this key? Existing files using this key will lose the reference."
      )
    ) {
      return;
    }
    try {
      await api.delete(`/api/companies/${companyId}/files-metadata-keys/${id}`);
      toast.success("Metadata key deleted");
      fetchMetadataKeys();
    } catch (error) {
      console.error("Error deleting metadata key:", error);
      toast.error("Failed to delete metadata key");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading organization settings...</div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Organization not found</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Organization Settings</h1>
          <p className="text-muted-foreground mt-1">
            Manage your organization's API access and settings
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate(-1)}>
          Back
        </Button>
      </div>

      {/* Organization Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building className="h-5 w-5" />
            Organization Information
          </CardTitle>
          <CardDescription>
            Basic information about your organization
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="org-name">Organization Name</Label>
            <Input
              id="org-name"
              value={company.name}
              disabled
              className="bg-muted"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-id">Organization ID</Label>
            <div className="flex items-center gap-2">
              <Input
                id="org-id"
                value={company.id}
                disabled
                className="bg-muted font-mono text-sm"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(company.id, "Organization ID")}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Created</Label>
            <p className="text-sm text-muted-foreground pt-2">
              {new Date(company.created_at).toLocaleDateString()}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Supabase Credentials */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              API Authentication
            </CardTitle>
            <CardDescription>
              Required for API gateway authentication
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                These credentials are safe to use in client-side applications and can be shared publicly.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="api-base-url">Base API URL</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="api-base-url"
                  value={import.meta.env.VITE_API_URL ?? ""}
                  disabled
                  className="bg-muted font-mono text-sm"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    copyToClipboard(import.meta.env.VITE_API_URL ?? "", "API URL")
                  }
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* API Key Management */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Company API Key
            </CardTitle>
            <CardDescription>
              Your organization's API key for workflow authorization
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                Keep your API key secure. Anyone with this key can trigger workflows in your organization.
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="api-key">Company API Key</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="api-key"
                  type={showApiKey ? "text" : "password"}
                  value={company.api_key}
                  disabled
                  className="bg-muted font-mono text-sm"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(company.api_key, "API Key")}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="pt-4 border-t">
              <Button
                variant="destructive"
                onClick={regenerateApiKey}
                disabled={regeneratingKey}
                className="w-full"
              >
                {regeneratingKey ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Regenerating...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Regenerate API Key
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* File Metadata Keys */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            File Metadata Keys
          </CardTitle>
          <CardDescription>
            Manage keys used for file metadata
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="New key name (e.g. Invoice Number)"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleCreateKey();
                }
              }}
            />
            <Button onClick={handleCreateKey} disabled={creatingKey || !newKeyName.trim()}>
              {creatingKey ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </Button>
          </div>

          <div className="space-y-2">
            {metadataKeys.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No metadata keys defined.
              </p>
            )}
            {metadataKeys.map((key) => (
              <div key={key.id} className="flex items-center justify-between p-2 border rounded-md bg-muted/50">
                <span className="text-sm font-medium">{key.name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDeleteKey(key.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>


      {/* API Usage Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>API Usage</CardTitle>
          <CardDescription>
            How to use your credentials to trigger workflows externally
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Endpoint URL</Label>
            <div className="flex items-center gap-2">
              <Input
                value={`${import.meta.env.VITE_API_URL ?? ""}/api/workflows/{workflow_id}/trigger`}
                disabled
                className="bg-muted font-mono text-sm"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(`${import.meta.env.VITE_API_URL ?? ""}/api/workflows/{workflow_id}/trigger`, "Endpoint URL")}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Example cURL Request</Label>
            <Textarea
              value={`curl -X POST ${import.meta.env.VITE_API_URL ?? ""}/api/workflows/YOUR_WORKFLOW_ID/trigger \\
  -H "x-api-key: ${company?.api_key ?? ""}" \\
  -H "Content-Type: application/json" \\
  -d '{"data": {"customer_name": "John Doe", "order_amount": 150.00}}'`}
              disabled
              className="bg-muted font-mono text-xs h-40"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => copyToClipboard(`curl -X POST ${import.meta.env.VITE_API_URL ?? ""}/api/workflows/YOUR_WORKFLOW_ID/trigger -H "x-api-key: ${company?.api_key ?? ""}" -H "Content-Type: application/json" -d '{"data": {"customer_name": "John Doe", "order_amount": 150.00}}'`, "Example Request")}
            >
              <Copy className="h-4 w-4 mr-2" />
              Copy Example
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Team Members */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team Members
          </CardTitle>
          <CardDescription>
            Users in your organization
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {users.map((user) => (
              <div key={user.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                    <span className="text-sm font-medium">
                      {(user.full_name || user.email).charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium">{user.full_name || "No name"}</p>
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                  </div>
                </div>
                <Badge variant={user.role === 'company_admin' ? 'default' : 'secondary'}>
                  {user.role === 'company_admin' ? 'Admin' : 'User'}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div >
  );
}
