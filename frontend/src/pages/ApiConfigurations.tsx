import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2, Edit, ArrowLeft, Save, X, Settings, Download, FileText, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useCompanyId } from "@/hooks/useCompanyId";
import { useLanguage } from "@/contexts/LanguageContext";

type KeyValuePair = { key: string; value: string; mode?: "static" | "bind" };

interface ApiConfiguration {
  id: string;
  name: string;
  description: string | null;
  config_type: "automatic_action" | "agent_decision" | "dynamic_options";
  api_url: string;
  api_method: string;
  api_headers: KeyValuePair[];
  api_params: KeyValuePair[];
  api_data: KeyValuePair[];
  company_id: string;
  created_at: string;
  updated_at: string;
}

export default function ApiConfigurations() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const companyId = useCompanyId();
  const [configurations, setConfigurations] = useState<ApiConfiguration[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<ApiConfiguration | null>(null);
  
  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [configType, setConfigType] = useState<"automatic_action" | "agent_decision" | "dynamic_options">("automatic_action");
  const [apiUrl, setApiUrl] = useState("");
  const [apiMethod, setApiMethod] = useState("GET");
  const [headers, setHeaders] = useState<KeyValuePair[]>([{ key: "", value: "" }]);

  useEffect(() => {
    if (companyId) {
      fetchConfigurations();
    }
  }, [companyId]);

  const fetchConfigurations = async () => {
    if (!companyId) return;
    try {
      setLoading(true);
      const list = await api.get<Array<Record<string, unknown>>>(
        `/api/companies/${companyId}/api-configurations`
      );
      const configs = (list || []).map((config: Record<string, unknown>) => ({
        ...config,
        api_headers: typeof config.api_headers === 'string' ? JSON.parse(config.api_headers as string) : (config.api_headers || []),
        api_params: typeof config.api_params === 'string' ? JSON.parse(config.api_params as string) : (config.api_params || []),
        api_data: typeof config.api_data === 'string' ? JSON.parse(config.api_data as string) : (config.api_data || []),
      })) as ApiConfiguration[];
      setConfigurations(configs);
    } catch (error) {
      console.error("Error fetching configurations:", error);
      toast.error(t("apiConfigurations.failedToLoad"));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (config?: ApiConfiguration) => {
    if (config) {
      setEditingConfig(config);
      setName(config.name);
      setDescription(config.description || "");
      setConfigType(config.config_type);
      setApiUrl(config.api_url);
      setApiMethod(config.api_method || "GET");
      setHeaders(config.api_headers.length > 0 ? config.api_headers : [{ key: "", value: "" }]);
    } else {
      setEditingConfig(null);
      setName("");
      setDescription("");
      setConfigType("automatic_action");
      setApiUrl("");
      setApiMethod("GET");
      setHeaders([{ key: "", value: "" }]);
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingConfig(null);
  };

  const handleSave = async () => {
    if (!companyId) {
      toast.error(t("apiConfigurations.companyNotSet"));
      return;
    }

    if (!name.trim() || !apiUrl.trim()) {
      toast.error(t("apiConfigurations.nameAndUrlRequired"));
      return;
    }

    try {
      const configData = {
        name: name.trim(),
        description: description.trim() || null,
        config_type: configType,
        api_url: apiUrl.trim(),
        api_method: apiMethod,
        api_headers: headers.filter((h) => h.key.trim() || h.value.trim()),
        api_params: [] as KeyValuePair[],
        api_data: [] as KeyValuePair[],
      };

      if (editingConfig) {
        await api.patch(
          `/api/companies/${companyId}/api-configurations/${editingConfig.id}`,
          configData
        );
        toast.success(t("apiConfigurations.configurationUpdated"));
      } else {
        await api.post(`/api/companies/${companyId}/api-configurations`, configData);
        toast.success(t("apiConfigurations.configurationCreated"));
      }

      handleCloseDialog();
      fetchConfigurations();
    } catch (error: any) {
      console.error("Error saving configuration:", error);
      toast.error(`${t("apiConfigurations.failedToSave")}: ${error.message || 'Unknown error'}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("apiConfigurations.deleteConfirm"))) {
      return;
    }

    try {
      if (!companyId) {
        toast.error(t("apiConfigurations.companyNotSet"));
        return;
      }
      await api.delete(`/api/companies/${companyId}/api-configurations/${id}`);
      toast.success(t("apiConfigurations.configurationDeleted"));
      fetchConfigurations();
    } catch (error: any) {
      console.error("Error deleting configuration:", error);
      toast.error(`${t("apiConfigurations.failedToDelete")}: ${error.message || 'Unknown error'}`);
    }
  };

  const handleDuplicate = (config: ApiConfiguration) => {
    // Generate a new name by appending " (Copy)" or incrementing the number
    let newName = `${config.name} (Copy)`;
    
    // Check if a configuration with this name already exists
    const existingNames = configurations.map(c => c.name);
    if (existingNames.includes(newName)) {
      // Try to find a unique name by incrementing
      let counter = 2;
      while (existingNames.includes(`${config.name} (Copy ${counter})`)) {
        counter++;
      }
      newName = `${config.name} (Copy ${counter})`;
    }

    // Open dialog with duplicated data
    setEditingConfig(null); // This is a new configuration, not editing
    setName(newName);
    setDescription(config.description || "");
    setConfigType(config.config_type);
    setApiUrl(config.api_url);
    setApiMethod(config.api_method || "GET");
    setHeaders(config.api_headers.length > 0 ? config.api_headers : [{ key: "", value: "" }]);
    setIsDialogOpen(true);
  };

  const handleAddKeyValue = (type: "headers") => {
    setHeaders([...headers, { key: "", value: "" }]);
  };

  const handleUpdateKeyValue = (
    type: "headers",
    index: number,
    field: "key" | "value",
    value: string
  ) => {
    const updated = [...headers];
    updated[index][field] = value;
    setHeaders(updated);
  };

  const handleDeleteKeyValue = (type: "headers", index: number) => {
    if (headers.length <= 1) return;
    const updated = headers.filter((_, i) => i !== index);
    setHeaders(updated);
  };

  const handleDownloadApiDocs = async () => {
    try {
      const response = await fetch('/docs/openapi.json');
      if (!response.ok) {
        throw new Error('Failed to fetch API documentation');
      }
      const json = await response.json();
      const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'floowly-api-documentation.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(t("apiConfigurations.docDownloaded"));
    } catch (error) {
      console.error("Error downloading API documentation:", error);
      toast.error(t("apiConfigurations.failedToDownloadDoc"));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading API configurations...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("apiConfigurations.title")}</h1>
          <p className="text-muted-foreground mt-1">
            {t("apiConfigurations.subtitle")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t("common.back")}
          </Button>
          <Button variant="outline" onClick={handleDownloadApiDocs}>
            <Download className="h-4 w-4 mr-2" />
            Download API Docs
          </Button>
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="h-4 w-4 mr-2" />
            {t("apiConfigurations.newConfiguration")}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            API Documentation
          </CardTitle>
          <CardDescription>
            Download the complete OpenAPI/Swagger specification for the Floowly API
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-sm text-muted-foreground mb-2">
                The API documentation includes detailed information about all API endpoints including:
              </p>
              <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                <li>Workflow triggering and execution management</li>
                <li>Decision making and step completion</li>
                <li>Execution data updates and retrieval</li>
                <li>User information and utility functions</li>
                <li>AI-powered workflow creation and audio transcription</li>
              </ul>
            </div>
            <Button variant="outline" onClick={handleDownloadApiDocs} className="ml-4">
              <Download className="h-4 w-4 mr-2" />
              Download OpenAPI Spec
            </Button>
          </div>
        </CardContent>
      </Card>

      {configurations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Settings className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No configurations yet</h3>
            <p className="text-muted-foreground text-center mb-4">
              Create your first API configuration to reuse across workflows
            </p>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              Create Configuration
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {configurations.map((config) => (
            <Card key={config.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{config.name}</CardTitle>
                    <CardDescription className="mt-1">
                      {config.description || t("apiConfigurations.noDescription")}
                    </CardDescription>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleOpenDialog(config)}
                      title="Edit"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDuplicate(config)}
                      title="Duplicate"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(config.id)}
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={
                      config.config_type === "automatic_action" ? "default" : 
                      config.config_type === "agent_decision" ? "secondary" : 
                      "outline"
                    }>
                      {config.config_type === "automatic_action" ? t("apiConfigurations.automaticAction") : 
                       config.config_type === "agent_decision" ? t("apiConfigurations.agentDecision") : 
                       t("apiConfigurations.dynamicOptions")}
                    </Badge>
                  </div>
                  <div className="text-sm space-y-1">
                    <p className="font-medium">Method: {config.api_method}</p>
                    <p className="text-muted-foreground truncate" title={config.api_url}>
                      URL: {config.api_url}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingConfig ? t("apiConfigurations.editConfiguration") : t("apiConfigurations.newConfiguration")}
            </DialogTitle>
            <DialogDescription>
              Create a reusable API configuration that can be used across multiple workflow steps
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 mt-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">{t("apiConfigurations.nameRequired")}</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("apiConfigurations.namePlaceholder")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="config-type">{t("apiConfigurations.configType")}</Label>
                <Select value={configType} onValueChange={(value: any) => setConfigType(value)}>
                  <SelectTrigger id="config-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="automatic_action">{t("apiConfigurations.automaticAction")}</SelectItem>
                    <SelectItem value="agent_decision">{t("apiConfigurations.agentDecision")}</SelectItem>
                    <SelectItem value="dynamic_options">{t("apiConfigurations.dynamicOptions")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{t("apiConfigurations.description")}</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("apiConfigurations.descriptionPlaceholder")}
                rows={2}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="api-url">{t("apiConfigurations.apiUrl")}</Label>
                <Input
                  id="api-url"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  placeholder={t("apiConfigurations.apiUrlPlaceholder")}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="api-method">{t("apiConfigurations.httpMethod")}</Label>
                <Select value={apiMethod} onValueChange={setApiMethod}>
                  <SelectTrigger id="api-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GET">GET</SelectItem>
                    <SelectItem value="POST">POST</SelectItem>
                    <SelectItem value="PUT">PUT</SelectItem>
                    <SelectItem value="PATCH">PATCH</SelectItem>
                    <SelectItem value="DELETE">DELETE</SelectItem>
                  </SelectContent>
                </Select>
                {configType === "dynamic_options" && (
                  <p className="text-xs text-muted-foreground">
                    GET is recommended for fetching options. The API should return a JSON array of strings.
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>{t("apiConfigurations.headers")}</Label>
                <Button size="sm" variant="outline" onClick={() => handleAddKeyValue("headers")}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </Button>
              </div>
              <div className="space-y-2">
                {headers.map((header, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      placeholder={t("apiConfigurations.keyPlaceholder")}
                      value={header.key}
                      onChange={(e) => handleUpdateKeyValue("headers", index, "key", e.target.value)}
                    />
                    <Input
                      placeholder={t("apiConfigurations.valuePlaceholder")}
                      value={header.value}
                      onChange={(e) => handleUpdateKeyValue("headers", index, "value", e.target.value)}
                    />
                    {headers.length > 1 && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDeleteKeyValue("headers", index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Note: Query parameters and request data are configured per workflow step in the step properties.
              </p>
            </div>

            <Alert>
              <AlertDescription>
                {configType === "dynamic_options" ? (
                  <>
                    This configuration is used to fetch dynamic options for option and multiple_option field types. 
                    The API should return a JSON array of strings (e.g., ["Option 1", "Option 2"]). 
                    The options will be fetched at runtime when the field is displayed in a workflow execution.
                  </>
                ) : (
                  <>
                    This configuration can be reused across multiple workflow steps. When selected in a step, 
                    the API URL, method, and headers will be automatically applied. Query parameters and request data 
                    are configured per step in the workflow editor to allow custom data bindings.
                  </>
                )}
              </AlertDescription>
            </Alert>

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={handleCloseDialog}>
                {t("common.cancel")}
              </Button>
              <Button onClick={handleSave}>
                <Save className="h-4 w-4 mr-2" />
                {editingConfig ? t("apiConfigurations.update") : t("apiConfigurations.create")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

