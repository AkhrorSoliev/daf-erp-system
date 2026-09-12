"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Check, Loader2, Phone, X } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SubmissionRow } from "./types";

interface Props {
  row: SubmissionRow;
  onToggle: (rowId: string, called: boolean) => Promise<boolean>;
}

export function CallCell({ row, onToggle }: Props) {
  const [busy, setBusy] = useState(false);
  const lead = row.lead;
  // O'quvchi bo'lgan yoki arxivdagi lidga qo'ng'iroq belgisi qo'yilmaydi.
  const editable = lead !== null && !lead.archived && row.stage !== "converted";

  async function toggle(called: boolean) {
    setBusy(true);
    const ok = await onToggle(row.id, called);
    setBusy(false);
    if (!ok) return;
    if (called) {
      toast(
        (t) => (
          <span className="flex items-center gap-3 text-sm">
            Qo&apos;ng&apos;iroq belgilandi
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              onClick={() => {
                toast.dismiss(t.id);
                void toggle(false);
              }}
            >
              Bekor qilish
            </button>
          </span>
        ),
        { duration: 5000 },
      );
    } else {
      toast.success("Qo'ng'iroq belgisi olib tashlandi");
    }
  }

  if (!lead?.calledAt) {
    if (!editable) return <span className="text-muted-foreground">—</span>;
    return (
      <Button
        size="sm"
        variant="outline"
        className="h-7"
        disabled={busy}
        onClick={() => void toggle(true)}
      >
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Phone className="size-3.5" />
        )}
        Telefon qildim
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground">
      <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
      <span>
        {format(new Date(lead.calledAt), "dd.MM")}
        {lead.calledBy ? ` · ${lead.calledBy.firstName}` : ""}
      </span>
      {editable && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="size-6"
              disabled={busy}
              onClick={() => void toggle(false)}
            >
              {busy ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <X className="size-3.5" />
              )}
              <span className="sr-only">Belgini olib tashlash</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Qo&apos;ng&apos;iroq belgisini olib tashlash</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
