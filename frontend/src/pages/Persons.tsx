import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Pencil, Trash2, FolderOpen, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { useCompanyId } from "@/hooks/useCompanyId";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface PersonRow {
  id: string;
  full_name: string;
  national_id: string | null;
  notes: string | null;
  root_folder_id: string | null;
  root_folder?: { id: string; name: string } | null;
}

export default function Persons() {
  const companyId = useCompanyId();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [persons, setPersons] = useState<PersonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PersonRow | null>(null);
  const [fullName, setFullName] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const itemsPerPage = 10;

  const filteredPersons = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return persons;
    return persons.filter(
      (p) =>
        p.full_name.toLowerCase().includes(q) ||
        (p.national_id?.toLowerCase().includes(q) ?? false) ||
        (p.notes?.toLowerCase().includes(q) ?? false),
    );
  }, [persons, query]);

  const paginatedPersons = useMemo(() => {
    const start = (page - 1) * itemsPerPage;
    return filteredPersons.slice(start, start + itemsPerPage);
  }, [filteredPersons, page]);

  const totalPages = Math.max(1, Math.ceil(filteredPersons.length / itemsPerPage));

  const handleSearchChange = (value: string) => {
    setQuery(value);
    setPage(1);
  };

  const loadPersons = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const data = await api.get<PersonRow[]>(`/api/companies/${companyId}/persons`);
      setPersons(Array.isArray(data) ? data : []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(t("persons.loadFailed")));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPersons();
  }, [companyId]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const openCreate = () => {
    setEditing(null);
    setFullName("");
    setNationalId("");
    setNotes("");
    setDialogOpen(true);
  };

  const openEdit = (person: PersonRow) => {
    setEditing(person);
    setFullName(person.full_name);
    setNationalId(person.national_id ?? "");
    setNotes(person.notes ?? "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!companyId || !fullName.trim()) return;
    setSaving(true);
    try {
      const payload = {
        full_name: fullName.trim(),
        national_id: nationalId.trim() || null,
        notes: notes.trim() || null,
      };
      if (editing) {
        await api.patch(`/api/companies/${companyId}/persons/${editing.id}`, payload);
        toast.success(String(t("persons.updated")));
      } else {
        await api.post(`/api/companies/${companyId}/persons`, payload);
        toast.success(String(t("persons.created")));
      }
      setDialogOpen(false);
      await loadPersons();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(t("persons.saveFailed")));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (person: PersonRow) => {
    if (!companyId) return;
    if (!window.confirm(String(t("persons.deleteConfirm", { name: person.full_name })))) return;
    try {
      await api.delete(`/api/companies/${companyId}/persons/${person.id}`);
      toast.success(String(t("persons.deleted")));
      await loadPersons();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(t("persons.deleteFailed")));
    }
  };

  const openDocuments = (person: PersonRow) => {
    navigate(`/documents?personId=${person.id}`);
  };

  if (!companyId) {
    return (
      <div className="p-4 text-muted-foreground">{String(t("persons.noCompany"))}</div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{String(t("persons.title"))}</h1>
          <p className="text-muted-foreground mt-1">{String(t("persons.subtitle"))}</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          {String(t("persons.add"))}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{String(t("persons.listTitle"))}</CardTitle>
          <CardDescription>{String(t("persons.listDescription"))}</CardDescription>
          <div className="relative max-w-md pt-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder={String(t("persons.searchPlaceholder"))}
              value={query}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">{String(t("common.loading"))}</p>
          ) : persons.length === 0 ? (
            <p className="text-sm text-muted-foreground">{String(t("persons.empty"))}</p>
          ) : filteredPersons.length === 0 ? (
            <p className="text-sm text-muted-foreground">{String(t("persons.noResults"))}</p>
          ) : (
            <div className="space-y-2">
              {paginatedPersons.map((person) => (
                <div
                  key={person.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 border rounded-md"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{person.full_name}</div>
                    {person.national_id && (
                      <div className="text-xs text-muted-foreground">{person.national_id}</div>
                    )}
                    {person.notes && (
                      <div className="text-sm text-muted-foreground mt-1 line-clamp-2">{person.notes}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="outline" size="sm" onClick={() => openDocuments(person)}>
                      <FolderOpen className="h-4 w-4 mr-1" />
                      {String(t("persons.openDocuments"))}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(person)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => void handleDelete(person)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {!loading && filteredPersons.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4 pt-4 border-t">
              <p className="text-sm text-muted-foreground">
                {String(
                  t("persons.paginationShowing", {
                    from: (page - 1) * itemsPerPage + 1,
                    to: Math.min(page * itemsPerPage, filteredPersons.length),
                    total: filteredPersons.length,
                  }),
                )}
              </p>
              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm">
                    {String(t("persons.pageOf", { page, total: totalPages }))}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
                    disabled={page === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? String(t("persons.editTitle")) : String(t("persons.createTitle"))}
            </DialogTitle>
            <DialogDescription>{String(t("persons.formDescription"))}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="person-name">{String(t("persons.fullName"))}</Label>
              <Input id="person-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="person-national-id">{String(t("persons.nationalId"))}</Label>
              <Input id="person-national-id" value={nationalId} onChange={(e) => setNationalId(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="person-notes">{String(t("persons.notes"))}</Label>
              <Textarea id="person-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{String(t("common.cancel"))}</Button>
            <Button onClick={() => void handleSave()} disabled={saving || !fullName.trim()}>
              {String(t("common.save"))}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
