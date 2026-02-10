import { useState, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { X, Image } from "lucide-react";
import { cn } from "@/lib/utils";
import { getIconComponent, renderIcon } from "@/lib/iconUtils";

// Import icon sets to dynamically get all available icons
import * as FaIcons from "react-icons/fa";
import * as MdIcons from "react-icons/md";
import * as BsIcons from "react-icons/bs";
import * as HiIcons from "react-icons/hi";

/**
 * Dynamically get all available icons from react-icons
 * This function loads all icons from Font Awesome, Material Design, Bootstrap, and Heroicons
 */
function getAllAvailableIcons(): string[] {
  const allIcons: string[] = [];
  
  // Get all Font Awesome icons (Fa*)
  const faIconNames = Object.keys(FaIcons).filter(
    (key) => key.startsWith("Fa") && typeof (FaIcons as any)[key] === "function"
  );
  allIcons.push(...faIconNames);
  
  // Get all Material Design icons (Md*)
  const mdIconNames = Object.keys(MdIcons).filter(
    (key) => key.startsWith("Md") && typeof (MdIcons as any)[key] === "function"
  );
  allIcons.push(...mdIconNames);
  
  // Get all Bootstrap icons (Bs*)
  const bsIconNames = Object.keys(BsIcons).filter(
    (key) => key.startsWith("Bs") && typeof (BsIcons as any)[key] === "function"
  );
  allIcons.push(...bsIconNames);
  
  // Get all Heroicons (Hi*)
  const hiIconNames = Object.keys(HiIcons).filter(
    (key) => key.startsWith("Hi") && typeof (HiIcons as any)[key] === "function"
  );
  allIcons.push(...hiIconNames);
  
  // Sort icons alphabetically for consistent display
  return allIcons.sort();
}

interface IconPickerProps {
  value: string | null;
  onChange: (iconName: string | null) => void;
  trigger?: React.ReactNode;
  className?: string;
}

export function IconPicker({ value, onChange, trigger, className }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Dynamically load all available icons (cached with useMemo)
  const allAvailableIcons = useMemo(() => getAllAvailableIcons(), []);

  // Filter icons by search
  const filteredIcons = useMemo(() => {
    if (!search.trim()) {
      return allAvailableIcons;
    }
    
    const searchLower = search.toLowerCase();
    return allAvailableIcons.filter((iconName) => {
      return iconName.toLowerCase().includes(searchLower);
    });
  }, [allAvailableIcons, search]);

  const selectedIcon = value ? renderIcon(value, "h-4 w-4") : null;



  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger || (
          <Button
            type="button"
            variant="outline"
            className={cn("gap-2 w-full justify-start", className)}
          >
            {selectedIcon ? (
              <>
                {selectedIcon}
                <span className="text-xs text-muted-foreground">{value}</span>
              </>
            ) : (
              <>
                <Image className="h-4 w-4" />
                <span>Select Icon</span>
              </>
            )}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent 
        className="w-80 p-0" 
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="p-3 border-b">
          <Input
            placeholder="Search icons..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9"
          />
        </div>
        <div
          ref={scrollRef}
          data-scrollable
          className="overflow-y-scroll overflow-x-hidden [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-border/80"
          style={{
            height: '300px',
            maxHeight: '300px',
            scrollbarWidth: 'thin',
            scrollbarColor: 'hsl(var(--border)) hsl(var(--background))',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <div className="p-2">
            <div className="grid grid-cols-6 gap-2">
              {/* No icon option */}
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                  setSearch("");
                }}
                className={cn(
                  "flex flex-col items-center justify-center h-12 rounded-md border transition-colors",
                  !value
                    ? "border-primary bg-primary/10"
                    : "border-border hover:bg-accent"
                )}
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>

              {/* Icon grid */}
              {filteredIcons
                .map((iconName) => {
                  // Check if icon exists (don't return default on not found)
                  const IconComponent = getIconComponent(iconName, undefined, false);
                  // Skip if icon doesn't exist
                  if (!IconComponent) return null;

                  const isSelected = value === iconName;

                  return (
                    <button
                      key={iconName}
                      type="button"
                      onClick={() => {
                        onChange(iconName);
                        setOpen(false);
                        setSearch("");
                      }}
                      className={cn(
                        "flex flex-col items-center justify-center h-12 rounded-md border transition-colors",
                        isSelected
                          ? "border-primary bg-primary/10"
                          : "border-border hover:bg-accent"
                      )}
                      title={iconName}
                    >
                      <IconComponent className="h-4 w-4" />
                    </button>
                  );
                })
                .filter(Boolean)}
            </div>
            {filteredIcons.length === 0 && (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No icons found
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

