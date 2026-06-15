import { Bell, Check, ExternalLink, Trash2 } from "lucide-react";
import type { MouseEvent } from "react";
import { useNotifications, Notification } from "@/hooks/useNotifications";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import { fr, enUS } from "date-fns/locale";
import { useLanguage } from "@/contexts/LanguageContext";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

export function NotificationBell() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification } = useNotifications();
  const { language, t } = useLanguage();
  const navigate = useNavigate();
  const dateLocale = language === "fr" ? fr : enUS;

  const handleNotificationClick = (notification: Notification) => {
    markAsRead(notification.id);
    if (notification.type === 'assignment') {
      navigate('/documents');
    }
  };

  const handleDeleteClick = (event: MouseEvent<HTMLButtonElement>, notificationId: string) => {
    event.preventDefault();
    event.stopPropagation();
    deleteNotification(notificationId);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-[10px] animate-in zoom-in"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>{t("notifications.title") || "Notifications"}</span>
          {unreadCount > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-xs h-8 px-2" 
              onClick={(e) => {
                e.stopPropagation();
                markAllAsRead();
              }}
            >
              <Check className="h-3 w-3 mr-1" />
              {t("notifications.markAllRead") || "Mark all as read"}
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ScrollArea className="h-[400px]">
          {notifications.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {t("notifications.empty") || "No notifications"}
            </div>
          ) : (
            notifications.map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                className={cn(
                  "flex flex-col items-start p-4 cursor-pointer focus:bg-accent",
                  !notification.is_read && "bg-accent/30 font-medium"
                )}
                onClick={() => handleNotificationClick(notification)}
              >
                <div className="flex justify-between items-start w-full mb-1 gap-2">
                  <span className="text-sm font-semibold">{notification.title}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(notification.created_at), {
                        addSuffix: true,
                        locale: dateLocale,
                      })}
                    </span>
                    <button
                      type="button"
                      aria-label={t("notifications.delete") || "Delete notification"}
                      className="text-muted-foreground hover:text-foreground rounded p-1"
                      onClick={(event) => handleDeleteClick(event, notification.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                  {notification.message}
                </p>
                <div className="flex items-center text-[10px] text-primary font-medium">
                  {notification.type === 'assignment' && (
                    <>
                      <ExternalLink className="h-3 w-3 mr-1" />
                      {t("notifications.viewExecution") || "View execution"}
                    </>
                  )}
                </div>
              </DropdownMenuItem>
            ))
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

