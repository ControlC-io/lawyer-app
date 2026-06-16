import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Pencil, Trash2, FolderOpen, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { useCompanyId } from "@/hooks/useCompanyId";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{String(t("persons.title"))}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{String(t("persons.subtitle"))}</p>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="h-4 w-4 mr-1.5" />
          {String(t("persons.add"))}
        </Button>
      </div>

      {/* Search + Table */}
      <div className="rounded-lg border bg-card">
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="pl-8 h-8 text-sm"
              placeholder={String(t("persons.searchPlaceholder"))}
              value={query}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>
          {!loading && (
            <span className="text-xs text-muted-foreground ml-auto">
              {filteredPersons.length} {filteredPersons.length === 1 ? "person" : "persons"}
            </span>
          )}
        </div>

        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[280px]">{String(t("persons.fullName"))}</TableHead>
              <TableHead>{String(t("persons.nationalId"))}</TableHead>
              <TableHead>{String(t("persons.notes"))}</TableHead>
              <TableHead className="w-[140px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-sm text-muted-foreground">
                  {String(t("common.loading"))}
                </TableCell>
              </TableRow>
            ) : persons.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-sm text-muted-foreground">
                  {String(t("persons.empty"))}
                </TableCell>
              </TableRow>
            ) : filteredPersons.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-sm text-muted-foreground">
                  {String(t("persons.noResults"))}
                </TableCell>
              </TableRow>
            ) : (
              paginatedPersons.map((person) => (
                <TableRow key={person.id}>
                  <TableCell className="font-medium">{person.full_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {person.national_id ?? <span className="text-muted-foreground/40">—</span>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-xs">
                    {person.notes ? (
                      <span className="line-clamp-1">{person.notes}</span>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-muted-foreground"
                        onClick={() => openDocuments(person)}
                      >
                        <FolderOpen className="h-3.5 w-3.5 mr-1" />
                        {String(t("persons.openDocuments"))}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(person)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => void handleDelete(person)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        {!loading && filteredPersons.length > itemsPerPage && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <p className="text-xs text-muted-foreground">
              {String(
                t("persons.paginationShowing", {
                  from: (page - 1) * itemsPerPage + 1,
                  to: Math.min(page * itemsPerPage, filteredPersons.length),
                  total: filteredPersons.length,
                }),
              )}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs px-2">
                {String(t("persons.pageOf", { page, total: totalPages }))}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
                disabled={page === totalPages}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Dialog */}
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
