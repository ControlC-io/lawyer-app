import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, setToken } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

const Auth = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { user, profile, refreshUserData } = useAuth();
  const [searchParams] = useSearchParams();
  const next = searchParams.get("next") || "/";
  const initialEmail = searchParams.get("email") || "";
  const initialMode = (searchParams.get("mode") as "signin" | "signup") || "signin";
  const isInvited = !!searchParams.get("email");

  // Default to true so signup link is visible until config loads (avoids flash of missing link on client-side nav)
  const [signupEnabled, setSignupEnabled] = useState(true);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">(isInvited ? initialMode : "signin");
  const [demoDialogOpen, setDemoDialogOpen] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoForm, setDemoForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    companyName: "",
  });

  // Fetch public config (signup enabled or not) on mount
  useEffect(() => {
    api
      .get<{ signupEnabled: boolean }>("/api/public/config", { skipAuth: true })
      .then((data) => {
        setSignupEnabled(data.signupEnabled === true);
        setConfigLoaded(true);
      })
      .catch(() => {
        setConfigLoaded(true);
        // Keep signupEnabled as-is (true by default) so a failed/slow config request doesn't hide the link
      });
  }, []);

  // Update email and mode if query params change (only force signin when we know signup is disabled)
  useEffect(() => {
    if (searchParams.get("email")) {
      setEmail(searchParams.get("email") || "");
    }
    const m = searchParams.get("mode");
    if (m === "signup" && !searchParams.get("email") && configLoaded && !signupEnabled) {
      setMode("signin");
    } else if (m === "signin" || m === "signup") {
      setMode(m);
    }
  }, [searchParams, signupEnabled, configLoaded]);

  // Prefill demo form when user or profile is available
  useEffect(() => {
    if (user || profile) {
      const userEmail = user?.email || profile?.email || "";
      let firstName = "";
      let lastName = "";

      if (profile?.full_name) {
        const parts = profile.full_name.trim().split(/\s+/);
        if (parts.length > 0) {
          firstName = parts[0];
          if (parts.length > 1) {
            lastName = parts.slice(1).join(" ");
          }
        }
      }

      setDemoForm(prev => ({
        ...prev,
        email: prev.email || userEmail,
        firstName: prev.firstName || firstName,
        lastName: prev.lastName || lastName,
      }));
    }
  }, [user, profile]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === "signin") {
        const data = await api.post<{ token: string }>("/api/auth/login", { email, password }, { skipAuth: true });
        setToken(data.token);
        await refreshUserData();
        toast.success(t("auth.signInSuccess"));
      } else {
        const data = await api.post<{ token: string }>(
          "/api/auth/register",
          { email, password, full_name: fullName },
          { skipAuth: true }
        );
        setToken(data.token);
        await refreshUserData();
        toast.success(t("auth.signUpSuccessConnected"));
      }
      navigate(next);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : (mode === "signin" ? t("auth.signInError") : t("auth.signUpError"));
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleDemoRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setDemoLoading(true);

    try {
      await api.post(
        "/api/public/demo-request",
        {
          firstName: demoForm.firstName,
          lastName: demoForm.lastName,
          email: demoForm.email,
          companyName: demoForm.companyName,
        },
        { skipAuth: true }
      );
      toast.success(t("demo.success"));
      setDemoDialogOpen(false);
      setDemoForm({
        firstName: "",
        lastName: "",
        email: "",
        companyName: "",
      });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : t("demo.error"));
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex justify-center mb-4">
            <img 
              src="/logo.png" 
              alt="Picobello" 
              className="h-[60px]"
            />
          </div>
          <CardTitle className="text-center">{mode === "signin" ? t("auth.signIn") : t("auth.signUp")}</CardTitle>
          <CardDescription className="text-center">
            {mode === "signin" ? t("auth.signInDescription") : t("auth.signUpDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAuth} className="space-y-4">
            {mode === "signup" && (
              <div className="space-y-2">
                <Label htmlFor="signup-name">{t("auth.fullName")}</Label>
                <Input
                  id="signup-name"
                  type="text"
                  placeholder={t("auth.fullNamePlaceholder") as string}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="auth-email">{t("auth.email")}</Label>
              <Input
                id="auth-email"
                type="email"
                placeholder={t("auth.emailPlaceholder") as string}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={!!searchParams.get("email")}
              />
              {searchParams.get("email") && (
                <p className="text-[10px] text-muted-foreground">
                  {t("auth.emailInvitedHint")}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="auth-password">{t("auth.password")}</Label>
              <Input
                id="auth-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (mode === "signin" ? t("auth.signInButton") : t("auth.signUpButton"))}
            </Button>
            
            {(isInvited || signupEnabled) && (
              <div className="text-center text-sm">
                <button 
                  type="button" 
                  onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                  className="text-primary hover:underline"
                >
                  {mode === "signin" ? t("auth.noAccount") : t("auth.alreadyHaveAccount")}
                </button>
              </div>
            )}

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">{t("auth.or")}</span>
              </div>
            </div>
            <Button 
              type="button" 
              variant="outline" 
              className="w-full" 
              onClick={() => setDemoDialogOpen(true)}
            >
              {t("auth.requestDemo")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Dialog open={demoDialogOpen} onOpenChange={setDemoDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("demo.title")}</DialogTitle>
            <DialogDescription>
              {t("demo.description")}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleDemoRequest} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="demo-firstname">{t("demo.firstName")}</Label>
              <Input
                id="demo-firstname"
                type="text"
                placeholder={t("demo.firstNamePlaceholder") as string}
                value={demoForm.firstName}
                onChange={(e) => setDemoForm({ ...demoForm, firstName: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="demo-lastname">{t("demo.lastName")}</Label>
              <Input
                id="demo-lastname"
                type="text"
                placeholder={t("demo.lastNamePlaceholder") as string}
                value={demoForm.lastName}
                onChange={(e) => setDemoForm({ ...demoForm, lastName: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="demo-email">{t("demo.email")}</Label>
              <Input
                id="demo-email"
                type="email"
                placeholder={t("demo.emailPlaceholder") as string}
                value={demoForm.email}
                onChange={(e) => setDemoForm({ ...demoForm, email: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="demo-company">{t("demo.companyName")}</Label>
              <Input
                id="demo-company"
                type="text"
                placeholder={t("demo.companyNamePlaceholder") as string}
                value={demoForm.companyName}
                onChange={(e) => setDemoForm({ ...demoForm, companyName: e.target.value })}
                required
              />
            </div>
            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setDemoDialogOpen(false)}
                disabled={demoLoading}
              >
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={demoLoading}>
                {demoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("demo.submit")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Auth;
