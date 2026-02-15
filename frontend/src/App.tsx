import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Header } from "@/components/Header";
import { AuthProvider } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ThemeProvider } from "next-themes";
import Auth from "./pages/Auth";
import WorkflowList from "./pages/WorkflowList";
import WorkflowEditor from "./pages/WorkflowEditor";
import WorkflowExecutions from "./pages/WorkflowExecutions";
import ExecutionDetail from "./pages/ExecutionDetail";
import ExecutionData from "./pages/ExecutionData";
import DocumentManagement from "./pages/DocumentManagement";
import NotFound from "./pages/NotFound";
import UsersGroups from "./pages/UsersGroups";
import OrganizationSettings from "./pages/OrganizationSettings";
import UserSettings from "./pages/UserSettings";
import AcceptInvitation from "./pages/AcceptInvitation";
import ApiConfigurations from "./pages/ApiConfigurations";
import AgentConfigurations from "./pages/AgentConfigurations";
import NoOrganization from "./pages/NoOrganization";
import { ExternalForm } from "./pages/ExternalForm";
import CompanyPortal from "./pages/CompanyPortal";
import Data from "./pages/Data";
import GlobalVariables from "./pages/GlobalVariables";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <LanguageProvider>
            <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/no-organization" element={<NoOrganization />} />
            <Route path="/accept-invitation" element={<AcceptInvitation />} />
            <Route path="/external/form/:token" element={<ExternalForm />} />
            <Route path="/portal/:slug" element={<CompanyPortal />} />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <SidebarProvider>
                    <div className="flex h-screen w-full overflow-hidden" style={{ overflow: 'visible' }}>
                      <AppSidebar />
                      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                        <Header />
                        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
                          <Routes>
                            <Route index element={<WorkflowExecutions />} />
                            <Route path="/app" element={<WorkflowExecutions />} />
                            <Route path="/executions" element={<WorkflowExecutions />} />
                            <Route path="/executions/:id" element={<ExecutionDetail />} />
                            <Route path="/execution-data" element={<ExecutionData />} />
                            <Route path="/workflows" element={<WorkflowList />} />
                            <Route path="/workflow/:id" element={<WorkflowEditor />} />
                            <Route path="/documents" element={<DocumentManagement />} />
                            <Route path="/data/global-variables" element={<GlobalVariables />} />
                            <Route path="/data" element={<Data />} />
                            <Route path="/data/:tableId" element={<Data />} />
                            <Route path="/users-groups" element={<UsersGroups />} />
                            <Route path="/organization-settings" element={<OrganizationSettings />} />
                            <Route path="/user-settings" element={<UserSettings />} />
                            <Route path="/api-configurations" element={<ApiConfigurations />} />
                            <Route path="/agent-configurations" element={<AgentConfigurations />} />
                            <Route path="*" element={<NotFound />} />
                          </Routes>
                        </main>
                      </div>
                    </div>
                  </SidebarProvider>
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
