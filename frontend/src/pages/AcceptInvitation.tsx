import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, CheckCircle2 } from "lucide-react";

export default function AcceptInvitation() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const { user, loading: authLoading, setSelectedCompanyId, refreshUserData, signOut } = useAuth();
  const [loading, setLoading] = useState(true);
  const [invitationInfo, setInvitationInfo] = useState<{ company_name: string; email: string } | null>(null);
  const [emailExists, setEmailExists] = useState<boolean | null>(null);
  const [accepted, setAccepted] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (token) {
      fetchInvitationInfo();
    } else {
      setLoading(false);
    }
  }, [token]);

  const fetchInvitationInfo = async () => {
    try {
      const data = await api.get<{ email: string; company_name: string; company_id: string; role: string }>(
        `/api/invitations/${token}`
      ).catch(() => null);
      if (data) {
        setInvitationInfo({ company_name: data.company_name, email: data.email });
        const check = await api.get<{ exists: boolean }>(`/api/invitations/check-email?email=${encodeURIComponent(data.email)}`).catch(() => ({ exists: false }));
        setEmailExists(check?.exists ?? false);
      } else {
        toast.error("Invitation not found or expired");
      }
    } catch (err) {
      console.error(err);
      toast.error("Invitation not found or expired");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // If we have token and info but no user, and we're not loading, redirect to auth
    if (!authLoading && !user && !loading && token && invitationInfo && emailExists !== null) {
      const nextPath = window.location.pathname + window.location.search;
      const mode = emailExists ? "signin" : "signup";
      navigate(`/auth?next=${encodeURIComponent(nextPath)}&email=${encodeURIComponent(invitationInfo.email)}&mode=${mode}`);
    }
  }, [user, authLoading, loading, token, invitationInfo, emailExists, navigate]);

  const handleAccept = async () => {
    if (!token || !user) return;
    setLoading(true);
    try {
      const data = await api.post<{ success: boolean; companyId?: string }>(`/api/invitations/${token}/accept`);
      if (data.success) {
        toast.success("Successfully joined the organization!");
        if (data.companyId) setSelectedCompanyId(data.companyId);
        await refreshUserData();
        setAccepted(true);
      }
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Failed to accept invitation");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!token || !invitationInfo) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invalid Invitation</CardTitle>
            <CardDescription>This invitation link is invalid or has expired.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Please contact the person who invited you to request a new invitation.
            </p>
          </CardContent>
          <CardFooter>
            <Button onClick={() => navigate("/")} className="w-full" variant="outline">
              Go to Home
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (accepted) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-muted/30 p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="flex justify-center mb-4">
              <CheckCircle2 className="h-16 w-16 text-green-500" />
            </div>
            <CardTitle className="text-2xl">Welcome to {invitationInfo.company_name}!</CardTitle>
            <CardDescription>
              You have successfully joined the organization. You can now access all shared workflows and documents.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button onClick={() => navigate("/app")} className="w-full" size="lg">
              Go to Application
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Join {invitationInfo.company_name}</CardTitle>
          <CardDescription>
            You have been invited to join <strong>{invitationInfo.company_name}</strong>.
            {user?.email && user.email.toLowerCase() !== invitationInfo.email.toLowerCase() && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md text-amber-800 text-sm">
                <strong>Warning:</strong> This invitation was sent to <strong>{invitationInfo.email}</strong>, but you are signed in as <strong>{user.email}</strong>.
              </div>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            By accepting this invitation, you will be added as a member of this organization and will have access to its resources.
          </p>
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button onClick={handleAccept} className="w-full" size="lg" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Accept Invitation
          </Button>
          {user && (
             <Button variant="ghost" className="w-full text-xs" onClick={() => signOut()}>
                Sign in with a different account
             </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}

