"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { AudioLines, FileText, ImageIcon, Pause, Play, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { hajm, KIND_LABEL, type MediaAsset } from "./media-types";

const ICON = {
  AUDIO: AudioLines,
  IMAGE: ImageIcon,
  VIDEO: Video,
  PDF: FileText,
} as const;

/**
 * Aktivlar ro'yxati. Audio joyida eshitiladi, rasm joyida ko'rinadi —
 * ro'yxatdan chiqmasdan tekshirish uchun.
 */
export function AssetList({ assets }: { assets: MediaAsset[] }) {
  if (assets.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Bu filtrga mos aktiv yo&apos;q.
      </div>
    );
  }
  return (
    <div className="divide-y rounded-lg border">
      {assets.map((a) => (
        <AssetRow key={a.key} a={a} />
      ))}
    </div>
  );
}

function AssetRow({ a }: { a: MediaAsset }) {
  const Icon = ICON[a.kind] ?? FileText;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [open, setOpen] = useState(false);

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      document.querySelectorAll("audio").forEach((x) => {
        if (x !== el) x.pause();
      });
      void el.play();
      setPlaying(true);
    } else {
      el.pause();
      setPlaying(false);
    }
  };

  return (
    <div className="p-3">
      <div className="flex items-center gap-3">
        {a.kind === "AUDIO" && a.url ? (
          <button
            type="button"
            onClick={toggle}
            aria-label={`${a.titel} — tinglash`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition hover:opacity-90"
          >
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => a.kind === "IMAGE" && setOpen((v) => !v)}
            aria-label={a.kind === "IMAGE" ? `${a.titel} — ko'rish` : a.titel}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition hover:bg-accent"
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        )}

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{a.titel}</div>
          <div className="truncate font-mono text-[11px] text-muted-foreground">
            {a.key}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {a.niveau && (
            <Badge variant="secondary" className="text-[10px]">
              {a.niveau}
            </Badge>
          )}
          <Badge variant="outline" className="text-[10px]">
            {KIND_LABEL[a.kind] ?? a.kind}
          </Badge>
          <span className="w-14 text-right text-[11px] tabular-nums text-muted-foreground">
            {hajm(a.bytes)}
          </span>
        </div>
      </div>

      {a.kind === "IMAGE" && open && a.url && (
        <div className="relative mt-3 aspect-video overflow-hidden rounded-md bg-muted">
          <Image
            src={a.url}
            alt={a.titel}
            fill
            sizes="(max-width: 768px) 100vw, 600px"
            className="object-contain"
            unoptimized
          />
        </div>
      )}
      {a.kind === "AUDIO" && a.url && (
        <audio
          ref={audioRef}
          src={a.url}
          preload="none"
          onEnded={() => setPlaying(false)}
          onPause={() => setPlaying(false)}
        />
      )}
    </div>
  );
}
