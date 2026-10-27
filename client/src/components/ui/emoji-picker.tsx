"use client";

import type { ComponentProps } from "react";
import { EmojiPicker as Frimousse } from "frimousse";
import { cn } from "@/lib/utils";

/** shadcn-style wrapper over frimousse: search, categories, skin tone, virtualized grid. */
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

function EmojiPickerContent({
  className,
  loadingText,
  emptyText,
  ...props
}: ComponentProps<typeof Frimousse.Viewport> & {
  loadingText: string;
  emptyText: string;
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
              className="bg-card px-2 pb-1 pt-3 text-xs font-extrabold text-ink-400"
              {...rest}
            >
              {category.label}
            </div>
          ),
          Row: ({ children, ...rest }) => (
            <div className="scroll-my-1 px-1" {...rest}>
              {children}
            </div>
          ),
          Emoji: ({ emoji, ...rest }) => (
            <button
              type="button"
              className="flex size-10 items-center justify-center rounded-xl text-[24px] data-[active]:bg-tint"
              {...rest}
            >
              {emoji.emoji}
            </button>
          ),
        }}
      />
    </Frimousse.Viewport>
  );
}

export { EmojiPicker, EmojiPickerSearch, EmojiPickerContent };
