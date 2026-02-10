import { useMemo, useState, useEffect } from "react";
import { Plus, Pencil, Trash2, Search, ChevronLeft, ChevronRight, Loader2, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useCompanyId } from "@/hooks/useCompanyId";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";

type GroupItem = {
  id: string;
  name: string;
  description?: string;
  memberCount?: number;
};

type UserItem = {
  id: string;
  full_name: string | null;
  email: string;
  role?: string;
};

type GroupMember = {
  profile_id: string;
  group_id: string;
};

export default function UsersGroups() {
  const companyId = useCompanyId();
  const { user, isCompanyAdmin } = useAuth();
  const { t } = useLanguage();
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [activeTab, setActiveTab] = useState<"users" | "groups">("users");
  const [loading, setLoading] = useState(true);

  // Users tab state
  const [userQuery, setUserQuery] = useState("");
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>("");
  const [userToRemove, setUserToRemove] = useState<UserItem | null>(null);
  const [isRemovingUser, setIsRemovingUser] = useState(false);

  // Groups tab state
  const [groupQuery, setGroupQuery] = useState("");
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<GroupItem | null>(null);
  const [groupForm, setGroupForm] = useState<{ name: string; description: string }>({ name: "", description: "" });
  const [managingGroupId, setManagingGroupId] = useState<string | null>(null);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  
  // Invitation state
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"company_admin" | "user">("user");
  const [inviting, setInviting] = useState(false);
  const [pendingInvitations, setPendingInvitations] = useState<any[]>([]);
  
  // Pagination state
  const [usersPage, setUsersPage] = useState(1);
  const [groupsPage, setGroupsPage] = useState(1);
  const itemsPerPage = 6;

  useEffect(() => {
    if (companyId) {
      fetchData();
    }
  }, [companyId]);

  const fetchData = async () => {
    setLoading(true);
    await Promise.all([
      fetchUsers(),
      fetchGroups(),
      fetchGroupMembers(),
      fetchInvitations()
    ]);
    setLoading(false);
  };

  const fetchInvitations = async () => {
    if (!companyId) return;
    try {
      const data = await api.get<any[]>(`/api/companies/${companyId}/invitations`);
      setPendingInvitations(data || []);
    } catch (e) {
      console.error("Failed to fetch invitations", e);
    }
  };

  const fetchUsers = async () => {
    if (!companyId) return;
    try {
      const data = await api.get<UserItem[]>(`/api/companies/${companyId}/users`);
      setUsers(data || []);
    } catch (e) {
      toast.error("Failed to fetch users");
      console.error(e);
    }
  };

  const fetchGroups = async () => {
    if (!companyId) return;
    try {
      const data = await api.get<GroupItem[]>(`/api/companies/${companyId}/groups`);
      setGroups(data || []);
    } catch (e) {
      toast.error("Failed to fetch groups");
      console.error(e);
    }
  };

  const fetchGroupMembers = async () => {
    if (!companyId) return;
    try {
      const data = await api.get<GroupMember[]>(`/api/companies/${companyId}/group-members`);
      setGroupMembers(data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const getUserGroups = (userId: string) => {
    const userGroupIds = groupMembers.filter(m => m.profile_id === userId).map(m => m.group_id);
    return groups.filter(g => userGroupIds.includes(g.id));
  };

  const getGroupMembers = (groupId: string) => {
    const memberIds = groupMembers.filter(m => m.group_id === groupId).map(m => m.profile_id);
    return users.filter(u => memberIds.includes(u.id));
  };

  const filteredUsers = useMemo(() => {
    const q = userQuery.toLowerCase();
    let filtered = users.filter((u) => 
      u.full_name?.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
    
    if (selectedGroupFilter) {
      const memberIds = groupMembers
        .filter(m => m.group_id === selectedGroupFilter)
        .map(m => m.profile_id);
      filtered = filtered.filter(u => memberIds.includes(u.id));
    }
    
    return filtered;
  }, [users, userQuery, selectedGroupFilter, groupMembers]);

  const filteredGroups = useMemo(() => {
    const q = groupQuery.toLowerCase();
    return groups.filter((g) => 
      g.name.toLowerCase().includes(q) || g.description?.toLowerCase().includes(q)
    ).map(g => ({
      ...g,
      memberCount: groupMembers.filter(m => m.group_id === g.id).length
    }));
  }, [groups, groupQuery, groupMembers]);

  // Paginated data
  const paginatedUsers = useMemo(() => {
    const start = (usersPage - 1) * itemsPerPage;
    return filteredUsers.slice(start, start + itemsPerPage);
  }, [filteredUsers, usersPage]);

  const paginatedGroups = useMemo(() => {
    const start = (groupsPage - 1) * itemsPerPage;
    return filteredGroups.slice(start, start + itemsPerPage);
  }, [filteredGroups, groupsPage]);

  const totalUsersPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const totalGroupsPages = Math.ceil(filteredGroups.length / itemsPerPage);

  // Groups actions
  const openCreateGroup = () => {
    setEditingGroup(null);
    setGroupForm({ name: "", description: "" });
    setGroupDialogOpen(true);
  };

  const openEditGroup = (g: GroupItem) => {
    setEditingGroup(g);
    setGroupForm({ name: g.name, description: g.description || "" });
    setGroupDialogOpen(true);
  };

  const saveGroup = async () => {
    if (!groupForm.name.trim() || !companyId) return;
    try {
      if (editingGroup) {
        await api.patch(`/api/companies/${companyId}/groups/${editingGroup.id}`, {
          name: groupForm.name,
          description: groupForm.description,
        });
        toast.success("Group updated successfully");
      } else {
        await api.post(`/api/companies/${companyId}/groups`, {
          name: groupForm.name,
          description: groupForm.description,
        });
        toast.success("Group created successfully");
      }
      setGroupDialogOpen(false);
      fetchGroups();
    } catch (error: any) {
      toast.error(error.message || "Failed to save group");
      console.error(error);
    }
  };

  const removeGroup = async (id: string) => {
    try {
      await api.delete(`/api/companies/${companyId}/groups/${id}`);
      toast.success("Group deleted successfully");
      fetchData();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete group");
      console.error(error);
    }
  };

  const openAssignUsersDialog = (groupId: string) => {
    setManagingGroupId(groupId);
    setAssignDialogOpen(true);
  };

  const toggleUserInGroup = async (userId: string, groupId: string) => {
    const isMember = groupMembers.some((m) => m.profile_id === userId && m.group_id === groupId);
    try {
      if (isMember) {
        await api.delete(
          `/api/companies/${companyId}/groups/${groupId}/members/by-profile/${userId}`
        );
        toast.success("User removed from group");
      } else {
        await api.post(`/api/companies/${companyId}/groups/${groupId}/members`, {
          profile_id: userId,
        });
        toast.success("User added to group");
      }
      fetchGroupMembers();
    } catch (error: any) {
      toast.error(error.message || "Failed to update group membership");
      console.error(error);
    }
  };

  const removeUserFromGroup = async (userId: string, groupId: string) => {
    try {
      await api.delete(
        `/api/companies/${companyId}/groups/${groupId}/members/by-profile/${userId}`
      );
      toast.success("User removed from group");
      fetchGroupMembers();
    } catch (error: any) {
      toast.error(error.message || "Failed to remove user from group");
      console.error(error);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !companyId) return;
    setInviting(true);
    try {
      await api.post(`/api/companies/${companyId}/invitations`, {
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      toast.success("Invitation sent successfully!");
      setInviteDialogOpen(false);
      setInviteEmail("");
      fetchInvitations();
    } catch (error: any) {
      toast.error(error.message || "Failed to send invitation");
      console.error(error);
    } finally {
      setInviting(false);
    }
  };

  const cancelInvitation = async (id: string) => {
    try {
      await api.delete(`/api/invitations/${id}`);
      toast.success("Invitation cancelled");
      fetchInvitations();
    } catch (error: any) {
      toast.error(error.message || "Failed to cancel invitation");
      console.error(error);
    }
  };

  const removeUserFromCompany = async () => {
    if (!userToRemove || !companyId) return;
    setIsRemovingUser(true);
    try {
      await api.delete(`/api/companies/${companyId}/users/${userToRemove.id}`);
      toast.success(t("usersGroups.removeUserSuccess"));
      setUserToRemove(null);
      fetchUsers();
      fetchGroupMembers();
      fetchInvitations();
    } catch (error: any) {
      toast.error(t("usersGroups.failedToRemoveUser"));
      console.error(error);
    } finally {
      setIsRemovingUser(false);
    }
  };

  // Reset pagination when search changes
  const handleUserSearchChange = (value: string) => {
    setUserQuery(value);
    setUsersPage(1);
  };

  const handleGroupSearchChange = (value: string) => {
    setGroupQuery(value);
    setGroupsPage(1);
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Users & Groups</h1>
            <p className="text-muted-foreground mt-1">Manage users and groups for your company</p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="groups">Groups</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Users</CardTitle>
                  <CardDescription>All users in your company</CardDescription>
                </div>
                {isCompanyAdmin && (
                  <Button onClick={() => setInviteDialogOpen(true)} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Invite User
                  </Button>
                )}
              </div>
              <div className="flex gap-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Search users by name or email..."
                    value={userQuery}
                    onChange={(e) => handleUserSearchChange(e.target.value)}
                  />
                </div>
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={selectedGroupFilter}
                  onChange={(e) => setSelectedGroupFilter(e.target.value)}
                >
                  <option value="">All Groups</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Groups</TableHead>
                    {isCompanyAdmin && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedUsers.map((u) => {
                    const userGroups = getUserGroups(u.id);
                    const canBeRemoved = isCompanyAdmin && u.role !== "company_admin" && u.id !== user?.id;
                    
                    return (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.full_name || "—"}</TableCell>
                        <TableCell>{u.email}</TableCell>
                        <TableCell className="capitalize">{u.role?.replace("_", " ") || "—"}</TableCell>
                        <TableCell>
                          {userGroups.length > 0 
                            ? userGroups.map(g => g.name).join(", ") 
                            : "—"
                          }
                        </TableCell>
                        {isCompanyAdmin && (
                          <TableCell className="text-right">
                            {canBeRemoved && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setUserToRemove(u)}
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                title={t("usersGroups.removeFromOrganization") as string}
                              >
                                <UserMinus className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                  {paginatedUsers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={isCompanyAdmin ? 5 : 4} className="text-center text-muted-foreground">
                        No users found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              
              {totalUsersPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {((usersPage - 1) * itemsPerPage) + 1} to {Math.min(usersPage * itemsPerPage, filteredUsers.length)} of {filteredUsers.length} users
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setUsersPage(prev => Math.max(prev - 1, 1))}
                      disabled={usersPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm">
                      Page {usersPage} of {totalUsersPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setUsersPage(prev => Math.min(prev + 1, totalUsersPages))}
                      disabled={usersPage === totalUsersPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {isCompanyAdmin && pendingInvitations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Pending Invitations</CardTitle>
                <CardDescription>Users who haven't accepted their invitation yet</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Sent At</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingInvitations.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell>{inv.email}</TableCell>
                        <TableCell className="capitalize">{inv.role}</TableCell>
                        <TableCell>{new Date(inv.created_at).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => cancelInvitation(inv.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            Cancel
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="groups" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Groups</CardTitle>
                  <CardDescription>Organize users into groups</CardDescription>
                </div>
                {isCompanyAdmin && (
                  <Button onClick={openCreateGroup} className="gap-2">
                    <Plus className="h-4 w-4" />
                    New Group
                  </Button>
                )}
              </div>
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Search groups..."
                  value={groupQuery}
                  onChange={(e) => handleGroupSearchChange(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {paginatedGroups.map((group) => {
                  const members = getGroupMembers(group.id);
                  return (
                    <Card key={group.id} className="hover:shadow-md transition-shadow">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <CardTitle>{group.name}</CardTitle>
                            <CardDescription>{group.description}</CardDescription>
                          </div>
                          {isCompanyAdmin && (
                            <div className="flex gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditGroup(group)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeGroup(group.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Members ({group.memberCount || 0})</span>
                            {isCompanyAdmin && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openAssignUsersDialog(group.id)}
                              >
                                Manage
                              </Button>
                            )}
                          </div>
                          <div className="space-y-1">
                            {members.length === 0 ? (
                              <p className="text-sm text-muted-foreground">No members assigned</p>
                            ) : (
                              members.slice(0, 3).map((user) => (
                                <div key={user.id} className="flex items-center justify-between text-sm">
                                  <span>{user.full_name || user.email}</span>
                                  {isCompanyAdmin && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => removeUserFromGroup(user.id, group.id)}
                                      className="h-6 w-6 p-0"
                                    >
                                      <Trash2 className="h-3 w-3 text-destructive" />
                                    </Button>
                                  )}
                                </div>
                              ))
                            )}
                            {members.length > 3 && (
                              <p className="text-xs text-muted-foreground">+{members.length - 3} more</p>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {paginatedGroups.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-muted-foreground mb-4">No groups found</p>
                  <Button onClick={openCreateGroup}>Create your first group</Button>
                </div>
              )}

              {totalGroupsPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {((groupsPage - 1) * itemsPerPage) + 1} to {Math.min(groupsPage * itemsPerPage, filteredGroups.length)} of {filteredGroups.length} groups
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setGroupsPage(prev => Math.max(prev - 1, 1))}
                      disabled={groupsPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm">
                      Page {groupsPage} of {totalGroupsPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setGroupsPage(prev => Math.min(prev + 1, totalGroupsPages))}
                      disabled={groupsPage === totalGroupsPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Group Edit/Create Dialog */}
      <Dialog open={groupDialogOpen} onOpenChange={setGroupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingGroup ? "Edit Group" : "New Group"}</DialogTitle>
            <DialogDescription>
              {editingGroup ? "Update group details" : "Create a new group for organizing users"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="groupName">Group Name</Label>
              <Input
                id="groupName"
                value={groupForm.name}
                onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
                placeholder="e.g., Marketing Team"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="groupDescription">Description</Label>
              <Input
                id="groupDescription"
                value={groupForm.description}
                onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })}
                placeholder="Optional description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveGroup}>{editingGroup ? "Save Changes" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Users Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manage Group Members</DialogTitle>
            <DialogDescription>
              Add or remove users from {groups.find(g => g.id === managingGroupId)?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => {
                  const isMember = managingGroupId 
                    ? groupMembers.some(m => m.profile_id === user.id && m.group_id === managingGroupId)
                    : false;
                  return (
                    <TableRow key={user.id}>
                      <TableCell>{user.full_name || "—"}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant={isMember ? "destructive" : "default"}
                          size="sm"
                          onClick={() => managingGroupId && toggleUserInGroup(user.id, managingGroupId)}
                        >
                          {isMember ? "Remove" : "Add"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button onClick={() => setAssignDialogOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite User Dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite User</DialogTitle>
            <DialogDescription>
              Send an email invitation to join your organization.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="inviteEmail">Email Address</Label>
              <Input
                id="inviteEmail"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="user@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inviteRole">Role</Label>
              <select
                id="inviteRole"
                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as any)}
              >
                <option value="user">User</option>
                <option value="company_admin">Admin</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleInvite} disabled={inviting || !inviteEmail}>
              {inviting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Send Invitation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove User Confirmation Dialog */}
      <AlertDialog open={!!userToRemove} onOpenChange={(open) => !open && setUserToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("common.confirm")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("usersGroups.removeUserConfirm")}
              <br />
              <strong>{userToRemove?.full_name || userToRemove?.email}</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isRemovingUser}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                removeUserFromCompany();
              }}
              disabled={isRemovingUser}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isRemovingUser ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("common.loading")}
                </>
              ) : (
                t("common.delete")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
