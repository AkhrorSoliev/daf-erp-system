"use client";

import { HandCoins } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CenterTopUpContent } from "./debt/center-topup-content";
import { monthLabel } from "./salary-utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The month whose card was clicked — the dialog never picks its own. */
  month: string;
  /** Kept in sync with the table's search so the dialog foots to the card. */
  search: string;
}

/**
 * "Qolgan (markaz)" seen from the salary page.
 *
 * The body lives in `debt/center-topup-content.tsx` because the same list is
 * also a tab on `/payments/debt`. This file is only the dialog chrome: the
 * salary page's reader arrives here already looking at a month and a teacher
 * filter, so the month is handed down rather than picked again.
 */
export function SalaryCenterTopUpDialog({
  open,
  onOpenChange,
  month,
  search,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <HandCoins className="size-5 text-amber-600" />
            Markaz qo&apos;shimchasi — kimdan undirish kerak
          </DialogTitle>
          <DialogDescription>
            {monthLabel(month)} — markaz shu o&apos;quvchilar to&apos;lamagan
            darslar uchun ustozlarga pul to&apos;lab bergan.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <CenterTopUpContent month={month} search={search} enabled={open} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
