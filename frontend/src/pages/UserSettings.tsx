import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { User, Bell, Shield, Save, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";

export default function UserSettings() {
  const navigate = useNavigate();
  const { profile, refreshUserData, user } = useAuth();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Local state for form fields
  const [fullName, setFullName] = useState("");
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  
  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "");
      setNotificationsEnabled(profile.notifications_enabled !== false);
    }
  }, [profile]);

  const handleSave = async () => {
    if (!profile) return;

    setSaving(true);
    try {
      await api.patch("/api/me", {
        full_name: fullName,
        notifications_enabled: notificationsEnabled,
      });
      await refreshUserData();
      toast.success(t("settings.profileUpdated") || "Profile updated successfully");
    } catch (error: unknown) {
      console.error("Error updating profile:", error);
      toast.error(error instanceof Error ? error.message : "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!user || !profile) return;

    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error(t("settings.passwordFieldsRequired") || "All password fields are required");
      return;
    }

    if (newPassword.length < 6) {
      toast.error(t("settings.passwordMinLength") || "Password must be at least 6 characters long");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error(t("settings.passwordsDoNotMatch") || "New passwords do not match");
      return;
    }

    if (currentPassword === newPassword) {
      toast.error(t("settings.newPasswordMustDiffer") || "New password must be different from current password");
      return;
    }

    setChangingPassword(true);
    try {
      await api.post("/api/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
      });

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      toast.success(t("settings.passwordChangedSuccess") || "Password changed successfully");
    } catch (error: unknown) {
      console.error("Error changing password:", error);
      toast.error(error instanceof Error ? error.message : (t("settings.passwordChangeError") || "Failed to change password"));
    } finally {
      setChangingPassword(false);
    }
  };

  if (!profile) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("sidebar.userSettings") || "User Settings"}</h1>
          <p className="text-muted-foreground mt-1">
            {t("settings.manageAccount") || "Manage your account settings and preferences"}
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate(-1)}>
          {t("common.back") || "Back"}
        </Button>
      </div>

      <div className="grid gap-6">
        {/* Profile Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              {t("settings.profileInfo") || "Profile Information"}
            </CardTitle>
            <CardDescription>
              {t("settings.profileDescription") || "Update your personal information"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="full-name">{t("settings.fullName") || "Full Name"}</Label>
                <Input
                  id="full-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="John Doe"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">{t("settings.email") || "Email Address"}</Label>
                <Input
                  id="email"
                  value={profile.email}
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  {t("settings.emailNote") || "Email cannot be changed directly."}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Change Password */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              {t("settings.changePassword") || "Change Password"}
            </CardTitle>
            <CardDescription>
              {t("settings.changePasswordDescription") || "Update your account password"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">{t("settings.currentPassword") || "Current Password"}</Label>
              <div className="relative">
                <Input
                  id="current-password"
                  type={showCurrentPassword ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder={t("settings.currentPasswordPlaceholder") || "Enter your current password"}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                >
                  {showCurrentPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">{t("settings.newPassword") || "New Password"}</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t("settings.newPasswordPlaceholder") || "Enter your new password"}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                >
                  {showNewPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("settings.passwordMinLengthHint") || "Password must be at least 6 characters long"}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">{t("settings.confirmPassword") || "Confirm New Password"}</Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t("settings.confirmPasswordPlaceholder") || "Confirm your new password"}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>
            <div className="flex justify-end">
              <Button 
                onClick={handleChangePassword} 
                disabled={changingPassword || !currentPassword || !newPassword || !confirmPassword}
                variant="outline"
                className="min-w-[120px]"
              >
                {changingPassword ? (
                  <>
                    <Save className="h-4 w-4 mr-2 animate-spin" />
                    {t("settings.changingPassword") || "Changing..."}
                  </>
                ) : (
                  <>
                    <Shield className="h-4 w-4 mr-2" />
                    {t("settings.changePasswordButton") || "Change Password"}
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Notification Preferences */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              {t("settings.notifications") || "Notifications"}
            </CardTitle>
            <CardDescription>
              {t("settings.notificationDescription") || "Choose how you want to be notified about workflow tasks"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">
                  {t("settings.emailNotifications") || "Email Notifications"}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {t("settings.emailNotificationsDesc") || "Receive an email when a new workflow step is assigned to you"}
                </p>
              </div>
              <Switch
                checked={notificationsEnabled}
                onCheckedChange={setNotificationsEnabled}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving} className="min-w-[120px]">
            {saving ? (
              <>
                <Save className="h-4 w-4 mr-2 animate-spin" />
                {t("common.saving") || "Saving..."}
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                {t("common.saveChanges") || "Save Changes"}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

