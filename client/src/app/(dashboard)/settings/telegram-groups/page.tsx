import { Suspense } from "react";
import { TelegramGroupsClient } from "@/components/settings/telegram-groups-client";

export default function TelegramGroupsPage() {
  return (
    <Suspense>
      <TelegramGroupsClient />
    </Suspense>
  );
}
