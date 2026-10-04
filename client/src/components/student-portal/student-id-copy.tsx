"use client";

import toast from "react-hot-toast";
import { Copy } from "@phosphor-icons/react";

/**
 * The student's ID with a tap to copy it. Payme (`student_id`) and Click
 * (`merchant_trans_id`) take this number as the account, so a parent paying
 * from their own Payme or Click app has to type it in.
 */
export function StudentIdCopy({ id }: { id: number }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(String(id));
      toast.success("ID nusxalandi");
    } catch {
      toast.error("Nusxalab bo'lmadi, raqamni qo'lda yozib oling");
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`ID ${id} ni nusxalash`}
      className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-3 py-1 font-display text-sm font-bold tabular-nums text-ink-700 transition-colors hover:bg-tint"
    >
      ID: {id}
      <Copy size={14} weight="bold" />
    </button>
  );
}
