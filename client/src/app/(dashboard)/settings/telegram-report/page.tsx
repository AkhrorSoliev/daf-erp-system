import { Suspense } from "react";
import { TelegramReportSettingsClient } from "@/components/settings/telegram-report/telegram-report-settings-client";

export default function TelegramReportSettingsPage() {
  return (
    <Suspense>
      <TelegramReportSettingsClient />
    </Suspense>
  );
}
