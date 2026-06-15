import { SidebarTrigger } from "@/components/ui/sidebar";
import { NotificationBell } from "./NotificationBell";
import { useLocation, Link } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

export function Header() {
  const { t } = useLanguage();
  const location = useLocation();
  const pathnames = location.pathname.split("/").filter((x) => x);

  const segmentMap: Record<string, { labelKey: string; path?: string }> = {
    documents: { labelKey: "sidebar.documents", path: "/documents" },
    persons: { labelKey: "sidebar.persons", path: "/persons" },
    "document-types": { labelKey: "sidebar.documentTypes", path: "/document-types" },
    "split-pdf": { labelKey: "sidebar.splitPdf", path: "/documents/split-pdf" },
    "users-groups": { labelKey: "sidebar.usersGroups", path: "/users-groups" },
    "organization-settings": { labelKey: "sidebar.organizationSettings", path: "/organization-settings" },
    "user-settings": { labelKey: "sidebar.userSettings", path: "/user-settings" },
  };

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b bg-background px-4 lg:px-6">
      <SidebarTrigger className="-ml-1" />
      <div className="flex-1 flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/" className="hover:text-foreground transition-colors">
          <Home className="h-4 w-4" />
        </Link>
        {pathnames.map((name, index) => {
          const isLast = index === pathnames.length - 1;
          const segment = segmentMap[name];
          const label = segment ? t(segment.labelKey) : name;
          const routeTo = segment?.path || `/${pathnames.slice(0, index + 1).join("/")}`;

          return (
            <div key={`${name}-${index}`} className="flex items-center gap-2">
              <ChevronRight className="h-4 w-4 shrink-0" />
              {isLast ? (
                <span className="font-medium text-foreground truncate max-w-[150px]">
                  {label}
                </span>
              ) : (
                <Link
                  to={routeTo}
                  className="hover:text-foreground transition-colors whitespace-nowrap"
                >
                  {label}
                </Link>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-4">
        <NotificationBell />
      </div>
    </header>
  );
}
