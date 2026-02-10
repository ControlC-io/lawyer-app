import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useCompanyId } from "@/hooks/useCompanyId";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Download, Settings2, ArrowUpDown, ArrowUp, ArrowDown, X, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

interface Workflow {
  id: string;
  name: string;
  data_structure: any[] | null;
  category_id: string | null;
}

interface WorkflowCategory {
  id: string;
  name: string;
  parent_category_id: string | null;
}

interface Execution {
  id: string;
  name: string | null;
  status: string;
  created_at: string;
  completed_at: string | null;
  created_by: string | null;
}

interface ExecutionData {
  id: string;
  execution_id: string;
  values: Record<string, any>;
}

type SortConfig = {
  field: string | null;
  direction: "asc" | "desc";
};

type FilterConfig = {
  field: string;
  value: string;
};

const ExecutionDataPage = () => {
  const navigate = useNavigate();
  const companyId = useCompanyId();
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());
  const [sortConfig, setSortConfig] = useState<SortConfig>({ field: null, direction: "asc" });
  const [filters, setFilters] = useState<FilterConfig[]>([]);
  const [fieldFilterOpen, setFieldFilterOpen] = useState(false);
  const [currentFilterField, setCurrentFilterField] = useState<string>("");
  const [currentFilterValue, setCurrentFilterValue] = useState<string>("");
  const [dateFormat, setDateFormat] = useState<string>("dd/MM/yyyy HH:mm");

  const { data: categories, isLoading: isLoadingCategories } = useQuery({
    queryKey: ["workflow_categories", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      return api.get<WorkflowCategory[]>(`/api/companies/${companyId}/workflow-categories`);
    },
    enabled: !!companyId,
  });

  const { data: workflows, isLoading: isLoadingWorkflows } = useQuery({
    queryKey: ["workflows", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      return api.get<Workflow[]>(`/api/companies/${companyId}/workflows`);
    },
    enabled: !!companyId,
  });

  // Fetch selected workflow details
  const selectedWorkflow = useMemo(() => {
    return workflows?.find((w) => w.id === selectedWorkflowId) || null;
  }, [workflows, selectedWorkflowId]);

  // Get available fields from workflow data structure + metadata fields
  const availableFields = useMemo(() => {
    const fields: Array<{ id: string; name: string; field_type: string; isMetadata: boolean }> = [];
    
    // Add metadata fields first
    fields.push(
      { id: "_execution_name", name: "Execution Name", field_type: "text", isMetadata: true },
      { id: "_created_at", name: "Created At", field_type: "date", isMetadata: true },
      { id: "_completed_at", name: "Completed At", field_type: "date", isMetadata: true }
    );
    
    // Add workflow data structure fields
    if (selectedWorkflow?.data_structure) {
      const dataStructure = Array.isArray(selectedWorkflow.data_structure)
        ? selectedWorkflow.data_structure
        : [];
      
      dataStructure.forEach((item: any) => {
        if (item.id && item.name) {
          fields.push({
            id: item.id,
            name: item.name,
            field_type: item.field_type || "text",
            isMetadata: false,
          });
        }
      });
    }
    
    return fields;
  }, [selectedWorkflow]);

  // Auto-select all fields when workflow changes (only on initial load)
  const [hasInitializedFields, setHasInitializedFields] = useState(false);
  useMemo(() => {
    if (availableFields.length > 0 && selectedFields.size === 0 && !hasInitializedFields) {
      setSelectedFields(new Set(availableFields.map((f) => f.id)));
      setHasInitializedFields(true);
    }
  }, [availableFields, selectedFields.size, hasInitializedFields]);

  const { data: executionsWithData, isLoading: isLoadingExecutions } = useQuery({
    queryKey: ["completed_executions", selectedWorkflowId, companyId],
    queryFn: async () => {
      if (!selectedWorkflowId || !companyId) return [];
      const list = await api.get<any[]>(
        `/api/companies/${companyId}/executions?workflowId=${selectedWorkflowId}&status=completed&includeData=true`
      );
      return list || [];
    },
    enabled: !!selectedWorkflowId && !!companyId,
  });

  const executions = useMemo(
    () =>
      (executionsWithData || []).map((e) => ({
        id: e.id,
        name: e.name,
        status: e.status,
        created_at: e.created_at,
        completed_at: e.completed_at,
        created_by: e.created_by,
      })),
    [executionsWithData]
  );

  const executionDataMap = useMemo(() => {
    const map = new Map<string, ExecutionData>();
    (executionsWithData || []).forEach((e: any) => {
      const rec = e.execution_data_records?.[0];
      if (rec) map.set(e.id, { id: rec.id, execution_id: e.id, values: rec.values || {} });
    });
    return map;
  }, [executionsWithData]);
  const isLoadingData = false;

  // Process and filter data
  const processedData = useMemo(() => {
    if (!executions || !executionDataMap || !selectedWorkflow) return [];

    let data = executions.map((execution) => {
      const execData = executionDataMap.get(execution.id);
      const values = execData?.values || {};

      // Build row data with execution metadata and field values
      const row: Record<string, any> = {
        _execution_id: execution.id,
        _execution_name: execution.name || `Execution ${execution.id.slice(0, 8)}`,
        _created_at: execution.created_at,
        _completed_at: execution.completed_at,
        _created_by: execution.created_by,
      };

      // Add field values (skip metadata fields as they're already set above)
      availableFields.forEach((field) => {
        // Skip metadata fields - they're already set in the row object above
        if (field.isMetadata) return;
        
        const fieldValue = values[field.id];
        if (fieldValue) {
          // Handle different value structures
          if (typeof fieldValue === "object" && fieldValue !== null && "value" in fieldValue) {
            row[field.id] = fieldValue.value;
          } else {
            row[field.id] = fieldValue;
          }
        } else {
          row[field.id] = null;
        }
      });

      return row;
    });

    // Apply field filters
    filters.forEach((filter) => {
      data = data.filter((row) => {
        const value = row[filter.field];
        if (value === null || value === undefined) return false;
        return String(value).toLowerCase().includes(filter.value.toLowerCase());
      });
    });

    // Apply sorting
    if (sortConfig.field) {
      data.sort((a, b) => {
        const aVal = a[sortConfig.field!];
        const bVal = b[sortConfig.field!];
        
        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;

        let comparison = 0;
        if (typeof aVal === "number" && typeof bVal === "number") {
          comparison = aVal - bVal;
        } else {
          comparison = String(aVal).localeCompare(String(bVal));
        }

        return sortConfig.direction === "asc" ? comparison : -comparison;
      });
    }

    return data;
  }, [executions, executionDataMap, selectedWorkflow, availableFields, filters, sortConfig]);

  // Get visible columns (only selected fields)
  const visibleColumns = useMemo(() => {
    return availableFields
      .filter((field) => selectedFields.has(field.id))
      .map((field) => ({
        id: field.id,
        name: field.name,
        isMetadata: field.isMetadata,
      }));
  }, [availableFields, selectedFields]);

  const handleSort = (field: string) => {
    setSortConfig((prev) => {
      if (prev.field === field) {
        return {
          field,
          direction: prev.direction === "asc" ? "desc" : "asc",
        };
      }
      return { field, direction: "asc" };
    });
  };

  const addFilter = (field: string, value: string) => {
    if (!value.trim()) return;
    setFilters((prev) => {
      const existing = prev.find((f) => f.field === field);
      if (existing) {
        return prev.map((f) => (f.field === field ? { field, value } : f));
      }
      return [...prev, { field, value }];
    });
  };

  const removeFilter = (field: string) => {
    setFilters((prev) => prev.filter((f) => f.field !== field));
  };

  const toggleField = (fieldId: string) => {
    setSelectedFields((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(fieldId)) {
        newSet.delete(fieldId);
      } else {
        newSet.add(fieldId);
      }
      return newSet;
    });
  };

  const selectAllFields = () => {
    setSelectedFields(new Set(availableFields.map((f) => f.id)));
  };

  const deselectAllFields = () => {
    setSelectedFields(new Set());
  };

  const exportToExcel = async () => {
    if (!processedData.length || !selectedWorkflow) return;

    // Prepare data for export
    const exportData = processedData.map((row) => {
      const exportRow: Record<string, any> = {};
      visibleColumns.forEach((col) => {
        let value = row[col.id];
        
        // Format dates using the selected format
        if (value && (col.id === "_created_at" || col.id === "_completed_at")) {
          try {
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
              value = format(date, dateFormat);
            } else {
              value = "";
            }
          } catch {
            value = "";
          }
        } else if (value === null || value === undefined) {
          value = "";
        } else if (typeof value === "object") {
          value = JSON.stringify(value);
        } else {
          // Check if it's a date field and format it
          const field = availableFields.find((f) => f.id === col.id);
          if (field && (field.field_type === "date" || field.field_type === "datetime") && typeof value === "string") {
            try {
              const date = new Date(value);
              if (!isNaN(date.getTime())) {
                value = format(date, dateFormat);
              }
            } catch {
              // Keep original value if formatting fails
            }
          }
        }
        
        exportRow[col.name] = value;
      });
      return exportRow;
    });

    // Generate filename
    const workflowName = selectedWorkflow.name.replace(/[^a-z0-9]/gi, "_");
    const dateStr = new Date().toISOString().split("T")[0];

    // Try to use xlsx library if available, otherwise fall back to CSV
    try {
      const XLSX = await import("xlsx");
      // Create workbook
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Execution Data");
      const filename = `${workflowName}_execution_data_${dateStr}.xlsx`;
      XLSX.writeFile(wb, filename);
    } catch (error) {
      // Fallback to CSV export
      const headers = visibleColumns.map((col) => col.name);
      const csvRows = [
        headers.join(","),
        ...exportData.map((row) =>
          headers
            .map((header) => {
              const value = row[header];
              // Escape quotes and wrap in quotes if contains comma, newline, or quote
              if (value === null || value === undefined) return "";
              const stringValue = String(value);
              if (stringValue.includes(",") || stringValue.includes("\n") || stringValue.includes('"')) {
                return `"${stringValue.replace(/"/g, '""')}"`;
              }
              return stringValue;
            })
            .join(",")
        ),
      ];
      const csvContent = csvRows.join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `${workflowName}_execution_data_${dateStr}.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const formatValue = (value: any, fieldType?: string, fieldId?: string): string => {
    if (value === null || value === undefined) return "";
    if (typeof value === "object") return JSON.stringify(value);
    
    // Check if it's a metadata date field
    const isMetadataDateField = fieldId === "_created_at" || fieldId === "_completed_at";
    
    // Format date/datetime fields
    if ((fieldType === "date" || fieldType === "datetime" || isMetadataDateField) && typeof value === "string") {
      try {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          return format(date, dateFormat);
        }
      } catch {
        // Fallback to string if format fails
      }
    }
    
    // Also check if it's a string that looks like an ISO date
    if (typeof value === "string" && !fieldType && !isMetadataDateField) {
      // Try to parse as ISO date string (format: YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)
      const dateMatch = value.match(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/);
      if (dateMatch) {
        try {
          const date = new Date(value);
          if (!isNaN(date.getTime())) {
            return format(date, dateFormat);
          }
        } catch {
          // Fallback to original value
        }
      }
    }
    
    return String(value);
  };

  const getSortIcon = (field: string) => {
    if (sortConfig.field !== field) {
      return <ArrowUpDown className="h-4 w-4 ml-1 opacity-50" />;
    }
    return sortConfig.direction === "asc" ? (
      <ArrowUp className="h-4 w-4 ml-1" />
    ) : (
      <ArrowDown className="h-4 w-4 ml-1" />
    );
  };

  // Group workflows by category
  const groupedWorkflows = useMemo(() => {
    if (!workflows || !categories) return { uncategorized: [], categorized: new Map<string, Workflow[]>() };

    // Get category path (e.g., "Parent > Child > Grandchild")
    const getCategoryPath = (categoryId: string | null): string => {
      if (!categoryId || !categories) return "";
      const category = categories.find((c) => c.id === categoryId);
      if (!category) return "";

      const path: string[] = [];
      let current: WorkflowCategory | undefined = category;

      while (current) {
        path.unshift(current.name);
        if (current.parent_category_id) {
          current = categories.find((c) => c.id === current!.parent_category_id);
        } else {
          break;
        }
      }

      return path.join(" > ");
    };

    const categorized = new Map<string, Workflow[]>();
    const uncategorized: Workflow[] = [];

    workflows.forEach((workflow) => {
      if (workflow.category_id) {
        const categoryPath = getCategoryPath(workflow.category_id);
        if (!categorized.has(categoryPath)) {
          categorized.set(categoryPath, []);
        }
        categorized.get(categoryPath)!.push(workflow);
      } else {
        uncategorized.push(workflow);
      }
    });

    // Sort categories by path
    const sortedCategories = Array.from(categorized.entries()).sort(([a], [b]) => {
      return a.localeCompare(b);
    });

    return {
      uncategorized: uncategorized.sort((a, b) => a.name.localeCompare(b.name)),
      categorized: new Map(sortedCategories),
    };
  }, [workflows, categories]);

  if (isLoadingWorkflows || isLoadingCategories) {
    return <div className="p-6">Loading workflows...</div>;
  }

  return (
    <div className="h-full flex flex-col p-6 gap-4">
      <div className="flex-shrink-0">
        <h1 className="text-3xl font-bold mb-1">Execution Data</h1>
        <p className="text-muted-foreground mb-4">
          View and export execution data for completed workflows
        </p>

        <div className="flex gap-4 items-end mb-4">
          <div className="flex-1 max-w-md">
            <Label htmlFor="workflow-select">Select Workflow</Label>
            <Select
              value={selectedWorkflowId || ""}
              onValueChange={(value) => {
                setSelectedWorkflowId(value);
                setSelectedFields(new Set());
                setFilters([]);
                setSortConfig({ field: null, direction: "asc" });
                setHasInitializedFields(false);
              }}
            >
              <SelectTrigger id="workflow-select">
                <SelectValue placeholder="Select a workflow" />
              </SelectTrigger>
              <SelectContent>
                {Array.from(groupedWorkflows.categorized.entries()).map(([categoryPath, categoryWorkflows]) => (
                  <SelectGroup key={categoryPath}>
                    <SelectLabel>{categoryPath}</SelectLabel>
                    {categoryWorkflows.map((workflow) => (
                      <SelectItem key={workflow.id} value={workflow.id}>
                        {workflow.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
                {groupedWorkflows.uncategorized.length > 0 && (
                  <SelectGroup key="uncategorized">
                    <SelectLabel>Uncategorized</SelectLabel>
                    {groupedWorkflows.uncategorized.map((workflow) => (
                      <SelectItem key={workflow.id} value={workflow.id}>
                        {workflow.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
          </div>

          {selectedWorkflowId && (
            <>
              <Popover open={fieldFilterOpen} onOpenChange={setFieldFilterOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline">
                    <Settings2 className="h-4 w-4 mr-2" />
                    Fields ({selectedFields.size}/{availableFields.length})
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80" align="start">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium">Select Fields</h4>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={selectAllFields}
                        >
                          Select All
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={deselectAllFields}
                        >
                          Deselect All
                        </Button>
                      </div>
                    </div>
                    <Separator />
                    <ScrollArea className="h-64">
                      <div className="space-y-2">
                        {availableFields.map((field) => (
                          <div
                            key={field.id}
                            className="flex items-center space-x-2"
                          >
                            <Checkbox
                              id={field.id}
                              checked={selectedFields.has(field.id)}
                              onCheckedChange={() => toggleField(field.id)}
                            />
                            <Label
                              htmlFor={field.id}
                              className="text-sm font-normal cursor-pointer flex-1"
                            >
                              {field.name}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                    <Separator />
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Date/Time Format</Label>
                      <Select value={dateFormat} onValueChange={setDateFormat}>
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="dd/MM/yyyy HH:mm">DD/MM/YYYY HH:mm</SelectItem>
                          <SelectItem value="MM/dd/yyyy HH:mm">MM/DD/YYYY HH:mm</SelectItem>
                          <SelectItem value="yyyy-MM-dd HH:mm">YYYY-MM-DD HH:mm</SelectItem>
                          <SelectItem value="dd/MM/yyyy">DD/MM/YYYY</SelectItem>
                          <SelectItem value="MM/dd/yyyy">MM/DD/YYYY</SelectItem>
                          <SelectItem value="yyyy-MM-dd">YYYY-MM-DD</SelectItem>
                          <SelectItem value="PPpp">Full Date & Time</SelectItem>
                          <SelectItem value="PPp">Full Date & Short Time</SelectItem>
                          <SelectItem value="PPP">Full Date</SelectItem>
                          <SelectItem value="P">Short Date</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              <Button
                onClick={exportToExcel}
                disabled={processedData.length === 0}
                variant="outline"
              >
                <Download className="h-4 w-4 mr-2" />
                Export to Excel
              </Button>
            </>
          )}
        </div>

        {selectedWorkflowId && visibleColumns.length > 0 && (
          <div className="space-y-3 mb-4 border rounded-lg p-4 bg-card">
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Label htmlFor="filter-field" className="text-xs mb-1 block">Filter Field</Label>
                <Select
                  value={currentFilterField}
                  onValueChange={setCurrentFilterField}
                >
                  <SelectTrigger id="filter-field" className="h-8">
                    <SelectValue placeholder="Select field to filter" />
                  </SelectTrigger>
                  <SelectContent>
                    {visibleColumns.map((col) => (
                      <SelectItem key={col.id} value={col.id}>
                        {col.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Label htmlFor="filter-value" className="text-xs mb-1 block">Filter Value</Label>
                <Input
                  id="filter-value"
                  placeholder="Enter filter value..."
                  value={currentFilterValue}
                  onChange={(e) => setCurrentFilterValue(e.target.value)}
                  className="h-8"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && currentFilterField && currentFilterValue.trim()) {
                      addFilter(currentFilterField, currentFilterValue);
                      setCurrentFilterField("");
                      setCurrentFilterValue("");
                    }
                  }}
                />
              </div>
              <Button
                size="sm"
                onClick={() => {
                  if (currentFilterField && currentFilterValue.trim()) {
                    addFilter(currentFilterField, currentFilterValue);
                    setCurrentFilterField("");
                    setCurrentFilterValue("");
                  }
                }}
                disabled={!currentFilterField || !currentFilterValue.trim()}
                className="h-8"
              >
                Add Filter
              </Button>
            </div>

            {filters.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2 border-t">
                {filters.map((filter) => {
                  const field = availableFields.find((f) => f.id === filter.field);
                  const fieldName = field?.name || filter.field;
                  return (
                    <div
                      key={filter.field}
                      className="flex items-center gap-1 bg-secondary text-secondary-foreground px-2 py-1 rounded text-xs"
                    >
                      <span>{fieldName}: {filter.value}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-4 w-4 ml-1 hover:bg-destructive/20"
                        onClick={() => removeFilter(filter.field)}
                      >
                        <span className="sr-only">Remove</span>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  );
                })}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFilters([]);
                    setCurrentFilterField("");
                    setCurrentFilterValue("");
                  }}
                  className="h-6 text-xs ml-auto"
                >
                  Clear All
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {!selectedWorkflowId ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          Please select a workflow to view execution data
        </div>
      ) : isLoadingExecutions || isLoadingData ? (
        <div className="flex-1 flex items-center justify-center">
          Loading execution data...
        </div>
      ) : visibleColumns.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center space-y-2">
            <p className="text-lg font-medium">No fields selected</p>
            <p className="text-sm">Please select at least one field to display the table.</p>
            <p className="text-xs">Use the "Fields" button to select which fields to show.</p>
          </div>
        </div>
      ) : processedData.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          No completed executions found for this workflow
        </div>
      ) : (
        <div className="flex-1 overflow-auto border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                {visibleColumns.map((col) => {
                  const field = availableFields.find((f) => f.id === col.id);
                  return (
                    <TableHead
                      key={col.id}
                      className="sticky top-0 bg-background z-10 cursor-pointer hover:bg-muted/50"
                      onClick={() => handleSort(col.id)}
                    >
                      <div className="flex items-center">
                        {col.name}
                        {getSortIcon(col.id)}
                      </div>
                    </TableHead>
                  );
                })}
                <TableHead className="sticky top-0 bg-background z-10 w-24">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {processedData.map((row) => (
                <TableRow key={row._execution_id}>
                  {visibleColumns.map((col) => {
                    const field = availableFields.find((f) => f.id === col.id);
                    const value = row[col.id];
                    return (
                      <TableCell key={col.id}>
                        {formatValue(value, field?.field_type, col.id)}
                      </TableCell>
                    );
                  })}
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/executions/${row._execution_id}`)}
                      className="h-8"
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {selectedWorkflowId && processedData.length > 0 && (
        <div className="flex-shrink-0 text-sm text-muted-foreground">
          Showing {processedData.length} execution{processedData.length !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
};

export default ExecutionDataPage;

