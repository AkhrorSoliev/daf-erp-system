"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useNotifications, type AppNotification } from "@/hooks/use-notifications";
import { notificationHref } from "./notification-href";

/**
 * What a click on a row does, for the bell and the page alike: mark it read,
 * then open what it points at (a task opens its drawer, `/tasks?task=`). A row
 * the viewer has no page for is only marked read. `afterOpen` runs just before
 * the navigation (the bell closes its panel).
 */
export function useNotificationActions(afterOpen?: () => void) {
  const router = useRouter();
  const roles = useAuth((s) => s.user?.roles);
  const markRead = useNotifications((s) => s.markRead);

  const hrefOf = (n: AppNotification) => notificationHref(n, roles?.map((r) => r.id) ?? []);
  const onOpen = (n: AppNotification) => {
    if (!n.isRead) void markRead(n.id);
    const url = hrefOf(n);
    if (!url) return;
    afterOpen?.();
    router.push(url);
  };

  return { hrefOf, onOpen };
}
