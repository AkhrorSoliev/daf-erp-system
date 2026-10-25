"use client";

import type { ReactNode } from "react";
import { ChatCircleDots } from "../lumio/icon";
import { EmptyState, Screen, Skeleton } from "../lumio";
import { LoadFailed } from "../load-failed";
import { loadState } from "../lib/load-state";
import { useT } from "@/i18n/context";
import { useChatAccess } from "./chat-queries";

export type ChatGateState = "loading" | "open" | "closed" | "failed";

/**
 * Only `GET /chat/access` answers while the company switch is off, so its
 * answer (or a 403/404 on it) is the whole decision. A network failure is
 * never "switched off": it is a request with no answer.
 */
export function chatGateState(q: {
  data: { enabled: boolean } | undefined;
  isError: boolean;
  isPaused: boolean;
  error: unknown;
}): ChatGateState {
  switch (loadState(q)) {
    case "ready":
      return q.data?.enabled ? "open" : "closed";
    case "offline":
      return "failed";
    case "failed": {
      const status = (q.error as { response?: { status?: number } } | null)
        ?.response?.status;
      return status === 403 || status === 404 ? "closed" : "failed";
    }
    default:
      return "loading";
  }
}

/** Wraps every chat page: skeleton, «Chat hali ochilmagan», or the page. */
export function ChatGate({ children }: { children: ReactNode }) {
  const t = useT();
  const access = useChatAccess();
  const state = chatGateState(access);

  if (state === "open") return <>{children}</>;

  return (
    <Screen>
      {state === "loading" && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}
      {state === "closed" && (
        <EmptyState
          icon={<ChatCircleDots weight="bold" />}
          title={t("Chat hali ochilmagan")}
          description={t("Chat ochilganda bu yerda suhbatlaringiz paydo bo'ladi.")}
        />
      )}
      {state === "failed" && <LoadFailed query={access} />}
    </Screen>
  );
}
