"use client";

import Link from "next/link";
import { ChatCircleDots, Gear } from "../lumio/icon";
import { EmptyState, Screen, ScreenHeader, Skeleton, lumioButton } from "../lumio";
import { LoadFailed } from "../load-failed";
import { loadState } from "../lib/load-state";
import { useT } from "@/i18n/context";
import { useConversations } from "./chat-queries";
import { ChatAccessBanner } from "./chat-access-banner";
import { ConversationRow } from "./conversation-row";

export function ChatListPage() {
  const t = useT();
  const list = useConversations();
  const state = loadState(list);
  const newChat = (
    <Link href="/portal/chat/new" className={lumioButton({ size: "sm" })}>
      {t("Yangi chat")}
    </Link>
  );

  return (
    <Screen narrow>
      <ScreenHeader
        title={t("Chat")}
        right={
          <div className="flex items-center gap-2">
            {newChat}
            <Link
              href="/portal/chat/settings"
              aria-label={t("Sozlamalar")}
              className="inline-flex size-10 items-center justify-center rounded-full border border-line bg-surface text-ink-700 hover:bg-tint"
            >
              <Gear size={22} weight="bold" />
            </Link>
          </div>
        }
      />
      <ChatAccessBanner />
      {state === "loading" && (
        <div className="flex flex-col gap-2.5">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-card border border-line bg-surface px-3.5 py-3"
            >
              <Skeleton className="size-[50px] shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3.5 w-full" />
              </div>
            </div>
          ))}
        </div>
      )}
      {(state === "offline" || state === "failed") && (
        <LoadFailed query={list} />
      )}
      {state === "ready" && list.data!.length === 0 && (
        <EmptyState
          icon={<ChatCircleDots weight="bold" />}
          title={t("Hali yozishma yo'q")}
          action={newChat}
        />
      )}
      {state === "ready" && list.data!.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {list.data!.map((c) => (
            <ConversationRow key={c.id} conversation={c} />
          ))}
        </div>
      )}
    </Screen>
  );
}
