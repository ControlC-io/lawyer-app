import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, userCompanies, isSuperAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // If the user has no companies and is not a super admin, redirect to no-organization
  if (userCompanies.length === 0 && !isSuperAdmin) {
    return <Navigate to="/no-organization" replace />;
  }

  return <>{children}</>;
}

interface SuperAdminRouteProps {
  children: React.ReactNode;
}

/** Renders children only for super-admin users; otherwise redirects to home. */
export function SuperAdminRoute({ children }: SuperAdminRouteProps) {
  const { isSuperAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

interface CompanyAdminRouteProps {
  children: React.ReactNode;
}

/** Renders children only for company-admin users with a selected company; otherwise redirects to home. */
export function CompanyAdminRoute({ children }: CompanyAdminRouteProps) {
  const { isCompanyAdmin, selectedCompanyId, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!selectedCompanyId || !isCompanyAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
