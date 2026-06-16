import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Header } from "@/components/Header";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { DocumentImportJobsProvider } from "@/contexts/DocumentImportJobsContext";
import { ProtectedRoute, SuperAdminRoute, PermissionRoute } from "@/components/ProtectedRoute";
import { ThemeProvider } from "next-themes";
import { useTheme } from "next-themes";
import { useEffect } from "react";
import Auth from "./pages/Auth";
import DocumentManagement from "./pages/DocumentManagement";
import SplitPdfPage from "./pages/SplitPdfPage";
import Persons from "./pages/Persons";
import DocumentTypes from "./pages/DocumentTypes";
import NotFound from "./pages/NotFound";
import UsersGroups from "./pages/UsersGroups";
import Settings from "./pages/Settings";
import AcceptInvitation from "./pages/AcceptInvitation";
import Companies from "./pages/Companies";
import ArchivedRecords from "./pages/ArchivedRecords";
import NoOrganization from "./pages/NoOrganization";
import MetadataKeys from "./pages/MetadataKeys";
import InfoPage from "./pages/InfoPage";

const queryClient = new QueryClient();

type Hsl = { h: number; s: number; l: number };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function hslToTriplet({ h, s, l }: Hsl): string {
  return `${Math.round(h)} ${clamp(s, 0, 100).toFixed(1)}% ${clamp(l, 0, 100).toFixed(1)}%`;
}

function hexToHsl(hexColor: string): Hsl | null {
  const normalized = hexColor.trim().replace("#", "");
  if (!/^[0-9A-Fa-f]{3}$|^[0-9A-Fa-f]{6}$/.test(normalized)) {
    return null;
  }

  const full = normalized.length === 3
    ? normalized.split("").map((char) => `${char}${char}`).join("")
    : normalized;

  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;

  let hue = 0;
  if (delta !== 0) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue = Math.round(hue * 60);
    if (hue < 0) hue += 360;
  }

  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  return { h: hue, s: saturation * 100, l: lightness * 100 };
}

function deriveBrandTokens(base: Hsl, isDark: boolean) {
  const accent: Hsl = isDark
    ? { h: base.h, s: clamp(base.s * 0.45, 18, 55), l: 20 }
    : { h: base.h, s: clamp(base.s * 0.65, 35, 90), l: 95 };
  const accentForeground: Hsl = isDark
    ? { h: base.h, s: clamp(base.s, 40, 95), l: 70 }
    : { h: base.h, s: clamp(base.s, 45, 95), l: 40 };
  const primaryGlow: Hsl = isDark
    ? { h: base.h, s: clamp(base.s + 5, 0, 100), l: clamp(base.l + 14, 0, 100) }
    : { h: base.h, s: clamp(base.s + 8, 0, 100), l: clamp(base.l + 10, 0, 100) };
  const gradientSecondary: Hsl = isDark
    ? { h: (base.h + 28) % 360, s: clamp(base.s + 6, 20, 100), l: clamp(base.l - 6, 0, 100) }
    : { h: (base.h + 24) % 360, s: clamp(base.s + 8, 20, 100), l: clamp(base.l - 8, 0, 100) };
  const gradientPrimary = `linear-gradient(135deg, hsl(${hslToTriplet(base)}), hsl(${hslToTriplet(gradientSecondary)}))`;
  const gradientPrimaryReverse = `linear-gradient(135deg, hsl(${hslToTriplet(gradientSecondary)}), hsl(${hslToTriplet(base)}))`;
  const shadowGlow = isDark
    ? `0 8px 32px -8px hsl(${hslToTriplet(base)} / 0.5)`
    : `0 8px 32px -8px hsl(${hslToTriplet(base)} / 0.3)`;

  return {
    primary: hslToTriplet(base),
    primaryGlow: hslToTriplet(primaryGlow),
    ring: hslToTriplet(base),
    accent: hslToTriplet(accent),
    accentForeground: hslToTriplet(accentForeground),
    gradientPrimary,
    gradientPrimaryReverse,
    shadowGlow,
  };
}

function CompanyBrandingThemeSync() {
  const { companyBranding } = useAuth();
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const root = document.documentElement;
    const color = companyBranding?.internal_primary_color?.trim();
    const baseHsl = color ? hexToHsl(color) : null;

    if (baseHsl) {
      const isDark = resolvedTheme === "dark";
      const tokens = deriveBrandTokens(baseHsl, isDark);
      root.style.setProperty("--primary", tokens.primary);
      root.style.setProperty("--primary-glow", tokens.primaryGlow);
      root.style.setProperty("--ring", tokens.ring);
      root.style.setProperty("--accent", tokens.accent);
      root.style.setProperty("--accent-foreground", tokens.accentForeground);
      root.style.setProperty("--sidebar-primary", tokens.primary);
      root.style.setProperty("--sidebar-ring", tokens.ring);
      root.style.setProperty("--sidebar-accent", tokens.accent);
      root.style.setProperty("--sidebar-accent-foreground", tokens.accentForeground);
      root.style.setProperty("--gradient-primary", tokens.gradientPrimary);
      root.style.setProperty("--gradient-primary-reverse", tokens.gradientPrimaryReverse);
      root.style.setProperty("--shadow-glow", tokens.shadowGlow);
      return;
    }

    root.style.removeProperty("--primary");
    root.style.removeProperty("--primary-glow");
    root.style.removeProperty("--ring");
    root.style.removeProperty("--accent");
    root.style.removeProperty("--accent-foreground");
    root.style.removeProperty("--sidebar-primary");
    root.style.removeProperty("--sidebar-ring");
    root.style.removeProperty("--sidebar-accent");
    root.style.removeProperty("--sidebar-accent-foreground");
    root.style.removeProperty("--gradient-primary");
    root.style.removeProperty("--gradient-primary-reverse");
    root.style.removeProperty("--shadow-glow");
  }, [companyBranding?.internal_primary_color, resolvedTheme]);

  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <LanguageProvider>
            <AuthProvider>
          <CompanyBrandingThemeSync />
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/no-organization" element={<NoOrganization />} />
            <Route path="/accept-invitation" element={<AcceptInvitation />} />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <DocumentImportJobsProvider>
                  <SidebarProvider>
                    <div className="flex h-screen w-full overflow-hidden" style={{ overflow: 'visible' }}>
                      <AppSidebar />
                      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                        <Header />
                        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
                          <Routes>
                            <Route index element={<PermissionRoute permission="documents.view"><DocumentManagement /></PermissionRoute>} />
                            <Route path="/documents" element={<PermissionRoute permission="documents.view"><DocumentManagement /></PermissionRoute>} />
                            <Route path="/documents/split-pdf" element={<PermissionRoute permission="documents.view"><SplitPdfPage /></PermissionRoute>} />
                            <Route path="/persons" element={<PermissionRoute permission="persons.view"><Persons /></PermissionRoute>} />
                            <Route path="/document-types" element={<PermissionRoute permission="documents.view"><DocumentTypes /></PermissionRoute>} />
                            <Route path="/metadata-keys" element={<PermissionRoute permission="org_settings.manage"><MetadataKeys /></PermissionRoute>} />
                            <Route path="/users-groups" element={<UsersGroups />} />
                            <Route path="/settings" element={<Settings />} />
                            <Route path="/organization-settings" element={<Navigate to="/settings" replace />} />
                            <Route path="/user-settings" element={<Navigate to="/settings" replace />} />
                            <Route path="/companies" element={<SuperAdminRoute><Companies /></SuperAdminRoute>} />
                            <Route path="/archived-records" element={<SuperAdminRoute><ArchivedRecords /></SuperAdminRoute>} />
                            <Route path="/info" element={<InfoPage />} />
                            <Route path="*" element={<NotFound />} />
                          </Routes>
                        </main>
                      </div>
                    </div>
                  </SidebarProvider>
                  </DocumentImportJobsProvider>
                </ProtectedRoute>
              }
            />
          </Routes>
          </AuthProvider>
        </LanguageProvider>
      </BrowserRouter>
    </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
