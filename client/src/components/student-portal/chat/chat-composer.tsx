"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { PaperPlaneRight } from "@phosphor-icons/react";
import { useT } from "@/i18n/context";
import { sendTyping, shouldPing } from "./chat-typing";
import { ImagePicker, ImagePreviewChip } from "./image-picker";
import { useUploadChatFile } from "./use-chat-upload";
import { VoiceRecorder } from "./voice-recorder";

// Mirrors MESSAGE_MAX in server/src/chat/chat.constants.ts.
export const MESSAGE_MAX = 2000;
const COUNTER_FROM = MESSAGE_MAX - 200;
const MAX_HEIGHT_PX = 120; // about five lines

/** Rounded field + round coral send button. Enter sends, Shift+Enter breaks the line. */
export function ChatComposer({
  conversationId,
  onSend,
  busy,
}: {
  conversationId: string;
  onSend: (text: string) => void;
  /** An earlier message is still waiting for the server. */
  busy: boolean;
}) {
  const t = useT();
  const [text, setText] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  const lastPing = useRef<number | undefined>(undefined);
  const { upload, uploading, progress } = useUploadChatFile(conversationId);
  const [image, setImage] = useState<File | null>(null);
  const [recording, setRecording] = useState(false);
  const empty = text.trim().length === 0;
  const inFlight = busy || uploading;
  const blocked = empty || inFlight;

  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [text]);

  const send = () => {
    if (blocked) return;
    onSend(text.trim());
    setText("");
  };

  const sendImage = async () => {
    if (!image) return;
    if (await upload({ file: image })) setImage(null);
  };

  return (
    <div>
      {image ? (
        <ImagePreviewChip
          file={image}
          sending={uploading}
          progress={progress}
          onSend={() => void sendImage()}
          onCancel={() => setImage(null)}
        />
      ) : null}
      <div className="flex items-end gap-2.5">
      {recording ? null : (
        <ImagePicker disabled={inFlight} onPick={setImage} />
      )}
      {recording ? null : (
      <div className="flex min-h-12 flex-1 flex-col justify-center rounded-[26px] border border-line bg-background px-4">
        <textarea
          ref={field}
          rows={1}
          value={text}
          maxLength={MESSAGE_MAX}
          placeholder={t("Xabar yozing…")}
          aria-label={t("Xabar yozing…")}
          onChange={(e) => {
            const value = e.target.value;
            setText(value);
            const now = Date.now();
            if (value.trim() && !inFlight && shouldPing(lastPing.current, now)) {
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
          className="max-h-[120px] w-full resize-none border-none bg-transparent py-3 text-[15.5px] font-semibold text-ink-900 outline-none placeholder:text-ink-400"
        />
        {text.length >= COUNTER_FROM ? (
          <span className="pb-1.5 text-right text-[11px] font-bold text-ink-400">
            {text.length}/{MESSAGE_MAX}
          </span>
        ) : null}
      </div>
      )}
      {empty || recording ? (
        <VoiceRecorder
          disabled={inFlight}
          onSubmit={upload}
          onRecordingChange={setRecording}
        />
      ) : (
      <button
        type="button"
        aria-label={t("Yuborish")}
        disabled={blocked}
        onClick={send}
        className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-coral-500 text-white shadow-[0_6px_14px_rgba(255,107,74,.4)] transition-transform active:scale-90 disabled:opacity-50 disabled:shadow-none"
      >
        <PaperPlaneRight size={22} weight="fill" />
      </button>
      )}
      </div>
    </div>
  );
}
