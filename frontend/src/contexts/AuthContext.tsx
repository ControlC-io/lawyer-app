import { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { api, setToken, clearToken } from "@/lib/api";

const SELECTED_COMPANY_KEY = "floowly_selected_company";

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  notifications_enabled?: boolean;
  is_super_admin?: boolean;
}

interface UserCompany {
  company_id: string;
  role: "company_admin" | "user";
}

/** Minimal user shape for compatibility (replaces Supabase User) */
interface User {
  id: string;
  email?: string;
}

/** Minimal session shape (replaces Supabase Session) */
interface Session {
  user: User;
}

interface CompanyBranding {
  /** Set with branding fetch so consumers can avoid showing stale data after company switch */
  companyId?: string;
  name?: string | null;
  internal_logo_url?: string | null;
  internal_primary_color?: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  userCompanies: UserCompany[];
  loading: boolean;
  selectedCompanyId: string | null;
  setSelectedCompanyId: (id: string | null) => void;
  isCompanyAdmin: boolean;
  isSuperAdmin: boolean;
  permissions: string[];
  companyBranding: CompanyBranding | null;
  hasPermission: (key: string) => boolean;
  signOut: () => Promise<void>;
  refreshUserData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userCompanies, setUserCompanies] = useState<UserCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCompanyId, setSelectedCompanyIdState] = useState<string | null>(
    () => localStorage.getItem(SELECTED_COMPANY_KEY)
  );
  const selectedCompanyRef = useRef(selectedCompanyId);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [companyBranding, setCompanyBranding] = useState<CompanyBranding | null>(null);
  const brandingLogoObjectUrlRef = useRef<string | null>(null);
  const navigate = useNavigate();

  const revokeBrandingLogoObjectUrl = useCallback(() => {
    if (brandingLogoObjectUrlRef.current) {
      URL.revokeObjectURL(brandingLogoObjectUrlRef.current);
      brandingLogoObjectUrlRef.current = null;
    }
  }, []);

  const setSelectedCompanyId = useCallback((id: string | null) => {
    setSelectedCompanyIdState(id);
    selectedCompanyRef.current = id;
    try {
      if (id) {
        localStorage.setItem(SELECTED_COMPANY_KEY, id);
      } else {
        localStorage.removeItem(SELECTED_COMPANY_KEY);
      }
    } catch {
      // localStorage may be unavailable (private browsing, quota exceeded)
    }
  }, []);

  const isCompanyAdmin = selectedCompanyId
    ? userCompanies.some((uc) => uc.company_id === selectedCompanyId && uc.role === "company_admin")
    : false;

  const hasPermission = useCallback(
    (key: string): boolean => {
      if (isSuperAdmin || isCompanyAdmin) return true;
      if (permissions.includes('*')) return true;
      return permissions.includes(key);
    },
    [isSuperAdmin, isCompanyAdmin, permissions],
  );

  const fetchUserData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{
        profile: { id: string; email: string; full_name: string | null; notifications_enabled?: boolean };
        user_companies: { company_id: string; role: string }[];
        super_admin: boolean;
      }>("/api/me");

      setProfile({
        id: data.profile.id,
        email: data.profile.email,
        full_name: data.profile.full_name,
        notifications_enabled: data.profile.notifications_enabled,
      });

      const companies = (data.user_companies || []).map((uc) => ({
        company_id: uc.company_id,
        role: uc.role as "company_admin" | "user",
      }));
      setUserCompanies(companies);
      setIsSuperAdmin(data.super_admin ?? false);

      const u: User = { id: data.profile.id, email: data.profile.email };
      setUser(u);
      setSession({ user: u });

      if (companies.length > 0) {
        const preferredId = selectedCompanyRef.current || localStorage.getItem(SELECTED_COMPANY_KEY);
        const isPreferredValid = preferredId && companies.some((uc) => uc.company_id === preferredId);
        if (isPreferredValid) {
          setSelectedCompanyId(preferredId);
        } else {
          setSelectedCompanyId(companies[0].company_id);
        }
      }
    } catch (err) {
      clearToken();
      setUser(null);
      setSession(null);
      setProfile(null);
      setUserCompanies([]);
      setSelectedCompanyIdState(null);
      setIsSuperAdmin(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("floowly_token");
    if (token) {
      fetchUserData();
    } else {
      setLoading(false);
    }
  }, [fetchUserData]);

  useEffect(() => {
    if (!selectedCompanyId || !user) {
      setPermissions([]);
      setCompanyBranding(null);
      return;
    }
    const fetchPermissions = async () => {
      try {
        const perms = await api.get<string[]>(`/api/companies/${selectedCompanyId}/my-permissions`);
        setPermissions(perms || []);
      } catch {
        setPermissions([]);
      }
    };
    fetchPermissions();
  }, [selectedCompanyId, user]);

  useEffect(() => {
    if (!selectedCompanyId || !user) {
      setCompanyBranding(null);
      return;
    }

    const fetchBranding = async () => {
      try {
        const company = await api.get<
          Pick<CompanyBranding, "internal_logo_url" | "internal_primary_color"> & { name?: string }
        >(`/api/companies/${selectedCompanyId}`);
        let resolvedLogoUrl: string | null = company.internal_logo_url ?? null;
        const rawLogoUrl = company.internal_logo_url?.trim() ?? "";
        if (/^\/api\/companies\/[a-zA-Z0-9-]+\/internal-logo$/.test(rawLogoUrl)) {
          const blob = await api.getBlob(rawLogoUrl);
          revokeBrandingLogoObjectUrl();
          const objectUrl = URL.createObjectURL(blob);
          brandingLogoObjectUrlRef.current = objectUrl;
          resolvedLogoUrl = objectUrl;
        } else {
          revokeBrandingLogoObjectUrl();
        }
        setCompanyBranding({
          companyId: selectedCompanyId,
          name: company.name ?? null,
          internal_logo_url: resolvedLogoUrl,
          internal_primary_color: company.internal_primary_color ?? null,
        });
      } catch {
        revokeBrandingLogoObjectUrl();
        setCompanyBranding(null);
      }
    };

    fetchBranding();
  }, [selectedCompanyId, user, revokeBrandingLogoObjectUrl]);

  useEffect(() => {
    return () => {
      revokeBrandingLogoObjectUrl();
    };
  }, [revokeBrandingLogoObjectUrl]);

  const signOut = async () => {
    clearToken();
    setUser(null);
    setSession(null);
    setProfile(null);
    setUserCompanies([]);
    setSelectedCompanyIdState(null);
    setPermissions([]);
    revokeBrandingLogoObjectUrl();
    setCompanyBranding(null);
    navigate("/auth");
  };

  const refreshUserData = async () => {
    if (localStorage.getItem("floowly_token")) {
      await fetchUserData();
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        userCompanies,
        loading,
        selectedCompanyId,
        setSelectedCompanyId,
        isCompanyAdmin,
        isSuperAdmin,
        permissions,
        companyBranding,
        hasPermission,
        signOut,
        refreshUserData,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
