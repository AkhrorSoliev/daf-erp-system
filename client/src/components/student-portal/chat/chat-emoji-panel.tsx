"use client";

import { useState } from "react";
import { useT } from "@/i18n/context";
import {
  EMOJI_BUTTON,
  EmojiPicker,
  EmojiPickerContent,
  EmojiPickerSearch,
} from "@/components/ui/emoji-picker";
import { categoryText, loadRecent, pushRecent, saveRecent } from "./chat-emoji";

const COLUMNS = 8;

/** Telegram-style panel in the keyboard's place: search, recent row, categories. */
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
      className="mt-3 h-[min(280px,40dvh)]"
      // Taps on emoji must not take the focus (and the caret) from the field.
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).closest("button")) e.preventDefault();
      }}
    >
      <EmojiPicker
        columns={COLUMNS}
        onEmojiSelect={(e) => pick(e.emoji)}
        className="gap-2"
      >
        <EmojiPickerSearch placeholder={t("Emoji qidirish…")} />
        {recent.length > 0 ? (
          <div>
            <p className="pb-1 text-xs font-extrabold text-ink-400">
              {t("Oxirgilar")}
            </p>
            <div className="grid grid-cols-8">
              {recent.slice(0, COLUMNS).map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => pick(e)}
                  className={EMOJI_BUTTON}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <EmojiPickerContent
          className="min-h-0"
          loadingText={t("Yuklanmoqda…")}
          emptyText={t("Topilmadi")}
          categoryLabel={(label) => {
            const text = categoryText(label);
            return text ? t(text) : label;
          }}
        />
      </EmojiPicker>
    </div>
  );
}
