"use client";

import { useState, useRef, useCallback } from "react";
import { SendHorizontal } from "lucide-react";

interface AiChatInputProps {
  onSend: (content: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function AiChatInput({
  onSend,
  disabled,
  placeholder = "Auf Deutsch schreiben...",
}: AiChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
  }, []);

  function handleSubmit() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="flex items-end gap-2 rounded-2xl border bg-background p-2 shadow-sm">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          adjustHeight();
        }}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        rows={1}
        className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
        style={{ maxHeight: 120 }}
      />
      <button
        onClick={handleSubmit}
        disabled={disabled || !value.trim()}
        className="shrink-0 size-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center transition-all hover:bg-primary/90 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <SendHorizontal className="size-4" />
      </button>
    </div>
  );
}
