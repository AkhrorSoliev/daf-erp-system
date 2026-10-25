"use client";

import { Screen, ScreenHeader } from "../lumio";
import { useT } from "@/i18n/context";

// Stub: a later task fills the body, the export stays.
export function ChatSettingsPage() {
  const t = useT();
  return (
    <Screen>
      <ScreenHeader title={t("Chat")} />
    </Screen>
  );
}
