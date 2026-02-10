import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IconPicker } from "./IconPicker";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface WorkflowCategory {
  id: string;
  name: string;
  description: string | null;
  parent_category_id: string | null;
  icon: string | null;
  company_id: string;
}

interface CategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: WorkflowCategory | null;
  companyId: string;
  onSuccess: () => void;
  defaultParentCategoryId?: string | null;
}

export function CategoryDialog({
  open,
  onOpenChange,
  category,
  companyId,
  onSuccess,
  defaultParentCategoryId,
}: CategoryDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [parentCategoryId, setParentCategoryId] = useState<string | null>(null);
  const [icon, setIcon] = useState<string | null>(null);
  const [categories, setCategories] = useState<WorkflowCategory[]>([]);
  const [loading, setLoading] = useState(false);

  // Initialize form when dialog opens or when defaultParentCategoryId changes
  useEffect(() => {
    if (open) {
      fetchCategories();
      if (category) {
        // Editing existing category - use category data
        setName(category.name);
        setDescription(category.description || "");
        setParentCategoryId(category.parent_category_id);
        setIcon(category.icon);
      } else {
        // Creating new category - use defaultParentCategoryId prop
        setName("");
        setDescription("");
        // Always use the current defaultParentCategoryId prop value
        // This ensures the correct parent is preselected
        setParentCategoryId(defaultParentCategoryId ?? null);
        setIcon(null);
      }
    } else {
      // Reset when dialog closes
      setName("");
      setDescription("");
      setParentCategoryId(null);
      setIcon(null);
    }
  }, [open, category, defaultParentCategoryId]);

  // Effect to ensure parentCategoryId is set when defaultParentCategoryId prop changes
  // This is important because the prop might change after the dialog opens
  useEffect(() => {
    if (open && !category && defaultParentCategoryId && parentCategoryId !== defaultParentCategoryId) {
      setParentCategoryId(defaultParentCategoryId);
    }
  }, [open, category, defaultParentCategoryId, parentCategoryId]);

  const fetchCategories = async () => {
    try {
      const loadedCategories = await api.get<WorkflowCategory[]>(
        `/api/companies/${companyId}/workflow-categories`
      );
      setCategories(loadedCategories || []);

      if (!category && defaultParentCategoryId && (loadedCategories?.length ?? 0) > 0) {
        const categoryExists = loadedCategories?.some((cat) => cat.id === defaultParentCategoryId);
        if (categoryExists) setParentCategoryId(defaultParentCategoryId);
      }
    } catch (error) {
      console.error("Error fetching categories:", error);
      toast.error("Failed to load categories");
    }
  };

  // Get all ancestor IDs to prevent circular references
  const getAncestorIds = (categoryId: string, allCategories: WorkflowCategory[]): string[] => {
    const ancestors: string[] = [categoryId];
    let currentId = categoryId;

    while (currentId) {
      const current = allCategories.find((c) => c.id === currentId);
      if (current?.parent_category_id) {
        ancestors.push(current.parent_category_id);
        currentId = current.parent_category_id;
      } else {
        break;
      }
    }

    return ancestors;
  };

  // Filter out categories that would create circular references
  const getAvailableParentCategories = () => {
    if (!category) return categories;

    // Get all ancestors of the current category
    const ancestorIds = getAncestorIds(category.id, categories);
    
    // Filter out self and all ancestors
    return categories.filter(
      (c) => c.id !== category.id && !ancestorIds.includes(c.id)
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error("Category name is required");
      return;
    }

    setLoading(true);

    try {
      if (category) {
        await api.patch(`/api/companies/${companyId}/workflow-categories/${category.id}`, {
          name: name.trim(),
          description: description.trim() || null,
          parent_category_id: parentCategoryId || null,
          icon: icon,
        });
        toast.success("Category updated successfully");
      } else {
        await api.post(`/api/companies/${companyId}/workflow-categories`, {
          name: name.trim(),
          description: description.trim() || null,
          parent_category_id: parentCategoryId || null,
          icon: icon,
        });
        toast.success("Category created successfully");
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: unknown) {
      console.error("Error saving category:", error);
      toast.error(error instanceof Error ? error.message : "Failed to save category");
    } finally {
      setLoading(false);
    }
  };

  // Helper function to get category path for display
  const getCategoryPath = (catId: string | null): string => {
    if (!catId) return "None";
    const cat = categories.find((c) => c.id === catId);
    if (!cat) return "Unknown";
    
    // Build path by traversing up the tree
    const path: string[] = [];
    let current: WorkflowCategory | undefined = cat;
    
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

  const availableParents = getAvailableParentCategories();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {category ? "Edit Category" : "Create Category"}
          </DialogTitle>
          <DialogDescription>
            {category
              ? "Update category details"
              : "Create a new category to organize workflows"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="category-name">Name</Label>
            <Input
              id="category-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Category name"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category-description">Description</Label>
            <Textarea
              id="category-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Category description (optional)"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category-parent">Parent Category</Label>
            <Select
              value={parentCategoryId || "none"}
              onValueChange={(value) =>
                setParentCategoryId(value === "none" ? null : value)
              }
            >
              <SelectTrigger id="category-parent">
                <SelectValue placeholder="Select parent category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None (Root level)</SelectItem>
                {availableParents.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {getCategoryPath(cat.id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Leave as "None" to create a top-level category
            </p>
          </div>

          <div className="space-y-2">
            <Label>Icon</Label>
            <div className="w-full">
              <IconPicker value={icon} onChange={setIcon} className="w-full" />
            </div>
            <p className="text-xs text-muted-foreground">
              Choose an icon to visually identify this category
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading
                ? category
                  ? "Updating..."
                  : "Creating..."
                : category
                ? "Update"
                : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

