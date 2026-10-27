"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Keyboard, PaperPlaneRight, Smiley, X } from "@phosphor-icons/react";
import { useT } from "@/i18n/context";
import { ChatEmojiPanel } from "./chat-emoji-panel";
import { insertAtCaret } from "./chat-emoji";
import { sendTyping, shouldPing } from "./chat-typing";
import { ImagePicker, ImagePreviewChip } from "./image-picker";
import { useUploadChatFile, type ChatUpload } from "./use-chat-upload";
import { VoiceRecorder } from "./voice-recorder";

// Mirrors MESSAGE_MAX in server/src/chat/chat.constants.ts.
export const MESSAGE_MAX = 2000;
const COUNTER_FROM = MESSAGE_MAX - 200;
const MAX_HEIGHT_PX = 120; // about five lines

/** The message being answered, shown above the field. */
export interface ComposerReply {
  id: string;
  /** Who wrote it ("Siz" or the peer's name). */
  label: string;
  /** Its words, or the name of its file kind. */
  preview: string;
}

/** The message being edited; the field starts with its text. */
export interface ComposerEdit {
  id: string;
  text: string;
}

/** Rounded field + round coral send button. Enter sends, Shift+Enter breaks the line. */
export function ChatComposer({
  conversationId,
  onSend,
  busy,
  reply,
  onCancelReply,
  editing,
  onEdit,
  onCancelEdit,
  editBusy,
}: {
  conversationId: string;
  onSend: (text: string) => void;
  /** An earlier message is still waiting for the server. */
  busy: boolean;
  reply: ComposerReply | null;
  onCancelReply: () => void;
  /** Mount with a `key` per edited message: the field starts with its text. */
  editing: ComposerEdit | null;
  onEdit: (text: string) => void;
  onCancelEdit: () => void;
  editBusy: boolean;
}) {
  const t = useT();
  const [text, setText] = useState(editing?.text ?? "");
  const field = useRef<HTMLTextAreaElement>(null);
  const lastPing = useRef<number | undefined>(undefined);
  const { upload, uploading, progress } = useUploadChatFile(conversationId);
  const [image, setImage] = useState<File | null>(null);
  const [recording, setRecording] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const empty = text.trim().length === 0;
  const inFlight = busy || uploading;
  const unchanged = editing !== null && text.trim() === editing.text;
  const blocked = editing
    ? empty || unchanged || editBusy
    : empty || inFlight;
  const replyId = reply?.id;
  const editId = editing?.id;

  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
    // A fractional line height leaves a sub-pixel overflow that draws a scrollbar.
    el.style.overflowY = el.scrollHeight > MAX_HEIGHT_PX ? "auto" : "hidden";
  }, [text]);

  // Answering or editing starts in the field.
  useEffect(() => {
    if (replyId || editId) field.current?.focus();
  }, [replyId, editId]);

  const touch = () =>
    typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

  // Like Telegram: on a phone the panel takes the keyboard's place.
  const toggleEmoji = () => {
    if (emojiOpen) {
      setEmojiOpen(false);
      field.current?.focus();
      return;
    }
    setEmojiOpen(true);
    if (touch()) field.current?.blur();
  };

  const addEmoji = (emoji: string) => {
    const el = field.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = insertAtCaret(text, start, end, emoji, MESSAGE_MAX);
    if (!next) return;
    setText(next.text);
    requestAnimationFrame(() => el?.setSelectionRange(next.caret, next.caret));
  };

  const send = () => {
    if (blocked) return;
    if (editing) {
      onEdit(text.trim());
      return;
    }
    onSend(text.trim());
    setText("");
  };

  const withReply = async (u: ChatUpload): Promise<boolean> => {
    const ok = await upload({ ...u, replyToId: reply?.id });
    if (ok && reply) onCancelReply();
    return ok;
  };

  const sendImage = async () => {
    if (!image) return;
    if (await withReply({ file: image })) setImage(null);
  };

  const context = editing
    ? { title: t("Tahrirlash"), preview: editing.text, cancel: onCancelEdit }
    : reply
      ? { title: reply.label, preview: reply.preview, cancel: onCancelReply }
      : null;

  return (
    <div>
      {context ? (
        <div className="mb-2 flex items-center gap-2 rounded-2xl border-l-[3px] border-coral-500 bg-tint px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-extrabold text-coral-500">
              {context.title}
            </p>
            <p className="truncate text-[13px] font-semibold text-ink-500">
              {context.preview}
            </p>
          </div>
          <button
            type="button"
            aria-label={t("Bekor qilish")}
            onClick={context.cancel}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-ink-400 hover:bg-line"
          >
            <X size={16} weight="bold" />
          </button>
        </div>
      ) : null}
      {image && !editing ? (
        <ImagePreviewChip
          file={image}
          sending={uploading}
          progress={progress}
          onSend={() => void sendImage()}
          onCancel={() => setImage(null)}
        />
      ) : null}
      <div className="flex items-end gap-2.5">
        {recording || editing ? null : (
          <ImagePicker disabled={inFlight} onPick={setImage} />
        )}
        {recording ? null : (
          // min-w-0: the textarea's intrinsic width must not push the send button off screen.
          <div className="flex min-h-12 min-w-0 flex-1 flex-col justify-center rounded-[26px] border border-line bg-background pl-1.5 pr-4">
            <div className="flex items-end gap-1">
            <button
              type="button"
              aria-label={emojiOpen ? t("Klaviatura") : t("Emoji")}
              aria-pressed={emojiOpen}
              onMouseDown={(e) => e.preventDefault()}
              onClick={toggleEmoji}
              className="mb-[5px] inline-flex size-9 shrink-0 items-center justify-center rounded-full text-ink-400 hover:text-coral-500"
            >
              {emojiOpen ? (
                <Keyboard size={24} weight="bold" />
              ) : (
                <Smiley size={24} weight="bold" />
              )}
            </button>
            <textarea
              ref={field}
              rows={1}
              value={text}
              maxLength={MESSAGE_MAX}
              placeholder={t("Xabar yozing…")}
              aria-label={t("Xabar yozing…")}
              onFocus={() => {
                if (touch()) setEmojiOpen(false);
              }}
              onChange={(e) => {
                const value = e.target.value;
                setText(value);
                const now = Date.now();
                if (
                  !editing &&
                  value.trim() &&
                  !inFlight &&
                  shouldPing(lastPing.current, now)
                ) {
                  lastPing.current = now;
                  sendTyping(conversationId);
                }
              }}
              onKeyDown={(e) => {
                // Enter that confirms an IME candidate must not send.
                if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing)
                  return;
                e.preventDefault();
                send();
              }}
              className="max-h-[120px] min-w-0 flex-1 resize-none border-none bg-transparent py-3 text-[15.5px] font-semibold text-ink-900 outline-none placeholder:text-ink-400"
            />
            </div>
            {text.length >= COUNTER_FROM ? (
              <span className="pb-1.5 text-right text-[11px] font-bold text-ink-400">
                {text.length}/{MESSAGE_MAX}
              </span>
            ) : null}
          </div>
        )}
        {!editing && (empty || recording) ? (
          <VoiceRecorder
            disabled={inFlight}
            onSubmit={withReply}
            onRecordingChange={setRecording}
          />
        ) : (
          <button
            type="button"
            aria-label={editing ? t("Saqlash") : t("Yuborish")}
            disabled={blocked}
            onClick={send}
            className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-coral-500 text-white shadow-[0_6px_14px_rgba(255,107,74,.4)] transition-transform active:scale-90 disabled:opacity-50 disabled:shadow-none"
          >
            <PaperPlaneRight size={22} weight="fill" />
          </button>
        )}
      </div>
      {emojiOpen && !recording ? <ChatEmojiPanel onPick={addEmoji} /> : null}
    </div>
  );
}
