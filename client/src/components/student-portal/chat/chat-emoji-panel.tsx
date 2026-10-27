"use client";

import { useState } from "react";
import { useT } from "@/i18n/context";
import {
  EmojiPicker,
  EmojiPickerContent,
  EmojiPickerSearch,
} from "@/components/ui/emoji-picker";
import { loadRecent, pushRecent, saveRecent } from "./chat-emoji";

/** Telegram-style panel under the field: recent row, search, categories. */
export function ChatEmojiPanel({ onPick }: { onPick: (emoji: string) => void }) {
  const t = useT();
  const [recent, setRecent] = useState<string[]>(() => loadRecent());

  const pick = (emoji: string) => {
    onPick(emoji);
    const next = pushRecent(recent, emoji);
    setRecent(next);
    saveRecent(next);
  };

  return (
    <div
      className="mt-2 flex h-[300px] flex-col gap-2 rounded-3xl border border-line bg-card p-2"
      // Taps on emoji must not take the focus (and the caret) from the field.
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).closest("button")) e.preventDefault();
      }}
    >
      <EmojiPicker
        columns={8}
        onEmojiSelect={(e) => pick(e.emoji)}
        className="min-h-0 flex-1 gap-2"
      >
        <EmojiPickerSearch placeholder={t("Emoji qidirish…")} />
        {recent.length > 0 ? (
          <div className="flex gap-1 overflow-x-auto px-1" aria-label={t("Oxirgilar")}>
            {recent.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => pick(e)}
                className="flex size-10 shrink-0 items-center justify-center rounded-xl text-[24px] hover:bg-tint"
              >
                {e}
              </button>
            ))}
          </div>
        ) : null}
        <EmojiPickerContent
          className="min-h-0"
          loadingText={t("Yuklanmoqda…")}
          emptyText={t("Topilmadi")}
        />
      </EmojiPicker>
    </div>
  );
}
