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
  useEditMessage,
  useMarkRead,
  useMessages,
  usePeer,
  useRemoveMessage,
} from "./chat-queries";
import {
  canEdit,
  isNearBottom,
  lastPeerMessageId,
  mergePending,
  threadMessages,
  type ThreadItem,
} from "./chat-thread-model";
import type { ReplyView } from "./chat-types";
import { useChatPeerTyping } from "./chat-stream-store";
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

/** The message as a reply card; its words are the text, a file is named by kind. */
const asReply = (m: ThreadItem): ReplyView => ({
  id: m.id,
  mine: m.mine,
  kind: m.kind,
  deleted: false,
  preview: m.text ?? "",
});

export function ChatThreadPage({ id }: { id: string }) {
  const t = useT();
  const sidebarMode = useSidebar((s) => s.mode);
  const access = useChatAccess().data;
  const blockedIds = useBlockedIds();
  const query = useMessages(id);
  const state = loadState(query);
  const { pending, submit, retry, busy } = useThreadSend(id);
  const remove = useRemoveMessage(id);
  const edit = useEditMessage(id);
  const { mutate: markRead } = useMarkRead(id);
  const [toDelete, setToDelete] = useState<ThreadItem | null>(null);
  // The message whose actions are open, and whether it may still be edited
  // (decided when it opens, so render stays free of the clock).
  const [actions, setActions] = useState<{
    message: ThreadItem;
    editable: boolean;
  } | null>(null);
  const [replyTo, setReplyTo] = useState<ThreadItem | null>(null);
  const [editing, setEditing] = useState<ThreadItem | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  // Follow new height only while the student is at the end (true on open).
  const stick = useRef(true);
  const marked = useRef<string | undefined>(undefined);
  const visible = useSyncExternalStore(subscribeVisibility, isVisible, () => true);

  // A direct link may name a thread the list has not loaded: the title falls back.
  const peer = usePeer(id);
  const peerTyping = useChatPeerTyping(id);
  const messages = threadMessages(query.data?.pages);
  const items = mergePending(messages, pending);
  const lastPeer = lastPeerMessageId(messages);
  const peerLabel = peer ? peerName(peer) : t("Suhbat");

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
    submit(text, replyTo ? asReply(replyTo) : null);
    setReplyTo(null);
  };

  const onEdit = (text: string) => {
    if (!editing) return;
    edit.mutate(
      { messageId: editing.id, text },
      { onSuccess: () => setEditing(null) },
    );
  };

  // Swipe (touch) or the arrow beside a bubble (mouse) answers a message.
  const startReply = (m: ThreadItem) => {
    setEditing(null);
    setReplyTo(m);
  };

  const jumpTo = (messageId: string) => {
    const el = document.getElementById(`msg-${messageId}`);
    if (!el) return;
    stick.current = false; // the student chose to look back
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  const replyLabel = (m: ThreadItem) => (m.mine ? t("Siz") : peerLabel);
  const replyPreview = (m: ThreadItem) =>
    m.kind === "IMAGE"
      ? t("Rasm")
      : m.kind === "VOICE"
        ? t("Ovozli xabar")
        : (m.text ?? "");

  // Composer is fixed; every other state is a notice at the end of the thread.
  const notice =
    peer && blockedIds.includes(peer.id) ? (
      <BlockedNotice peer={peer} />
    ) : access && !access.canWrite ? (
      <ChatAccessBanner />
    ) : null;
  const composerShown = !notice;

  // The fixed composer grows (reply line, emoji panel): the spacer at the end
  // of the list grows with it, so the last message stays above the composer.
  // At the end the list's observer follows; scrolled up, the view moves by
  // the same amount, like Telegram.
  useEffect(() => {
    const composer = composerRef.current;
    const spacer = spacerRef.current;
    if (!composer || !spacer) return;
    let last = 0;
    const ro = new ResizeObserver(() => {
      const h = composer.offsetHeight;
      spacer.style.height = `${h}px`;
      if (!stick.current && last) window.scrollBy(0, h - last);
      last = h;
    });
    ro.observe(composer);
    return () => {
      ro.disconnect();
      spacer.style.height = "0px";
    };
  }, [composerShown]);

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
          <div className="min-w-0">
            <h1 className="truncate font-display text-lg font-extrabold text-ink-900">
              {peerLabel}
            </h1>
            {peerTyping && (
              <p className="truncate text-xs font-semibold text-ink-500">
                {t("yozmoqda…")}
              </p>
            )}
          </div>
        </div>
        <PeerMenu conversationId={id} peer={peer} />

      </header>

      <div
        ref={listRef}
        className={cn(
          "flex flex-col gap-2 pt-4",
          "pb-4",
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
                  peerLabel={peerLabel}
                  onReply={composerShown ? startReply : undefined}
                  onActions={(msg) =>
                    setActions({
                      message: msg,
                      editable: canEdit(msg, Date.now()),
                    })
                  }
                  onJump={jumpTo}
                  onRetry={() => retry(m.id.replace("pending:", ""))}
                  renderMedia={(msg) => <MediaBubble message={msg} />}
                />
              ))}
            </section>
          ))}
        {notice && <div className="pt-2">{notice}</div>}
        {/* Height of the fixed composer, set by its observer. */}
        <div ref={spacerRef} aria-hidden className="shrink-0" />
      </div>

      {/* Outside the content column (fixed), so it clears the rail itself. */}
      {composerShown && (
        <div
          ref={composerRef}
          className={cn(
            "fixed inset-x-0 bottom-0 z-20 transition-[padding] duration-200 ease-out",
            CONTENT_INSET[sidebarMode],
          )}
        >
          <div className="border-t border-line bg-surface">
            <div className="mx-auto w-full max-w-[600px] px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
              {access ? (
                <ChatComposer
                  key={editing?.id ?? "compose"}
                  conversationId={id}
                  onSend={onSend}
                  busy={busy}
                  reply={
                    replyTo
                      ? {
                          id: replyTo.id,
                          label: replyLabel(replyTo),
                          preview: replyPreview(replyTo),
                        }
                      : null
                  }
                  onCancelReply={() => setReplyTo(null)}
                  editing={
                    editing ? { id: editing.id, text: editing.text ?? "" } : null
                  }
                  onEdit={onEdit}
                  onCancelEdit={() => setEditing(null)}
                  editBusy={edit.isPending}
                />
              ) : (
                <Skeleton className="h-12 w-full rounded-[26px]" />
              )}
            </div>
          </div>
        </div>
      )}

      <BottomSheet
        open={actions !== null}
        onOpenChange={(open) => !open && setActions(null)}
        title={t("Xabar amallari")}
      >
        <div className="flex flex-col gap-2.5">
          {composerShown && actions?.editable && (
            <Button
              variant="secondary"
              block
              onClick={() => {
                if (!actions) return;
                setReplyTo(null);
                setEditing(actions.message);
                setActions(null);
              }}
            >
              {t("Tahrirlash")}
            </Button>
          )}
          {actions?.message.mine && (
            <Button
              variant="danger"
              block
              onClick={() => {
                setToDelete(actions.message);
                setActions(null);
              }}
            >
              {t("O'chirish")}
            </Button>
          )}
        </div>
      </BottomSheet>

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
