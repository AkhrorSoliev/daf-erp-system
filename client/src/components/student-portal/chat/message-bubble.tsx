"use client";

import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { ArrowBendUpLeft, DotsThree } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { tashkentHhmm } from "@/lib/tashkent-time";
import { useT } from "@/i18n/context";
import { shouldReplyOnRelease, swipeStep, type SwipeState } from "./chat-swipe";
import type { MessageView, ReplyView } from "./chat-types";
import type { ThreadItem } from "./chat-thread-model";

/**
 * Neutral stand-in for a photo or a voice note. Task 6 passes `renderMedia`
 * to MessageBubble and this stays only as the fallback.
 */
export function MediaPlaceholder({ message }: { message: MessageView }) {
  const t = useT();
  return (
    <span className="italic opacity-80">
      {message.kind === "IMAGE" ? t("Rasm") : t("Ovozli xabar")}
    </span>
  );
}

/** The words a reply shows of the message it answers; a file is named, never shown. */
export function replyBody(reply: ReplyView, t: (s: string) => string): string {
  if (reply.deleted) return t("O'chirilgan xabar");
  if (reply.kind === "IMAGE") return t("Rasm");
  if (reply.kind === "VOICE") return t("Ovozli xabar");
  return reply.preview;
}

/** The quoted message above a reply; tapping it scrolls to the original. */
function ReplyQuote({
  reply,
  label,
  mine,
  onJump,
}: {
  reply: ReplyView;
  label: string;
  mine: boolean;
  onJump?: (id: string) => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={() => onJump?.(reply.id)}
      className={cn(
        "mb-1.5 block w-full min-w-0 rounded-xl border-l-[3px] px-2.5 py-1.5 text-left text-[13px] leading-[1.3]",
        mine
          ? "border-white/70 bg-white/15 text-white"
          : "border-coral-500 bg-tint text-ink-500",
      )}
    >
      <span className="block truncate font-extrabold">
        {reply.mine ? t("Siz") : label}
      </span>
      <span
        className={cn(
          "block truncate font-semibold",
          reply.deleted && "italic opacity-80",
        )}
      >
        {replyBody(reply, t)}
      </span>
    </button>
  );
}

/**
 * One message. `mine` is coral on the right with a tail, the peer's is white on
 * the left, the time sits under it. The text is DATA: never through t(), never
 * as HTML. The arrow beside it, or a swipe to the left, answers it.
 */
export function MessageBubble({
  message,
  peerLabel,
  onReply,
  onActions,
  onJump,
  onRetry,
  renderMedia,
}: {
  message: ThreadItem;
  /** The peer's name, for the quote of a message of theirs. */
  peerLabel: string;
  /** Answers this message (swipe on touch, arrow on hover). */
  onReply?: (message: ThreadItem) => void;
  /** Opens edit / delete; offered on my own sent messages only. */
  onActions?: (message: ThreadItem) => void;
  /** Scrolls to the message a reply answers. */
  onJump?: (id: string) => void;
  onRetry?: (message: ThreadItem) => void;
  /** Content of an IMAGE / VOICE bubble (Task 6). */
  renderMedia?: (message: MessageView) => ReactNode;
}) {
  const t = useT();
  const me = message.mine;
  const failed = message.pending === "failed";
  const sending = message.pending === "sending";
  const settled = !message.pending;
  const canReply = settled && onReply;
  const canAct = settled && me && onActions;

  const swipe = useRef<SwipeState | null>(null);
  const [dx, setDx] = useState(0);

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (!canReply || e.pointerType === "mouse") return;
    swipe.current = { x: e.clientX, y: e.clientY, locked: false };
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const s = swipe.current;
    if (!s) return;
    const step = swipeStep(s, e.clientX, e.clientY);
    if (step.cancel) {
      swipe.current = null;
      setDx(0);
      return;
    }
    swipe.current = step.state;
    if (step.state.locked) setDx(step.dx);
  };
  const end = () => {
    const s = swipe.current;
    swipe.current = null;
    if (s?.locked && shouldReplyOnRelease(dx) && onReply) {
      onReply(message);
      navigator.vibrate?.(10);
    }
    setDx(0);
  };

  const progress = Math.min(1, Math.abs(dx) / 44);

  return (
    <div
      id={`msg-${message.id}`}
      className={cn("group relative flex w-full", me ? "justify-end" : "justify-start")}
    >
      {/* Under the sliding bubble: shows up as it moves. */}
      <span
        aria-hidden
        className="pointer-events-none absolute right-1 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-tint text-coral-500"
        style={{ opacity: progress, transform: `translateY(-50%) scale(${0.6 + 0.4 * progress})` }}
      >
        <ArrowBendUpLeft size={18} weight="bold" />
      </span>
      <div
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        style={{
          transform: dx ? `translateX(${dx}px)` : undefined,
          transition: dx ? "none" : "transform 160ms ease-out",
          touchAction: "pan-y",
        }}
        className={cn(
          "flex max-w-[78%] flex-col",
          me ? "items-end" : "items-start",
        )}
      >
        <div className={cn("flex items-center gap-1", !me && "flex-row-reverse")}>
          {canAct ? (
            <button
              type="button"
              aria-label={t("Xabar amallari")}
              onClick={() => onActions(message)}
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-ink-400 hover:bg-tint"
            >
              <DotsThree size={20} weight="bold" />
            </button>
          ) : null}
          {canReply ? (
            // Always visible (a phone has no hover); the swipe is the shortcut.
            <button
              type="button"
              aria-label={t("Javob berish")}
              onClick={() => onReply(message)}
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-ink-400 hover:bg-tint"
            >
              <ArrowBendUpLeft size={18} weight="bold" />
            </button>
          ) : null}
          <div
            className={cn(
              "min-w-0 rounded-[20px] px-[15px] py-[11px] text-[15.5px] font-semibold leading-[1.4]",
              me
                ? "rounded-br-md text-white shadow-[0_4px_12px_rgba(255,107,74,.28)]"
                : "rounded-bl-md border border-line bg-surface text-ink-900 shadow-lumio-sm",
              me && (failed ? "bg-danger" : "bg-coral-500"),
              sending && "opacity-70",
            )}
          >
            {message.replyTo ? (
              <ReplyQuote
                reply={message.replyTo}
                label={peerLabel}
                mine={me}
                onJump={onJump}
              />
            ) : null}
            {message.kind === "TEXT" ? (
              <span className="whitespace-pre-wrap break-words">
                {message.text}
              </span>
            ) : (
              (renderMedia?.(message) ?? <MediaPlaceholder message={message} />)
            )}
          </div>
        </div>
        <div className="mx-1.5 mt-1 flex items-center gap-2 text-[11px] font-bold text-ink-400">
          {sending ? (
            <span>{t("yuborilmoqda")}</span>
          ) : failed ? (
            <>
              <span className="text-danger">{t("Yuborilmadi")}</span>
              <button
                type="button"
                onClick={() => onRetry?.(message)}
                className="font-extrabold text-danger underline"
              >
                {t("Qayta yuborish")}
              </button>
            </>
          ) : (
            <>
              {message.editedAt ? <span>{t("tahrirlangan")}</span> : null}
              <span>{tashkentHhmm(message.createdAt)}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
