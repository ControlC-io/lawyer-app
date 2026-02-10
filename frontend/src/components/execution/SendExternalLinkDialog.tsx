
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Mail, Loader2, Plus, X } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

interface SendExternalLinkDialogProps {
  isOpen: boolean;
  onClose: () => void;
  token: string;
  executionId: string;
  companyId: string;
  stepName: string;
}

export const SendExternalLinkDialog = ({
  isOpen,
  onClose,
  token,
  executionId,
  companyId,
  stepName,
}: SendExternalLinkDialogProps) => {
  const [emails, setEmails] = useState<string[]>([""]);
  const [comment, setComment] = useState<string>("");
  const [isSending, setIsSending] = useState(false);

  const handleAddEmail = () => {
    setEmails([...emails, ""]);
  };

  const handleRemoveEmail = (index: number) => {
    const newEmails = emails.filter((_, i) => i !== index);
    if (newEmails.length === 0) newEmails.push("");
    setEmails(newEmails);
  };

  const handleEmailChange = (index: number, value: string) => {
    const newEmails = [...emails];
    newEmails[index] = value;
    setEmails(newEmails);
  };

  const handleSend = async () => {
    const validEmails = emails
      .map((e) => e.trim())
      .filter((e) => e !== "" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

    if (validEmails.length === 0) {
      toast({
        title: "Invalid Email",
        description: "Please enter at least one valid email address.",
        variant: "destructive",
      });
      return;
    }

    setIsSending(true);
    try {
      await Promise.all(
        validEmails.map((email) =>
          api.post(`/api/external/steps/${encodeURIComponent(token)}/send-link`, {
            email,
            token,
            executionId,
            companyId,
            stepName,
            comment: comment.trim() || undefined,
          })
        )
      );
      toast({
        title: "Emails Sent",
        description: `Successfully sent the form link to ${validEmails.length} recipient(s).`,
      });
      onClose();
      setEmails([""]);
      setComment("");
    } catch (error: unknown) {
      console.error("Error sending emails:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send emails. Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send Form Link</DialogTitle>
          <DialogDescription>
            Send an email with the link to complete this form to the following recipients.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Recipient Email Addresses</Label>
            {emails.map((email, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  type="email"
                  placeholder="email@example.com"
                  value={email}
                  onChange={(e) => handleEmailChange(index, e.target.value)}
                  disabled={isSending}
                />
                {emails.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveEmail(index)}
                    disabled={isSending}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={handleAddEmail}
              disabled={isSending}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Recipient
            </Button>
          </div>
          <div className="space-y-2">
            <Label htmlFor="comment">Comment (optional)</Label>
            <Textarea
              id="comment"
              placeholder="Add a message to include in the email..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={isSending}
              rows={4}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={isSending}>
            {isSending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Mail className="mr-2 h-4 w-4" />
                Send Emails
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

