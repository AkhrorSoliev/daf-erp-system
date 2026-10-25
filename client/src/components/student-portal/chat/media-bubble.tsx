"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "@phosphor-icons/react";
import { useT } from "@/i18n/context";
import { Skeleton } from "../lumio";
import type { MessageView } from "./chat-types";
import { useSignedFile } from "./use-signed-file";
import { VoicePlayer } from "./voice-player";

function Viewer({ url, onClose }: { url: string; onClose: () => void }) {
  const t = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
      onClick={onClose}
    >
      <button
        type="button"
        aria-label={t("Yopish")}
        onClick={onClose}
        className="absolute right-4 top-4 inline-flex size-11 items-center justify-center rounded-full bg-white/20 text-white"
      >
        <X size={22} weight="bold" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element -- signed storage link */}
      <img
        src={url}
        alt={t("Rasm")}
        className="max-h-full max-w-full object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

function ImageContent({ message }: { message: MessageView }) {
  const t = useT();
  const file = useSignedFile(message.id, true);
  const [open, setOpen] = useState(false);
  const retried = useRef(false);

  if (!file.url) {
    return file.loadState === "failed" || file.loadState === "offline" ? (
      <span className="italic opacity-80">{t("Rasmni yuklab bo'lmadi")}</span>
    ) : (
      <Skeleton className="h-40 w-48 rounded-xl" />
    );
  }
  return (
    <>
      <button
        type="button"
        aria-label={t("Rasmni ochish")}
        onClick={() => setOpen(true)}
        className="block"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- signed storage link */}
        <img
          src={file.url}
          alt={t("Rasm")}
          loading="lazy"
          onError={() => {
            // An expired link: one new link, then give up.
            if (!retried.current) {
              retried.current = true;
              void file.refresh();
            }
          }}
          className="h-auto max-h-60 w-auto max-w-full rounded-xl object-cover"
        />
      </button>
      {open ? <Viewer url={file.url} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** Content of an IMAGE / VOICE bubble (the `renderMedia` seam of MessageBubble). */
export function MediaBubble({ message }: { message: MessageView }) {
  const t = useT();
  if (message.file?.purged) {
    return <span className="italic opacity-70">{t("Fayl o'chirilgan")}</span>;
  }
  if (message.kind === "IMAGE") return <ImageContent message={message} />;
  return (
    <VoicePlayer
      messageId={message.id}
      durationSec={message.file?.durationSec ?? null}
      mine={message.mine}
    />
  );
}
