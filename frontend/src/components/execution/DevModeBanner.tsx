import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, Wrench, Send, Loader2, Edit2, Check, X, Copy, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";

interface WebhookConfig {
    url: string;
    method: string;
    headers?: Record<string, string>;
    data?: any;
}

interface DevModeBannerProps {
    executionId: string;
    executionStepId: string;
    stepConfig: any;
    stepType: string;
    actionType?: string;
    decisionNodeType?: string;
    workflowStepId: string;
}

export const DevModeBanner = ({
    executionId,
    executionStepId,
    stepConfig: rawStepConfig,
    stepType,
    actionType,
    decisionNodeType,
    workflowStepId,
}: DevModeBannerProps) => {
    const { toast } = useToast();
    const [isOpen, setIsOpen] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [editedUrl, setEditedUrl] = useState("");
    const [isResending, setIsResending] = useState(false);
    const [lastResult, setLastResult] = useState<{ success: boolean; message: string } | null>(null);
    const [webhookPayload, setWebhookPayload] = useState<any>(null);
    const [webhookHeaders, setWebhookHeaders] = useState<Record<string, string>>({});
    const [isPayloadOpen, setIsPayloadOpen] = useState(false);
    const [agentConfig, setAgentConfig] = useState<any>(null);
    const [isLoadingAgentConfig, setIsLoadingAgentConfig] = useState(false);

    // Parse stepConfig if it's a string
    const stepConfig = typeof rawStepConfig === 'string' 
        ? (() => {
            try {
                return JSON.parse(rawStepConfig);
            } catch {
                return rawStepConfig;
            }
        })()
        : (rawStepConfig || {});

    // Check if this step type should show dev mode
    const isAutomaticAction = stepType === 'action' && actionType === 'automatic';
    const isAgentAction = stepType === 'action' && actionType === 'agent';
    const isAgentDecision = stepType === 'decision' && decisionNodeType === 'Agent';
    const isAgentPlusHumanDecision = stepType === 'decision' && decisionNodeType === 'Agent + Human';
    const showDevMode = isAutomaticAction || isAgentAction || isAgentDecision || isAgentPlusHumanDecision;

    if (!showDevMode) {
        return null;
    }

    useEffect(() => {
        const fetchAgentConfig = async () => {
            if (!stepConfig?.agent_id) {
                setAgentConfig(null);
                return;
            }
            setIsLoadingAgentConfig(true);
            try {
                const list = await api.get<Array<Record<string, unknown>>>(`/api/agents/configurations`);
                const found = (list ?? []).find((c) => c.id === stepConfig.agent_id);
                setAgentConfig(found ?? null);
            } catch {
                setAgentConfig(null);
            } finally {
                setIsLoadingAgentConfig(false);
            }
        };

        fetchAgentConfig();
    }, [stepConfig?.agent_id]);

    // Get webhook URL from agent config if available, otherwise from step config
    const effectiveConfig = agentConfig || stepConfig;
    const webhookUrl = effectiveConfig?.api_url || "";
    const webhookMethod = effectiveConfig?.api_method || "POST";
    const currentUrl = isEditing ? editedUrl : webhookUrl;

    useEffect(() => {
        const computePayload = async () => {
            try {
                const execution = await api.get<{
                    execution_data_records?: Array<{ values?: Record<string, { value?: unknown }> }>;
                }>(`/api/workflows/executions/${executionId}`);

                const executionDataMap: Record<string, unknown> = {};
                const records = execution?.execution_data_records ?? [];
                records.forEach((row) => {
                    const values = row.values ?? {};
                    Object.entries(values).forEach(([fieldId, fieldData]) => {
                        executionDataMap[fieldId] = fieldData?.value ?? fieldData;
                    });
                });

                // Resolve data bindings - handle both array and JSON string formats
                // For agent steps: agent config provides api_url/method/headers, step config provides api_data
                // For non-agent steps: step config provides everything
                // Always use step config for api_data (matches edge function behavior)
                const configToUseForData = stepConfig;
                let apiData = configToUseForData?.api_data || [];
                if (typeof apiData === 'string') {
                    try {
                        apiData = JSON.parse(apiData);
                    } catch {
                        apiData = [];
                    }
                }
                if (!Array.isArray(apiData)) {
                    apiData = [];
                }

                const resolvedData: Record<string, any> = {};
                apiData.forEach((item: any) => {
                    if (item.key) {
                        let resolvedValue = item.value || '';
                        if (typeof resolvedValue === 'string' && resolvedValue.startsWith('{{') && resolvedValue.endsWith('}}')) {
                            const fieldId = resolvedValue.slice(2, -2).trim();
                            resolvedValue = executionDataMap[fieldId] ?? '';
                        }
                        resolvedData[item.key] = resolvedValue;
                    }
                });

                // Build request body
                let requestBody: any = {
                    execution_id: executionId,
                    execution_step_id: executionStepId,
                    ...resolvedData
                };

                // For decision steps, include condition and outputs
                const isAgentDecision = stepType === 'decision' && (decisionNodeType === 'Agent' || decisionNodeType === 'Agent + Human');
                if (isAgentDecision) {
                    // Ensure condition and outputs are properly formatted
                    const condition = stepConfig?.condition || '';
                    const outputs = Array.isArray(stepConfig?.outputs) 
                        ? stepConfig.outputs 
                        : (stepConfig?.outputs ? [stepConfig.outputs] : []);
                    
                    requestBody.condition = condition;
                    requestBody.outputs = outputs;
                    
                    console.log('DevModeBanner - Decision step payload computed:', {
                        condition,
                        outputs,
                        stepConfig_condition: stepConfig?.condition,
                        stepConfig_outputs: stepConfig?.outputs,
                        outputsType: typeof stepConfig?.outputs,
                        isArray: Array.isArray(stepConfig?.outputs)
                    });
                }

                setWebhookPayload(requestBody);

                // Build headers - handle both array and JSON string formats
                // Use agent config if available, otherwise use step config
                const configToUseForHeaders = agentConfig || stepConfig;
                let apiHeaders = configToUseForHeaders?.api_headers || [];
                if (typeof apiHeaders === 'string') {
                    try {
                        apiHeaders = JSON.parse(apiHeaders);
                    } catch {
                        apiHeaders = [];
                    }
                }
                if (!Array.isArray(apiHeaders)) {
                    apiHeaders = [];
                }

                const headersObj: Record<string, string> = {
                    'Content-Type': 'application/json'
                };
                apiHeaders.forEach((header: any) => {
                    if (header.key && header.value) {
                        headersObj[header.key] = header.value;
                    }
                });

                setWebhookHeaders(headersObj);
            } catch (error) {
                console.error("Error computing webhook payload:", error);
            }
        };

        computePayload();
    }, [executionId, executionStepId, stepConfig, agentConfig]);

    const handleStartEdit = () => {
        setEditedUrl(webhookUrl);
        setIsEditing(true);
    };

    const handleCancelEdit = () => {
        setIsEditing(false);
        setEditedUrl("");
    };

    const handleSaveEdit = () => {
        setIsEditing(false);
    };

    const handleCopyUrl = async () => {
        try {
            await navigator.clipboard.writeText(currentUrl);
            toast({
                title: "Copied",
                description: "URL copied to clipboard",
            });
        } catch {
            toast({
                title: "Failed to copy",
                description: "Could not copy URL to clipboard",
                variant: "destructive",
            });
        }
    };

    const handleResendWebhook = async () => {
        const urlToUse = isEditing ? editedUrl : webhookUrl;

        if (!urlToUse) {
            toast({
                title: "No URL configured",
                description: "This step does not have a webhook URL configured",
                variant: "destructive",
            });
            return;
        }

        setIsResending(true);
        setLastResult(null);

        try {
            if (isEditing && editedUrl !== webhookUrl) {
                const execution = await api.get<{
                    execution_data_records?: Array<{ values?: Record<string, { value?: unknown }> }>;
                }>(`/api/workflows/executions/${executionId}`);

                const executionDataMap: Record<string, unknown> = {};
                (execution?.execution_data_records ?? []).forEach((row) => {
                    const values = row.values ?? {};
                    Object.entries(values).forEach(([fieldId, fieldData]) => {
                        executionDataMap[fieldId] = fieldData?.value ?? fieldData;
                    });
                });

                // Resolve data bindings - handle both array and JSON string formats
                // For agent steps: agent config provides api_url/method/headers, step config provides api_data
                // For non-agent steps: step config provides everything
                const configToUseForData = stepConfig; // Always use step config for api_data
                let apiData = configToUseForData?.api_data || [];
                if (typeof apiData === 'string') {
                    try {
                        apiData = JSON.parse(apiData);
                    } catch {
                        apiData = [];
                    }
                }
                if (!Array.isArray(apiData)) {
                    apiData = [];
                }

                const resolvedData: Record<string, any> = {};
                apiData.forEach((item: any) => {
                    if (item.key) {
                        let resolvedValue = item.value || '';
                        if (typeof resolvedValue === 'string' && resolvedValue.startsWith('{{') && resolvedValue.endsWith('}}')) {
                            const fieldId = resolvedValue.slice(2, -2).trim();
                            resolvedValue = executionDataMap[fieldId] ?? '';
                        }
                        resolvedData[item.key] = resolvedValue;
                    }
                });

                // Build headers - handle both array and JSON string formats
                // For agent steps: use agent config for headers, otherwise use step config
                const configToUseForHeaders = agentConfig || stepConfig;
                let apiHeaders = configToUseForHeaders?.api_headers || [];
                if (typeof apiHeaders === 'string') {
                    try {
                        apiHeaders = JSON.parse(apiHeaders);
                    } catch {
                        apiHeaders = [];
                    }
                }
                if (!Array.isArray(apiHeaders)) {
                    apiHeaders = [];
                }

                const headersObj: Record<string, string> = {
                    'Content-Type': 'application/json'
                };
                apiHeaders.forEach((header: any) => {
                    if (header.key && header.value) {
                        headersObj[header.key] = header.value;
                    }
                });

                // Build request body
                let requestBody: any = {
                    execution_id: executionId,
                    execution_step_id: executionStepId,
                    ...resolvedData
                };

                // For decision steps, include condition and outputs
                const isAgentDecision = stepType === 'decision' && (decisionNodeType === 'Agent' || decisionNodeType === 'Agent + Human');
                if (isAgentDecision) {
                    // Ensure condition and outputs are properly formatted
                    const condition = stepConfig?.condition || '';
                    const outputs = Array.isArray(stepConfig?.outputs) 
                        ? stepConfig.outputs 
                        : (stepConfig?.outputs ? [stepConfig.outputs] : []);
                    
                    requestBody.condition = condition;
                    requestBody.outputs = outputs;
                    
                    console.log('Decision step - adding condition and outputs:', {
                        condition,
                        outputs,
                        hasCondition: !!condition,
                        outputsCount: outputs.length
                    });
                }

                const response = await fetch(editedUrl, {
                    method: webhookMethod,
                    headers: headersObj,
                    body: JSON.stringify(requestBody),
                });

                const responseText = await response.text();
                if (response.ok) {
                    setLastResult({ success: true, message: "Webhook sent successfully" });
                    toast({ title: "Webhook Sent", description: "The webhook was successfully resent to the custom URL" });
                } else {
                    setLastResult({ success: false, message: `Failed with status ${response.status}` });
                    toast({
                        title: "Webhook Failed",
                        description: `Request failed with status ${response.status}`,
                        variant: "destructive",
                    });
                }
            } else {
                const result = await api.post<{ success?: boolean; message?: string; error?: string }>(
                    `/api/workflows/executions/${executionId}/steps/${executionStepId}/process`,
                    {}
                );

                if (result?.success !== false) {
                    setLastResult({ success: true, message: result?.message ?? "Webhook resent successfully" });
                    toast({ title: "Webhook Resent", description: result?.message ?? "The webhook was successfully resent" });
                } else {
                    const errorMessage = result?.error ?? "Unknown error";
                    setLastResult({ success: false, message: errorMessage });
                    toast({ title: "Webhook Failed", description: errorMessage, variant: "destructive" });
                }
            }
        } catch (error: unknown) {
            console.error("Error resending webhook:", error);
            setLastResult({ success: false, message: error instanceof Error ? error.message : "Failed to resend webhook" });
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to resend webhook",
                variant: "destructive",
            });
        } finally {
            setIsResending(false);
        }
    };

    return (
        <div className="w-full bg-amber-100 dark:bg-amber-900/30 border-b-2 border-amber-400 dark:border-amber-600">
            <Collapsible open={isOpen} onOpenChange={setIsOpen}>
                <div className="px-4 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Wrench className="h-4 w-4 text-amber-700 dark:text-amber-400" />
                        <span className="font-semibold text-amber-800 dark:text-amber-300">DEV MODE</span>
                        <Badge variant="outline" className="text-amber-700 dark:text-amber-400 border-amber-500">
                            {isAgentAction ? "Agent Action" : isAgentDecision ? "Agent Decision" : isAgentPlusHumanDecision ? "Agent + Human Decision" : "Automatic Action"}
                        </Badge>
                    </div>
                    <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-800">
                            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                    </CollapsibleTrigger>
                </div>

                <CollapsibleContent>
                    <div className="px-4 pb-4 space-y-3">
                        <Card className="bg-white/50 dark:bg-gray-900/50">
                            <CardHeader className="py-3">
                                <CardTitle className="text-sm font-medium flex items-center gap-2">
                                    Webhook Configuration
                                    <Badge variant="secondary">{webhookMethod}</Badge>
                                    {agentConfig && (
                                        <Badge variant="outline" className="text-xs">
                                            Using Agent: {agentConfig.name || stepConfig?.agent_id}
                                        </Badge>
                                    )}
                                    {isLoadingAgentConfig && (
                                        <Badge variant="outline" className="text-xs">
                                            <Loader2 className="h-3 w-3 mr-1 animate-spin inline" />
                                            Loading agent config...
                                        </Badge>
                                    )}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="py-2 space-y-3">
                                <div className="space-y-2">
                                    <Label className="text-xs text-muted-foreground">Webhook URL</Label>
                                    <div className="flex items-center gap-2">
                                        {isEditing ? (
                                            <>
                                                <Input
                                                    value={editedUrl}
                                                    onChange={(e) => setEditedUrl(e.target.value)}
                                                    placeholder="Enter webhook URL"
                                                    className="flex-1 font-mono text-sm"
                                                />
                                                <Button variant="ghost" size="icon" onClick={handleSaveEdit}>
                                                    <Check className="h-4 w-4 text-green-600" />
                                                </Button>
                                                <Button variant="ghost" size="icon" onClick={handleCancelEdit}>
                                                    <X className="h-4 w-4 text-red-600" />
                                                </Button>
                                            </>
                                        ) : (
                                            <>
                                                <code className="flex-1 px-2 py-1 bg-muted rounded text-sm font-mono truncate">
                                                    {webhookUrl || "(No URL configured)"}
                                                </code>
                                                <Button variant="ghost" size="icon" onClick={handleStartEdit} disabled={!webhookUrl}>
                                                    <Edit2 className="h-4 w-4" />
                                                </Button>
                                                <Button variant="ghost" size="icon" onClick={handleCopyUrl} disabled={!webhookUrl}>
                                                    <Copy className="h-4 w-4" />
                                                </Button>
                                                {webhookUrl && (
                                                    <Button variant="ghost" size="icon" asChild>
                                                        <a href={webhookUrl} target="_blank" rel="noopener noreferrer">
                                                            <ExternalLink className="h-4 w-4" />
                                                        </a>
                                                    </Button>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Webhook Payload Display */}
                                {webhookPayload && (
                                    <Collapsible open={isPayloadOpen} onOpenChange={setIsPayloadOpen}>
                                        <div className="space-y-2">
                                            <CollapsibleTrigger asChild>
                                                <Button variant="ghost" className="w-full flex justify-between items-center p-2 h-auto">
                                                    <Label className="text-xs text-muted-foreground cursor-pointer">Webhook Payload (JSON)</Label>
                                                    {isPayloadOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                                </Button>
                                            </CollapsibleTrigger>
                                            <CollapsibleContent>
                                                <div className="space-y-2">
                                                    {/* Headers Section */}
                                                    <div>
                                                        <Label className="text-xs text-muted-foreground mb-1 block">Headers</Label>
                                                        <div className="relative">
                                                            <pre className="bg-muted p-3 rounded text-xs font-mono overflow-x-auto max-h-32 overflow-y-auto">
                                                                {JSON.stringify(webhookHeaders, null, 2)}
                                                            </pre>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="absolute top-1 right-1 h-6 w-6"
                                                                onClick={async () => {
                                                                    try {
                                                                        await navigator.clipboard.writeText(JSON.stringify(webhookHeaders, null, 2));
                                                                        toast({
                                                                            title: "Copied",
                                                                            description: "Headers copied to clipboard",
                                                                        });
                                                                    } catch {
                                                                        toast({
                                                                            title: "Failed to copy",
                                                                            variant: "destructive",
                                                                        });
                                                                    }
                                                                }}
                                                            >
                                                                <Copy className="h-3 w-3" />
                                                            </Button>
                                                        </div>
                                                    </div>

                                                    {/* Body Section */}
                                                    <div>
                                                        <Label className="text-xs text-muted-foreground mb-1 block">Request Body</Label>
                                                        <div className="relative">
                                                            <pre className="bg-muted p-3 rounded text-xs font-mono overflow-x-auto max-h-64 overflow-y-auto">
                                                                {JSON.stringify(webhookPayload, null, 2)}
                                                            </pre>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="absolute top-1 right-1 h-6 w-6"
                                                                onClick={async () => {
                                                                    try {
                                                                        await navigator.clipboard.writeText(JSON.stringify(webhookPayload, null, 2));
                                                                        toast({
                                                                            title: "Copied",
                                                                            description: "Payload copied to clipboard",
                                                                        });
                                                                    } catch {
                                                                        toast({
                                                                            title: "Failed to copy",
                                                                            variant: "destructive",
                                                                        });
                                                                    }
                                                                }}
                                                            >
                                                                <Copy className="h-3 w-3" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </CollapsibleContent>
                                        </div>
                                    </Collapsible>
                                )}

                                {lastResult && (
                                    <div className={`text-sm px-3 py-2 rounded ${lastResult.success ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300' : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'}`}>
                                        {lastResult.message}
                                    </div>
                                )}

                                <div className="flex items-center gap-2 pt-2">
                                    <Button
                                        onClick={handleResendWebhook}
                                        disabled={isResending || (!webhookUrl && !editedUrl)}
                                        className="bg-amber-600 hover:bg-amber-700 text-white"
                                    >
                                        {isResending ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Sending...
                                            </>
                                        ) : (
                                            <>
                                                <Send className="mr-2 h-4 w-4" />
                                                Resend Webhook
                                            </>
                                        )}
                                    </Button>
                                    {isEditing && editedUrl !== webhookUrl && (
                                        <span className="text-xs text-amber-700 dark:text-amber-400">
                                            Using custom URL
                                        </span>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </CollapsibleContent>
            </Collapsible>
        </div>
    );
};
