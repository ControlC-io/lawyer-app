import { useState, useRef, useMemo } from "react";
import { MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { api } from "@/lib/api";

interface FeedbackDialogProps {
  isCollapsed?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function FeedbackDialog({ isCollapsed = false, open: controlledOpen, onOpenChange }: FeedbackDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { profile } = useAuth();
  const { t } = useLanguage();
  const quillRef = useRef<ReactQuill>(null);

  // Use controlled state if provided, otherwise use internal state
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;

  // Image handler for pasting/uploading images
  const imageHandler = () => {
    const input = document.createElement('input');
    input.setAttribute('type', 'file');
    input.setAttribute('accept', 'image/*');
    input.click();

    input.onchange = async () => {
      const file = input.files?.[0];
      if (file) {
        // Convert image to base64
        const reader = new FileReader();
        reader.onload = (e) => {
          const quill = quillRef.current?.getEditor();
          if (quill && e.target?.result) {
            const range = quill.getSelection(true);
            quill.insertEmbed(range.index, 'image', e.target.result);
            quill.setSelection(range.index + 1, 0);
          }
        };
        reader.readAsDataURL(file);
      }
    };
  };

  const modules = useMemo(() => ({
    toolbar: {
      container: [
        [{ header: [1, 2, 3, false] }],
        ["bold", "italic", "underline", "strike"],
        [{ list: "ordered" }, { list: "bullet" }],
        ["link", "image"],
        ["clean"],
      ],
      handlers: {
        image: imageHandler,
      },
    },
  }), []);

  const formats = [
    "header",
    "bold",
    "italic",
    "underline",
    "strike",
    "list",
    "bullet",
    "link",
    "image",
  ];

  const handleSubmit = async () => {
    if (!feedback.trim() || feedback === "<p><br></p>") {
      toast.error(t("feedback.required"));
      return;
    }

    setIsSubmitting(true);

    try {
      await api.post(
        "/api/public/feedback",
        {
          userEmail: profile?.email || "anonymous@picobello.app",
          userName: profile?.full_name || "Anonymous User",
          feedback,
        },
        { skipAuth: true }
      );
      toast.success(t("feedback.success"));
      setFeedback("");
      setOpen(false);
    } catch (error: unknown) {
      console.error("Error sending feedback:", error);
      const errorMessage = error instanceof Error ? error.message : t("feedback.error");
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {isCollapsed ? (
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0"
            title={t("sidebar.feedback")}
          >
            <MessageSquare className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant="outline" className="w-full justify-start">
            <MessageSquare className="h-4 w-4 mr-2" />
            {t("sidebar.feedback")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>{t("feedback.title")}</DialogTitle>
          <DialogDescription>
            {t("feedback.description")}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <ReactQuill
            ref={quillRef}
            theme="snow"
            value={feedback}
            onChange={setFeedback}
            modules={modules}
            formats={formats}
            placeholder={t("feedback.placeholder")}
            style={{ height: "200px", marginBottom: "50px" }}
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isSubmitting}
          >
            {t("feedback.cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <>{t("feedback.sending")}</>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                {t("feedback.send")}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
