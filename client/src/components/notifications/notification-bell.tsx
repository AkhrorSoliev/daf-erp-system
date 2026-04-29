"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Bell, CheckCheck, MessageSquare, ListTodo, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  useNotifications,
  type AppNotification,
} from "@/hooks/use-notifications";
import { useSSE } from "@/hooks/use-sse";
import { usePushNotifications } from "@/hooks/use-push-notifications";

const TYPE_ICONS: Record<string, typeof MessageSquare> = {
  COMMENT: MessageSquare,
  TASK_ASSIGNED: ListTodo,
  TASK_STATUS_CHANGED: CheckCheck,
  SYSTEM: Info,
};

function NotificationItem({
  notification,
  onRead,
  onNavigate,
}: {
  notification: AppNotification;
  onRead: (id: string) => void;
  onNavigate: (n: AppNotification) => void;
}) {
  const Icon = TYPE_ICONS[notification.type] || Info;

  return (
    <button
      type="button"
      className={`flex w-full items-start gap-3 rounded-md p-3 text-left transition-colors hover:bg-muted/50 ${
        !notification.isRead ? "bg-blue-50/50 dark:bg-blue-950/20" : ""
      }`}
      onClick={() => {
        if (!notification.isRead) onRead(notification.id);
        onNavigate(notification);
      }}
    >
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-medium leading-tight">
          {notification.title}
        </p>
        <p className="text-xs text-muted-foreground line-clamp-2">
          {notification.message}
        </p>
        <p className="text-xs text-muted-foreground">
          {format(new Date(notification.createdAt), "dd.MM.yyyy, HH:mm")}
        </p>
      </div>
      {!notification.isRead && (
        <div className="mt-2 size-2 shrink-0 rounded-full bg-blue-500" />
      )}
    </button>
  );
}

export function NotificationBell() {
  const router = useRouter();
  const {
    notifications,
    unreadCount,
    loading,
    fetchNotifications,
    fetchUnreadCount,
    markRead,
    markAllRead,
  } = useNotifications();

  const initialized = useRef(false);

  // Initialize SSE and push
  useSSE();
  usePushNotifications();

  // Fetch unread count on mount
  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      fetchUnreadCount();
    }
  }, [fetchUnreadCount]);

  const handleOpen = (open: boolean) => {
    if (open && notifications.length === 0) {
      fetchNotifications();
    }
  };

  const handleNavigate = (n: AppNotification) => {
    if (n.relatedEntityType && n.relatedEntityId) {
      const routes: Record<string, string> = {
        Student: `/students/${n.relatedEntityId}`,
        User: `/teachers/${n.relatedEntityId}`,
      };
      const url = routes[n.relatedEntityType];
      if (url) router.push(url);
    }
  };

  return (
    <Popover onOpenChange={handleOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="relative inline-flex size-9 items-center justify-center rounded-md border border-input bg-background text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <Bell className="size-4" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Bildirishnomalar</TooltipContent>
      </Tooltip>

      <PopoverContent className="w-96 p-0" align="end">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-sm font-semibold">Bildirishnomalar</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => markAllRead()}
            >
              <CheckCheck className="mr-1 size-3" />
              Barchasini o&apos;qilgan
            </Button>
          )}
        </div>

        <div className="max-h-80 overflow-y-auto">
          {loading && notifications.length === 0 ? (
            <div className="divide-y">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex w-full items-start gap-3 p-3">
                  <Skeleton className="size-8 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex h-20 items-center justify-center">
              <p className="text-sm text-muted-foreground">
                Bildirishnomalar yo&apos;q
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onRead={markRead}
                  onNavigate={handleNavigate}
                />
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
