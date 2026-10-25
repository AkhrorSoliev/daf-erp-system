"use client";

import { Screen, Section, Skeleton, StackHeader } from "../lumio";
import { LoadFailed } from "../load-failed";
import { loadState } from "../lib/load-state";
import { useT } from "@/i18n/context";
import { useChatMe } from "./chat-queries";
import { PrivacyForm } from "./privacy-form";
import { UsernameField } from "./username-field";

export function ChatSettingsPage() {
  const t = useT();
  const me = useChatMe();
  const state = loadState(me);
  return (
    <Screen narrow>
      <StackHeader title={t("Chat sozlamalari")} backHref="/portal/chat" />
      {state === "loading" && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-[54px] w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}
      {(state === "offline" || state === "failed") && (
        <LoadFailed query={me} />
      )}
      {state === "ready" && (
        <>
          <Section title={t("Foydalanuvchi nomi")}>
            {/* key: a fresh answer for another name resets the field */}
            <UsernameField key={me.data!.username ?? ""} current={me.data!.username} />
          </Section>
          <Section title={t("Maxfiylik")}>
            <PrivacyForm me={me.data!} />
          </Section>
        </>
      )}
    </Screen>
  );
}
