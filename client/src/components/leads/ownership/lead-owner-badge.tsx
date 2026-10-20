"use client";

import { useState } from "react";
import { Clock, Loader2, UserPlus } from "lucide-react";
import toast from "react-hot-toast";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "@/lib/get-error-message";
import { useCan } from "@/hooks/use-permissions";
import { useLeadsBoard, type LeadCard } from "@/hooks/use-leads-board";
import { claimLead } from "./ownership-api";
import { dueLabel, dueTone, ownerInitials, ownerName } from "./ownership-format";
import { useMinuteClock } from "./use-minute-clock";
import { useT } from "@/i18n/context";

const TONE = {
  normal: "text-muted-foreground",
  urgent: "text-orange-600 dark:text-orange-400",
  overdue: "text-destructive",
} as const;

/**
 * The owner line of a board card (ADR-0093): the owner's initials and the
 * deadline, or «Band qilish» on a free lead for someone who may claim it.
 * `interactive={false}` is the drag overlay's copy.
 */
export function LeadOwnerBadge({
  lead,
  sectionId,
  interactive = true,
}: {
  lead: LeadCard;
  sectionId?: string;
  interactive?: boolean;
}) {
  const t = useT();
  const now = useMinuteClock();
  const canClaim = useCan("leads.claim");
  const applyLeadUpdate = useLeadsBoard((s) => s.applyLeadUpdate);
  const [busy, setBusy] = useState(false);

  if (lead.owner) {
    const tone = lead.ownerDueAt ? dueTone(lead.ownerDueAt, now) : "normal";
    return (
      <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-[9px] font-semibold text-primary">
              {ownerInitials(lead.owner)}
            </span>
          </TooltipTrigger>
          <TooltipContent>{t("Mas'ul: {name}", { name: ownerName(lead.owner) })}</TooltipContent>
        </Tooltip>
        {lead.ownerDueAt && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={cn("flex items-center gap-0.5 tabular-nums", TONE[tone])}>
                <Clock className="size-3" />
                {tone === "overdue" ? t("Muddat o'tdi") : dueLabel(lead.ownerDueAt, now, t)}
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {t(
                "Shu vaqtgacha qo'ng'iroq, izoh yoki topshiriq bo'lmasa, lid umumiy ro'yxatga qaytadi",
              )}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    );
  }

  if (!interactive || !canClaim || !sectionId || lead.statusEnum === "CONVERTED") return null;

  const claim = async () => {
    setBusy(true);
    try {
      applyLeadUpdate(sectionId, await claimLead(lead.id));
      toast.success(t("Lid sizga biriktirildi"));
    } catch (error) {
      toast.error(getErrorMessage(error, t("Lidni band qilib bo'lmadi")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={claim}
      disabled={busy}
      className="mt-1.5 flex items-center gap-1 rounded px-1 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-60"
    >
      {busy ? <Loader2 className="size-3 animate-spin" /> : <UserPlus className="size-3" />}
      {t("Band qilish")}
    </button>
  );
}
