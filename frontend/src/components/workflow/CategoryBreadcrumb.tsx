import { ChevronRight, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { renderIcon } from "@/lib/iconUtils";

interface Category {
  id: string;
  name: string;
  icon: string | null;
  parent_category_id: string | null;
}

interface CategoryBreadcrumbProps {
  categories: Category[];
  onNavigate: (categoryId: string | null) => void;
  className?: string;
}

export function CategoryBreadcrumb({
  categories,
  onNavigate,
  className,
}: CategoryBreadcrumbProps) {
  // Get icon component from name
  const getIcon = (iconName: string | null) => {
    return renderIcon(iconName, "h-4 w-4");
  };

  const handleBreadcrumbClick = (categoryId: string | null) => {
    onNavigate(categoryId);
  };

  return (
    <nav className={cn("flex items-center gap-2 text-sm", className)}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => handleBreadcrumbClick(null)}
        className="h-8 px-2 gap-1.5"
      >
        <Home className="h-4 w-4" />
        <span>All Workflows</span>
      </Button>

      {categories.map((category, index) => {
        const IconComponent = getIcon(category.icon);
        return (
          <div key={category.id} className="flex items-center gap-2">
            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleBreadcrumbClick(category.id)}
              className="h-8 px-2 gap-1.5"
            >
              {IconComponent && <span className="flex-shrink-0 flex items-center justify-center">{IconComponent}</span>}
              <span>{category.name}</span>
            </Button>
          </div>
        );
      })}
    </nav>
  );
}


