"use client";
import { useEffect, useReducer, useRef, useState, useSyncExternalStore } from "react";
import { Loader2, Mic, Send, Square, X } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { VOICE_LIMIT_SEC, formatDuration, pickVoiceMime, voiceFileName, voiceReducer } from "./task-file-rules";
import { useTaskFiles } from "./use-task-files";

const noop = () => () => {};
// The browser's answer, read without an effect; on the server there is no recorder.
const useVoiceMime = () =>
  useSyncExternalStore(
    noop,
    () => (typeof MediaRecorder === "undefined" ? null : pickVoiceMime((t) => MediaRecorder.isTypeSupported(t))),
    () => null,
  );

const releaseMic = (stream: MediaStream | null) => stream?.getTracks().forEach((t) => t.stop());

/** Spec screen 15: oddiy → yozilmoqda (stops itself at 3:00) → yuborishga tayyor. */
export function TaskVoiceRecorder({ taskId }: { taskId: string }) {
  const mime = useVoiceMime();
  const upload = useTaskFiles((s) => s.upload);
  const [state, dispatch] = useReducer(voiceReducer, { kind: "idle" });
  const [now, setNow] = useState(0);
  const [sending, setSending] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const urlRef = useRef<string | null>(null);
  const aliveRef = useRef(false);

  // Leaving the drawer mid-recording frees the microphone; nothing is dispatched after that.
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      if (recRef.current) recRef.current.onstop = null;
      if (recRef.current?.state === "recording") recRef.current.stop();
      releaseMic(streamRef.current);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  if (!mime) return null;

  const start = async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast.error("Mikrofonga ruxsat berilmadi");
      return;
    }
    if (!aliveRef.current) { releaseMic(stream); return; }
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 48_000 });
    } catch {
      releaseMic(stream);
      toast.error("Bu brauzerda ovoz yozib bo'lmaydi");
      return;
    }
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      releaseMic(stream);
      streamRef.current = null;
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      timerRef.current = null;
      const blob = new Blob(chunks, { type: mime.split(";")[0] });
      urlRef.current = URL.createObjectURL(blob);
      dispatch({ type: "stop", at: Date.now(), blob, url: urlRef.current });
    };
    streamRef.current = stream;
    recRef.current = rec;
    rec.start();
    const at = Date.now();
    dispatch({ type: "start", at });
    setNow(at);
    timerRef.current = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t - at >= VOICE_LIMIT_SEC * 1000 && recRef.current?.state === "recording") recRef.current.stop();
    }, 250);
  };
  const discard = () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    dispatch({ type: "reset" });
  };
  const send = async () => {
    if (state.kind !== "ready") return;
    setSending(true);
    const ok = await upload(taskId, state.blob, voiceFileName(mime), state.durationSec);
    if (!aliveRef.current) return;
    setSending(false);
    if (ok) discard();
  };

  if (state.kind === "recording") {
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="size-2 animate-pulse rounded-full bg-red-500" />
        <span>{formatDuration((now - state.startedAt) / 1000)} / {formatDuration(VOICE_LIMIT_SEC)}</span>
        <Button type="button" size="xs" variant="outline" onClick={() => recRef.current?.stop()}><Square className="size-3" />{"To'xtatish"}</Button>
      </div>
    );
  }
  if (state.kind === "ready") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <audio src={state.url} controls className="h-8 max-w-[14rem]" />
        <Button type="button" size="icon-xs" variant="ghost" aria-label="Bekor qilish" onClick={discard} disabled={sending}><X /></Button>
        <Button type="button" size="xs" onClick={() => void send()} disabled={sending}>
          {sending ? <Loader2 className="animate-spin" /> : <Send />}Yuborish
        </Button>
      </div>
    );
  }
  return (
    <Button type="button" size="icon-sm" variant="ghost" aria-label="Ovozli xabar yozish" onClick={() => void start()}>
      <Mic className="size-4" />
    </Button>
  );
}
