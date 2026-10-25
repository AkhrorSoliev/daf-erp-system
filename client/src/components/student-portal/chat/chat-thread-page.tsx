"use client";

import { Screen, ScreenHeader } from "../lumio";
import { useT } from "@/i18n/context";

// Stub: a later task fills the body, the export stays.
export function ChatThreadPage({ id }: { id: string }) {
  const t = useT();
  return (
    <Screen data-conversation={id}>
      <ScreenHeader title={t("Chat")} />
    </Screen>
  );
}
