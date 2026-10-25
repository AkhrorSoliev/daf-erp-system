"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Microphone, PaperPlaneRight, X } from "@phosphor-icons/react";
import toast from "react-hot-toast";
import { useT } from "@/i18n/context";
import {
  VOICE_MAX_SEC,
  formatDuration,
  voiceFileName,
  voiceMime,
} from "./chat-media";
import type { ChatUpload } from "./use-chat-upload";

const noop = () => () => {};
// The browser's answer without an effect; on the server there is no recorder.
const useMime = () =>
  useSyncExternalStore(
    noop,
    () =>
      typeof MediaRecorder === "undefined"
        ? null
        : voiceMime((m) => MediaRecorder.isTypeSupported(m)),
    () => null,
  );

const release = (s: MediaStream | null) =>
  s?.getTracks().forEach((track) => track.stop());

/**
 * Mic button; tap starts, the bar's send button stops and sends, ✕ cancels.
 * Stops itself at the server's 2:00. Hidden where nothing can be recorded.
 */
export function VoiceRecorder({
  disabled,
  onSubmit,
  onRecordingChange,
}: {
  disabled: boolean;
  onSubmit: (u: ChatUpload) => Promise<boolean>;
  /** The composer swaps its text field for the bar while this is true. */
  onRecordingChange: (recording: boolean) => void;
}) {
  const t = useT();
  const mime = useMime();
  const [elapsed, setElapsed] = useState<number | null>(null); // null = idle
  const starting = useRef(false);
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<number | null>(null);
  const discard = useRef(false);
  const alive = useRef(true);

  const clearTimer = () => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
  };

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      discard.current = true;
      clearTimer();
      if (rec.current) rec.current.onstop = null;
      if (rec.current?.state === "recording") rec.current.stop();
      release(stream.current);
    };
  }, []);

  if (!mime) return null;

  const start = async () => {
    if (starting.current || rec.current?.state === "recording") return;
    starting.current = true;
    let s: MediaStream;
    try {
      s = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      starting.current = false;
      toast.error(t("Mikrofonga ruxsat berilmadi"));
      return;
    }
    starting.current = false;
    if (!alive.current) return release(s);
    let r: MediaRecorder;
    try {
      r = new MediaRecorder(s, { mimeType: mime, audioBitsPerSecond: 48_000 });
    } catch {
      release(s);
      toast.error(t("Bu brauzerda ovoz yozib bo'lmaydi"));
      return;
    }
    const chunks: Blob[] = [];
    const startedAt = Date.now();
    discard.current = false;
    r.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    r.onstop = () => {
      release(s);
      stream.current = null;
      clearTimer();
      setElapsed(null);
      onRecordingChange(false);
      if (discard.current || !alive.current) return;
      const type = mime.split(";")[0];
      const durationSec = Math.max(
        1,
        Math.min(VOICE_MAX_SEC, Math.round((Date.now() - startedAt) / 1000)),
      );
      const file = new File(chunks, voiceFileName(mime), { type });
      void onSubmit({ file, durationSec });
    };
    stream.current = s;
    rec.current = r;
    r.start();
    setElapsed(0);
    onRecordingChange(true);
    timer.current = window.setInterval(() => {
      const sec = Math.floor((Date.now() - startedAt) / 1000);
      setElapsed(sec);
      if (sec >= VOICE_MAX_SEC && r.state === "recording") r.stop();
    }, 250);
  };

  const finish = (cancel: boolean) => {
    discard.current = cancel;
    if (rec.current?.state === "recording") rec.current.stop();
  };

  if (elapsed === null) {
    return (
      <button
        type="button"
        aria-label={t("Ovozli xabar yozish")}
        disabled={disabled}
        onClick={() => void start()}
        className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-coral-500 text-white shadow-[0_6px_14px_rgba(255,107,74,.4)] transition-transform active:scale-90 disabled:opacity-50 disabled:shadow-none"
      >
        <Microphone size={22} weight="fill" />
      </button>
    );
  }
  return (
    <>
      <div className="flex min-h-12 flex-1 items-center gap-3 rounded-[26px] border border-line bg-background px-4">
        <button
          type="button"
          aria-label={t("Bekor qilish")}
          onClick={() => finish(true)}
          className="inline-flex size-8 items-center justify-center rounded-full text-ink-500 hover:bg-tint"
        >
          <X size={18} weight="bold" />
        </button>
        <span className="size-2.5 animate-pulse rounded-full bg-danger" />
        <span className="text-[15px] font-extrabold tabular-nums text-ink-900">
          {formatDuration(elapsed)}
        </span>
        <span className="text-xs font-bold text-ink-400">
          / {formatDuration(VOICE_MAX_SEC)}
        </span>
      </div>
      <button
        type="button"
        aria-label={t("Yuborish")}
        onClick={() => finish(false)}
        className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-coral-500 text-white shadow-[0_6px_14px_rgba(255,107,74,.4)] transition-transform active:scale-90"
      >
        <PaperPlaneRight size={22} weight="fill" />
      </button>
    </>
  );
}
