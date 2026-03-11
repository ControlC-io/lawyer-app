import { useState } from "react";
import { Plus, Trash2, Settings, X, ChevronRight, ChevronLeft, Eye, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { WorkflowStep } from "@/pages/WorkflowEditor";
import { cn } from "@/lib/utils";
import { FieldRenderer } from "@/components/execution/form/FieldRenderer";
import { FormPageStepper } from "@/components/execution/FormPageStepper";
import { type FormBlock, type FormPage, type FieldRule, evaluateFieldRules } from "@/lib/formConfig";
import { useLanguage } from "@/contexts/LanguageContext";

interface FieldConfig {
  shown: boolean;
  readonly: boolean;
  allowed_file_types?: string[];
  allow_ai_extraction?: boolean;
  compact_mode?: boolean; // For array fields: display in table format with labels only in header
  array_child_fields?: Record<string, { shown: boolean; required: boolean; readonly?: boolean }>; // For array fields: configuration for child fields
  array_enable_duplicate?: boolean; // For array fields: show duplicate row button (default true)
  array_enable_add_item?: boolean; // For array fields: show add item button (default true)
  array_enable_delete?: boolean; // For array fields: show delete row button (default true)
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
  onGoToDataStructure?: () => void;
}

export function FormBlocksEditor({ step, dataStructureItems, onUpdate, fullDataStructure, onGoToDataStructure }: FormBlocksEditorProps) {
  const { t } = useLanguage();
  // Parse form_pages from config, or migrate from form_blocks / form_fields
  const [pages, setPages] = useState<FormPage[]>(() => {
    if (step.config.form_pages && Array.isArray(step.config.form_pages) && step.config.form_pages.length > 0) {
      return step.config.form_pages as FormPage[];
    }
    if (step.config.form_blocks && Array.isArray(step.config.form_blocks)) {
      return [
        {
          id: crypto.randomUUID(),
          title: undefined,
          blocks: step.config.form_blocks as FormBlock[],
        },
      ];
    }
    if (step.config.form_fields) {
      const oldFields = Object.keys(step.config.form_fields).filter(
        (fieldId) => step.config.form_fields[fieldId]?.shown === true
      );
      if (oldFields.length > 0) {
        return [
          {
            id: crypto.randomUUID(),
            title: undefined,
            blocks: [
              {
                id: crypto.randomUUID(),
                title: "",
                columns: 1,
                columns_content: [oldFields],
                column_names: [],
                label_positions: ["top"],
              },
            ],
          },
        ];
      }
    }
    return [{ id: crypto.randomUUID(), title: undefined, blocks: [] }];
  });

  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [editingBlockTitleId, setEditingBlockTitleId] = useState<string | null>(null);
  const [editingPageTitleId, setEditingPageTitleId] = useState<string | null>(null);
  const [editingColumnNameKey, setEditingColumnNameKey] = useState<{
    pageId: string;
    blockId: string;
    columnIndex: number;
  } | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Get all field IDs that are in pages → blocks (visible fields)
  const visibleFieldIds = new Set<string>();
  pages.forEach((page) => {
    page.blocks.forEach((block) => {
      block.columns_content.forEach((column) => {
        column.forEach((fieldId) => visibleFieldIds.add(fieldId));
      });
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
      readonly: false,
      allowed_file_types: ["all"],
      allow_ai_extraction: false,
      compact_mode: false,
      array_enable_duplicate: true,
      array_enable_add_item: true,
      array_enable_delete: true,
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
        form_pages: pages,
      },
    });
  };

  // Update pages and persist form_pages
  const updatePages = (newPages: FormPage[]) => {
    setPages(newPages);
    const formFields = step.config.form_fields || {};
    const updatedFormFields = { ...formFields };
    newPages.forEach((page) => {
      page.blocks.forEach((block) => {
        block.columns_content.forEach((column) => {
          column.forEach((fieldId) => {
            if (!updatedFormFields[fieldId]) {
              updatedFormFields[fieldId] = {
                shown: true,
                readonly: false,
              };
            } else {
              updatedFormFields[fieldId] = {
                ...updatedFormFields[fieldId],
                shown: true,
              };
            }
          });
        });
      });
    });
    onUpdate({
      ...step,
      config: {
        ...step.config,
        form_fields: updatedFormFields,
        form_pages: newPages,
      },
    });
  };

  // Add new page
  const addPage = () => {
    const newPage: FormPage = {
      id: crypto.randomUUID(),
      title: undefined,
      blocks: [],
    };
    updatePages([...pages, newPage]);
  };

  // Delete page
  const deletePage = (pageId: string) => {
    const pageToDelete = pages.find((p) => p.id === pageId);
    const newPages = pages.filter((p) => p.id !== pageId);
    if (pageToDelete) {
      const formFields = step.config.form_fields || {};
      const updatedFormFields = { ...formFields };
      pageToDelete.blocks.forEach((block) => {
        block.columns_content.forEach((column) => {
          column.forEach((fieldId) => {
            const isFieldInOtherBlocks = newPages.some((page) =>
              page.blocks.some((b) => b.columns_content.some((col) => col.includes(fieldId)))
            );
            if (!isFieldInOtherBlocks) {
              updatedFormFields[fieldId] = {
                ...(updatedFormFields[fieldId] || {}),
                shown: false,
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
          form_pages: newPages,
        },
      });
      setPages(newPages);
    }
  };

  // Update page (e.g. title)
  const updatePage = (pageId: string, updates: Partial<Pick<FormPage, "title">>) => {
    const newPages = pages.map((p) => (p.id === pageId ? { ...p, ...updates } : p));
    updatePages(newPages);
  };

  // Add new block to a page
  const addBlock = (pageId: string) => {
    const newBlock: FormBlock = {
      id: crypto.randomUUID(),
      title: "",
      columns: 1,
      columns_content: [[]],
      column_names: [],
      label_positions: ["top"],
    };
    const newPages = pages.map((p) =>
      p.id === pageId ? { ...p, blocks: [...p.blocks, newBlock] } : p
    );
    updatePages(newPages);
  };

  // Delete block from a page
  const deleteBlock = (pageId: string, blockId: string) => {
    const page = pages.find((p) => p.id === pageId);
    const blockToDelete = page?.blocks.find((b) => b.id === blockId);
    if (!page || !blockToDelete) return;
    const newBlocks = page.blocks.filter((b) => b.id !== blockId);
    const newPages = pages.map((p) => (p.id === pageId ? { ...p, blocks: newBlocks } : p));
    const formFields = step.config.form_fields || {};
    const updatedFormFields = { ...formFields };
    blockToDelete.columns_content.forEach((column) => {
      column.forEach((fieldId) => {
        const isFieldInOtherBlocks = newPages.some((pg) =>
          pg.blocks.some((b) => b.columns_content.some((col) => col.includes(fieldId)))
        );
        if (!isFieldInOtherBlocks) {
          updatedFormFields[fieldId] = {
            ...(updatedFormFields[fieldId] || {}),
            shown: false,
          };
        }
      });
    });
    onUpdate({
      ...step,
      config: {
        ...step.config,
        form_fields: updatedFormFields,
        form_pages: newPages,
      },
    });
    setPages(newPages);
  };

  // Update block properties
  const updateBlock = (pageId: string, blockId: string, updates: Partial<FormBlock>) => {
    const newPages = pages.map((p) => {
      if (p.id !== pageId) return p;
      return {
        ...p,
        blocks: p.blocks.map((block) => {
          if (block.id !== blockId) return block;
          const updated = { ...block, ...updates };
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
              newColumnNames.push(block.column_names?.[i] ?? "");
              newLabelPositions.push(block.label_positions?.[i] ?? "top");
            }
            updated.columns_content = newColumnsContent;
            updated.column_names = newColumnNames;
            updated.label_positions = newLabelPositions;
          }
          return updated;
        }),
      };
    });
    updatePages(newPages);
  };

  // Add field to column
  const addFieldToColumn = (pageId: string, blockId: string, columnIndex: number, fieldId: string) => {
    const newPages = pages.map((p) => {
      if (p.id !== pageId) return p;
      return {
        ...p,
        blocks: p.blocks.map((block) => {
          if (block.id !== blockId) return block;
          const newColumnsContent = [...block.columns_content];
          newColumnsContent[columnIndex] = [...newColumnsContent[columnIndex], fieldId];
          return { ...block, columns_content: newColumnsContent };
        }),
      };
    });
    const formFields = step.config.form_fields || {};
    const fieldConfig = formFields[fieldId] || {
      shown: true,
      readonly: false,
    };
    onUpdate({
      ...step,
      config: {
        ...step.config,
        form_fields: {
          ...formFields,
          [fieldId]: { ...fieldConfig, shown: true },
        },
        form_pages: newPages,
      },
    });
    setPages(newPages);
  };

  // Remove field from column
  const removeFieldFromColumn = (pageId: string, blockId: string, columnIndex: number, fieldIndex: number) => {
    const page = pages.find((p) => p.id === pageId);
    const block = page?.blocks.find((b) => b.id === blockId);
    const removedFieldId = block?.columns_content[columnIndex]?.[fieldIndex];
    const newPages = pages.map((p) => {
      if (p.id !== pageId) return p;
      return {
        ...p,
        blocks: p.blocks.map((b) => {
          if (b.id !== blockId) return b;
          const newColumnsContent = [...b.columns_content];
          newColumnsContent[columnIndex] = newColumnsContent[columnIndex].filter((_, i) => i !== fieldIndex);
          return { ...b, columns_content: newColumnsContent };
        }),
      };
    });
    if (removedFieldId) {
      const isFieldInOtherBlocks = newPages.some((p) =>
        p.blocks.some((b) => b.columns_content.some((col) => col.includes(removedFieldId)))
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
                shown: false,
              },
            },
            form_pages: newPages,
          },
        });
        setPages(newPages);
        return;
      }
    }
    updatePages(newPages);
  };

  // Get field info
  const getFieldInfo = (fieldId: string) => {
    return dataStructureItems.find((item) => item.id === fieldId);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Label>Form structure: Pages → Blocks → Fields</Label>
          <p className="text-xs text-muted-foreground mt-1">
            Organize the form into pages, each containing blocks with customizable columns
          </p>
        </div>
        <div className="flex items-center gap-2">
          {onGoToDataStructure && (
            <Button onClick={onGoToDataStructure} size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground" title={t("workflowEditor.goToDataStructureTitle")}>
              <Database className="h-4 w-4 mr-2" />
              {t("workflowEditor.goToDataStructure")}
            </Button>
          )}
          <Button onClick={() => setShowPreview(true)} size="sm" variant="outline">
            <Eye className="h-4 w-4 mr-2" />
            Preview Form
          </Button>
        </div>
      </div>

      {pages.length === 0 ? (
        <div className="p-8 border border-dashed rounded-lg text-center">
          <p className="text-sm text-muted-foreground mb-4">No pages configured</p>
          <Button onClick={addPage} size="sm" variant="outline">
            <Plus className="h-4 w-4 mr-2" />
            Create First Page
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {pages.map((page, pageIndex) => (
            <div key={page.id} className="border rounded-lg bg-card overflow-hidden">
              {/* Page Header */}
              <div className="p-4 border-b bg-muted/50 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="font-semibold text-base shrink-0">Page {pageIndex + 1}</span>
                  <span className="text-muted-foreground font-normal shrink-0"> — </span>
                  {editingPageTitleId === page.id ? (
                    <Input
                      className="h-8 flex-1 min-w-0 max-w-sm font-normal"
                      placeholder="Page title (optional)"
                      defaultValue={page.title ?? ""}
                      autoFocus
                      onBlur={(e) => {
                        const value = e.target.value.trim();
                        updatePage(page.id, { title: value || undefined });
                        setEditingPageTitleId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.currentTarget.blur();
                        }
                        if (e.key === "Escape") {
                          setEditingPageTitleId(null);
                        }
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditingPageTitleId(page.id)}
                      className={cn(
                        "text-left font-normal min-w-0 flex-1 rounded px-1.5 py-0.5 -mx-1.5 -my-0.5",
                        "hover:bg-muted transition-colors",
                        !page.title && "text-muted-foreground/80 italic"
                      )}
                    >
                      {page.title || "Click to add page title"}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    onClick={() => deletePage(page.id)}
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive h-8 w-8 p-0"
                    title="Delete page"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Blocks in this page */}
              <div className="p-4 space-y-4">
                {page.blocks.length === 0 ? (
                  <div className="py-6 border border-dashed rounded-lg text-center">
                    <p className="text-sm text-muted-foreground mb-2">No blocks in this page</p>
                  </div>
                ) : (
                  page.blocks.map((block, blockIndex) => (
                    <div key={block.id} className="border rounded-lg bg-muted/20">
                      <div className="p-3 border-b bg-muted/30 flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="font-medium text-sm shrink-0">Block {blockIndex + 1}</span>
                          <span className="text-muted-foreground shrink-0"> — </span>
                          {editingBlockTitleId === block.id ? (
                            <Input
                              className="h-7 flex-1 min-w-0 max-w-xs text-sm font-normal"
                              placeholder="Block title (optional)"
                              defaultValue={block.title ?? ""}
                              autoFocus
                              onBlur={(e) => {
                                const value = e.target.value.trim();
                                updateBlock(page.id, block.id, { title: value || undefined });
                                setEditingBlockTitleId(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") e.currentTarget.blur();
                                if (e.key === "Escape") setEditingBlockTitleId(null);
                              }}
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => setEditingBlockTitleId(block.id)}
                              className={cn(
                                "text-sm text-left font-normal min-w-0 flex-1 rounded px-1.5 py-0.5 -mx-1.5 -my-0.5",
                                "hover:bg-muted transition-colors text-muted-foreground",
                                !block.title && "italic"
                              )}
                            >
                              {block.title || "Click to add block title"}
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                          <span className="text-xs text-muted-foreground">Columns</span>
                          <Select
                            value={block.columns.toString()}
                            onValueChange={(v) =>
                              updateBlock(page.id, block.id, { columns: parseInt(v) as 1 | 2 | 3 | 4 })
                            }
                          >
                            <SelectTrigger className="h-7 w-14 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">1</SelectItem>
                              <SelectItem value="2">2</SelectItem>
                              <SelectItem value="3">3</SelectItem>
                              <SelectItem value="4">4</SelectItem>
                            </SelectContent>
                          </Select>
                          <label className="flex items-center gap-1.5 text-xs cursor-pointer whitespace-nowrap">
                            <Checkbox
                              checked={block.compact ?? false}
                              onCheckedChange={(checked) =>
                                updateBlock(page.id, block.id, { compact: !!checked })
                              }
                              className="h-3.5 w-3.5"
                            />
                            Compact
                          </label>
                          <Button
                            onClick={() => deleteBlock(page.id, block.id)}
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive h-7 w-7 p-0"
                            title="Delete block"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="p-3">
                        <div
                          className={cn(
                            "grid gap-4",
                            block.columns === 1 && "grid-cols-1",
                            block.columns === 2 && "grid-cols-2",
                            block.columns === 3 && "grid-cols-3",
                            block.columns === 4 && "grid-cols-4"
                          )}
                        >
                          {Array.from({ length: block.columns }).map((_, colIndex) => {
                            const isEditingColName =
                              editingColumnNameKey?.pageId === page.id &&
                              editingColumnNameKey?.blockId === block.id &&
                              editingColumnNameKey?.columnIndex === colIndex;
                            const columnName = block.column_names?.[colIndex] ?? "";
                            const labelPosition = block.label_positions?.[colIndex] ?? "top";
                            return (
                            <div key={colIndex} className="space-y-2 min-h-[80px] border rounded-md p-3 bg-background/50">
                              <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                  <span className="text-xs font-medium text-muted-foreground shrink-0">
                                    Column {colIndex + 1}
                                  </span>
                                  <span className="text-muted-foreground/70 shrink-0"> — </span>
                                  {isEditingColName ? (
                                    <Input
                                      className="h-6 flex-1 min-w-0 max-w-[140px] text-xs font-normal"
                                      placeholder="Column name (optional)"
                                      defaultValue={columnName}
                                      autoFocus
                                      onBlur={(e) => {
                                        const value = e.target.value.trim();
                                        const newNames = [...(block.column_names || [])];
                                        while (newNames.length <= colIndex) newNames.push("");
                                        newNames[colIndex] = value;
                                        updateBlock(page.id, block.id, { column_names: newNames });
                                        setEditingColumnNameKey(null);
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") e.currentTarget.blur();
                                        if (e.key === "Escape") setEditingColumnNameKey(null);
                                      }}
                                    />
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setEditingColumnNameKey({
                                          pageId: page.id,
                                          blockId: block.id,
                                          columnIndex: colIndex,
                                        })
                                      }
                                      className={cn(
                                        "text-xs text-left font-normal min-w-0 flex-1 rounded px-1 py-0.5 -mx-1 -my-0.5",
                                        "hover:bg-muted transition-colors text-muted-foreground/90",
                                        !columnName && "italic"
                                      )}
                                    >
                                      {columnName || "Click to add column name"}
                                    </button>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <Select
                                    value={labelPosition}
                                    onValueChange={(v: "top" | "side") => {
                                      const newPositions = [...(block.label_positions || [])];
                                      while (newPositions.length <= colIndex)
                                        newPositions.push("top");
                                      newPositions[colIndex] = v;
                                      updateBlock(page.id, block.id, {
                                        label_positions: newPositions,
                                      });
                                    }}
                                  >
                                    <SelectTrigger className="h-6 w-20 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="top">Above</SelectItem>
                                      <SelectItem value="side">Beside</SelectItem>
                                    </SelectContent>
                                  </Select>
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
                                        onClick={() => removeFieldFromColumn(page.id, block.id, colIndex, fieldIndex)}
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
                                  <div className="text-xs text-muted-foreground text-center py-3 border border-dashed rounded">
                                    No fields
                                  </div>
                                )}
                              </div>
                              {availableFields.length > 0 && (
                                <Select
                                  value=""
                                  onValueChange={(fieldId) =>
                                    addFieldToColumn(page.id, block.id, colIndex, fieldId)
                                  }
                                >
                                  <SelectTrigger className="w-full border-dashed h-9 text-xs mt-1">
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
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <Button onClick={() => addBlock(page.id)} size="sm" variant="outline" className="w-full border-dashed">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Block
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {pages.length > 0 && (
        <Button onClick={addPage} size="sm" variant="outline" className="w-full border-dashed">
          <Plus className="h-4 w-4 mr-2" />
          Add Page
        </Button>
      )}

      {/* Field Settings Dialog */}
      {editingFieldId && (
        <FieldSettingsDialog
          fieldId={editingFieldId}
          fieldInfo={getFieldInfo(editingFieldId)!}
          fieldConfig={getFieldConfig(editingFieldId)}
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
          pages={pages}
          dataStructureItems={dataStructureItems}
          formFields={step.config.form_fields || {}}
          fieldRules={(step.config.field_rules as FieldRule[] | undefined) ?? []}
          fullDataStructure={fullDataStructure}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
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
  fullDataStructure?: any[];
  onUpdate: (updates: Partial<FieldConfig>) => void;
  onClose: () => void;
}

function FieldSettingsDialog({
  fieldId,
  fieldInfo,
  fieldConfig,
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
            <div className="flex gap-3">
              <label
                className={cn(
                  "flex items-center gap-2 p-3 rounded-md border text-sm font-medium cursor-pointer transition-colors",
                  fieldConfig.readonly
                    ? "bg-primary/5 border-primary/20 text-primary"
                    : "hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <Checkbox
                  checked={fieldConfig.readonly}
                  onCheckedChange={(checked) => onUpdate({ readonly: !!checked })}
                  className="h-4 w-4"
                />
                Read-only
              </label>
            </div>
          </div>

          {/* File Settings */}
          {fieldInfo.field_type === "file" && (
            <div className="space-y-4 pt-4 border-t">
              <Label className="text-sm font-semibold">File Settings</Label>
              <div className="space-y-4">
                <div className="space-y-3">
                  <Label className="text-xs font-medium">Allowed File Types</Label>
                  <p className="text-xs text-muted-foreground">
                    Choose &quot;All&quot; or one or more specific types; &quot;All&quot; cannot be combined with specific types. At least one option must be selected.
                  </p>
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={fieldConfig.allowed_file_types?.includes("image")}
                        onCheckedChange={(checked) => {
                          const current = fieldConfig.allowed_file_types || ["all"];
                          const withoutAll = current.filter((t) => t !== "all");
                          let updated = checked
                            ? [...withoutAll, "image"]
                            : withoutAll.filter((t) => t !== "image");
                          if (updated.length === 0) updated = ["all"];
                          onUpdate({ allowed_file_types: updated });
                        }}
                      />
                      Pictures
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={fieldConfig.allowed_file_types?.includes("pdf")}
                        onCheckedChange={(checked) => {
                          const current = fieldConfig.allowed_file_types || ["all"];
                          const withoutAll = current.filter((t) => t !== "all");
                          let updated = checked
                            ? [...withoutAll, "pdf"]
                            : withoutAll.filter((t) => t !== "pdf");
                          if (updated.length === 0) updated = ["all"];
                          onUpdate({ allowed_file_types: updated });
                        }}
                      />
                      PDF
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={
                          !fieldConfig.allowed_file_types?.length || fieldConfig.allowed_file_types?.includes("all")
                        }
                        onCheckedChange={(checked) => {
                          const current = fieldConfig.allowed_file_types || ["all"];
                          const updated = checked ? ["all"] : current.filter((t) => t !== "all");
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

              {/* Array row actions: duplicate, add item, delete */}
              <div className="space-y-2 pt-2">
                <Label className="text-sm font-medium">Row actions</Label>
                <p className="text-xs text-muted-foreground">
                  Enable or disable duplication, add item, and row deletion in the form
                </p>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={fieldConfig.array_enable_duplicate !== false}
                      onCheckedChange={(checked) => onUpdate({ array_enable_duplicate: !!checked })}
                    />
                    <span>Enable row duplication</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={fieldConfig.array_enable_add_item !== false}
                      onCheckedChange={(checked) => onUpdate({ array_enable_add_item: !!checked })}
                    />
                    <span>Enable add item</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={fieldConfig.array_enable_delete !== false}
                      onCheckedChange={(checked) => onUpdate({ array_enable_delete: !!checked })}
                    />
                    <span>Enable row deletion</span>
                  </label>
                </div>
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
                      Select which child fields to show, require, or make read-only in array items
                    </p>
                    <div className="space-y-2 border rounded-md p-3 bg-muted/20">
                      {childFields.map((childField: any) => {
                        const childConfig = arrayChildFields[childField.id] || { shown: true, required: false, readonly: false };
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
                              <label className="flex items-center gap-2 text-sm cursor-pointer">
                                <Checkbox
                                  checked={!!childConfig.readonly}
                                  disabled={!childConfig.shown}
                                  onCheckedChange={(checked) => {
                                    const updated = {
                                      ...arrayChildFields,
                                      [childField.id]: {
                                        ...childConfig,
                                        readonly: !!checked,
                                      },
                                    };
                                    onUpdate({ array_child_fields: updated });
                                  }}
                                />
                                <span className="text-xs">Read only</span>
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
  pages: FormPage[];
  dataStructureItems: Array<{
    id: string;
    name: string;
    data_structure_name: string;
    field_type?: string;
  }>;
  formFields: Record<string, FieldConfig>;
  fieldRules: FieldRule[];
  fullDataStructure?: any[];
  onClose: () => void;
}

function FormPreviewDialog({ pages, dataStructureItems, formFields, fieldRules, fullDataStructure, onClose }: FormPreviewDialogProps) {
  const [previewValues, setPreviewValues] = useState<Record<string, any>>({});
  const [formPageIndex, setFormPageIndex] = useState(0);

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
      readonly: false,
      allowed_file_types: ["all"],
      allow_ai_extraction: false,
      compact_mode: false,
      array_enable_duplicate: true,
      array_enable_add_item: true,
      array_enable_delete: true,
    };
  };

  // Render a single field
  const renderField = (fieldId: string, labelPosition: "top" | "side" = "top") => {
    const fieldConfig = getFieldConfig(fieldId);
    if (fieldConfig?.shown === false) return null;

    // Check visibility via centralized rules
    const isVisible = evaluateFieldRules(fieldId, "visibility", fieldRules, previewValues, true);
    if (!isVisible) return null;

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

    const disabled = fieldConfig?.readonly === true;
    const required = evaluateFieldRules(fieldId, "required", fieldRules, previewValues, false);

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
        renderChild={(childField, childValue, onChildChange, hideLabel, required, readonly) => {
          // Use required from configuration if provided, otherwise fallback to field's own required property
          const isRequired = required !== undefined ? required : (childField.required || false);
          const isDisabled = disabled || !!readonly;
          return (
            <FieldRenderer
              field={childField}
              value={childValue}
              onChange={onChildChange}
              disabled={isDisabled}
              required={isRequired}
              labelPosition={hideLabel ? "hidden" : "top"}
            />
          );
        }}
        fieldConfig={fieldConfig}
      />
    );
  };

  const hasAnyBlocks = pages.some((p) => p.blocks.length > 0);

  if (!hasAnyBlocks) {
    return (
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Form Preview</DialogTitle>
            <DialogDescription>Preview how your form will look during execution</DialogDescription>
          </DialogHeader>
          <div className="p-8 border border-dashed rounded-lg text-center">
            <p className="text-sm text-muted-foreground">No pages or blocks configured. Add pages and blocks to see the preview.</p>
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
          <DialogDescription>Preview how your form will look during execution (page → block → fields)</DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Card className="w-full">
            <CardHeader>
              <CardTitle>Form</CardTitle>
              <CardDescription>Fill required fields to continue</CardDescription>
            </CardHeader>
            <CardContent>
              <FormPageStepper
                pages={pages}
                currentIndex={formPageIndex}
                onPageChange={setFormPageIndex}
                getStepLabel={(page, idx) => page.title || `Page ${idx + 1}`}
                className="mb-6"
              />
              <form onSubmit={(e) => e.preventDefault()} className="w-full space-y-6">
                {(() => {
                  const currentIndex = Math.min(Math.max(0, formPageIndex), pages.length - 1);
                  const page = pages[currentIndex];
                  if (!page) return null;
                  return (
                    <div key={page.id} className="space-y-4">
                      {page.blocks.map((block) => (
                        <div key={block.id} className={cn(block.compact ? "space-y-2" : "space-y-4")}>
                          {block.title && (
                            <div className={cn(block.compact ? "pt-1 pb-0.5" : "pt-2 pb-1")}>
                              <h3 className={cn("font-semibold border-b", block.compact ? "text-sm pb-0.5" : "text-base pb-1")}>
                                {block.title}
                              </h3>
                            </div>
                          )}
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
                    </div>
                  );
                })()}
              </form>
              {pages.length > 1 && (
                <div className="flex items-center justify-between gap-4 mt-4 pt-4 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={formPageIndex <= 0}
                    onClick={() => setFormPageIndex((i) => Math.max(0, i - 1))}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {formPageIndex + 1} / {pages.length}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={formPageIndex >= pages.length - 1}
                    onClick={() => setFormPageIndex((i) => Math.min(pages.length - 1, i + 1))}
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              )}
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

