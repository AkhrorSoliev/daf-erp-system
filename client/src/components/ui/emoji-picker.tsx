"use client";

import type { ComponentProps } from "react";
import { EmojiPicker as Frimousse } from "frimousse";
import { cn } from "@/lib/utils";

/** shadcn-style wrapper over frimousse: search, categories, virtualized grid. */
function EmojiPicker({
  className,
  ...props
}: ComponentProps<typeof Frimousse.Root>) {
  return (
    <Frimousse.Root
      className={cn("isolate flex h-full w-full flex-col", className)}
      {...props}
    />
  );
}

function EmojiPickerSearch({
  className,
  ...props
}: ComponentProps<typeof Frimousse.Search>) {
  return (
    <Frimousse.Search
      className={cn(
        "h-10 w-full rounded-full border border-line bg-background px-4 text-[14px] font-semibold text-ink-900 outline-none placeholder:text-ink-400",
        className,
      )}
      {...props}
    />
  );
}

/** The emoji button; the recent row draws the same one so both grids line up. */
const EMOJI_BUTTON =
  "flex aspect-square w-full items-center justify-center rounded-xl text-[26px] leading-none hover:bg-tint data-[active]:bg-tint";

function EmojiPickerContent({
  className,
  loadingText,
  emptyText,
  categoryLabel = (label) => label,
  ...props
}: ComponentProps<typeof Frimousse.Viewport> & {
  loadingText: string;
  emptyText: string;
  /** Translates the data's (English) category names. */
  categoryLabel?: (label: string) => string;
}) {
  return (
    <Frimousse.Viewport
      className={cn("relative flex-1 outline-none", className)}
      {...props}
    >
      <Frimousse.Loading className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-ink-400">
        {loadingText}
      </Frimousse.Loading>
      <Frimousse.Empty className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-ink-400">
        {emptyText}
      </Frimousse.Empty>
      <Frimousse.List
        className="select-none pb-2"
        components={{
          CategoryHeader: ({ category, ...rest }) => (
            <div
              className="bg-surface pb-1 pt-2 text-xs font-extrabold text-ink-400"
              {...rest}
            >
              {categoryLabel(category.label)}
            </div>
          ),
          Row: ({ children, ...rest }) => (
            <div className="grid grid-cols-[repeat(var(--frimousse-list-columns),1fr)]" {...rest}>
              {children}
            </div>
          ),
          Emoji: ({ emoji, ...rest }) => (
            <button type="button" className={EMOJI_BUTTON} {...rest}>
              {emoji.emoji}
            </button>
          ),
        }}
      />
    </Frimousse.Viewport>
  );
}

export { EmojiPicker, EmojiPickerSearch, EmojiPickerContent, EMOJI_BUTTON };
