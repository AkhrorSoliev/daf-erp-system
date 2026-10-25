"use client";

import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, X } from "@phosphor-icons/react";
import toast from "react-hot-toast";
import { useT } from "@/i18n/context";
import { IMAGE_ACCEPT, checkImage } from "./chat-media";

/** Attach button; a file that fails `checkImage` is toasted and dropped. */
export function ImagePicker({
  disabled,
  onPick,
}: {
  disabled: boolean;
  onPick: (file: File) => void;
}) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={IMAGE_ACCEPT}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // the same photo can be picked again
          if (!file) return;
          const problem = checkImage(file, t);
          if (problem) toast.error(problem);
          else onPick(file);
        }}
      />
      <button
        type="button"
        aria-label={t("Rasm qo'shish")}
        disabled={disabled}
        onClick={() => input.current?.click()}
        className="inline-flex size-12 shrink-0 items-center justify-center rounded-full text-ink-500 hover:bg-tint disabled:opacity-50"
      >
        <ImageIcon size={24} />
      </button>
    </>
  );
}

/** The chosen photo, above the composer, with send / cancel. */
export function ImagePreviewChip({
  file,
  sending,
  progress,
  onSend,
  onCancel,
}: {
  file: File;
  sending: boolean;
  progress: number;
  onSend: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    // A data URL needs no revoking, so it is safe under StrictMode's double effect.
    const reader = new FileReader();
    reader.onload = () => setUrl(String(reader.result));
    reader.readAsDataURL(file);
    return () => {
      reader.onload = null;
    };
  }, [file]);
  return (
    <div className="mb-2 flex items-center gap-3 rounded-2xl border border-line bg-background p-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
      {url ? <img src={url} alt="" className="size-14 rounded-xl object-cover" /> : <span className="size-14" />}
      <div className="min-w-0 flex-1">
        {sending ? (
          <div className="h-1.5 overflow-hidden rounded-full bg-tint">
            <div
              className="h-full bg-coral-500 transition-[width]"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={onSend}
            className="rounded-full bg-coral-500 px-4 py-2 text-sm font-extrabold text-white"
          >
            {t("Yuborish")}
          </button>
        )}
      </div>
      <button
        type="button"
        aria-label={t("Bekor qilish")}
        disabled={sending}
        onClick={onCancel}
        className="inline-flex size-8 items-center justify-center rounded-full text-ink-500 hover:bg-tint disabled:opacity-50"
      >
        <X size={18} weight="bold" />
      </button>
    </div>
  );
}
