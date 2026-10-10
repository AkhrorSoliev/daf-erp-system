import { Suspense } from "react";
import { NotificationsPageClient } from "@/components/notifications/notifications-page-client";

export default function NotificationsPage() {
  return (
    <Suspense>
      <NotificationsPageClient />
    </Suspense>
  );
}
