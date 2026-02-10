import * as React from "react";
import { Folder } from "lucide-react";

// Import icon sets dynamically
import * as FaIcons from "react-icons/fa";
import * as MdIcons from "react-icons/md";
import * as BsIcons from "react-icons/bs";
import * as HiIcons from "react-icons/hi";

/**
 * Get an icon component by name
 * Supports both lucide-react icons (for backward compatibility) and react-icons
 * React Icons format: "FaHome", "MdSettings", "BsFolder", "HiOutlineUser", etc.
 * Returns null if icon not found (instead of default) to allow checking existence
 */
export function getIconComponent(
  iconName: string | null,
  defaultIcon?: React.ComponentType<{ className?: string }>,
  returnDefaultOnNotFound: boolean = true
): React.ComponentType<{ className?: string }> | null {
  if (!iconName) {
    return defaultIcon || Folder;
  }

  // Try to get from react-icons dynamically based on prefix
  try {
    let Icon: React.ComponentType<{ className?: string }> | undefined;
    
    // Font Awesome icons (Fa*)
    if (iconName.startsWith("Fa")) {
      Icon = (FaIcons as any)[iconName];
    }
    // Material Design icons (Md*)
    else if (iconName.startsWith("Md")) {
      Icon = (MdIcons as any)[iconName];
    }
    // Bootstrap icons (Bs*)
    else if (iconName.startsWith("Bs")) {
      Icon = (BsIcons as any)[iconName];
    }
    // Heroicons (HiOutline*, HiSolid*, etc.)
    else if (iconName.startsWith("Hi")) {
      Icon = (HiIcons as any)[iconName];
    }
    
    if (Icon) return Icon;
  } catch {
    // Icon not found in react-icons
  }

  // Return default or null based on flag
  return returnDefaultOnNotFound ? (defaultIcon || Folder) : null;
}

/**
 * Render an icon component
 */
export function renderIcon(
  iconName: string | null,
  className: string = "h-4 w-4",
  defaultIcon?: React.ComponentType<{ className?: string }>
): React.ReactElement | null {
  const IconComponent = getIconComponent(iconName, defaultIcon);
  if (!IconComponent) return null;
  // Use React.createElement to avoid JSX in .ts file
  return React.createElement(IconComponent, { className });
}





