"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CaretLeft } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/context";
import { Avatar, BottomSheet, Button, Skeleton } from "../lumio";
import { LoadFailed } from "../load-failed";
import { loadState } from "../lib/load-state";
import { CONTENT_INSET, useSidebar } from "../lib/sidebar-store";
import { groupByDay, peerName } from "./chat-format";
import { BlockedNotice, PeerMenu } from "./peer-menu";
import {
  useBlockedIds,
  useChatAccess,
  useConversations,
  useMarkRead,
  useMessages,
  useRemoveMessage,
} from "./chat-queries";
import {
  isNearBottom,
  lastPeerMessageId,
  mergePending,
  threadMessages,
  type ThreadItem,
} from "./chat-thread-model";
import { ChatAccessBanner } from "./chat-access-banner";
import { ChatComposer } from "./chat-composer";
import { MediaBubble } from "./media-bubble";
import { MessageBubble } from "./message-bubble";
import { useThreadSend } from "./use-thread-send";

function subscribeVisibility(cb: () => void) {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
}
const isVisible = () => document.visibilityState === "visible";

function BubbleSkeleton() {
  return (
    <div className="flex flex-col gap-2.5">
      <Skeleton className="h-10 w-2/3 self-start rounded-[20px]" />
      <Skeleton className="h-10 w-1/2 self-end rounded-[20px]" />
      <Skeleton className="h-14 w-3/5 self-start rounded-[20px]" />
    </div>
  );
}

export function ChatThreadPage({ id }: { id: string }) {
  const t = useT();
  const sidebarMode = useSidebar((s) => s.mode);
  const conversations = useConversations();
  const access = useChatAccess().data;
  const blockedIds = useBlockedIds();
  const query = useMessages(id);
  const state = loadState(query);
  const { pending, submit, retry, busy } = useThreadSend(id);
  const remove = useRemoveMessage(id);
  const { mutate: markRead } = useMarkRead(id);
  const [toDelete, setToDelete] = useState<ThreadItem | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Follow new height only while the student is at the end (true on open).
  const stick = useRef(true);
  const marked = useRef<string | undefined>(undefined);
  const visible = useSyncExternalStore(subscribeVisibility, isVisible, () => true);

  // A direct link may name a thread the list has not loaded: the title falls back.
  const peer = conversations.data?.find((c) => c.id === id)?.peer;
  const messages = threadMessages(query.data?.pages);
  const items = mergePending(messages, pending);
  const lastPeer = lastPeerMessageId(messages);

  // ONE scroll mechanism: when the list grows (images, new or optimistic
  // messages) and the student was near the end, stay at the end.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    // Growth of the list must never unstick: only the student moving UP does.
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (
        isNearBottom(y, window.innerHeight, document.documentElement.scrollHeight)
      ) {
        stick.current = true;
      } else if (y < lastY - 2) {
        stick.current = false;
      }
      lastY = y;
    };
    const ro = new ResizeObserver(() => {
      if (stick.current) {
        window.scrollTo({
          top: document.documentElement.scrollHeight,
          behavior: "auto",
        });
      }
    });
    ro.observe(list);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  // Read once on open, then whenever a newer peer message is on screen. The
  // ref holds what was last reported, so a poll that changes nothing is silent.
  useEffect(() => {
    if (state !== "ready" || !visible) return;
    const key = lastPeer ?? "";
    if (marked.current === key) return;
    marked.current = key;
    markRead();
  }, [state, visible, lastPeer, markRead]);

  const onSend = (text: string) => {
    stick.current = true;
    submit(text);
  };

  // Composer is fixed; every other state is a notice at the end of the thread.
  const notice =
    peer && blockedIds.includes(peer.id) ? (
      <BlockedNotice peer={peer} />
    ) : access && !access.canWrite ? (
      <ChatAccessBanner />
    ) : null;
  const composerShown = !notice;

  const groups = groupByDay(items, new Date(), t);

  return (
    <div className="mx-auto flex w-full flex-col md:max-w-[600px]">
      <header className="sticky top-0 z-10 -mx-4 flex items-center gap-3 border-b border-line bg-background px-4 py-2 sm:-mx-5 sm:px-5 md:mx-0 md:px-0">
        <Link
          href="/portal/chat"
          aria-label={t("Orqaga")}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink-900 shadow-lumio-sm hover:bg-tint"
        >
          <CaretLeft size={20} weight="bold" />
        </Link>
        {/* Task 7: wrap avatar + name into the button that opens the peer menu. */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar
            src={peer?.photo}
            name={peer ? peerName(peer) : null}
            size={40}
          />
          <h1 className="min-w-0 truncate font-display text-lg font-extrabold text-ink-900">
            {peer ? peerName(peer) : t("Suhbat")}
          </h1>
        </div>
        <PeerMenu conversationId={id} peer={peer} />

      </header>

      <div
        ref={listRef}
        className={cn(
          "flex flex-col gap-2 pt-4",
          "pb-4", // the layout already clears the fixed composer
        )}
      >
        {state === "loading" && <BubbleSkeleton />}
        {(state === "offline" || state === "failed") && (
          <LoadFailed query={query} />
        )}
        {state === "ready" && query.hasNextPage && (
          <Button
            variant="secondary"
            size="sm"
            className="self-center"
            loading={query.isFetchingNextPage}
            onClick={() => {
              stick.current = false; // older pages must not move the view
              void query.fetchNextPage();
            }}
          >
            {t("Oldingilarini ko'rsatish")}
          </Button>
        )}
        {state === "ready" && items.length === 0 && (
          <p className="py-10 text-center text-sm font-bold text-ink-500">
            {t("Birinchi xabarni yozing")}
          </p>
        )}
        {state === "ready" &&
          groups.map((g) => (
            <section key={g.label + g.items[0].id} className="flex flex-col gap-2">
              <h2 className="my-2 self-center rounded-full bg-tint px-3 py-1 text-xs font-bold text-ink-500">
                {g.label}
              </h2>
              {g.items.map((m) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  onDelete={setToDelete}
                  onRetry={() => retry(m.id.replace("pending:", ""))}
                  renderMedia={(msg) => <MediaBubble message={msg} />}
                />
              ))}
            </section>
          ))}
        {notice && <div className="pt-2">{notice}</div>}
      </div>

      {/* Outside the content column (fixed), so it clears the rail itself. */}
      {composerShown && (
        <div
          className={cn(
            "fixed inset-x-0 bottom-0 z-20 transition-[padding] duration-200 ease-out",
            CONTENT_INSET[sidebarMode],
          )}
        >
          <div className="border-t border-line bg-surface">
            <div className="mx-auto w-full max-w-[600px] px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
              {access ? (
                <ChatComposer conversationId={id} onSend={onSend} busy={busy} />
              ) : (
                <Skeleton className="h-12 w-full rounded-[26px]" />
              )}
            </div>
          </div>
        </div>
      )}

      <BottomSheet
        open={toDelete !== null}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={t("Xabar o'chirilsinmi?")}
      >
        <div className="flex flex-col gap-2.5">
          <Button
            variant="danger"
            block
            loading={remove.isPending}
            onClick={() =>
              toDelete &&
              remove.mutate(toDelete.id, { onSuccess: () => setToDelete(null) })
            }
          >
            {t("O'chirish")}
          </Button>
          <Button variant="secondary" block onClick={() => setToDelete(null)}>
            {t("Bekor qilish")}
          </Button>
        </div>
      </BottomSheet>
    </div>
  );
}
