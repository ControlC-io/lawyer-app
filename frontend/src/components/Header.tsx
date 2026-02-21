import { SidebarTrigger } from "@/components/ui/sidebar";
import { NotificationBell } from "./NotificationBell";
import { useLocation, Link } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { useCompanyId } from "@/hooks/useCompanyId";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function Header() {
  const { t } = useLanguage();
  const location = useLocation();
  const pathnames = location.pathname.split("/").filter((x) => x);
  const [workflowNameBySegment, setWorkflowNameBySegment] = useState<Record<string, string>>({});
  const [dataTableNameBySegment, setDataTableNameBySegment] = useState<Record<string, string>>({});

  // When the last segment is a UUID and we're on a workflow route (workflow or workflows), fetch workflow name
  const lastSegment = pathnames[pathnames.length - 1];
  const isWorkflowIdSegment =
    (pathnames.includes("workflow") || pathnames.includes("workflows")) &&
    lastSegment &&
    UUID_REGEX.test(lastSegment);

  // When the last segment is a UUID and we're on the data route, fetch data table name
  const isDataTableIdSegment =
    pathnames.includes("data") && lastSegment && UUID_REGEX.test(lastSegment);

  const companyId = useCompanyId();

  useEffect(() => {
    if (!isWorkflowIdSegment || !lastSegment || !companyId) {
      setWorkflowNameBySegment({});
      return;
    }
    let cancelled = false;
    api
      .get<{ name: string }>(`/api/companies/${companyId}/workflows/${lastSegment}`)
      .then((data) => {
        if (cancelled || !data?.name) return;
        setWorkflowNameBySegment((prev) => ({ ...prev, [lastSegment]: data.name }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isWorkflowIdSegment, lastSegment, companyId]);

  useEffect(() => {
    if (!isDataTableIdSegment || !lastSegment || !companyId) {
      setDataTableNameBySegment({});
      return;
    }
    let cancelled = false;
    api
      .get<Array<{ id: string; name: string }>>(`/api/companies/${companyId}/data-tables`)
      .then((list) => {
        if (cancelled || !list) return;
        const table = list.find((t) => t.id === lastSegment);
        if (table?.name) setDataTableNameBySegment((prev) => ({ ...prev, [lastSegment]: table.name }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isDataTableIdSegment, lastSegment, companyId]);

  // Mapping of URL segments to translation keys and correct navigation paths
  const segmentMap: Record<string, { labelKey: string; path?: string }> = {
    app: { labelKey: "sidebar.executions", path: "/" },
    executions: { labelKey: "sidebar.executions", path: "/" },
    workflows: { labelKey: "sidebar.workflows", path: "/workflows" },
    workflow: { labelKey: "sidebar.workflows", path: "/workflows" },
    data: { labelKey: "sidebar.data", path: "/data" },
    "execution-data": { labelKey: "sidebar.executionData", path: "/execution-data" },
    documents: { labelKey: "sidebar.documents", path: "/documents" },
    "api-configurations": { labelKey: "sidebar.apiConfigurations", path: "/api-configurations" },
    "agent-configurations": { labelKey: "sidebar.agentConfigurations", path: "/agent-configurations" },
    "agent-usage": { labelKey: "sidebar.agentUsage", path: "/agent-usage" },
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
          
          // If it's a known segment, use the mapped label and path
          // If it's a workflow ID, use resolved workflow name when available
          // If it's a data table ID, use resolved table name when available
          // Otherwise use the segment as-is (e.g. other IDs)
          const label = segment
            ? t(segment.labelKey)
            : (workflowNameBySegment[name] ?? dataTableNameBySegment[name] ?? name);
          const routeTo = segment?.path || `/${pathnames.slice(0, index + 1).join("/")}`;

          // Skip showing "app" if it's the first segment to avoid redundancy with Home
          if (name === "app" && index === 0 && pathnames.length > 1) return null;

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

