"use client";

import { useState } from "react";
import { Eye, X } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

interface AvatarWithPreviewProps {
  src: string | null | undefined;
  alt: string;
  children: React.ReactNode;
}

export function AvatarWithPreview({ src, alt, children }: AvatarWithPreviewProps) {
  const [open, setOpen] = useState(false);

  if (!src) {
    return <>{children}</>;
  }

  return (
    <>
      <button
        type="button"
        className="group/preview relative cursor-pointer rounded-full focus:outline-none"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen(true);
        }}
      >
        {children}
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover/preview:opacity-100">
          <Eye className="size-3.5 text-white" />
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm p-2 sm:max-w-md" showCloseButton={false} onClick={(e) => e.stopPropagation()}>
          <DialogTitle className="sr-only">{alt}</DialogTitle>
          <DialogClose className="absolute top-2 right-2 flex size-7 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/60 focus:outline-none">
            <X className="size-4" />
          </DialogClose>
          <img
            src={src}
            alt={alt}
            className="w-full rounded-lg object-contain"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
