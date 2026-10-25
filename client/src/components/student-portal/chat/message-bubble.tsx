"use client";

import type { ReactNode } from "react";
import { DotsThree } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { tashkentHhmm } from "@/lib/tashkent-time";
import { useT } from "@/i18n/context";
import type { MessageView } from "./chat-types";
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

/**
 * One message. `mine` is coral on the right with a tail, the peer's is white on
 * the left, the time sits under it. The text is DATA: never through t(), never
 * as HTML.
 */
export function MessageBubble({
  message,
  onDelete,
  onRetry,
  renderMedia,
}: {
  message: ThreadItem;
  /** Opens the delete confirmation; only offered on my own sent messages. */
  onDelete?: (message: ThreadItem) => void;
  onRetry?: (message: ThreadItem) => void;
  /** Content of an IMAGE / VOICE bubble (Task 6). */
  renderMedia?: (message: MessageView) => ReactNode;
}) {
  const t = useT();
  const me = message.mine;
  const failed = message.pending === "failed";
  const sending = message.pending === "sending";
  const canDelete = me && !message.pending && onDelete;

  return (
    <div
      className={cn(
        "flex max-w-[78%] flex-col",
        me ? "items-end self-end" : "items-start self-start",
      )}
    >
      <div className="flex items-center gap-1">
        {canDelete ? (
          <button
            type="button"
            aria-label={t("Xabar amallari")}
            onClick={() => onDelete(message)}
            className="inline-flex size-8 items-center justify-center rounded-full text-ink-400 hover:bg-tint"
          >
            <DotsThree size={20} weight="bold" />
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
          <span>{tashkentHhmm(message.createdAt)}</span>
        )}
      </div>
    </div>
  );
}
