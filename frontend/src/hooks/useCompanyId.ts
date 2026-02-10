import { useAuth } from "@/contexts/AuthContext";

export function useCompanyId(): string | null {
  const { selectedCompanyId } = useAuth();
  
  // All users now use the selected company
  return selectedCompanyId;
}
