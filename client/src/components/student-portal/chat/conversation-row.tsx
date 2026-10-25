"use client";

import Link from "next/link";
import { Avatar } from "../lumio";
import { useT } from "@/i18n/context";
import { clockLabel, peerName } from "./chat-format";
import type { ConversationView } from "./chat-types";

/** One conversation: avatar, name, time, preview, coral unread badge. */
export function ConversationRow({
  conversation,
}: {
  conversation: ConversationView;
}) {
  const t = useT();
  const { peer, lastMessage, unread } = conversation;
  const name = peerName(peer);
  return (
    <Link
      href={`/portal/chat/${conversation.id}`}
      className="flex w-full items-center gap-3 rounded-card border border-line bg-surface px-3.5 py-3 text-left shadow-lumio-sm transition-colors hover:bg-tint"
    >
      <Avatar src={peer.photo} name={name} size={50} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate font-display text-[17px] font-bold text-ink-900">
            {name}
          </span>
          {lastMessage ? (
            <span className="shrink-0 text-xs font-bold text-ink-400">
              {clockLabel(lastMessage.at, new Date(), t)}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 flex items-center justify-between gap-2">
          <span
            className={
              unread
                ? "truncate text-sm font-bold text-ink-700"
                : "truncate text-sm font-semibold text-ink-500"
            }
          >
            {lastMessage
              ? `${lastMessage.mine ? t("Siz: ") : ""}${lastMessage.preview}`
              : ""}
          </span>
          {unread ? (
            <span className="inline-flex h-[22px] min-w-[22px] shrink-0 items-center justify-center rounded-full bg-coral-500 px-[7px] font-display text-xs font-extrabold text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </span>
      </span>
    </Link>
  );
}
