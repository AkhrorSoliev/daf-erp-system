"use client";

import { formatNumber } from "@/lib/format-utils";
import { Button } from "./lumio";
import { ArrowUpRight } from "./lumio/icon";

/**
 * Inside the Telegram Mini App a payment opens outside it, through Telegram
 * (`openOutsideMiniApp`), and the Mini App stays open behind it. Telegram
 * opens a link only in answer to a tap, and the one sent after the checkout
 * request may come too late for it — so this card opens the same link again
 * from a fresh tap. It replaces the gateway buttons until the student is back.
 */
export function GatewayHandoff({
  name,
  amount,
  onOpen,
  onClose,
}: {
  name: string;
  amount: number;
  onOpen: () => void;
  onClose: () => void;
}) {
  return (
    <div className="inset-well space-y-3 rounded-card bg-sunk p-4 text-center">
      <div className="space-y-1">
        <p className="font-display text-base font-bold text-ink-900">
          {name} orqali {formatNumber(amount)} so'm
        </p>
        <p className="text-sm font-semibold text-ink-500">
          To'lov {name} ilovasida yoki brauzerda ochiladi. Ochilmagan bo'lsa,
          tugmani bosing.
        </p>
      </div>
      <Button
        block
        iconAfter={<ArrowUpRight size={20} weight="bold" />}
        onClick={onOpen}
      >
        {name}'ga o'tish
      </Button>
      <Button block variant="ghost" size="sm" onClick={onClose}>
        Yopish
      </Button>
    </div>
  );
}
