import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Trash2, Edit, ArrowLeft, Save, X, Settings, Shield, Grid, Layers, ChevronDown, BarChart2, ArrowUpDown, ArrowUp, ArrowDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";

// Types
interface AgentCategory {
    id: string;
    name: string;
    description: string | null;
    icon: string | null;
    created_at: string;
}

interface AgentConfiguration {
    id: string;
    name: string;
    description: string | null;
    api_url: string;
    api_method: string;
    api_headers: any;
    api_params: any;
    category_id: string | null;
    agent_type?: string;
    created_at: string;
    category?: AgentCategory;
}

interface AgentPermission {
    id: string;
    agent_configuration_id: string;
    company_id: string;
    enabled: boolean;
    created_at: string;
    agent_configuration?: { name: string };
    company?: { name: string };
}

interface Company {
    id: string;
    name: string;
}

interface AgentUsageRow {
    id: string;
    workflow_execution_id: string | null;
    agent_id: string | null;
    agent_name: string | null;
    model_name: string | null;
    input_tokens: string | null;
    thinking_tokens: string | null;
    output_tokens: string | null;
    total_cost: string | null;
    company_id: string | null;
    company_name: string | null;
    comment: string | null;
    created_at: string;
}

export default function AgentConfigurations() {
    const navigate = useNavigate();
    const { t } = useLanguage();
    const { isSuperAdmin } = useAuth();
    const [activeTab, setActiveTab] = useState("configurations");
    const [loading, setLoading] = useState(true);

    // Data states
    const [configurations, setConfigurations] = useState<AgentConfiguration[]>([]);
    const [categories, setCategories] = useState<AgentCategory[]>([]);
    const [permissions, setPermissions] = useState<AgentPermission[]>([]);
    const [companies, setCompanies] = useState<Company[]>([]);
    const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([]);
    const [agentTypeFilter, setAgentTypeFilter] = useState<"all" | "action" | "decision">("all");
    const [agentUsageList, setAgentUsageList] = useState<AgentUsageRow[]>([]);
    const [agentUsageLoading, setAgentUsageLoading] = useState(false);
    const [usageSortField, setUsageSortField] = useState<keyof AgentUsageRow | null>(null);
    const [usageSortDirection, setUsageSortDirection] = useState<"asc" | "desc">("asc");
    const [usageSearch, setUsageSearch] = useState("");

    // Dialog states
    const [configDialogOpen, setConfigDialogOpen] = useState(false);
    const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
    const [permissionDialogOpen, setPermissionDialogOpen] = useState(false);

    // Editing states
    const [editingConfig, setEditingConfig] = useState<AgentConfiguration | null>(null);
    const [editingCategory, setEditingCategory] = useState<AgentCategory | null>(null);
    const [editingPermission, setEditingPermission] = useState<AgentPermission | null>(null);

    // Form states
    const [configForm, setConfigForm] = useState({
        name: "",
        description: "",
        api_url: "",
        api_method: "POST",
        category_id: "",
        agent_type: "action" as "action" | "decision",
        api_headers: [] as { key: string; value: string }[],
        api_params: [] as { key: string; value: string }[],
    });

    const [categoryForm, setCategoryForm] = useState({
        name: "",
        description: "",
        icon: "",
    });

    const [permissionForm, setPermissionForm] = useState({
        agent_configuration_id: "",
        company_id: "",
        enabled: true,
    });

    useEffect(() => {
        if (!isSuperAdmin) {
            navigate("/executions");
            return;
        }
        fetchData();
    }, [isSuperAdmin, navigate]);

    const fetchAgentUsage = async () => {
        setAgentUsageLoading(true);
        try {
            const data = await api.get<AgentUsageRow[]>(`/api/agents/usage`);
            setAgentUsageList(data);
        } catch (err) {
            console.error("Failed to load agent usage:", err);
            toast.error("Failed to load agent usage");
            setAgentUsageList([]);
        } finally {
            setAgentUsageLoading(false);
        }
    };

    useEffect(() => {
        if (isSuperAdmin && activeTab === "usage") {
            fetchAgentUsage();
        }
    }, [isSuperAdmin, activeTab]);

    const usageColumns: { key: keyof AgentUsageRow; label: string; align?: "left" | "right" }[] = [
        { key: "created_at", label: "Created", align: "left" },
        { key: "agent_name", label: "Agent", align: "left" },
        { key: "company_name", label: "Company", align: "left" },
        { key: "workflow_execution_id", label: "Execution", align: "left" },
        { key: "model_name", label: "Model", align: "left" },
        { key: "input_tokens", label: "Input", align: "right" },
        { key: "thinking_tokens", label: "Thinking", align: "right" },
        { key: "output_tokens", label: "Output", align: "right" },
        { key: "total_cost", label: "Cost", align: "right" },
        { key: "comment", label: t("agentUsage.comment"), align: "left" },
    ];

    const filteredAndSortedUsage = useMemo(() => {
        const q = usageSearch.trim().toLowerCase();
        let list = agentUsageList;
        if (q) {
            list = list.filter((row) => {
                const created = row.created_at ? new Date(row.created_at).toLocaleString().toLowerCase() : "";
                const agent = (row.agent_name ?? row.agent_id ?? "").toString().toLowerCase();
                const company = (row.company_name ?? row.company_id ?? "").toString().toLowerCase();
                const exec = (row.workflow_execution_id ?? "").toLowerCase();
                const model = (row.model_name ?? "").toLowerCase();
                const comment = (row.comment ?? "").toLowerCase();
                return [created, agent, company, exec, model, comment].some((s) => s.includes(q));
            });
        }
        if (!usageSortField) return list;
        const dir = usageSortDirection === "asc" ? 1 : -1;
        const numericKeys = ["input_tokens", "thinking_tokens", "output_tokens", "total_cost"];
        return [...list].sort((a, b) => {
            const aVal = a[usageSortField];
            const bVal = b[usageSortField];
            const aStr = (aVal ?? "").toString();
            const bStr = (bVal ?? "").toString();
            if (numericKeys.includes(usageSortField)) {
                const aNum = parseFloat(aStr) || 0;
                const bNum = parseFloat(bStr) || 0;
                return dir * (aNum - bNum);
            }
            if (usageSortField === "created_at") {
                const aDate = aStr ? new Date(aStr).getTime() : 0;
                const bDate = bStr ? new Date(bStr).getTime() : 0;
                return dir * (aDate - bDate);
            }
            return dir * aStr.localeCompare(bStr, undefined, { numeric: true });
        });
    }, [agentUsageList, usageSearch, usageSortField, usageSortDirection]);

    const handleUsageSort = (field: keyof AgentUsageRow) => {
        if (usageSortField === field) {
            setUsageSortDirection((d) => (d === "asc" ? "desc" : "asc"));
        } else {
            setUsageSortField(field);
            setUsageSortDirection("asc");
        }
    };

    const getUsageSortIcon = (field: keyof AgentUsageRow) => {
        if (usageSortField !== field) return <ArrowUpDown className="h-4 w-4 ml-1 opacity-50" />;
        return usageSortDirection === "asc" ? (
            <ArrowUp className="h-4 w-4 ml-1" />
        ) : (
            <ArrowDown className="h-4 w-4 ml-1" />
        );
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            await Promise.all([
                fetchConfigurations(),
                fetchCategories(),
                fetchPermissions(),
                fetchCompanies(),
            ]);
        } catch (error) {
            console.error("Error fetching data:", error);
            toast.error(t("agentConfigurations.failedToLoadData"));
        } finally {
            setLoading(false);
        }
    };

    const fetchConfigurations = async () => {
        try {
            const data = await api.get<AgentConfiguration[]>(`/api/agents/configurations`);
            const configsWithType = (data || []).map((config) => ({
                ...config,
                agent_type: config.agent_type || "action",
            }));
            setConfigurations(configsWithType);
        } catch (error: unknown) {
            console.error("Error in fetchConfigurations:", error);
            toast.error(`Error: ${error instanceof Error ? error.message : t("agentConfigurations.failedToLoadConfigurations")}`);
        }
    };

    const fetchCategories = async () => {
        const data = await api.get<AgentCategory[]>(`/api/agents/categories`);
        setCategories(data || []);
    };

    const fetchPermissions = async () => {
        const companiesList = await api.get<Company[]>(`/api/companies`);
        const allPerms: AgentPermission[] = [];
        for (const c of companiesList || []) {
            const perms = await api.get<AgentPermission[]>(`/api/companies/${c.id}/agent-permissions`);
            allPerms.push(...(perms || []).map((p) => ({ ...p, company: p.company ?? { id: c.id, name: c.name } })));
        }
        setPermissions(allPerms);
    };

    const fetchCompanies = async () => {
        const data = await api.get<Company[]>(`/api/companies`);
        setCompanies(data || []);
    };

    // --- Configuration Handlers ---

    const handleOpenConfigDialog = (config?: AgentConfiguration) => {
        try {
            if (config) {
                setEditingConfig(config);
                // Parse api_headers and api_params if they're strings
                let parsedHeaders = [];
                if (config.api_headers) {
                    if (typeof config.api_headers === 'string') {
                        try {
                            parsedHeaders = JSON.parse(config.api_headers);
                        } catch {
                            parsedHeaders = [];
                        }
                    } else if (Array.isArray(config.api_headers)) {
                        parsedHeaders = config.api_headers;
                    }
                }
                
                let parsedParams = [];
                if (config.api_params) {
                    if (typeof config.api_params === 'string') {
                        try {
                            parsedParams = JSON.parse(config.api_params);
                        } catch {
                            parsedParams = [];
                        }
                    } else if (Array.isArray(config.api_params)) {
                        parsedParams = config.api_params;
                    }
                }
                
                setConfigForm({
                    name: config.name || "",
                    description: config.description || "",
                    api_url: config.api_url || "",
                    api_method: config.api_method || "POST",
                    category_id: config.category_id || "none",
                    agent_type: (config.agent_type || "action") as "action" | "decision",
                    api_headers: parsedHeaders.length > 0 ? parsedHeaders : [{ key: "", value: "" }],
                    api_params: parsedParams.length > 0 ? parsedParams : [{ key: "", value: "" }],
                });
            } else {
                setEditingConfig(null);
                setConfigForm({
                    name: "",
                    description: "",
                    api_url: "",
                    api_method: "POST",
                    category_id: "none",
                    agent_type: "action",
                    api_headers: [{ key: "", value: "" }],
                    api_params: [{ key: "", value: "" }],
                });
            }
            setConfigDialogOpen(true);
        } catch (error) {
            console.error("Error opening config dialog:", error);
            toast.error(t("agentConfigurations.failedToOpenDialog"));
        }
    };

    const handleSaveConfig = async () => {
        try {
            const payload = {
                name: configForm.name,
                description: configForm.description || null,
                api_url: configForm.api_url,
                api_method: configForm.api_method,
                category_id: (configForm.category_id && configForm.category_id !== "none") ? configForm.category_id : null,
                agent_type: configForm.agent_type,
                api_headers: configForm.api_headers.filter(h => h.key && h.value),
                api_params: configForm.api_params.filter(p => p.key && p.value),
            };

            if (editingConfig) {
                await api.patch(`/api/agents/configurations/${editingConfig.id}`, payload);
                toast.success(t("agentConfigurations.configurationUpdated"));
            } else {
                await api.post(`/api/agents/configurations`, payload);
                toast.success(t("agentConfigurations.configurationCreated"));
            }
            setConfigDialogOpen(false);
            fetchConfigurations();
        } catch (error: any) {
            toast.error(`Error: ${error.message}`);
        }
    };

    const handleDeleteConfig = async (id: string) => {
        if (!confirm(t("agentConfigurations.deleteConfirm"))) return;
        try {
            await api.delete(`/api/agents/configurations/${id}`);
            toast.success(t("agentConfigurations.configurationDeleted"));
            fetchConfigurations();
        } catch (error: unknown) {
            toast.error(`Error: ${error instanceof Error ? error.message : t("agentConfigurations.failedToDelete")}`);
        }
    };

    // --- Category Handlers ---

    const handleOpenCategoryDialog = (category?: AgentCategory) => {
        if (category) {
            setEditingCategory(category);
            setCategoryForm({
                name: category.name,
                description: category.description || "",
                icon: category.icon || "",
            });
        } else {
            setEditingCategory(null);
            setCategoryForm({
                name: "",
                description: "",
                icon: "",
            });
        }
        setCategoryDialogOpen(true);
    };

    const handleSaveCategory = async () => {
        try {
            const payload = {
                name: categoryForm.name,
                description: categoryForm.description || null,
                icon: categoryForm.icon || null,
            };

            if (editingCategory) {
                await api.patch(`/api/agents/categories/${editingCategory.id}`, payload);
                toast.success(t("agentConfigurations.categoryUpdated"));
            } else {
                await api.post(`/api/agents/categories`, payload);
                toast.success(t("agentConfigurations.categoryCreated"));
            }
            setCategoryDialogOpen(false);
            fetchCategories();
        } catch (error: any) {
            toast.error(`Error: ${error.message}`);
        }
    };

    const handleDeleteCategory = async (id: string) => {
        if (!confirm(t("agentConfigurations.deleteConfirm"))) return;
        try {
            await api.delete(`/api/agents/categories/${id}`);
            toast.success(t("agentConfigurations.categoryDeleted"));
            fetchCategories();
        } catch (error: unknown) {
            toast.error(`Error: ${error instanceof Error ? error.message : t("agentConfigurations.failedToDelete")}`);
        }
    };

    // --- Permission Handlers ---

    const handleOpenPermissionDialog = (permission?: AgentPermission) => {
        if (permission) {
            setEditingPermission(permission);
            setPermissionForm({
                agent_configuration_id: permission.agent_configuration_id,
                company_id: permission.company_id,
                enabled: permission.enabled,
            });
        } else {
            setEditingPermission(null);
            setPermissionForm({
                agent_configuration_id: "",
                company_id: "",
                enabled: true,
            });
        }
        setPermissionDialogOpen(true);
    };

    const handleSavePermission = async () => {
        try {
            const payload = {
                agent_configuration_id: permissionForm.agent_configuration_id,
                company_id: permissionForm.company_id,
                enabled: permissionForm.enabled,
            };

            if (editingPermission) {
                await api.patch(
                    `/api/companies/${editingPermission.company_id}/agent-permissions/${editingPermission.id}`,
                    { enabled: permissionForm.enabled }
                );
                toast.success(t("agentConfigurations.permissionUpdated"));
            } else {
                await api.post(`/api/companies/${permissionForm.company_id}/agent-permissions`, payload);
                toast.success(t("agentConfigurations.permissionCreated"));
            }
            setPermissionDialogOpen(false);
            fetchPermissions();
        } catch (error: any) {
            toast.error(`Error: ${error.message}`);
        }
    };

    const handleDeletePermission = async (perm: AgentPermission) => {
        if (!confirm(t("agentConfigurations.deleteConfirm"))) return;
        try {
            await api.delete(`/api/companies/${perm.company_id}/agent-permissions/${perm.id}`);
            toast.success(t("agentConfigurations.permissionDeleted"));
            fetchPermissions();
        } catch (error: unknown) {
            toast.error(`Error: ${error instanceof Error ? error.message : t("agentConfigurations.failedToDelete")}`);
        }
    };

    const handleTogglePermission = async (agentId: string, companyId: string, currentEnabled: boolean) => {
        try {
            const existingPermission = permissions.find(
                (p) => p.agent_configuration_id === agentId && p.company_id === companyId
            );

            if (existingPermission) {
                await api.patch(
                    `/api/companies/${companyId}/agent-permissions/${existingPermission.id}`,
                    { enabled: !currentEnabled }
                );
            } else {
                await api.post(`/api/companies/${companyId}/agent-permissions`, {
                    agent_configuration_id: agentId,
                    enabled: !currentEnabled,
                });
            }
            toast.success(t(!currentEnabled ? "agentConfigurations.permissionEnabledDisabled" : "agentConfigurations.permissionDisabled"));
            fetchPermissions();
        } catch (error: unknown) {
            toast.error(`Error: ${error instanceof Error ? error.message : t("agentConfigurations.failedToUpdate")}`);
        }
    };

    const getPermissionStatus = (agentId: string, companyId: string): boolean => {
        const permission = permissions.find(
            p => p.agent_configuration_id === agentId && p.company_id === companyId
        );
        return permission?.enabled ?? false;
    };

    const filteredCompanies = selectedCompanyIds.length > 0
        ? companies.filter(c => selectedCompanyIds.includes(c.id))
        : companies;


    if (loading) {
        return <div className="p-8 text-center">Loading agent configurations...</div>;
    }

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Agent Management</h1>
                    <p className="text-muted-foreground mt-1">
                        Manage global agent configurations, categories, and company permissions.
                    </p>
                </div>
                <Button variant="outline" onClick={() => navigate(-1)}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back
                </Button>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                <TabsList>
                    <TabsTrigger value="configurations" className="flex items-center gap-2">
                        <Settings className="h-4 w-4" />
                        Configurations
                    </TabsTrigger>
                    <TabsTrigger value="categories" className="flex items-center gap-2">
                        <Grid className="h-4 w-4" />
                        Categories
                    </TabsTrigger>
                    <TabsTrigger value="permissions" className="flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        Permissions
                    </TabsTrigger>
                    <TabsTrigger value="usage" className="flex items-center gap-2">
                        <BarChart2 className="h-4 w-4" />
                        Usage
                    </TabsTrigger>
                </TabsList>

                {/* CONFIGURATIONS TAB */}
                <TabsContent value="configurations" className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Label>Filter by type:</Label>
                            <Select value={agentTypeFilter} onValueChange={(value) => setAgentTypeFilter(value as "all" | "action" | "decision")}>
                                <SelectTrigger className="w-[150px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Types</SelectItem>
                                    <SelectItem value="action">Action</SelectItem>
                                    <SelectItem value="decision">Decision</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <Button onClick={() => handleOpenConfigDialog()}>
                            <Plus className="h-4 w-4 mr-2" />
                            New Configuration
                        </Button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {configurations
                            .filter(config => agentTypeFilter === "all" || (config.agent_type || "action") === agentTypeFilter)
                            .map((config) => (
                            <Card key={config.id}>
                                <CardHeader>
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <CardTitle className="text-lg">{config.name}</CardTitle>
                                            <CardDescription className="mt-1">{config.description || "No description"}</CardDescription>
                                        </div>
                                        <div className="flex flex-col gap-1 items-end">
                                            <Badge variant={(config.agent_type || "action") === "action" ? "default" : "secondary"}>
                                                {(config.agent_type || "action") === "action" ? "Action" : "Decision"}
                                            </Badge>
                                            {config.category && (
                                                <Badge variant="outline">{config.category.name}</Badge>
                                            )}
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span className="font-medium">Method:</span>
                                            <span>{config.api_method}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="font-medium">URL:</span>
                                            <span className="truncate max-w-[200px]" title={config.api_url}>{config.api_url}</span>
                                        </div>
                                    </div>
                                    <div className="flex justify-end gap-2 mt-4">
                                        <Button variant="ghost" size="icon" onClick={() => handleOpenConfigDialog(config)}>
                                            <Edit className="h-4 w-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon" onClick={() => handleDeleteConfig(config.id)}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </TabsContent>

                {/* CATEGORIES TAB */}
                <TabsContent value="categories" className="space-y-4">
                    <div className="flex justify-end">
                        <Button onClick={() => handleOpenCategoryDialog()}>
                            <Plus className="h-4 w-4 mr-2" />
                            New Category
                        </Button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
                        {categories.map((category) => (
                            <Card key={category.id}>
                                <CardHeader>
                                    <CardTitle className="text-lg flex items-center gap-2">
                                        {category.icon && <span>{category.icon}</span>}
                                        {category.name}
                                    </CardTitle>
                                    <CardDescription>{category.description || "No description"}</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex justify-end gap-2">
                                        <Button variant="ghost" size="icon" onClick={() => handleOpenCategoryDialog(category)}>
                                            <Edit className="h-4 w-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon" onClick={() => handleDeleteCategory(category.id)}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </TabsContent>

                {/* PERMISSIONS TAB */}
                <TabsContent value="permissions" className="space-y-4">
                    <div className="flex items-center justify-between">
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" className="w-[200px] justify-between">
                                    {selectedCompanyIds.length > 0 
                                        ? `${selectedCompanyIds.length} Company${selectedCompanyIds.length > 1 ? 'ies' : ''} Selected`
                                        : 'Select Companies'}
                                    <ChevronDown className="h-4 w-4 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[200px] p-0">
                                <div className="p-2 space-y-2 max-h-[300px] overflow-y-auto">
                                    <div className="flex items-center space-x-2 p-2">
                                        <Checkbox
                                            id="select-all"
                                            checked={selectedCompanyIds.length === companies.length && companies.length > 0}
                                            onCheckedChange={(checked) => {
                                                if (checked) {
                                                    setSelectedCompanyIds(companies.map(c => c.id));
                                                } else {
                                                    setSelectedCompanyIds([]);
                                                }
                                            }}
                                        />
                                        <label
                                            htmlFor="select-all"
                                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                        >
                                            Select All
                                        </label>
                                    </div>
                                    {companies.map((company) => (
                                        <div key={company.id} className="flex items-center space-x-2 p-2">
                                            <Checkbox
                                                id={company.id}
                                                checked={selectedCompanyIds.includes(company.id)}
                                                onCheckedChange={(checked) => {
                                                    if (checked) {
                                                        setSelectedCompanyIds([...selectedCompanyIds, company.id]);
                                                    } else {
                                                        setSelectedCompanyIds(selectedCompanyIds.filter(id => id !== company.id));
                                                    }
                                                }}
                                            />
                                            <label
                                                htmlFor={company.id}
                                                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                            >
                                                {company.name}
                                            </label>
                                        </div>
                                    ))}
                                </div>
                            </PopoverContent>
                        </Popover>
                        <Button onClick={() => handleOpenPermissionDialog()}>
                            <Plus className="h-4 w-4 mr-2" />
                            Add Permission
                        </Button>
                    </div>

                    <div className="border rounded-md overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-muted/50 text-muted-foreground">
                                <tr>
                                    <th className="p-4 font-medium text-left sticky left-0 bg-muted/50 z-10 border-r">Agent</th>
                                    {filteredCompanies.map((company) => (
                                        <th key={company.id} className="p-4 font-medium text-center min-w-[120px]">
                                            {company.name}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {configurations.map((agent) => (
                                    <tr key={agent.id} className="border-t hover:bg-muted/30">
                                        <td className="p-4 font-medium sticky left-0 bg-background z-10 border-r">
                                            {agent.name}
                                        </td>
                                        {filteredCompanies.map((company) => {
                                            const isEnabled = getPermissionStatus(agent.id, company.id);
                                            return (
                                                <td key={company.id} className="p-4 text-center">
                                                    <div className="flex justify-center">
                                                        <Switch
                                                            checked={isEnabled}
                                                            onCheckedChange={() => handleTogglePermission(agent.id, company.id, isEnabled)}
                                                        />
                                                    </div>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                                {configurations.length === 0 && (
                                    <tr>
                                        <td colSpan={filteredCompanies.length + 1} className="p-8 text-center text-muted-foreground">
                                            No agents found.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </TabsContent>

                {/* USAGE TAB - super_admin only: read-only agent_usage table */}
                <TabsContent value="usage" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <BarChart2 className="h-5 w-5" />
                                Agent Usage
                            </CardTitle>
                            <CardDescription>
                                Read-only view of the agent_usage table. Visible to super admins only.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {!isSuperAdmin ? (
                                <p className="text-sm text-muted-foreground">
                                    This view is only available to super administrators.
                                </p>
                            ) : agentUsageLoading ? (
                                <p className="text-sm text-muted-foreground">Loading usage data…</p>
                            ) : (
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2">
                                        <div className="relative flex-1 max-w-sm">
                                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                            <Input
                                                placeholder="Filter by agent, company, model, execution ID…"
                                                value={usageSearch}
                                                onChange={(e) => setUsageSearch(e.target.value)}
                                                className="pl-8"
                                            />
                                        </div>
                                        {(usageSearch || usageSortField) && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => {
                                                    setUsageSearch("");
                                                    setUsageSortField(null);
                                                    setUsageSortDirection("asc");
                                                }}
                                            >
                                                Clear
                                            </Button>
                                        )}
                                    </div>
                                    <div className="border rounded-md overflow-x-auto">
                                        <table className="w-full text-sm">
                                            <thead className="bg-muted/50 text-muted-foreground">
                                                <tr>
                                                    {usageColumns.map(({ key, label, align }) => (
                                                        <th
                                                            key={key}
                                                            className={`p-3 font-medium cursor-pointer select-none hover:bg-muted/70 ${align === "right" ? "text-right" : "text-left"}`}
                                                            onClick={() => handleUsageSort(key)}
                                                        >
                                                            <span className="inline-flex items-center">
                                                                {label}
                                                                {getUsageSortIcon(key)}
                                                            </span>
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filteredAndSortedUsage.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={10} className="p-6 text-center text-muted-foreground">
                                                            {agentUsageList.length === 0
                                                                ? "No usage records."
                                                                : "No rows match the current filter."}
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    filteredAndSortedUsage.map((row) => (
                                                        <tr key={row.id} className="border-t hover:bg-muted/30">
                                                            <td className="p-3 whitespace-nowrap">
                                                                {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
                                                            </td>
                                                            <td className="p-3">{row.agent_name ?? row.agent_id ?? "—"}</td>
                                                            <td className="p-3">{row.company_name ?? row.company_id ?? "—"}</td>
                                                            <td className="p-3 font-mono text-xs truncate max-w-[120px]" title={row.workflow_execution_id ?? ""}>
                                                                {row.workflow_execution_id ?? "—"}
                                                            </td>
                                                            <td className="p-3">{row.model_name ?? "—"}</td>
                                                            <td className="p-3 text-right">{row.input_tokens ?? "—"}</td>
                                                            <td className="p-3 text-right">{row.thinking_tokens ?? "—"}</td>
                                                            <td className="p-3 text-right">{row.output_tokens ?? "—"}</td>
                                                            <td className="p-3 text-right">{row.total_cost ?? "—"}</td>
                                                            <td className="p-3 max-w-[200px] truncate" title={row.comment ?? ""}>
                                                                {row.comment ?? "—"}
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* CONFIG DIALOG */}
            <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editingConfig ? "Edit Configuration" : "New Configuration"}</DialogTitle>
                        <DialogDescription>Configure the agent API details.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label>Name</Label>
                                <Input
                                    value={configForm.name}
                                    onChange={(e) => setConfigForm({ ...configForm, name: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Agent Type</Label>
                                <Select
                                    value={configForm.agent_type || "action"}
                                    onValueChange={(val) => setConfigForm({ ...configForm, agent_type: val as "action" | "decision" })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select agent type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="action">Action</SelectItem>
                                        <SelectItem value="decision">Decision</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                                <Label>Category</Label>
                                <Select
                                    value={configForm.category_id || "none"}
                                    onValueChange={(val) => setConfigForm({ ...configForm, category_id: val === "none" ? "" : val })}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select category" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">No category</SelectItem>
                                        {categories.map(c => (
                                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Description</Label>
                            <Textarea
                                value={configForm.description}
                                onChange={(e) => setConfigForm({ ...configForm, description: e.target.value })}
                            />
                        </div>
                        <div className="grid gap-4 md:grid-cols-3">
                            <div className="md:col-span-2 space-y-2">
                                <Label>API URL</Label>
                                <Input
                                    value={configForm.api_url}
                                    onChange={(e) => setConfigForm({ ...configForm, api_url: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Method</Label>
                                <Select
                                    value={configForm.api_method}
                                    onValueChange={(val) => setConfigForm({ ...configForm, api_method: val })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => (
                                            <SelectItem key={m} value={m}>{m}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Headers */}
                        <div className="space-y-2">
                            <Label>Headers</Label>
                            {configForm.api_headers.map((header, idx) => (
                                <div key={idx} className="flex gap-2">
                                    <Input
                                        placeholder="Key"
                                        value={header.key}
                                        onChange={(e) => {
                                            const newHeaders = [...configForm.api_headers];
                                            newHeaders[idx].key = e.target.value;
                                            setConfigForm({ ...configForm, api_headers: newHeaders });
                                        }}
                                    />
                                    <Input
                                        placeholder="Value"
                                        value={header.value}
                                        onChange={(e) => {
                                            const newHeaders = [...configForm.api_headers];
                                            newHeaders[idx].value = e.target.value;
                                            setConfigForm({ ...configForm, api_headers: newHeaders });
                                        }}
                                    />
                                    <Button variant="ghost" size="icon" onClick={() => {
                                        const newHeaders = configForm.api_headers.filter((_, i) => i !== idx);
                                        setConfigForm({ ...configForm, api_headers: newHeaders });
                                    }}>
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            ))}
                            <Button variant="outline" size="sm" onClick={() => {
                                setConfigForm({ ...configForm, api_headers: [...configForm.api_headers, { key: "", value: "" }] });
                            }}>
                                <Plus className="h-4 w-4 mr-2" /> Add Header
                            </Button>
                        </div>

                        {/* Params */}
                        <div className="space-y-2">
                            <Label>Default Params</Label>
                            {configForm.api_params.map((param, idx) => (
                                <div key={idx} className="flex gap-2">
                                    <Input
                                        placeholder="Key"
                                        value={param.key}
                                        onChange={(e) => {
                                            const newParams = [...configForm.api_params];
                                            newParams[idx].key = e.target.value;
                                            setConfigForm({ ...configForm, api_params: newParams });
                                        }}
                                    />
                                    <Input
                                        placeholder="Value"
                                        value={param.value}
                                        onChange={(e) => {
                                            const newParams = [...configForm.api_params];
                                            newParams[idx].value = e.target.value;
                                            setConfigForm({ ...configForm, api_params: newParams });
                                        }}
                                    />
                                    <Button variant="ghost" size="icon" onClick={() => {
                                        const newParams = configForm.api_params.filter((_, i) => i !== idx);
                                        setConfigForm({ ...configForm, api_params: newParams });
                                    }}>
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            ))}
                            <Button variant="outline" size="sm" onClick={() => {
                                setConfigForm({ ...configForm, api_params: [...configForm.api_params, { key: "", value: "" }] });
                            }}>
                                <Plus className="h-4 w-4 mr-2" /> Add Param
                            </Button>
                        </div>

                        <div className="flex justify-end gap-2 pt-4">
                            <Button variant="outline" onClick={() => setConfigDialogOpen(false)}>Cancel</Button>
                            <Button onClick={handleSaveConfig}>Save</Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* CATEGORY DIALOG */}
            <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingCategory ? "Edit Category" : "New Category"}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                        <div className="space-y-2">
                            <Label>Name</Label>
                            <Input
                                value={categoryForm.name}
                                onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Description</Label>
                            <Textarea
                                value={categoryForm.description}
                                onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Icon (Emoji or text)</Label>
                            <Input
                                value={categoryForm.icon}
                                onChange={(e) => setCategoryForm({ ...categoryForm, icon: e.target.value })}
                            />
                        </div>
                        <div className="flex justify-end gap-2 pt-4">
                            <Button variant="outline" onClick={() => setCategoryDialogOpen(false)}>Cancel</Button>
                            <Button onClick={handleSaveCategory}>Save</Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* PERMISSION DIALOG */}
            <Dialog open={permissionDialogOpen} onOpenChange={setPermissionDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingPermission ? "Edit Permission" : "New Permission"}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                        {!editingPermission && (
                            <>
                                <div className="space-y-2">
                                    <Label>Company</Label>
                                    <Select
                                        value={permissionForm.company_id}
                                        onValueChange={(val) => setPermissionForm({ ...permissionForm, company_id: val })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select company" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {companies.map(c => (
                                                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Agent Configuration</Label>
                                    <Select
                                        value={permissionForm.agent_configuration_id}
                                        onValueChange={(val) => setPermissionForm({ ...permissionForm, agent_configuration_id: val })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select agent" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {configurations.map(c => (
                                                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </>
                        )}
                        <div className="flex items-center gap-2 pt-2">
                            <Switch
                                checked={permissionForm.enabled}
                                onCheckedChange={(checked) => setPermissionForm({ ...permissionForm, enabled: checked })}
                            />
                            <Label>Enabled</Label>
                        </div>
                        <div className="flex justify-end gap-2 pt-4">
                            <Button variant="outline" onClick={() => setPermissionDialogOpen(false)}>Cancel</Button>
                            <Button onClick={handleSavePermission}>Save</Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
