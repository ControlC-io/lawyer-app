import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { BarChart2, ArrowUpDown, ArrowUp, ArrowDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { useLanguage } from "@/contexts/LanguageContext";

interface AgentUsageRow {
  id: string;
  workflow_execution_id: string | null;
  agent_id: string | null;
  agent_name: string | null;
  model_name: string | null;
  input_tokens: string | null;
  thinking_tokens: string | null;
  output_tokens: string | null;
  total_cost: string | null;
  company_id: string | null;
  company_name: string | null;
  comment: string | null;
  created_at: string;
}

const usageColumns = (t: (key: string) => string): { key: keyof AgentUsageRow; label: string; align?: "left" | "right" }[] => [
  { key: "created_at", label: "Created", align: "left" },
  { key: "agent_name", label: "Agent", align: "left" },
  { key: "workflow_execution_id", label: "Execution", align: "left" },
  { key: "model_name", label: "Model", align: "left" },
  { key: "total_cost", label: "Cost", align: "right" },
  { key: "comment", label: t("agentUsage.comment"), align: "left" },
];

export default function AgentUsage() {
  const { selectedCompanyId } = useAuth();
  const { t } = useLanguage();
  const [list, setList] = useState<AgentUsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<keyof AgentUsageRow | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    if (!selectedCompanyId) return;
    let cancelled = false;
    setLoading(true);
    api
      .get<AgentUsageRow[]>(`/api/companies/${selectedCompanyId}/agent-usage`)
      .then((data) => {
        if (!cancelled) setList(data);
      })
      .catch(() => {
        if (!cancelled) setList([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCompanyId]);

  const totalsByMonth = useMemo(() => {
    const byMonth = new Map<string, { cost: number; count: number }>();
    for (const row of list) {
      const date = row.created_at ? new Date(row.created_at) : null;
      const key = date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` : "—";
      const cur = byMonth.get(key) ?? { cost: 0, count: 0 };
      cur.cost += parseFloat(row.total_cost ?? "0") || 0;
      cur.count += 1;
      byMonth.set(key, cur);
    }
    return Array.from(byMonth.entries())
      .map(([month, agg]) => ({ month, ...agg }))
      .sort((a, b) => b.month.localeCompare(a.month));
  }, [list]);

  const filteredAndSorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = list;
    if (q) {
      result = result.filter((row) => {
        const created = row.created_at ? new Date(row.created_at).toLocaleString().toLowerCase() : "";
        const agent = (row.agent_name ?? row.agent_id ?? "").toString().toLowerCase();
        const exec = (row.workflow_execution_id ?? "").toLowerCase();
        const model = (row.model_name ?? "").toLowerCase();
        const comment = (row.comment ?? "").toLowerCase();
        return [created, agent, exec, model, comment].some((s) => s.includes(q));
      });
    }
    if (!sortField) return result;
    const dir = sortDirection === "asc" ? 1 : -1;
    const numericKeys = ["input_tokens", "thinking_tokens", "output_tokens", "total_cost"];
    return [...result].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      const aStr = (aVal ?? "").toString();
      const bStr = (bVal ?? "").toString();
      if (numericKeys.includes(sortField)) {
        const aNum = parseFloat(aStr) || 0;
        const bNum = parseFloat(bStr) || 0;
        return dir * (aNum - bNum);
      }
      if (sortField === "created_at") {
        const aDate = aStr ? new Date(aStr).getTime() : 0;
        const bDate = bStr ? new Date(bStr).getTime() : 0;
        return dir * (aDate - bDate);
      }
      return dir * aStr.localeCompare(bStr, undefined, { numeric: true });
    });
  }, [list, search, sortField, sortDirection]);

  const handleSort = (field: keyof AgentUsageRow) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const getSortIcon = (field: keyof AgentUsageRow) => {
    if (sortField !== field) return <ArrowUpDown className="h-4 w-4 ml-1 opacity-50" />;
    return sortDirection === "asc" ? (
      <ArrowUp className="h-4 w-4 ml-1" />
    ) : (
      <ArrowDown className="h-4 w-4 ml-1" />
    );
  };

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart2 className="h-5 w-5" />
            {t("sidebar.agentUsage")}
          </CardTitle>
          <CardDescription>
            {t("agentUsage.description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">{t("agentUsage.loading")}</p>
          ) : (
            <div className="space-y-3">
              {totalsByMonth.length > 0 && (
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-sm font-medium text-muted-foreground mb-2">
                    {t("agentUsage.totalsByMonth")}
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-muted-foreground">
                          <th className="p-2 font-medium">{t("agentUsage.month")}</th>
                          <th className="p-2 font-medium text-right">{t("agentUsage.cost")}</th>
                          <th className="p-2 font-medium text-right">{t("agentUsage.requests")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {totalsByMonth.map(({ month, cost, count }) => (
                          <tr key={month} className="border-t">
                            <td className="p-2 whitespace-nowrap">
                              {month === "—" ? "—" : new Date(month + "-01").toLocaleDateString(undefined, { month: "short", year: "numeric" })}
                            </td>
                            <td className="p-2 text-right">{cost.toFixed(4)}</td>
                            <td className="p-2 text-right">{count.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t("agentUsage.filterPlaceholder")}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8"
                  />
                </div>
                {(search || sortField) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSearch("");
                      setSortField(null);
                      setSortDirection("asc");
                    }}
                  >
                    {t("agentUsage.clear")}
                  </Button>
                )}
              </div>
              <div className="border rounded-md overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      {usageColumns(t).map(({ key, label, align }) => (
                        <th
                          key={key}
                          className={`p-3 font-medium cursor-pointer select-none hover:bg-muted/70 ${align === "right" ? "text-right" : "text-left"}`}
                          onClick={() => handleSort(key)}
                        >
                          <span className="inline-flex items-center">
                            {label}
                            {getSortIcon(key)}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAndSorted.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-6 text-center text-muted-foreground">
                          {list.length === 0
                            ? t("agentUsage.noRecords")
                            : t("agentUsage.noMatch")}
                        </td>
                      </tr>
                    ) : (
                      filteredAndSorted.map((row) => (
                        <tr key={row.id} className="border-t hover:bg-muted/30">
                          <td className="p-3 whitespace-nowrap">
                            {row.created_at ? new Date(row.created_at).toLocaleString() : "—"}
                          </td>
                          <td className="p-3">{row.agent_name ?? row.agent_id ?? "—"}</td>
                          <td className="p-3 font-mono text-xs truncate max-w-[120px]" title={row.workflow_execution_id ?? ""}>
                            {row.workflow_execution_id ?? "—"}
                          </td>
                          <td className="p-3">{row.model_name ?? "—"}</td>
                          <td className="p-3 text-right">{row.total_cost != null ? Number(row.total_cost).toFixed(4) : "—"}</td>
                          <td className="p-3 max-w-[200px] truncate" title={row.comment ?? ""}>
                            {row.comment ?? "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
