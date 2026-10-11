"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FILE_URL_REFRESH_MS, formatDuration } from "./task-file-rules";
import { useTaskFiles } from "./use-task-files";

/**
 * Spec screen 15: the browser's player, the stored length (Chrome's webm has none), 1x / 1,5x.
 * The link dies after 10 minutes: when the list is old, playing first renews it.
 */
export function TaskVoicePlayer({ taskId, fileId, src, durationSec }: { taskId: string; fileId: string; src: string; durationSec: number | null }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [fast, setFast] = useState(false);
  const toggle = () => {
    const next = !fast;
    setFast(next);
    if (ref.current) ref.current.playbackRate = next ? 1.5 : 1;
  };
  const renewBeforePlay = async (audio: HTMLAudioElement) => {
    const { taskId: shown, loadedAt } = useTaskFiles.getState();
    if (shown === taskId && Date.now() - loadedAt < FILE_URL_REFRESH_MS) return;
    audio.pause();
    if (!(await useTaskFiles.getState().ensureFresh(taskId))) return;
    const fresh = useTaskFiles.getState().files.find((f) => f.id === fileId);
    if (!fresh) return;
    audio.src = fresh.url; // React sets the same value on its next render
    audio.playbackRate = fast ? 1.5 : 1;
    void audio.play().catch(() => {});
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <audio ref={ref} src={src} controls preload="metadata" className="h-9 max-w-full" onPlay={(e) => void renewBeforePlay(e.currentTarget)} />
      {durationSec !== null && <span className="text-xs text-muted-foreground">{formatDuration(durationSec)}</span>}
      <Button type="button" size="xs" variant="outline" onClick={toggle} aria-label="Tezlik">{fast ? "1,5x" : "1x"}</Button>
    </div>
  );
}
