import { useState } from "react";
import { Plus, Trash2, Settings, X, ChevronRight, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { WorkflowStep } from "@/pages/WorkflowEditor";
import { cn } from "@/lib/utils";
import { FieldRenderer } from "@/components/execution/form/FieldRenderer";

// Types
interface FormBlock {
  id: string;
  title?: string;
  columns: 1 | 2 | 3 | 4;
  columns_content: string[][]; // Array of columns, each column contains field IDs
  column_names?: string[]; // Optional names for each column
  label_positions?: ("top" | "side")[]; // Label position for each column: "top" or "side"
  compact?: boolean; // Reduce padding and margins for denser layout
}

interface FieldConfig {
  shown: boolean;
  editable: boolean;
  readonly: boolean;
  required: boolean;
  visibility_condition?: {
    field_id: string;
    operator: "has_value" | "is_true";
  } | null;
  required_condition?: {
    field_id: string;
    operator: "has_value" | "is_true";
  } | null;
  allowed_file_types?: string[];
  allow_ai_extraction?: boolean;
  compact_mode?: boolean; // For array fields: display in table format with labels only in header
  array_child_fields?: Record<string, { shown: boolean; required: boolean }>; // For array fields: configuration for child fields
}

interface FormBlocksEditorProps {
  step: WorkflowStep;
  dataStructureItems: Array<{
    id: string;
    name: string;
    data_structure_name: string;
    field_type?: string;
  }>;
  onUpdate: (step: WorkflowStep) => void;
  fullDataStructure?: any[]; // Optional full data structure for better preview
}

export function FormBlocksEditor({ step, dataStructureItems, onUpdate, fullDataStructure }: FormBlocksEditorProps) {
  // Parse form_blocks from config, or initialize empty array
  const [blocks, setBlocks] = useState<FormBlock[]>(() => {
    if (step.config.form_blocks && Array.isArray(step.config.form_blocks)) {
      return step.config.form_blocks;
    }
    // Migration: convert old form_fields to blocks if they exist
    if (step.config.form_fields) {
      const oldFields = Object.keys(step.config.form_fields).filter(
        (fieldId) => step.config.form_fields[fieldId]?.shown === true
      );
      if (oldFields.length > 0) {
        return [
          {
            id: crypto.randomUUID(),
            title: "",
            columns: 1,
            columns_content: [oldFields],
            column_names: [],
            label_positions: ["top"],
          },
        ];
      }
    }
    return [];
  });

  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [editingColumn, setEditingColumn] = useState<{ blockId: string; columnIndex: number } | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Get all field IDs that are in blocks (visible fields)
  const visibleFieldIds = new Set<string>();
  blocks.forEach((block) => {
    block.columns_content.forEach((column) => {
      column.forEach((fieldId) => visibleFieldIds.add(fieldId));
    });
  });

  // Create a set of field IDs that are children of array parents
  const childFieldIds = new Set<string>();
  if (fullDataStructure && Array.isArray(fullDataStructure)) {
    fullDataStructure.forEach((field: any) => {
      if (field.parent_item_id) {
        childFieldIds.add(field.id);
      }
    });
  }

  // Get available fields (all fields minus visible ones and minus children of array parents)
  const availableFields = dataStructureItems.filter(
    (item) => !visibleFieldIds.has(item.id) && !childFieldIds.has(item.id)
  );

  // Get field config or default
  const getFieldConfig = (fieldId: string): FieldConfig => {
    return step.config.form_fields?.[fieldId] || {
      shown: true, // Fields in blocks are visible by default
      editable: true,
      readonly: false,
      required: false,
      visibility_condition: null,
      required_condition: null,
      allowed_file_types: [],
      allow_ai_extraction: false,
      compact_mode: false,
    };
  };

  // Update field config
  const updateFieldConfig = (fieldId: string, updates: Partial<FieldConfig>) => {
    const formFields = step.config.form_fields || {};
    onUpdate({
      ...step,
      config: {
        ...step.config,
        form_fields: {
          ...formFields,
          [fieldId]: {
            ...getFieldConfig(fieldId),
            ...updates,
          },
        },
        form_blocks: blocks,
      },
    });
  };

  // Update blocks
  const updateBlocks = (newBlocks: FormBlock[]) => {
    setBlocks(newBlocks);
    // Ensure all fields in blocks are marked as shown
    const formFields = step.config.form_fields || {};
    const updatedFormFields = { ...formFields };
    
    newBlocks.forEach((block) => {
      block.columns_content.forEach((column) => {
        column.forEach((fieldId) => {
          if (!updatedFormFields[fieldId]) {
            updatedFormFields[fieldId] = {
              shown: true,
              editable: true,
              readonly: false,
              required: false,
              visibility_condition: null,
              required_condition: null,
            };
          } else {
            updatedFormFields[fieldId] = {
              ...updatedFormFields[fieldId],
              shown: true, // Fields in blocks are visible
            };
          }
        });
      });
    });
    
    onUpdate({
      ...step,
      config: {
        ...step.config,
        form_fields: updatedFormFields,
        form_blocks: newBlocks,
      },
    });
  };

  // Add new block
  const addBlock = () => {
    const newBlock: FormBlock = {
      id: crypto.randomUUID(),
      title: "",
      columns: 1,
      columns_content: [[]],
      column_names: [],
      label_positions: ["top"], // Default to top
    };
    updateBlocks([...blocks, newBlock]);
  };

  // Delete block
  const deleteBlock = (blockId: string) => {
    const blockToDelete = blocks.find((b) => b.id === blockId);
    const newBlocks = blocks.filter((b) => b.id !== blockId);
    
    // Mark fields from deleted block as hidden (only if not in other blocks)
    if (blockToDelete) {
      const formFields = step.config.form_fields || {};
      const updatedFormFields = { ...formFields };
      
      blockToDelete.columns_content.forEach((column) => {
        column.forEach((fieldId) => {
          // Check if field is in any remaining block
          const isFieldInOtherBlocks = newBlocks.some(block =>
            block.columns_content.some(col => col.includes(fieldId))
          );
          
          if (!isFieldInOtherBlocks) {
            updatedFormFields[fieldId] = {
              ...(updatedFormFields[fieldId] || {}),
              shown: false, // Hide field when removed from all blocks
            };
          }
        });
      });
      
      onUpdate({
        ...step,
        config: {
          ...step.config,
          form_fields: updatedFormFields,
          form_blocks: newBlocks,
        },
      });
      setBlocks(newBlocks);
    } else {
      updateBlocks(newBlocks);
    }
  };

  // Update block properties
  const updateBlock = (blockId: string, updates: Partial<FormBlock>) => {
    const newBlocks = blocks.map((block) => {
      if (block.id === blockId) {
        const updated = { ...block, ...updates };
        // If columns changed, adjust columns_content, column_names, and label_positions
        if (updates.columns !== undefined && updates.columns !== block.columns) {
          const newColumnsContent: string[][] = [];
          const newColumnNames: string[] = [];
          const newLabelPositions: ("top" | "side")[] = [];
          for (let i = 0; i < updates.columns; i++) {
            if (i < block.columns_content.length) {
              newColumnsContent.push([...block.columns_content[i]]);
            } else {
              newColumnsContent.push([]);
            }
            if (block.column_names && i < block.column_names.length) {
              newColumnNames.push(block.column_names[i]);
            } else {
              newColumnNames.push("");
            }
            if (block.label_positions && i < block.label_positions.length) {
              newLabelPositions.push(block.label_positions[i]);
            } else {
              newLabelPositions.push("top"); // Default to top
            }
          }
          updated.columns_content = newColumnsContent;
          updated.column_names = newColumnNames;
          updated.label_positions = newLabelPositions;
        }
        return updated;
      }
      return block;
    });
    updateBlocks(newBlocks);
  };

  // Add field to column
  const addFieldToColumn = (blockId: string, columnIndex: number, fieldId: string) => {
    const newBlocks = blocks.map((block) => {
      if (block.id === blockId) {
        const newColumnsContent = [...block.columns_content];
        newColumnsContent[columnIndex] = [...newColumnsContent[columnIndex], fieldId];
        return { ...block, columns_content: newColumnsContent };
      }
      return block;
    });
    
    // Ensure field is marked as shown in form_fields
    const formFields = step.config.form_fields || {};
    const fieldConfig = formFields[fieldId] || {
      shown: true,
      editable: true,
      readonly: false,
      required: false,
      visibility_condition: null,
      required_condition: null,
    };
    
    onUpdate({
      ...step,
      config: {
        ...step.config,
        form_fields: {
          ...formFields,
          [fieldId]: {
            ...fieldConfig,
            shown: true, // Fields in blocks are visible
          },
        },
        form_blocks: newBlocks,
      },
    });
    
    setBlocks(newBlocks);
  };

  // Remove field from column
  const removeFieldFromColumn = (blockId: string, columnIndex: number, fieldIndex: number) => {
    const newBlocks = blocks.map((block) => {
      if (block.id === blockId) {
        const newColumnsContent = [...block.columns_content];
        const removedFieldId = newColumnsContent[columnIndex][fieldIndex];
        newColumnsContent[columnIndex] = newColumnsContent[columnIndex].filter((_, i) => i !== fieldIndex);
        return { ...block, columns_content: newColumnsContent };
      }
      return block;
    });
    
    // Mark field as hidden when removed from blocks (only if not in any other block)
    const removedFieldId = blocks.find(b => b.id === blockId)?.columns_content[columnIndex]?.[fieldIndex];
    if (removedFieldId) {
      const isFieldInOtherBlocks = newBlocks.some(block => 
        block.columns_content.some(column => column.includes(removedFieldId))
      );
      
      if (!isFieldInOtherBlocks) {
        const formFields = step.config.form_fields || {};
        onUpdate({
          ...step,
          config: {
            ...step.config,
            form_fields: {
              ...formFields,
              [removedFieldId]: {
                ...(formFields[removedFieldId] || {}),
                shown: false, // Hide field when removed from all blocks
              },
            },
            form_blocks: newBlocks,
          },
        });
        setBlocks(newBlocks);
        return;
      }
    }
    
    updateBlocks(newBlocks);
  };

  // Get field info
  const getFieldInfo = (fieldId: string) => {
    return dataStructureItems.find((item) => item.id === fieldId);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Label>Form Blocks Configuration</Label>
          <p className="text-xs text-muted-foreground mt-1">
            Organize form fields into blocks with customizable columns
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setShowPreview(true)} size="sm" variant="outline">
            <Eye className="h-4 w-4 mr-2" />
            Preview Form
          </Button>
          <Button onClick={addBlock} size="sm" variant="outline">
            <Plus className="h-4 w-4 mr-2" />
            Add Block
          </Button>
        </div>
      </div>

      {blocks.length === 0 ? (
        <div className="p-8 border border-dashed rounded-lg text-center">
          <p className="text-sm text-muted-foreground mb-4">No blocks configured</p>
          <Button onClick={addBlock} size="sm" variant="outline">
            <Plus className="h-4 w-4 mr-2" />
            Create First Block
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {blocks.map((block, blockIndex) => (
            <div key={block.id} className="border rounded-lg bg-card">
              {/* Block Header */}
              <div className="p-4 border-b bg-muted/30">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-base">
                      Block {blockIndex + 1}
                      {block.title && (
                        <span className="text-muted-foreground"> - {block.title}</span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => setEditingBlockId(block.id)}
                      size="sm"
                      variant="ghost"
                      className="h-8 w-8 p-0"
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                    <Button
                      onClick={() => deleteBlock(block.id)}
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive h-8 w-8 p-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Block Content - Columns */}
              <div className="p-4">
                <div
                  className={cn(
                    "grid gap-4",
                    block.columns === 1 && "grid-cols-1",
                    block.columns === 2 && "grid-cols-2",
                    block.columns === 3 && "grid-cols-3",
                    block.columns === 4 && "grid-cols-4"
                  )}
                >
                  {Array.from({ length: block.columns }).map((_, colIndex) => (
                    <div key={colIndex} className="space-y-2 min-h-[100px] border rounded-md p-3 bg-muted/20">
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <Label className="text-xs font-medium text-muted-foreground">
                            Column {colIndex + 1}
                            {block.column_names?.[colIndex] && (
                              <span className="text-muted-foreground/70"> - {block.column_names[colIndex]}</span>
                            )}
                          </Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            onClick={() => setEditingColumn({ blockId: block.id, columnIndex: colIndex })}
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0"
                          >
                            <Settings className="h-3.5 w-3.5" />
                          </Button>
                          {availableFields.length > 0 && (
                            <Select
                              value=""
                              onValueChange={(fieldId) => addFieldToColumn(block.id, colIndex, fieldId)}
                            >
                              <SelectTrigger className="h-7 text-xs flex-1">
                                <SelectValue placeholder="Add field..." />
                              </SelectTrigger>
                              <SelectContent>
                                {availableFields.map((field) => (
                                  <SelectItem key={field.id} value={field.id}>
                                    {field.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        {block.columns_content[colIndex]?.map((fieldId, fieldIndex) => {
                          const fieldInfo = getFieldInfo(fieldId);
                          if (!fieldInfo) return null;

                          return (
                            <div
                              key={fieldId}
                              className="flex items-center gap-2 p-2 bg-background border rounded-md group"
                            >
                              <div className="flex-1 min-w-0">
                                <span className="text-sm font-medium truncate">{fieldInfo.name}</span>
                              </div>
                              <Button
                                onClick={() => setEditingFieldId(fieldId)}
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0"
                              >
                                <Settings className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                onClick={() => removeFieldFromColumn(block.id, colIndex, fieldIndex)}
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          );
                        })}
                        {(!block.columns_content[colIndex] || block.columns_content[colIndex].length === 0) && (
                          <div className="text-xs text-muted-foreground text-center py-4 border border-dashed rounded">
                            No fields in this column
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Block Settings Dialog */}
      {editingBlockId && (
        <BlockSettingsDialog
          block={blocks.find((b) => b.id === editingBlockId)!}
          onUpdate={(updates) => {
            updateBlock(editingBlockId, updates);
          }}
          onClose={() => setEditingBlockId(null)}
        />
      )}

      {/* Column Settings Dialog */}
      {editingColumn && (
        <ColumnSettingsDialog
          block={blocks.find((b) => b.id === editingColumn.blockId)!}
          columnIndex={editingColumn.columnIndex}
          onUpdate={(updates) => {
            updateBlock(editingColumn.blockId, updates);
          }}
          onClose={() => setEditingColumn(null)}
        />
      )}

      {/* Field Settings Dialog */}
      {editingFieldId && (
        <FieldSettingsDialog
          fieldId={editingFieldId}
          fieldInfo={getFieldInfo(editingFieldId)!}
          fieldConfig={getFieldConfig(editingFieldId)}
          otherFields={dataStructureItems.filter((f) => f.id !== editingFieldId)}
          fullDataStructure={fullDataStructure}
          onUpdate={(updates) => {
            updateFieldConfig(editingFieldId, updates);
          }}
          onClose={() => setEditingFieldId(null)}
        />
      )}

      {/* Preview Form Dialog */}
      {showPreview && (
        <FormPreviewDialog
          blocks={blocks}
          dataStructureItems={dataStructureItems}
          formFields={step.config.form_fields || {}}
          fullDataStructure={fullDataStructure}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  );
}

// Block Settings Dialog Component
interface BlockSettingsDialogProps {
  block: FormBlock;
  onUpdate: (updates: Partial<FormBlock>) => void;
  onClose: () => void;
}

function BlockSettingsDialog({ block, onUpdate, onClose }: BlockSettingsDialogProps) {
  const [title, setTitle] = useState(block.title || "");
  const [columns, setColumns] = useState(block.columns.toString());
  const [compact, setCompact] = useState(block.compact || false);

  const handleSave = () => {
    onUpdate({
      title: title.trim() || undefined,
      columns: parseInt(columns) as 1 | 2 | 3 | 4,
      compact: compact,
    });
    onClose();
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Block Settings</DialogTitle>
          <DialogDescription>Configure the block title, columns, and layout density</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Block Title */}
          <div className="space-y-2">
            <Label htmlFor="block-title">Block Title (optional)</Label>
            <Input
              id="block-title"
              placeholder="Enter block title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Number of Columns */}
          <div className="space-y-2">
            <Label htmlFor="block-columns">Number of Columns</Label>
            <Select value={columns} onValueChange={setColumns}>
              <SelectTrigger id="block-columns">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 Column</SelectItem>
                <SelectItem value="2">2 Columns</SelectItem>
                <SelectItem value="3">3 Columns</SelectItem>
                <SelectItem value="4">4 Columns</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Compact Mode */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 p-3 rounded-md border text-sm font-medium cursor-pointer transition-colors hover:bg-accent hover:text-accent-foreground">
              <Checkbox
                checked={compact}
                onCheckedChange={(checked) => setCompact(!!checked)}
                className="h-4 w-4"
              />
              <div className="flex-1">
                <div className="font-medium">Compact Mode</div>
                <div className="text-xs text-muted-foreground">Reduce padding and margins for a denser layout</div>
              </div>
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Column Settings Dialog Component
interface ColumnSettingsDialogProps {
  block: FormBlock;
  columnIndex: number;
  onUpdate: (updates: Partial<FormBlock>) => void;
  onClose: () => void;
}

function ColumnSettingsDialog({ block, columnIndex, onUpdate, onClose }: ColumnSettingsDialogProps) {
  const [columnName, setColumnName] = useState(block.column_names?.[columnIndex] || "");
  const [labelPosition, setLabelPosition] = useState(block.label_positions?.[columnIndex] || "top");

  const handleSave = () => {
    const newColumnNames = [...(block.column_names || [])];
    while (newColumnNames.length <= columnIndex) {
      newColumnNames.push("");
    }
    newColumnNames[columnIndex] = columnName.trim() || "";

    const newLabelPositions = [...(block.label_positions || [])];
    while (newLabelPositions.length <= columnIndex) {
      newLabelPositions.push("top");
    }
    newLabelPositions[columnIndex] = labelPosition as "top" | "side";

    onUpdate({
      column_names: newColumnNames,
      label_positions: newLabelPositions,
    });
    onClose();
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Column {columnIndex + 1} Settings</DialogTitle>
          <DialogDescription>Configure the column name and label position</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Column Name */}
          <div className="space-y-2">
            <Label htmlFor="column-name">Column Name (optional)</Label>
            <Input
              id="column-name"
              placeholder="Enter column name"
              value={columnName}
              onChange={(e) => setColumnName(e.target.value)}
            />
          </div>

          {/* Label Position */}
          <div className="space-y-2">
            <Label htmlFor="label-position">Label Position</Label>
            <Select value={labelPosition} onValueChange={setLabelPosition}>
              <SelectTrigger id="label-position">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="top">Above</SelectItem>
                <SelectItem value="side">Beside</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Field Settings Dialog Component
interface FieldSettingsDialogProps {
  fieldId: string;
  fieldInfo: {
    id: string;
    name: string;
    data_structure_name: string;
    field_type?: string;
  };
  fieldConfig: FieldConfig;
  otherFields: Array<{ id: string; name: string }>;
  fullDataStructure?: any[];
  onUpdate: (updates: Partial<FieldConfig>) => void;
  onClose: () => void;
}

function FieldSettingsDialog({
  fieldId,
  fieldInfo,
  fieldConfig,
  otherFields,
  fullDataStructure,
  onUpdate,
  onClose,
}: FieldSettingsDialogProps) {
  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Field Settings: {fieldInfo.name}</DialogTitle>
          <DialogDescription>Configure the properties for this field</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Main Options */}
          <div className="space-y-4">
            <Label className="text-sm font-semibold">Field Options</Label>
            <div className="grid grid-cols-3 gap-3">
              <label
                className={cn(
                  "flex items-center gap-2 p-3 rounded-md border text-sm font-medium cursor-pointer transition-colors",
                  fieldConfig.editable
                    ? "bg-primary/5 border-primary/20 text-primary"
                    : "hover:bg-accent hover:text-accent-foreground",
                  fieldConfig.readonly && "opacity-50 cursor-not-allowed"
                )}
              >
                <Checkbox
                  checked={fieldConfig.editable}
                  disabled={fieldConfig.readonly}
                  onCheckedChange={(checked) => onUpdate({ editable: !!checked, readonly: false })}
                  className="h-4 w-4"
                />
                Editable
              </label>

              <label
                className={cn(
                  "flex items-center gap-2 p-3 rounded-md border text-sm font-medium cursor-pointer transition-colors",
                  fieldConfig.readonly
                    ? "bg-primary/5 border-primary/20 text-primary"
                    : "hover:bg-accent hover:text-accent-foreground",
                  fieldConfig.editable && "opacity-50 cursor-not-allowed"
                )}
              >
                <Checkbox
                  checked={fieldConfig.readonly}
                  disabled={fieldConfig.editable}
                  onCheckedChange={(checked) => onUpdate({ readonly: !!checked, editable: false })}
                  className="h-4 w-4"
                />
                Read-only
              </label>

              <label
                className={cn(
                  "flex items-center gap-2 p-3 rounded-md border text-sm font-medium cursor-pointer transition-colors",
                  fieldConfig.required
                    ? "bg-primary/5 border-primary/20 text-primary"
                    : "hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Checkbox
                  checked={fieldConfig.required}
                  onCheckedChange={(checked) => onUpdate({ required: !!checked })}
                  className="h-4 w-4"
                />
                Required
              </label>
            </div>
          </div>

          {/* File Settings */}
          {(fieldInfo.field_type === "file" || fieldInfo.field_type === "multiple_files") && (
            <div className="space-y-4 pt-4 border-t">
              <Label className="text-sm font-semibold">File Settings</Label>
              <div className="space-y-4">
                <div className="space-y-3">
                  <Label className="text-xs font-medium">Allowed File Types</Label>
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={fieldConfig.allowed_file_types?.includes("image")}
                        onCheckedChange={(checked) => {
                          const current = fieldConfig.allowed_file_types || [];
                          const updated = checked
                            ? [...current, "image"]
                            : current.filter((t) => t !== "image");
                          onUpdate({ allowed_file_types: updated });
                        }}
                      />
                      Pictures
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={fieldConfig.allowed_file_types?.includes("pdf")}
                        onCheckedChange={(checked) => {
                          const current = fieldConfig.allowed_file_types || [];
                          const updated = checked
                            ? [...current, "pdf"]
                            : current.filter((t) => t !== "pdf");
                          onUpdate({ allowed_file_types: updated });
                        }}
                      />
                      PDF
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={fieldConfig.allowed_file_types?.includes("all")}
                        onCheckedChange={(checked) => {
                          const current = fieldConfig.allowed_file_types || [];
                          const updated = checked
                            ? [...current, "all"]
                            : current.filter((t) => t !== "all");
                          onUpdate({ allowed_file_types: updated });
                        }}
                      />
                      All
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Array Settings */}
          {fieldInfo.field_type === "array" && (
            <div className="space-y-4 pt-4 border-t">
              <Label className="text-sm font-semibold">Array Settings</Label>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="array-compact-mode"
                  checked={fieldConfig.compact_mode || false}
                  onCheckedChange={(checked) => onUpdate({ compact_mode: !!checked })}
                />
                <label
                  htmlFor="array-compact-mode"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Compact mode
                  <span className="text-xs text-muted-foreground block mt-1">
                    Display items in table format with labels only in the header
                  </span>
                </label>
              </div>

              {/* Array Child Fields Configuration */}
              {fullDataStructure && (() => {
                const childFields = fullDataStructure.filter((f: any) => f.parent_item_id === fieldId);
                if (childFields.length === 0) {
                  return (
                    <div className="text-xs text-muted-foreground p-3 bg-muted/30 rounded-md">
                      No child fields found for this array field.
                    </div>
                  );
                }
                
                const arrayChildFields = fieldConfig.array_child_fields || {};
                
                return (
                  <div className="space-y-3">
                    <Label className="text-sm font-medium">Child Fields Configuration</Label>
                    <p className="text-xs text-muted-foreground">
                      Select which child fields should be shown and marked as required in array items
                    </p>
                    <div className="space-y-2 border rounded-md p-3 bg-muted/20">
                      {childFields.map((childField: any) => {
                        const childConfig = arrayChildFields[childField.id] || { shown: true, required: false };
                        return (
                          <div key={childField.id} className="flex items-center justify-between gap-4 p-2 bg-background rounded border">
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium">{childField.name || childField.id}</span>
                              {childField.field_type && (
                                <span className="text-xs text-muted-foreground ml-2">({childField.field_type})</span>
                              )}
                            </div>
                            <div className="flex items-center gap-4">
                              <label className="flex items-center gap-2 text-sm cursor-pointer">
                                <Checkbox
                                  checked={childConfig.shown}
                                  onCheckedChange={(checked) => {
                                    const updated = {
                                      ...arrayChildFields,
                                      [childField.id]: {
                                        ...childConfig,
                                        shown: !!checked,
                                        required: checked ? childConfig.required : false, // If hiding, also unset required
                                      },
                                    };
                                    onUpdate({ array_child_fields: updated });
                                  }}
                                />
                                <span className="text-xs">Show</span>
                              </label>
                              <label className="flex items-center gap-2 text-sm cursor-pointer">
                                <Checkbox
                                  checked={childConfig.required}
                                  disabled={!childConfig.shown}
                                  onCheckedChange={(checked) => {
                                    const updated = {
                                      ...arrayChildFields,
                                      [childField.id]: {
                                        ...childConfig,
                                        required: !!checked,
                                      },
                                    };
                                    onUpdate({ array_child_fields: updated });
                                  }}
                                />
                                <span className="text-xs">Required</span>
                              </label>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Advanced Conditions */}
          <Collapsible className="group">
            <CollapsibleTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="w-full flex items-center justify-between p-3 h-auto text-sm font-medium"
              >
                <div className="flex items-center gap-2">
                  <ChevronRight className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-90" />
                  Advanced Conditions
                </div>
              </Button>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <div className="p-3 bg-muted/30 border rounded-md space-y-4 mt-2">
                {/* Visibility Condition */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Visibility Condition</Label>
                  <div className="flex gap-2">
                    <Select
                      value={fieldConfig.visibility_condition?.field_id || "none"}
                      onValueChange={(value) => {
                        const newCondition =
                          value === "none"
                            ? null
                            : {
                                field_id: value,
                                operator: "has_value" as const,
                              };
                        onUpdate({ visibility_condition: newCondition });
                      }}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Always Visible" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Always Visible</SelectItem>
                        {otherFields.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            If {f.name}...
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {fieldConfig.visibility_condition && (
                      <Select
                        value={fieldConfig.visibility_condition.operator}
                        onValueChange={(value) => {
                          onUpdate({
                            visibility_condition: {
                              ...fieldConfig.visibility_condition!,
                              operator: value as "has_value" | "is_true",
                            },
                          });
                        }}
                      >
                        <SelectTrigger className="h-9 w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="has_value">Has Value</SelectItem>
                          <SelectItem value="is_true">Is True</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>

                {/* Required Condition */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Required Condition</Label>
                  <div className="flex gap-2">
                    <Select
                      value={fieldConfig.required_condition?.field_id || "none"}
                      onValueChange={(value) => {
                        const newCondition =
                          value === "none"
                            ? null
                            : {
                                field_id: value,
                                operator: "has_value" as const,
                              };
                        onUpdate({ required_condition: newCondition });
                      }}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Always Required (if checked)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Always Required (if checked above)</SelectItem>
                        {otherFields.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            If {f.name}...
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {fieldConfig.required_condition && (
                      <Select
                        value={fieldConfig.required_condition.operator}
                        onValueChange={(value) => {
                          onUpdate({
                            required_condition: {
                              ...fieldConfig.required_condition!,
                              operator: value as "has_value" | "is_true",
                            },
                          });
                        }}
                      >
                        <SelectTrigger className="h-9 w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="has_value">Has Value</SelectItem>
                          <SelectItem value="is_true">Is True</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button onClick={onClose} variant="outline">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Form Preview Dialog Component
interface FormPreviewDialogProps {
  blocks: FormBlock[];
  dataStructureItems: Array<{
    id: string;
    name: string;
    data_structure_name: string;
    field_type?: string;
  }>;
  formFields: Record<string, FieldConfig>;
  fullDataStructure?: any[];
  onClose: () => void;
}

function FormPreviewDialog({ blocks, dataStructureItems, formFields, fullDataStructure, onClose }: FormPreviewDialogProps) {
  const [previewValues, setPreviewValues] = useState<Record<string, any>>({});

  // Get field info - try to get from full data structure first for complete info
  const getFieldInfo = (fieldId: string) => {
    // Try full data structure first
    if (fullDataStructure) {
      const fullField = fullDataStructure.find((field: any) => field.id === fieldId);
      if (fullField) {
        return fullField;
      }
    }
    // Fallback to basic info
    return dataStructureItems.find((item) => item.id === fieldId);
  };

  // Get field config or default
  const getFieldConfig = (fieldId: string): FieldConfig => {
    return formFields[fieldId] || {
      shown: true,
      editable: true,
      readonly: false,
      required: false,
      visibility_condition: null,
      required_condition: null,
      allowed_file_types: [],
      allow_ai_extraction: false,
      compact_mode: false,
    };
  };

  // Helper to evaluate conditions (simplified for preview)
  const evaluateCondition = (condition: { field_id: string; operator: "has_value" | "is_true" } | null): boolean => {
    if (!condition) return true;
    const value = previewValues[condition.field_id];
    if (condition.operator === "has_value") {
      return value !== undefined && value !== null && value !== "";
    }
    if (condition.operator === "is_true") {
      return value === true;
    }
    return true;
  };

  // Render a single field
  const renderField = (fieldId: string, labelPosition: "top" | "side" = "top") => {
    const fieldConfig = getFieldConfig(fieldId);
    if (fieldConfig?.shown === false) return null;

    // Check visibility condition
    if (fieldConfig?.visibility_condition) {
      const isVisible = evaluateCondition(fieldConfig.visibility_condition);
      if (!isVisible) return null;
    }

    const fieldInfo = getFieldInfo(fieldId);
    if (!fieldInfo) return null;

    // Create a field definition - use full info if available
    const fieldDef: any = {
      id: fieldInfo.id,
      name: fieldInfo.name,
      field_type: fieldInfo.field_type || "text",
      type: fieldInfo.field_type || "text",
      description: fieldInfo.description || null,
      options: fieldInfo.options || null,
      options_source: fieldInfo.options_source || "static",
      label: fieldInfo.name, // FieldRenderer uses label or name
    };

    const disabled = fieldConfig?.readonly === true || fieldConfig?.editable === false;
    let required = fieldConfig?.required;
    if (fieldConfig?.required_condition) {
      required = evaluateCondition(fieldConfig.required_condition);
    }

    const currentValue = previewValues[fieldId];

    return (
      <FieldRenderer
        key={fieldId}
        field={fieldDef}
        value={currentValue}
        onChange={(val) => {
          setPreviewValues((prev) => ({ ...prev, [fieldId]: val }));
        }}
        disabled={disabled}
        required={required}
        labelPosition={labelPosition}
        // Mock handlers for file fields
        onUpload={() => Promise.resolve()}
        onViewFile={() => {}}
        onDelete={async () => {}}
        isUploading={false}
        // For array fields
        childFields={fullDataStructure || []}
        renderChild={(childField, childValue, onChildChange, hideLabel, required) => {
          // Use required from configuration if provided, otherwise fallback to field's own required property
          const isRequired = required !== undefined ? required : (childField.required || false);
          return (
            <FieldRenderer
              field={childField}
              value={childValue}
              onChange={onChildChange}
              disabled={disabled}
              required={isRequired}
              labelPosition={hideLabel ? "hidden" : "top"}
            />
          );
        }}
        fieldConfig={fieldConfig}
      />
    );
  };

  if (blocks.length === 0) {
    return (
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Form Preview</DialogTitle>
            <DialogDescription>Preview how your form will look during execution</DialogDescription>
          </DialogHeader>
          <div className="p-8 border border-dashed rounded-lg text-center">
            <p className="text-sm text-muted-foreground">No blocks configured. Add blocks to see the preview.</p>
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button onClick={onClose} variant="outline">
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Form Preview</DialogTitle>
          <DialogDescription>Preview how your form will look during execution</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Card className="w-full">
            <CardHeader>
              <CardTitle>Form</CardTitle>
              <CardDescription>Fill required fields to continue</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={(e) => e.preventDefault()} className="w-full space-y-6">
                {blocks.map((block) => (
                  <div key={block.id} className={cn(block.compact ? "space-y-2" : "space-y-4")}>
                    {/* Block Title */}
                    {block.title && (
                      <div className={cn(block.compact ? "pt-1 pb-0.5" : "pt-2 pb-1")}>
                        <h3 className={cn("font-semibold border-b", block.compact ? "text-sm pb-0.5" : "text-base pb-1")}>
                          {block.title}
                        </h3>
                      </div>
                    )}
                    {/* Block Columns */}
                    <div
                      className={cn(
                        "grid",
                        block.compact ? "gap-2" : "gap-4",
                        block.columns === 1
                          ? "grid-cols-1"
                          : block.columns === 2
                          ? "grid-cols-1 md:grid-cols-2"
                          : block.columns === 3
                          ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                          : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
                      )}
                    >
                      {block.columns_content.map((column, colIndex) => {
                        const columnName = block.column_names?.[colIndex];
                        const labelPosition = block.label_positions?.[colIndex] || "top";
                        const columnContent = (
                          <div className={cn(block.compact ? "space-y-2" : "space-y-3 sm:space-y-4")}>
                            {column.map((fieldUuid) => renderField(fieldUuid, labelPosition))}
                          </div>
                        );

                        // If column has a name, wrap it in a group with background
                        if (columnName) {
                          return (
                            <div key={colIndex} className={cn("border rounded-md bg-muted/20", block.compact ? "p-2" : "p-3")}>
                              <div className={cn("border-b", block.compact ? "mb-1 pb-1" : "mb-2 pb-2")}>
                                <h4 className={cn("font-semibold", block.compact ? "text-xs" : "text-sm")}>{columnName}</h4>
                              </div>
                              {columnContent}
                            </div>
                          );
                        }

                        return <div key={colIndex}>{columnContent}</div>;
                      })}
                    </div>
                  </div>
                ))}
              </form>
            </CardContent>
          </Card>
        </div>
        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button onClick={onClose} variant="outline">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

