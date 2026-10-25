"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { useT } from "@/i18n/context";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { Avatar, Input, Screen, Skeleton, StackHeader } from "../lumio";
import { LoadFailed } from "../load-failed";
import { loadState } from "../lib/load-state";
import { peerName } from "./chat-format";
import { useOpenConversation } from "./chat-queries";
import { parseChatQuery } from "./chat-search-model";
import type { OpenConversationBody, PeerSummary } from "./chat-types";
import { useChatSearch } from "./use-chat-search";

const ROW =
  "flex w-full items-center gap-3 rounded-card border border-line bg-surface px-3.5 py-3 text-left shadow-lumio-sm transition-colors hover:bg-tint disabled:opacity-60";

export function NewChatPage() {
  const t = useT();
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const debounced = useDebouncedValue(raw, 300);
  const open = useOpenConversation();
  const typed = parseChatQuery(raw);
  const settled = parseChatQuery(debounced);
  // Search only once the typing has settled on the same name.
  const nameQ =
    typed.kind === "name" && settled.kind === "name" && settled.q === typed.q
      ? typed.q
      : null;
  const search = useChatSearch(nameQ);
  const state = loadState(search);

  const start = (body: OpenConversationBody) =>
    open.mutate(body, {
      onSuccess: (c) => router.replace(`/portal/chat/${c.id}`),
    });
  const startPeer = (p: PeerSummary) =>
    start(p.username ? { username: p.username } : { studentId: p.id });

  return (
    <Screen narrow>
      <StackHeader title={t("Yangi chat")} backHref="/portal/chat" />
      <Input
        autoFocus
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder={t("Ism yoki @nom")}
        iconBefore={<MagnifyingGlass />}
        maxLength={40}
        aria-label={t("Ism yoki @nom")}
      />
      <div className="mt-3 flex flex-col gap-2.5">
        {typed.kind === "invalid" && (
          <p className="px-1 text-sm font-semibold text-ink-500">
            {t("@nom 5–32 belgidan iborat: lotin harf, raqam va _")}
          </p>
        )}
        {typed.kind === "username" && (
          <button
            type="button"
            className={ROW}
            disabled={open.isPending}
            onClick={() => start({ username: typed.username })}
          >
            <span className="font-display text-base font-bold text-ink-900">
              {t("@{username} ni ochish", { username: typed.username })}
            </span>
          </button>
        )}
        {nameQ === null && typed.kind === "name" && <ResultSkeleton />}
        {nameQ !== null && state === "loading" && <ResultSkeleton />}
        {nameQ !== null && (state === "offline" || state === "failed") && (
          <LoadFailed query={search} />
        )}
        {nameQ !== null && state === "ready" && search.data!.length === 0 && (
          <div className="px-1 py-6 text-center">
            <p className="font-display text-lg font-bold text-ink-900">
              {t("Topilmadi")}
            </p>
            <p className="mt-1 text-sm font-semibold text-ink-500">
              {t("O'quvchi maxfiylik sozlamasi tufayli ko'rinmasligi mumkin.")}
            </p>
          </div>
        )}
        {nameQ !== null &&
          state === "ready" &&
          search.data!.map((p) => (
            <button
              key={p.id}
              type="button"
              className={ROW}
              disabled={open.isPending}
              onClick={() => startPeer(p)}
            >
              <Avatar src={p.photo} name={peerName(p)} size={46} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-base font-bold text-ink-900">
                  {peerName(p)}
                </span>
                {p.username ? (
                  <span className="block truncate text-sm font-semibold text-ink-500">
                    @{p.username}
                  </span>
                ) : null}
              </span>
            </button>
          ))}
      </div>
    </Screen>
  );
}

function ResultSkeleton() {
  return (
    <>
      {[0, 1].map((i) => (
        <Skeleton key={i} className="h-[68px] w-full rounded-card" />
      ))}
    </>
  );
}
