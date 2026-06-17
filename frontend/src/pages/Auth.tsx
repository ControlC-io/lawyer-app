import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, setToken } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { LexoraLogo } from "@/components/LexoraLogo";
import { useLanguage } from "@/contexts/LanguageContext";

const Auth = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { refreshUserData } = useAuth();
  const [searchParams] = useSearchParams();
  const next = searchParams.get("next") || "/";
  const initialEmail = searchParams.get("email") || "";
  const initialMode = (searchParams.get("mode") as "signin" | "signup") || "signin";
  const isInvited = !!searchParams.get("email");

  const [signupEnabled, setSignupEnabled] = useState(true);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">(isInvited ? initialMode : "signin");

  useEffect(() => {
    api
      .get<{ signupEnabled: boolean }>("/api/public/config", { skipAuth: true })
      .then((data) => {
        setSignupEnabled(data.signupEnabled === true);
        setConfigLoaded(true);
      })
      .catch(() => {
        setConfigLoaded(true);
      });
  }, []);

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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex justify-center mb-4">
            <LexoraLogo className="h-14 w-14" />
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
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
