import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Folder } from "lucide-react";
import { cn } from "@/lib/utils";
import { renderIcon } from "@/lib/iconUtils";

interface CategoryCardProps {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  itemCount: number; // Number of workflows + subcategories
  onClick: () => void;
  className?: string;
}

export function CategoryCard({
  id,
  name,
  description,
  icon,
  itemCount,
  onClick,
  className,
}: CategoryCardProps) {
  const IconComponent = icon ? renderIcon(icon, "h-6 w-6 text-primary", Folder) : <Folder className="h-6 w-6 text-primary" />;

  return (
    <Card
      className={cn(
        "hover:shadow-lg transition-all duration-300 cursor-pointer group h-fit min-h-[280px] flex flex-col border-2 border-dashed hover:border-solid",
        className
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-3 flex-shrink-0">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex-shrink-0 flex items-center justify-center">{IconComponent}</div>
              <CardTitle className="text-lg leading-tight break-words">
                {name}
              </CardTitle>
            </div>
          </div>
        </div>
        <CardDescription className="text-sm leading-relaxed line-clamp-3 min-h-[3.5rem]">
          {description || "No description provided"}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0 flex-1 flex flex-col justify-end">
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span className="font-medium">
              {itemCount} {itemCount === 1 ? "item" : "items"}
            </span>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Folder className="h-3 w-3" />
              <span>Category</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


