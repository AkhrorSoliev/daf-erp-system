"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "@phosphor-icons/react";
import { useT } from "@/i18n/context";
import { registerMedia } from "../lib/media-registry";
import { SIGNED_URL_STALE_MS, formatDuration } from "./chat-media";
import { useSignedFile } from "./use-signed-file";

/**
 * Play / pause, 1x / 1.5x, stored length and position. The link is asked for
 * on the first press; the <audio> is registered so listening counts as
 * active time (ADR-0020).
 */
export function VoicePlayer({
  messageId,
  durationSec,
  mine,
}: {
  messageId: string;
  durationSec: number | null;
  /** Own bubbles are coral, so the controls are white there. */
  mine: boolean;
}) {
  const t = useT();
  const audio = useRef<HTMLAudioElement>(null);
  const [wanted, setWanted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [fast, setFast] = useState(false);
  const [pos, setPos] = useState(0);
  const playWhenReady = useRef(false);
  const retried = useRef(false);
  const file = useSignedFile(messageId, wanted);

  useEffect(() => {
    const el = audio.current;
    return el ? registerMedia(el) : undefined;
  }, []);

  // A failed link must never leave a stale "play" behind for a later refetch.
  useEffect(() => {
    if (file.loadState === "failed" || file.loadState === "offline") {
      playWhenReady.current = false;
    }
  }, [file.loadState]);

  // The link arrived after the first press: start then.
  useEffect(() => {
    const el = audio.current;
    if (file.url && playWhenReady.current && el) {
      playWhenReady.current = false;
      el.playbackRate = fast ? 1.5 : 1;
      void el.play().catch(() => {});
    }
  }, [file.url, fast]);

  const toggle = async () => {
    const el = audio.current;
    if (!el) return;
    if (playing) return el.pause();
    if (!file.url) {
      playWhenReady.current = true;
      setWanted(true);
      return;
    }
    if (Date.now() - file.updatedAt > SIGNED_URL_STALE_MS) {
      // React owns `src`: never set it by hand. The effect above plays once
      // the new URL has been applied; an unchanged URL plays right here.
      playWhenReady.current = true;
      const fresh = await file.refresh();
      if (!fresh) {
        playWhenReady.current = false;
        return;
      }
      if (fresh !== file.url) return;
      playWhenReady.current = false;
    }
    el.playbackRate = fast ? 1.5 : 1;
    void el.play().catch(() => {});
  };

  const speed = () => {
    const next = !fast;
    setFast(next);
    if (audio.current) audio.current.playbackRate = next ? 1.5 : 1;
  };

  const tint = mine ? "bg-white/25 text-white" : "bg-tint text-ink-700";
  return (
    <div className="flex min-w-[180px] items-center gap-2.5">
      <audio
        ref={audio}
        src={file.url ?? undefined}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPlaying={() => {
          retried.current = false;
        }}
        onPause={() => setPlaying(false)}
        // A new `src` empties the element without a pause event.
        onEmptied={() => setPlaying(false)}
        onAbort={() => setPlaying(false)}
        onEnded={() => setPos(0)}
        onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
        onError={() => {
          // An expired link: ask for a new one once.
          if (file.url && !retried.current) {
            retried.current = true;
            playWhenReady.current = true;
            void file.refresh().then((u) => {
              if (!u) playWhenReady.current = false;
            });
          }
        }}
      />
      <button
        type="button"
        aria-label={playing ? t("To'xtatish") : t("Eshitish")}
        onClick={() => void toggle()}
        disabled={wanted && file.loadState === "loading"}
        className={`inline-flex size-10 shrink-0 items-center justify-center rounded-full ${mine ? "bg-white text-coral-500" : "bg-coral-500 text-white"}`}
      >
        {playing ? <Pause size={20} weight="fill" /> : <Play size={20} weight="fill" />}
      </button>
      <span className="text-[13px] font-extrabold tabular-nums">
        {playing || pos > 0
          ? `${formatDuration(pos)} / ${formatDuration(durationSec ?? 0)}`
          : formatDuration(durationSec ?? 0)}
      </span>
      <button
        type="button"
        aria-label={t("Tezlik")}
        onClick={speed}
        className={`rounded-full px-2 py-1 text-xs font-extrabold ${tint}`}
      >
        {fast ? "1.5x" : "1x"}
      </button>
      {file.loadState === "failed" || file.loadState === "offline" ? (
        <span className="text-xs font-bold">{t("Yuklab bo'lmadi")}</span>
      ) : null}
    </div>
  );
}
