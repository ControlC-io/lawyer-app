import { Link, useLocation } from "react-router-dom";
import { Workflow, Users, Building2, PlayCircle, FolderOpen, LogOut, Settings, Network, Play, Bot, BarChart2, Database, Sun, Globe, User, Table2, Variable, Archive } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CompanySwitcher } from "@/components/CompanySwitcher";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";
import { StartWorkflowDialog } from "@/components/workflow/StartWorkflowDialog";
import { useTheme } from "next-themes";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { LanguageSelector } from "@/components/LanguageSelector";
import { useLanguage } from "@/contexts/LanguageContext";
import { FeedbackDialog } from "@/components/FeedbackDialog";

type MenuItem = { titleKey: string; url: string; icon: typeof Workflow; permission?: string };

const menuSections: { groupLabelKey: string; items: MenuItem[] }[] = [
  {
    groupLabelKey: "sidebar.groupWorkflows",
    items: [
      { titleKey: "sidebar.executions", url: "/", icon: PlayCircle },
      { titleKey: "sidebar.workflows", url: "/workflows", icon: Workflow, permission: "workflows.manage" },
    ],
  },
  {
    groupLabelKey: "sidebar.groupData",
    items: [
      { titleKey: "sidebar.executionData", url: "/execution-data", icon: Database, permission: "execution_data.view" },
      { titleKey: "sidebar.data", url: "/data", icon: Table2, permission: "data.view" },
      { titleKey: "sidebar.globalVariables", url: "/data/global-variables", icon: Variable, permission: "variables.view" },
    ],
  },
  {
    groupLabelKey: "sidebar.groupResources",
    items: [
      { titleKey: "sidebar.documents", url: "/documents", icon: FolderOpen, permission: "documents.view" },
      { titleKey: "sidebar.apiConfigurations", url: "/api-configurations", icon: Network, permission: "api_config.manage" },
    ],
  },
  {
    groupLabelKey: "sidebar.groupAdministration",
    items: [
      { titleKey: "sidebar.usersGroups", url: "/users-groups", icon: Users, permission: "users_groups.manage" },
      { titleKey: "sidebar.userSettings", url: "/user-settings", icon: User },
      { titleKey: "sidebar.organizationSettings", url: "/organization-settings", icon: Settings, permission: "org_settings.manage" },
    ],
  },
];

export function AppSidebar() {
  const { open } = useSidebar();
  const {
    signOut,
    profile,
    loading,
    userCompanies,
    isSuperAdmin,
    isCompanyAdmin,
    hasPermission,
    companyBranding,
    selectedCompanyId,
  } = useAuth();
  const location = useLocation();
  const [startWorkflowDialogOpen, setStartWorkflowDialogOpen] = useState(false);
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";
  const { t, language } = useLanguage();

  console.log("[AppSidebar] Render - loading:", loading);

  const isItemActive = (item: MenuItem) => {
    const isExecutions = item.titleKey === "sidebar.executions";
    const isData = item.titleKey === "sidebar.data";
    const isGlobalVariables = item.titleKey === "sidebar.globalVariables";
    return isExecutions
      ? location.pathname === "/" || location.pathname === "/executions" || location.pathname.startsWith("/executions/")
      : isData
        ? (location.pathname === "/data" || location.pathname.startsWith("/data/")) && location.pathname !== "/data/global-variables"
        : isGlobalVariables
          ? location.pathname === "/data/global-variables"
          : location.pathname === item.url || location.pathname.startsWith(`${item.url}/`);
  };
  const customLogoUrl = companyBranding?.internal_logo_url ?? "";
  const shouldUseFallbackLogo = logoLoadFailed || !customLogoUrl;
  const sidebarLogoSrc = shouldUseFallbackLogo
    ? (open ? "/logo.png" : "/favicon.png")
    : customLogoUrl;
  const sidebarLogoAlt = open ? "Company logo" : "Company icon";
  const showSidebarLogo = open || shouldUseFallbackLogo;

  const handleLogoError = () => {
    if (!logoLoadFailed) {
      setLogoLoadFailed(true);
    }
  };

  useEffect(() => {
    setLogoLoadFailed(false);
  }, [customLogoUrl]);

  return (
    <>
      <Sidebar collapsible="icon" className="border-r border-sidebar-border" style={{ overflow: 'visible' }}>
        <SidebarHeader className="border-b border-sidebar-border p-4 flex flex-row items-center justify-center">
          <div className="flex items-center gap-2">
            {showSidebarLogo && (
              <img
                src={sidebarLogoSrc}
                alt={sidebarLogoAlt}
                className="h-8"
                onError={handleLogoError}
              />
            )}
          </div>
        </SidebarHeader>
        <SidebarContent>
          {/* Start Workflow CTA */}
          <SidebarGroup>
            <SidebarGroupContent>
              <div className="mb-4 pb-4 border-b border-sidebar-border">
                {open ? (
                  <Button
                    onClick={() => setStartWorkflowDialogOpen(true)}
                    className="w-full bg-brand-gradient text-white hover:opacity-90 shadow-md transition-all"
                    size="default"
                  >
                    <Play className="h-4 w-4 mr-2" />
                    {t("sidebar.startWorkflow")}
                  </Button>
                ) : (
                  <Button
                    onClick={() => setStartWorkflowDialogOpen(true)}
                    className="w-full bg-brand-gradient text-white hover:opacity-90 shadow-md transition-all"
                    size="icon"
                    title={t("sidebar.startWorkflow")}
                  >
                    <Play className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </SidebarGroupContent>
          </SidebarGroup>

          {menuSections.map((section) => {
            const visibleItems = section.items.filter(
              (item) => !item.permission || hasPermission(item.permission)
            );
            const hasExtraAdminItem =
              section.groupLabelKey === "sidebar.groupAdministration" && hasPermission("usage.view");
            const hasVisibleLinks = visibleItems.length > 0 || hasExtraAdminItem;

            if (!hasVisibleLinks) return null;

            return (
              <SidebarGroup key={section.groupLabelKey}>
                <SidebarGroupLabel>{t(section.groupLabelKey)}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {visibleItems.map((item) => {
                      const isExecutions = item.titleKey === "sidebar.executions";
                      return (
                        <SidebarMenuItem key={item.titleKey}>
                          <SidebarMenuButton
                            asChild
                            isActive={isItemActive(item)}
                            className={isExecutions ? "bg-sidebar-accent/50 hover:bg-sidebar-accent font-semibold border-l-2 border-primary" : ""}
                          >
                            <Link to={item.url}>
                              <item.icon className="h-4 w-4" />
                              {open && <span>{t(item.titleKey)}</span>}
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                    {hasExtraAdminItem && (
                      <SidebarMenuItem>
                        <SidebarMenuButton asChild isActive={location.pathname === "/agent-usage"}>
                          <Link to="/agent-usage">
                            <BarChart2 className="h-4 w-4" />
                            {open && <span>{t("sidebar.agentUsage")}</span>}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          })}

          {isSuperAdmin && (
            <SidebarGroup>
              <SidebarGroupLabel>{t("sidebar.groupSuperAdministration")}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location.pathname === "/agent-configurations"}>
                      <Link to="/agent-configurations">
                        <Bot className="h-4 w-4" />
                        {open && <span>{t("sidebar.agentConfigurations")}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location.pathname === "/companies"}>
                      <Link to="/companies">
                        <Building2 className="h-4 w-4" />
                        {open && <span>{t("sidebar.companies")}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={location.pathname === "/archived-records"}>
                      <Link to="/archived-records">
                        <Archive className="h-4 w-4" />
                        {open && <span>{t("sidebar.archivedRecords")}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </SidebarContent>
        <StartWorkflowDialog open={startWorkflowDialogOpen} onOpenChange={setStartWorkflowDialogOpen} />
        <SidebarFooter className="border-t p-2">
          <div className="flex items-center justify-center gap-1">
            <FeedbackDialog isCollapsed />
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9" title={t("sidebar.settings")}>
                  <Settings className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-3" align="center" side="top">
                <div className="space-y-3">
                  {userCompanies.length > 1 && (
                    <div>
                      <CompanySwitcher isCollapsed={false} />
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sun className="h-4 w-4 text-muted-foreground" />
                      <Label htmlFor="dark-mode-toggle-popover" className="text-sm cursor-pointer">
                        {t("sidebar.darkMode")}
                      </Label>
                    </div>
                    <Switch
                      id="dark-mode-toggle-popover"
                      checked={isDark}
                      onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <Label className="text-sm">
                        {language === "fr" ? "Langue" : "Language"}
                      </Label>
                    </div>
                    <LanguageSelector />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9"
              onClick={signOut}
              title={t("sidebar.signOut")}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
          {open && profile && (
            <div
              className="mt-1.5 px-1 text-center text-xs text-muted-foreground truncate flex flex-col items-center gap-0.5"
              title={[
                profile.full_name || profile.email,
                profile.email,
                userCompanies.length > 1 &&
                  selectedCompanyId &&
                  companyBranding?.companyId === selectedCompanyId &&
                  companyBranding.name
                  ? companyBranding.name
                  : null,
                isSuperAdmin ? "Super Admin" : null,
              ]
                .filter(Boolean)
                .join("\n")}
            >
              <span className="truncate w-full">{profile.full_name || profile.email}</span>
              {userCompanies.length > 1 &&
                selectedCompanyId &&
                companyBranding?.companyId === selectedCompanyId &&
                companyBranding.name && (
                  <span className="truncate w-full font-medium text-foreground/80" title={companyBranding.name}>
                    {companyBranding.name}
                  </span>
                )}
              {isSuperAdmin && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-medium shrink-0">
                  Super Admin
                </Badge>
              )}
            </div>
          )}
        </SidebarFooter>
      </Sidebar>
    </>
  );
}
