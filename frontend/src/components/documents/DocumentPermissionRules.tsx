import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Shield, UserPlus, Users, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { MetadataValueControl } from "@/components/documents/MetadataValueControl";

interface MetadataKey {
  id: string;
  name: string;
  value_kind: "free_text" | "predefined_list";
  allowed_values?: unknown;
}

interface Condition {
  key_id: string;
  value: string;
}

interface Assignment {
  id: string;
  user_id: string | null;
  group_id: string | null;
  user?: { id: string; email: string; full_name: string | null } | null;
  group?: { id: string; name: string } | null;
}

interface PermissionRule {
  id: string;
  name: string;
  permission_type: string;
  conditions: Condition[];
  assignments: Assignment[];
  created_at: string;
}

interface Profile {
  id: string;
  full_name: string | null;
  email: string;
}

interface Group {
  id: string;
  name: string;
}

interface Props {
  companyId: string;
}

export default function DocumentPermissionRules({ companyId }: Props) {
  const [rules, setRules] = useState<PermissionRule[]>([]);
  const [metadataKeys, setMetadataKeys] = useState<MetadataKey[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<PermissionRule | null>(null);
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<"read" | "write">("read");
  const [formConditions, setFormConditions] = useState<Condition[]>([]);
  const [assignType, setAssignType] = useState<"user" | "group">("group");
  const [assignEntityId, setAssignEntityId] = useState("");
  const { toast } = useToast();

  const fetchRules = useCallback(async () => {
    const data = await api.get<PermissionRule[]>(`/api/companies/${companyId}/document-permission-rules`);
    setRules(data || []);
  }, [companyId]);

  const fetchMetadataKeys = useCallback(async () => {
    const data = await api.get<MetadataKey[]>(
      `/api/companies/${companyId}/files-metadata-keys?includeSystemManaged=true`,
    );
    setMetadataKeys(data || []);
  }, [companyId]);

  useEffect(() => {
    fetchRules();
    fetchMetadataKeys();
    api.get<Profile[]>(`/api/companies/${companyId}/users`).then((d) => setUsers(d || []));
    api.get<Group[]>(`/api/companies/${companyId}/groups`).then((d) => setGroups(d || []));
  }, [companyId, fetchRules, fetchMetadataKeys]);

  const openCreate = () => {
    setEditingRule(null);
    setFormName("");
    setFormType("read");
    setFormConditions([{ key_id: "", value: "" }]);
    setIsCreateOpen(true);
  };

  const openEdit = (rule: PermissionRule) => {
    setEditingRule(rule);
    setFormName(rule.name);
    setFormType(rule.permission_type as "read" | "write");
    setFormConditions(
      rule.conditions.length > 0 ? [...rule.conditions] : [{ key_id: "", value: "" }]
    );
    setIsCreateOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      toast({ title: "Error", description: "Name is required", variant: "destructive" });
      return;
    }
    const conditions = formConditions.filter((c) => c.key_id);
    try {
      if (editingRule) {
        await api.patch(`/api/companies/${companyId}/document-permission-rules/${editingRule.id}`, {
          name: formName,
          permission_type: formType,
          conditions,
        });
        toast({ title: "Success", description: "Rule updated" });
      } else {
        await api.post(`/api/companies/${companyId}/document-permission-rules`, {
          name: formName,
          permission_type: formType,
          conditions,
        });
        toast({ title: "Success", description: "Rule created" });
      }
      setIsCreateOpen(false);
      fetchRules();
    } catch {
      toast({ title: "Error", description: "Failed to save rule", variant: "destructive" });
    }
  };

  const handleDelete = async (ruleId: string) => {
    try {
      await api.delete(`/api/companies/${companyId}/document-permission-rules/${ruleId}`);
      toast({ title: "Success", description: "Rule deleted" });
      fetchRules();
    } catch {
      toast({ title: "Error", description: "Failed to delete rule", variant: "destructive" });
    }
  };

  const handleAddAssignment = async (ruleId: string) => {
    if (!ruleId || !assignEntityId) return;
    const body = assignType === "user" ? { user_id: assignEntityId } : { group_id: assignEntityId };
    try {
      await api.post(`/api/companies/${companyId}/document-permission-rules/${ruleId}/assignments`, body);
      toast({ title: "Success", description: "Assignment added" });
      setAssignEntityId("");
      fetchRules();
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed to add assignment", variant: "destructive" });
    }
  };

  const handleRemoveAssignment = async (ruleId: string, assignmentId: string) => {
    try {
      await api.delete(`/api/companies/${companyId}/document-permission-rules/${ruleId}/assignments/${assignmentId}`);
      toast({ title: "Success", description: "Assignment removed" });
      fetchRules();
    } catch {
      toast({ title: "Error", description: "Failed to remove assignment", variant: "destructive" });
    }
  };

  const getKeyName = (keyId: string) => metadataKeys.find((k) => k.id === keyId)?.name || keyId;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Document Access Rules</h3>
          <p className="text-sm text-muted-foreground">
            Define metadata-based access rules. Users matching a rule can access all files whose metadata matches the rule's conditions.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1.5" />
          New Rule
        </Button>
      </div>

      {rules.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Shield className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No access rules yet. Company admins can see all documents.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <Card key={rule.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      {rule.name}
                      <Badge variant={rule.permission_type === "write" ? "default" : "secondary"} className="capitalize">
                        {rule.permission_type}
                      </Badge>
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {rule.conditions.length === 0
                        ? "Matches all files (no conditions)"
                        : rule.conditions.map((c) => `${getKeyName(c.key_id)} = "${c.value}"`).join(" AND ")}
                    </CardDescription>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(rule)}>Edit</Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(rule.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Assigned to</Label>
                <div className="mt-2 space-y-1">
                  {rule.assignments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No users or groups assigned.</p>
                  ) : (
                    rule.assignments.map((a) => (
                      <div key={a.id} className="flex items-center justify-between py-1.5 px-2 rounded bg-muted/30">
                        <div className="flex items-center gap-2 text-sm">
                          {a.user ? <UserPlus className="h-3.5 w-3.5 text-muted-foreground" /> : <Users className="h-3.5 w-3.5 text-muted-foreground" />}
                          <span>{a.user ? (a.user.full_name || a.user.email) : a.group?.name || "—"}</span>
                        </div>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleRemoveAssignment(rule.id, a.id)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))
                  )}
                  <div className="flex gap-2 mt-2">
                    <Select value={assignType} onValueChange={(v: "user" | "group") => { setAssignType(v); setAssignEntityId(""); }}>
                      <SelectTrigger className="h-8 w-24"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="group">Group</SelectItem>
                        <SelectItem value="user">User</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={assignEntityId} onValueChange={setAssignEntityId}>
                      <SelectTrigger className="h-8 flex-1"><SelectValue placeholder={`Select ${assignType}`} /></SelectTrigger>
                      <SelectContent>
                        {assignType === "group"
                          ? groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)
                          : users.map((u) => <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      className="h-8"
                      disabled={!assignEntityId}
                      onClick={() => handleAddAssignment(rule.id)}
                    >
                      Add
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingRule ? "Edit Rule" : "Create Access Rule"}</DialogTitle>
            <DialogDescription>
              Define conditions (AND logic). Files matching ALL conditions will be accessible.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Rule Name</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Finance Invoices 2026" />
            </div>
            <div>
              <Label>Access Level</Label>
              <Select value={formType} onValueChange={(v: "read" | "write") => setFormType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="read">Read — view and download</SelectItem>
                  <SelectItem value="write">Write — upload and modify</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Conditions</Label>
              <div className="mt-2 space-y-2">
                {formConditions.map((cond, i) => (
                  <div key={i} className="flex gap-2">
                    <Select value={cond.key_id} onValueChange={(v) => {
                      const next = [...formConditions];
                      next[i].key_id = v;
                      setFormConditions(next);
                    }}>
                      <SelectTrigger className="h-9 flex-1"><SelectValue placeholder="Document field" /></SelectTrigger>
                      <SelectContent>
                        {metadataKeys.map((k) => <SelectItem key={k.id} value={k.id}>{k.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <MetadataValueControl
                      className="h-9 flex-1"
                      metaKey={metadataKeys.find((k) => k.id === cond.key_id)}
                      value={cond.value}
                      onChange={(v) => {
                        const next = [...formConditions];
                        next[i].value = v;
                        setFormConditions(next);
                      }}
                      placeholder="Value"
                    />
                    <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setFormConditions(formConditions.filter((_, j) => j !== i))}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setFormConditions([...formConditions, { key_id: "", value: "" }])}>
                  + Add condition
                </Button>
              </div>
            </div>
            <Button onClick={handleSave} className="w-full">{editingRule ? "Update Rule" : "Create Rule"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
