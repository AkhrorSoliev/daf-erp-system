"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { isLongComment, LONG_COMMENT } from "./rating-format";

/** Uzun izoh 3 qatorga qisqartiriladi; «Ko'proq o'qish» / «Kamroq» bilan ochiladi. */
export function ExpandableText({ text, limit = LONG_COMMENT }: { text: string; limit?: number }) {
  const [open, setOpen] = useState(false);
  if (!isLongComment(text, limit)) return <p className="break-words">{text}</p>;
  return (
    <div>
      <p className={cn("break-words", !open && "line-clamp-3")}>{text}</p>
      <button
        type="button"
        aria-expanded={open}
        className="mt-1 rounded-sm text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? "Kamroq" : "Ko'proq o'qish"}
      </button>
    </div>
  );
}
