import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Company {
  id: string;
  name: string;
}

interface CompanySwitcherProps {
  isCollapsed?: boolean;
}

export function CompanySwitcher({ isCollapsed = false }: CompanySwitcherProps) {
  const { userCompanies, selectedCompanyId, setSelectedCompanyId, loading } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);

  useEffect(() => {
    if (userCompanies.length > 0) {
      fetchCompanies();
    }
  }, [userCompanies.length]);

  const fetchCompanies = async () => {
    try {
      setLoadingCompanies(true);
      const data = await api.get<Array<{ id: string; name: string }>>("/api/companies");
      if (data) setCompanies(data);
    } catch (e) {
      console.error("[CompanySwitcher] Error fetching companies:", e);
    } finally {
      setLoadingCompanies(false);
    }
  };

  if (userCompanies.length === 0) {
    console.log("[CompanySwitcher] No companies for user");
    return null;
  }

  if (userCompanies.length === 1) {
    // Don't show switcher if user only belongs to one company
    return null;
  }

  if (loading || loadingCompanies) {
    console.log("[CompanySwitcher] Loading state - auth:", loading, "companies:", loadingCompanies);
    if (isCollapsed) {
      return (
        <div className="w-full flex justify-center py-2">
          <Building2 className="h-5 w-5 text-muted-foreground animate-pulse" />
        </div>
      );
    }
    return (
      <div className="w-full px-2 py-1 text-sm text-muted-foreground">
        Loading companies...
      </div>
    );
  }

  console.log("[CompanySwitcher] Rendering with", companies.length, "companies");

  const selectedCompany = companies.find(c => c.id === selectedCompanyId);

  // Collapsed state: show only icon with tooltip
  if (isCollapsed) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="w-full flex justify-center">
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10"
                aria-label={selectedCompany?.name || "Select company"}
              >
                <Building2 className="h-5 w-5" />
              </Button>
            </div>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>{selectedCompany?.name || "Select company"}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Expanded state: show full select dropdown
  return (
    <Select
      value={selectedCompanyId || ""}
      onValueChange={(value) => setSelectedCompanyId(value || null)}
    >
      <SelectTrigger className="w-full bg-background">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <SelectValue placeholder="Select company" />
        </div>
      </SelectTrigger>
      <SelectContent className="bg-popover z-50">
        {companies.map((company) => (
          <SelectItem key={company.id} value={company.id}>
            {company.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
