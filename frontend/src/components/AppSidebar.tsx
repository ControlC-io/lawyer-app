import { Link, useLocation } from "react-router-dom";
import { Users, Building2, FolderOpen, LogOut, Settings, Sun, Globe, Archive, FileType, Tag } from "lucide-react";
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
import { useTheme } from "next-themes";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { LanguageSelector } from "@/components/LanguageSelector";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { DossierLogo } from "@/components/DossierLogo";

type MenuItem = { titleKey: string; url: string; icon: typeof FolderOpen; permission?: string };

const menuSections: { groupLabelKey: string; items: MenuItem[] }[] = [
  {
    groupLabelKey: "sidebar.groupResources",
    items: [
      { titleKey: "sidebar.documents", url: "/documents", icon: FolderOpen, permission: "documents.view" },
      { titleKey: "sidebar.persons", url: "/persons", icon: Users, permission: "persons.view" },
      { titleKey: "sidebar.documentTypes", url: "/document-types", icon: FileType, permission: "documents.view" },
      { titleKey: "sidebar.metadataKeys", url: "/metadata-keys", icon: Tag, permission: "org_settings.manage" },
    ],
  },
  {
    groupLabelKey: "sidebar.groupAdministration",
    items: [
      { titleKey: "sidebar.usersGroups", url: "/users-groups", icon: Users, permission: "users_groups.manage" },
      { titleKey: "sidebar.settings", url: "/settings", icon: Settings },
    ],
  },
];

export function AppSidebar() {
  const { open, isMobile } = useSidebar();
  const showLabels = open || isMobile;
  const {
    signOut,
    profile,
    loading,
    userCompanies,
    isSuperAdmin,
    hasPermission,
    companyBranding,
    selectedCompanyId,
  } = useAuth();
  const location = useLocation();
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const { t, language } = useLanguage();

  const isItemActive = (item: MenuItem) => {
    const isDocuments = item.titleKey === "sidebar.documents";
    return isDocuments
      ? location.pathname === "/" || location.pathname === "/documents" || location.pathname.startsWith("/documents/")
      : location.pathname === item.url || location.pathname.startsWith(`${item.url}/`);
  };
  const customLogoUrl = companyBranding?.internal_logo_url ?? "";
  const shouldUseFallbackLogo = logoLoadFailed || !customLogoUrl;
  const isExpanded = open || isMobile;
  const customLogoSrc = customLogoUrl;
  const brandTitle =
    !shouldUseFallbackLogo &&
    companyBranding?.companyId === selectedCompanyId &&
    companyBranding.name
      ? companyBranding.name
      : "Dossier";
  const brandSubtitle = shouldUseFallbackLogo ? t("sidebar.brandTagline") : null;

  const handleLogoError = () => {
    if (!logoLoadFailed) {
      setLogoLoadFailed(true);
    }
  };

  useEffect(() => {
    setLogoLoadFailed(false);
  }, [customLogoUrl]);

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border" style={{ overflow: 'visible' }}>
      <SidebarHeader className="h-14 shrink-0 border-b border-sidebar-border p-0">
        <Link
          to="/documents"
          className={cn(
            "flex h-full min-w-0 items-center gap-2.5 overflow-hidden transition-colors hover:bg-sidebar-accent/60",
            isExpanded ? "justify-start px-3" : "justify-center px-0",
          )}
          title={brandTitle}
        >
          {shouldUseFallbackLogo ? (
            <DossierLogo className={cn(isExpanded ? "h-8 w-8" : "h-6 w-6")} />
          ) : (
            <img
              src={customLogoSrc}
              alt={brandTitle}
              className={cn("shrink-0 object-contain", isExpanded ? "h-8 w-8" : "h-6 w-6")}
              onError={handleLogoError}
            />
          )}
          {isExpanded && (
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-sm font-semibold leading-none tracking-tight text-sidebar-foreground">
                {brandTitle}
              </span>
              {brandSubtitle && (
                <span className="truncate text-[11px] leading-none text-sidebar-foreground/60">
                  {brandSubtitle}
                </span>
              )}
            </div>
          )}
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {menuSections.map((section) => {
          const visibleItems = section.items.filter(
            (item) => !item.permission || hasPermission(item.permission)
          );
          const hasVisibleLinks = visibleItems.length > 0;

          if (!hasVisibleLinks) return null;

          return (
            <SidebarGroup key={section.groupLabelKey}>
              <SidebarGroupLabel>{t(section.groupLabelKey)}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {visibleItems.map((item) => {
                    const active = isItemActive(item);
                    const isDocuments = item.titleKey === "sidebar.documents";
                    return (
                      <SidebarMenuItem key={item.titleKey}>
                        <SidebarMenuButton
                          asChild
                          isActive={active}
                          className={isDocuments && active ? "font-semibold border-l-2 border-primary" : ""}
                        >
                          <Link to={item.url}>
                            <item.icon className="h-4 w-4" />
                            {showLabels && <span>{t(item.titleKey)}</span>}
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
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
                  <SidebarMenuButton asChild isActive={location.pathname === "/companies"}>
                    <Link to="/companies">
                      <Building2 className="h-4 w-4" />
                      {showLabels && <span>{t("sidebar.companies")}</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={location.pathname === "/archived-records"}>
                    <Link to="/archived-records">
                      <Archive className="h-4 w-4" />
                      {showLabels && <span>{t("sidebar.archivedRecords")}</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter className="border-t p-2">
        <div className="flex items-center justify-center gap-1">
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
        {showLabels && profile && (
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
  );
}
