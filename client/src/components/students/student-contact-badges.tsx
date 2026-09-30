"use client";

import { format } from "date-fns";
import { BadgeCheck, Send, Unplug } from "lucide-react";
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
//   messages reach it. The bot calls this being registered. «Telegram
//   uzilgan» replaces it while the linked chat refuses the bot (ADR-0054).

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

export function TelegramBotBadge({
  chatId,
  disconnectedAt,
}: {
  chatId: string | null;
  disconnectedAt: string | null;
}) {
  if (!chatId) return null;
  // The chat is still linked, but it stopped taking the bot's messages: the
  // student blocked the bot or deleted the account (ADR-0054). The server
  // clears the mark by itself once the chat takes a message again.
  if (disconnectedAt) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            tabIndex={0}
            className="bg-red-100 text-red-700 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400"
          >
            <Unplug />
            Telegram uzilgan
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-64">
          {format(new Date(disconnectedAt), "dd.MM.yyyy")} dan beri bot
          xabarlari yetib bormayapti: o&apos;quvchi botni bloklagan yoki
          Telegram hisobini o&apos;chirgan. Botga qaytsa, aloqa o&apos;zi
          tiklanadi.
        </TooltipContent>
      </Tooltip>
    );
  }
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
