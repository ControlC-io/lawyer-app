import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

interface StepLogsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  stepId: string | null;
  steps: any[];
  logs: any[];
}

export const StepLogsDialog = ({ isOpen, onClose, stepId, steps, logs }: StepLogsDialogProps) => {
  const stepName = stepId ? steps?.find(s => s.id === stepId)?.workflow_steps?.name : "";
  const stepLogs = stepId ? logs?.filter((log: any) => log.step_id === stepId) || [] : [];

  const getLogVariant = (type: string) => {
    switch(type.toLowerCase()) {
      case "success": return "default";
      case "error": return "destructive";
      case "info":
      default: return "secondary";
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>
            {stepName} - Logs
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-[60vh] w-full">
          {stepLogs.length > 0 ? (
            <div className="space-y-4 pr-4">
              {stepLogs.map((log: any) => {
                const logType = log.log_type || "info";
                
                return (
                  <Card key={log.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant={getLogVariant(logType)} className="text-xs">
                            {logType.charAt(0).toUpperCase() + logType.slice(1).toLowerCase()}
                          </Badge>
                          <CardTitle className="text-sm text-muted-foreground">
                            {format(new Date(log.created_at), "PPpp")}
                          </CardTitle>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div 
                        className="prose prose-sm max-w-none dark:prose-invert" 
                        dangerouslySetInnerHTML={{ __html: log.log_text }} 
                      />
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-8">
              No logs available for this step
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

