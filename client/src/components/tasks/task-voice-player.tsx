"use client";
import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/context";
import { FILE_URL_REFRESH_MS, formatDuration } from "./task-file-rules";
import { useTaskFiles } from "./use-task-files";

/**
 * Spec screen 15: the browser's player, the stored length (Chrome's webm has none), 1x / 1,5x.
 * The mounted link stays put while a message plays (a list reload brings new links, and swapping
 * the source would restart it at 0:00): it is swapped only when it is 10 minutes old and the
 * student presses play.
 */
export function TaskVoicePlayer({ taskId, fileId, src, durationSec }: { taskId: string; fileId: string; src: string; durationSec: number | null }) {
  const t = useT();
  const ref = useRef<HTMLAudioElement>(null);
  const [fast, setFast] = useState(false);
  // The link on the element and when the list that held it was read.
  const [mounted, setMounted] = useState(() => ({ src, readAt: useTaskFiles.getState().loadedAt }));
  const requestRef = useRef(0); // the newest play press; a pause or a later press drops the older one
  const ownPauseRef = useRef(false); // the pause we make ourselves while renewing is not the student's
  const rate = (on: boolean) => (on ? 1.5 : 1);

  const toggle = () => {
    const next = !fast;
    setFast(next);
    if (ref.current) ref.current.playbackRate = rate(next);
  };

  const renewBeforePlay = async (audio: HTMLAudioElement) => {
    if (Date.now() - mounted.readAt < FILE_URL_REFRESH_MS) return;
    const request = ++requestRef.current;
    if (!audio.paused) {
      ownPauseRef.current = true;
      audio.pause();
    }
    const ok = await useTaskFiles.getState().ensureFresh(taskId);
    const { files, loadedAt } = useTaskFiles.getState();
    const fresh = ok ? files.find((f) => f.id === fileId) : undefined;
    // Paused by the student (or pressed again) while the list was being read: that wins.
    if (!fresh || request !== requestRef.current) return;
    flushSync(() => setMounted({ src: fresh.url, readAt: loadedAt }));
    audio.playbackRate = rate(fast); // a new source resets it
    void audio.play().catch(() => {});
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <audio
        ref={ref}
        src={mounted.src}
        controls
        preload="metadata"
        className="h-9 max-w-full"
        onPlay={(e) => void renewBeforePlay(e.currentTarget)}
        onPause={() => {
          if (ownPauseRef.current) ownPauseRef.current = false;
          else requestRef.current++;
        }}
      />
      {durationSec !== null && <span className="text-xs text-muted-foreground">{formatDuration(durationSec)}</span>}
      <Button type="button" size="xs" variant="outline" onClick={toggle} aria-label={t("Tezlik")}>{fast ? "1,5x" : "1x"}</Button>
    </div>
  );
}
