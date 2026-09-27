"use client";

import { format } from "date-fns";
import { BadgeCheck, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Two facts about how the centre reaches a student, shown side by side on the
// staff card because they are easy to mistake for one another (ADR-0039):
//
// - «Telefon tasdiqlangan» — the student proved the card's number with an SMS
//   code (or an SMS password reset). Nothing else counts: a Telegram account
//   can carry a different number from the one the student uses.
// - «Telegram botda» — a Telegram chat is linked to the card, so the bot's
//   messages reach it. The bot calls this being registered.

export function PhoneProofBadge({
  verified,
  verifiedAt,
}: {
  verified: boolean;
  verifiedAt: string | null;
}) {
  if (verified) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            tabIndex={0}
            className="bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400"
          >
            <BadgeCheck />
            Telefon tasdiqlangan
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          SMS kod bilan tasdiqlangan
          {verifiedAt ? ` · ${format(new Date(verifiedAt), "dd.MM.yyyy")}` : ""}
        </TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge tabIndex={0} variant="outline" className="text-muted-foreground">
          Telefon tasdiqlanmagan
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        O&apos;quvchi bu raqamni hali SMS kod bilan tasdiqlamagan. Telegram
        orqali kirish tasdiq hisoblanmaydi.
      </TooltipContent>
    </Tooltip>
  );
}

export function TelegramBotBadge({ chatId }: { chatId: string | null }) {
  if (!chatId) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          tabIndex={0}
          className="bg-blue-100 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400"
        >
          <Send />
          Telegram botda ro&apos;yxatdan o&apos;tgan
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">
        Bot xabarlari shu Telegram hisobiga boradi. Bu telefon raqamining
        tasdig&apos;i emas.
      </TooltipContent>
    </Tooltip>
  );
}
