"use client";

import { useState } from "react";
import { DotsThreeVertical } from "@phosphor-icons/react";
import { useT } from "@/i18n/context";
import { BottomSheet, Button } from "../lumio";
import { useBlock, useBlockedIds, useUnblock } from "./chat-queries";
import type { PeerSummary } from "./chat-types";
import { ReportDialog } from "./report-dialog";

type Step = "menu" | "confirm" | "report" | null;

/** Thread header ⋯: block / unblock and report. `peer` may still be unknown. */
export function PeerMenu({
  conversationId,
  peer,
}: {
  conversationId: string;
  peer: PeerSummary | undefined;
}) {
  const t = useT();
  const [step, setStep] = useState<Step>(null);
  const block = useBlock();
  const unblock = useUnblock();
  const blockedIds = useBlockedIds();
  const blocked = peer ? blockedIds.includes(peer.id) : false;
  const close = () => setStep(null);

  return (
    <>
      <button
        type="button"
        aria-label={t("Menyu")}
        onClick={() => setStep("menu")}
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink-900 shadow-lumio-sm hover:bg-tint"
      >
        <DotsThreeVertical size={22} weight="bold" />
      </button>

      <BottomSheet
        open={step === "menu"}
        onOpenChange={(o) => !o && close()}
        title={t("Suhbat")}
      >
        <div className="flex flex-col gap-2.5">
          {peer ? (
            blocked ? (
              <Button
                variant="secondary"
                block
                loading={unblock.isPending}
                onClick={() =>
                  unblock.mutate(peer.id, { onSuccess: close })
                }
              >
                {t("Blokdan chiqarish")}
              </Button>
            ) : (
              <Button
                variant="danger"
                block
                onClick={() => setStep("confirm")}
              >
                {t("Bloklash")}
              </Button>
            )
          ) : null}
          <Button variant="secondary" block onClick={() => setStep("report")}>
            {t("Shikoyat qilish")}
          </Button>
        </div>
      </BottomSheet>

      <BottomSheet
        open={step === "confirm"}
        onOpenChange={(o) => !o && close()}
        title={t("Bu o'quvchini bloklaysizmi?")}
      >
        <div className="flex flex-col gap-2.5">
          <p className="text-sm font-semibold text-ink-700">
            {t(
              "Ularga yozolmaysiz va ular sizga yozolmaydi. Yozishmani o'qish mumkin bo'lib qoladi.",
            )}
          </p>
          <Button
            variant="danger"
            block
            loading={block.isPending}
            onClick={() => peer && block.mutate(peer.id, { onSuccess: close })}
          >
            {t("Bloklash")}
          </Button>
          <Button variant="secondary" block onClick={close}>
            {t("Bekor qilish")}
          </Button>
        </div>
      </BottomSheet>

      <ReportDialog
        conversationId={conversationId}
        open={step === "report"}
        onOpenChange={(o) => !o && close()}
      />
    </>
  );
}

/** Replaces the composer while I have blocked the peer (reading stays). */
export function BlockedNotice({ peer }: { peer: PeerSummary }) {
  const t = useT();
  const unblock = useUnblock();
  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm font-bold text-ink-700">
        {t("Siz bu o'quvchini blokladingiz")}
      </p>
      <Button
        size="sm"
        variant="secondary"
        loading={unblock.isPending}
        onClick={() => unblock.mutate(peer.id)}
      >
        {t("Blokdan chiqarish")}
      </Button>
    </div>
  );
}
