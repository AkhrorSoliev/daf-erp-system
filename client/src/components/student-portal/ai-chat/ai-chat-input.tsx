"use client";

import { useState, useRef, useCallback } from "react";
import { PaperPlaneRight } from "@phosphor-icons/react";

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
    <div className="flex items-end gap-2 rounded-feature border border-line bg-surface p-2 shadow-lumio-sm">
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
        className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm font-semibold text-ink-900 outline-none placeholder:text-ink-400 disabled:opacity-50"
        style={{ maxHeight: 120 }}
      />
      <button
        onClick={handleSubmit}
        disabled={disabled || !value.trim()}
        aria-label="Yuborish"
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-coral-500 text-white transition-all clay-coral clay-btn disabled:opacity-40"
      >
        <PaperPlaneRight size={18} weight="fill" />
      </button>
    </div>
  );
}
