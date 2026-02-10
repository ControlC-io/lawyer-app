import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

type CompanyResponse = { id: string; name: string; api_key?: string | null; [k: string]: unknown };

export function useCompanyApiKey(companyId: string | null | undefined): string | null | undefined {
  const { data: company } = useQuery({
    queryKey: ["company", companyId],
    enabled: !!companyId,
    queryFn: () => api.get<CompanyResponse>(`/api/companies/${companyId}`),
  });
  return company?.api_key ?? undefined;
}
