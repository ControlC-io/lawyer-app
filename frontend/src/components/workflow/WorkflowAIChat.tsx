import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2, Mic, MicOff } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
import ReactMarkdown from "react-markdown";
import { useVoiceRecording } from "@/hooks/useVoiceRecording";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface WorkflowAIChatProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
}

export function WorkflowAIChat({ open, onOpenChange, companyId }: WorkflowAIChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Bonjour ! Je vais vous aider à créer votre workflow. Pour commencer, pouvez-vous me décrire le processus que vous souhaitez automatiser ?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { isRecording, isTranscribing, startRecording, stopRecording, cancelRecording } = useVoiceRecording();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const data = await api.post<{ workflowId?: string; message?: string }>(
        "/api/agents/workflows/create-with-ai",
        { messages: [...messages, userMessage], companyId }
      );

      if (data?.workflowId) {
        // Workflow créé avec succès
        toast({
          title: "Workflow créé !",
          description: "Votre workflow a été créé avec succès.",
        });
        onOpenChange(false);
        navigate(`/workflow/${data.workflowId}`);
      } else if (data.message) {
        // L'IA pose une autre question
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.message },
        ]);
      }
    } catch (error) {
      console.error("Error creating workflow with AI:", error);
      toast({
        title: "Erreur",
        description: "Une erreur est survenue lors de la création du workflow.",
        variant: "destructive",
      });
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Désolé, une erreur est survenue. Pouvez-vous réessayer ?",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleMicClick = async () => {
    if (isRecording) {
      try {
        const transcribedText = await stopRecording();
        if (transcribedText) {
          setInput(prev => prev ? `${prev} ${transcribedText}` : transcribedText);
        }
      } catch (error) {
        console.error('Error stopping recording:', error);
      }
    } else {
      startRecording();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] h-[600px] flex flex-col">
        <DialogHeader>
          <DialogTitle>Create Workflow with AI</DialogTitle>
        </DialogHeader>
        <ScrollArea className="flex-1 pr-4" ref={scrollRef}>
          <div className="space-y-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  }`}
                >
                  <div className="text-sm prose prose-sm max-w-none dark:prose-invert">
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-4 py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
        <div className="flex gap-2 pt-4 border-t">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Décrivez votre workflow..."
            className="min-h-[60px] resize-none"
            disabled={isLoading || isRecording || isTranscribing}
          />
          <Button
            onClick={handleMicClick}
            disabled={isLoading || isTranscribing}
            size="icon"
            variant={isRecording ? "destructive" : "outline"}
            className="h-[60px] w-[60px] shrink-0"
          >
            {isTranscribing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isRecording ? (
              <MicOff className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </Button>
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isLoading || isRecording || isTranscribing}
            size="icon"
            className="h-[60px] w-[60px] shrink-0"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
