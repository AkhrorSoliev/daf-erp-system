import { Suspense } from "react";
import { TelegramSettingsClient } from "@/components/settings/telegram-settings-client";

export default function TelegramSettingsPage() {
  return (
    <Suspense>
      <TelegramSettingsClient />
    </Suspense>
  );
}
