"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";
import { getErrorMessage } from "@/lib/get-error-message";
import { BottomSheet, Button } from "../lumio";
import { useReportConversation } from "./chat-queries";

// The server takes one free-text reason (3–500 chars). The label is sent in
// Uzbek (the staff read it), with the optional comment after it.
const REASONS = [
  msg("Haqorat yoki tahdid"),
  msg("Spam yoki reklama"),
  msg("Nomaqbul rasm yoki ovoz"),
  msg("Boshqa sabab"),
];
const COMMENT_MAX = 350;

export function ReportDialog({
  conversationId,
  open,
  onOpenChange,
}: {
  conversationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const report = useReportConversation();
  const [reason, setReason] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [refusal, setRefusal] = useState<string | null>(null);

  const submit = () => {
    if (!reason || report.isPending) return;
    const text = comment.trim();
    setRefusal(null);
    report.mutate(
      { conversationId, reason: text ? `${reason}: ${text}` : reason },
      {
        onSuccess: () => {
          toast.success(t("Shikoyat yuborildi"));
          setReason(null);
          setComment("");
          onOpenChange(false);
        },
        onError: (err) =>
          setRefusal(getErrorMessage(err, t("Shikoyat yuborilmadi"))),
      },
    );
  };

  return (
    <BottomSheet
      open={open}
      onOpenChange={(o) => {
        if (!o) setRefusal(null);
        onOpenChange(o);
      }}
      title={t("Shikoyat qilish")}
    >
      <div className="flex flex-col gap-3">
        <div role="radiogroup" aria-label={t("Sabab")} className="flex flex-col gap-2">
          {REASONS.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={reason === r}
              onClick={() => setReason(r)}
              className={
                reason === r
                  ? "rounded-card border-2 border-coral-500 bg-tint px-4 py-3 text-left font-bold text-ink-900"
                  : "rounded-card border border-line bg-surface px-4 py-3 text-left font-semibold text-ink-700"
              }
            >
              {t(r)}
            </button>
          ))}
        </div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={COMMENT_MAX}
          rows={3}
          placeholder={t("Izoh (ixtiyoriy)")}
          aria-label={t("Izoh (ixtiyoriy)")}
          className="w-full resize-none rounded-md border border-line-strong bg-sunk px-4 py-3 font-semibold text-ink-900 outline-none placeholder:text-ink-400 focus:border-coral-500"
        />
        {refusal ? (
          <p role="alert" className="text-sm font-bold text-coral-600">
            {refusal}
          </p>
        ) : null}
        <Button
          block
          disabled={!reason}
          loading={report.isPending}
          onClick={submit}
        >
          {t("Yuborish")}
        </Button>
        <Button variant="secondary" block onClick={() => onOpenChange(false)}>
          {t("Bekor qilish")}
        </Button>
      </div>
    </BottomSheet>
  );
}
