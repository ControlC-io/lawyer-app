import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, X, ChevronDown, ChevronUp, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface ArrayFieldProps {
  field: any;
  value: any[];
  onChange: (value: any[]) => void;
  disabled?: boolean;
  labelPosition?: "top" | "side";
  childFields: any[];
  renderChild?: (field: any, value: any, onChange: (val: any) => void, hideLabel?: boolean, required?: boolean, readonly?: boolean) => React.ReactNode;
  compactMode?: boolean; // From form field config
  arrayChildFieldsConfig?: Record<string, { shown: boolean; required: boolean; readonly?: boolean }>; // Configuration for which child fields to show, require, or make read-only
  enableDuplicate?: boolean; // Show duplicate row button (default true)
  enableAddItem?: boolean; // Show add item button (default true)
  enableDelete?: boolean; // Show delete row button (default true)
  primaryColor?: string;
}

export const ArrayField = ({
  field,
  value = [],
  onChange,
  disabled,
  labelPosition = "top",
  childFields,
  renderChild,
  compactMode = false,
  arrayChildFieldsConfig,
  enableDuplicate = true,
  enableAddItem = true,
  enableDelete = true,
  primaryColor,
}: ArrayFieldProps) => {
  const wrapperStyle = primaryColor ? ({ "--portal-primary": primaryColor } as React.CSSProperties) : undefined;
  const showRowActions = !disabled && (enableDuplicate || enableDelete);
  const [expandedItems, setExpandedItems] = useState<Record<number, boolean>>({});

  const getMyChildFields = () => {
    let fields = childFields
      .filter((f) => f.parent_item_id === field.id)
      .sort((a, b) => {
        const posA = a.position ?? 999999;
        const posB = b.position ?? 999999;
        return posA - posB;
      });
    
    // Filter by configuration if provided
    if (arrayChildFieldsConfig) {
      fields = fields.filter((f) => {
        const config = arrayChildFieldsConfig[f.id];
        // If config exists, use it; otherwise default to shown=true for backward compatibility
        return config ? config.shown : true;
      });
    }
    
    return fields;
  };

  const myChildFields = getMyChildFields();
  // Always use compact/table mode for arrays (tabular view)
  const isCompactMode = true;
  
  // Helper to get required status for a child field
  const getChildFieldRequired = (childFieldId: string): boolean => {
    if (arrayChildFieldsConfig) {
      const config = arrayChildFieldsConfig[childFieldId];
      return config ? config.required : false;
    }
    // Fallback to field's own required property if no config
    const childField = childFields.find(f => f.id === childFieldId);
    return childField?.required || false;
  };

  // Helper to get read-only status for a child field (column)
  const getChildFieldReadonly = (childFieldId: string): boolean => {
    if (arrayChildFieldsConfig) {
      const config = arrayChildFieldsConfig[childFieldId];
      return config ? !!config.readonly : false;
    }
    return false;
  };

  const handleAddItem = () => {
    const newItem: any = { _id: crypto.randomUUID() };
    // Initialize default values if needed
    onChange([...(value || []), newItem]);
  };

  const handleRemoveItem = (index: number) => {
    const newValue = [...(value || [])];
    newValue.splice(index, 1);
    onChange(newValue);
  };

  const handleDuplicateItem = (index: number) => {
    const newValue = [...(value || [])];
    const itemToDuplicate = newValue[index];
    // Create a deep copy of the item with a new _id
    const duplicatedItem = {
      ...itemToDuplicate,
      _id: crypto.randomUUID(),
    };
    // Insert the duplicated item right after the original
    newValue.splice(index + 1, 0, duplicatedItem);
    onChange(newValue);
  };

  const handleUpdateItem = (index: number, childFieldId: string, childValue: any) => {
    const newValue = [...(value || [])];
    newValue[index] = {
      ...newValue[index],
      [childFieldId]: childValue
    };
    onChange(newValue);
  };

  const toggleExpand = (index: number) => {
    setExpandedItems(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  // If no child fields defined, simple array of strings (not fully supported in this refactor as per original code usually having objects, but let's handle it safely)
  if (myChildFields.length === 0) {
      // Fallback for simple arrays or misconfigured
      return (
        <div className="space-y-1.5">
           <Label className="text-sm font-medium">{field.label || field.name || field.id}</Label>
           <div className="text-muted-foreground text-xs">Array field configuration missing child fields.</div>
        </div>
      )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{field.label || field.name || field.id}</Label>
        {!disabled && enableAddItem && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddItem}
            className="h-8 px-2 lg:px-3 portal-primary-btn"
            data-portal-color={primaryColor ? "true" : undefined}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Item
          </Button>
        )}
      </div>

      {(!value || value.length === 0) && (
        <div className="text-sm text-muted-foreground bg-muted/50 p-4 rounded-md border border-dashed text-center">
          No items added yet
        </div>
      )}

      {value && value.length > 0 && (
    <div className="space-y-2 w-full" style={wrapperStyle}>
          {isCompactMode ? (
            <div className="border rounded-md overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {myChildFields.map((cf) => {
                        const isRequired = getChildFieldRequired(cf.id);
                        return (
                          <TableHead key={cf.id} className="min-w-[150px] px-2 py-1.5 text-xs font-medium">
                            {cf.label || cf.name || cf.id}
                            {isRequired && <span className="text-destructive ml-1">*</span>}
                          </TableHead>
                        );
                      })}
                      {showRowActions && <TableHead className="w-[100px] px-2 py-1.5"></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {value.map((item, index) => (
                      <TableRow key={`${item._id ?? item.id ?? index}-${index}`}>
                        {myChildFields.map((cf) => {
                          const isRequired = getChildFieldRequired(cf.id);
                          const isReadonly = getChildFieldReadonly(cf.id);
                          return (
                            <TableCell key={cf.id} className="align-top px-2 py-1.5">
                              {renderChild && renderChild(
                                cf, 
                                item[cf.id], 
                                (val) => handleUpdateItem(index, cf.id, val),
                                isCompactMode, // Hide labels in compact mode (they're in the table header)
                                isRequired,
                                isReadonly
                              )}
                            </TableCell>
                          );
                        })}
                        {showRowActions && (
                          <TableCell className="px-2 py-1.5">
                            <div className="flex items-center justify-center gap-1">
                              {enableDuplicate && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                  onClick={() => handleDuplicateItem(index)}
                                  title="Duplicate row"
                                >
                                  <Copy className="h-4 w-4" />
                                </Button>
                              )}
                              {enableDelete && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  onClick={() => handleRemoveItem(index)}
                                  title="Delete row"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {value.map((item, index) => (
                <div key={`${item._id ?? item.id ?? index}-${index}`} className="border rounded-md p-3 bg-card">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-muted-foreground">Item {index + 1}</span>
                    {(enableDuplicate || enableDelete) && !disabled && (
                      <div className="flex items-center gap-1">
                        {enableDuplicate && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={() => handleDuplicateItem(index)}
                            title="Duplicate item"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        )}
                        {enableDelete && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleRemoveItem(index)}
                            title="Delete item"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="space-y-4">
                    {myChildFields.map((cf) => {
                      const isRequired = getChildFieldRequired(cf.id);
                      const isReadonly = getChildFieldReadonly(cf.id);
                      return (
                        <div key={cf.id}>
                          {renderChild && renderChild(
                            cf, 
                            item[cf.id], 
                            (val) => handleUpdateItem(index, cf.id, val),
                            false, // Don't hide labels in non-compact mode
                            isRequired,
                            isReadonly
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      
      {field.description && (
        <p className="text-xs text-muted-foreground">{field.description}</p>
      )}
    </div>
  );
};

