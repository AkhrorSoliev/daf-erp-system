"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "@/lib/get-error-message";
import { useAuth } from "@/hooks/use-auth";
import { useCan } from "@/hooks/use-permissions";
import type { LeadCard, LeadStatus } from "@/hooks/use-leads-board";
import { claimLead, releaseLead } from "./ownership-api";
import { LeadOwnerAssign } from "./lead-owner-assign";
import { dueLabel, dueTone, ownerName, type LeadOwner } from "./ownership-format";
import { useMinuteClock } from "./use-minute-clock";
import { useT } from "@/i18n/context";

export interface OwnerBlockLead {
  id: string;
  statusEnum: LeadStatus;
  owner: LeadOwner | null;
  ownerDueAt: string | null;
}

/**
 * «Mas'ul» in the lead drawer (ADR-0093): who holds the lead and until when,
 * with «Band qilish», «Bo'shatish» and, for a manager, «Boshqaga berish».
 * A converted lead's owner is frozen: no buttons.
 */
export function LeadOwnerBlock({
  lead,
  onChanged,
}: {
  lead: OwnerBlockLead;
  onChanged: (card: LeadCard) => void;
}) {
  const t = useT();
  const now = useMinuteClock();
  const userId = useAuth((s) => s.user?.id);
  const canClaim = useCan("leads.claim");
  const canAssign = useCan("leads.assign");
  const [busy, setBusy] = useState<"claim" | "release" | null>(null);

  const converted = lead.statusEnum === "CONVERTED";
  const mine = lead.owner != null && lead.owner.id === userId;

  const run = async (kind: "claim" | "release", ok: string) => {
    setBusy(kind);
    try {
      onChanged(kind === "claim" ? await claimLead(lead.id) : await releaseLead(lead.id));
      toast.success(ok);
    } catch (error) {
      toast.error(getErrorMessage(error, t("Saqlashda xatolik yuz berdi")));
    } finally {
      setBusy(null);
    }
  };

  const tone = lead.ownerDueAt ? dueTone(lead.ownerDueAt, now) : "normal";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{t("Mas'ul")}</p>
        {lead.owner ? (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {ownerName(lead.owner)}
            {lead.ownerDueAt && (
              <span
                className={cn(
                  tone === "urgent" && "text-orange-600 dark:text-orange-400",
                  tone === "overdue" && "text-destructive",
                )}
              >
                {" · "}
                {tone === "overdue" ? t("muddat o'tdi") : dueLabel(lead.ownerDueAt, now, t)}
              </span>
            )}
          </p>
        ) : (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {converted
              ? t("Egasi belgilanmagan")
              : t("Umumiy ro'yxatda — hali hech kim olmagan")}
          </p>
        )}
      </div>
      {!converted && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {!lead.owner && canClaim && (
            <Button
              size="sm"
              disabled={busy !== null}
              onClick={() => void run("claim", t("Lid sizga biriktirildi"))}
            >
              {busy === "claim" && <Loader2 className="size-4 animate-spin" />}
              {t("Band qilish")}
            </Button>
          )}
          {lead.owner && (mine || canAssign) && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => void run("release", t("Lid umumiy ro'yxatga qaytarildi"))}
            >
              {busy === "release" && <Loader2 className="size-4 animate-spin" />}
              {t("Bo'shatish")}
            </Button>
          )}
          {canAssign && (
            <LeadOwnerAssign
              leadId={lead.id}
              currentOwnerId={lead.owner?.id ?? null}
              disabled={busy !== null}
              onAssigned={onChanged}
            />
          )}
        </div>
      )}
    </div>
  );
}
