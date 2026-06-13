"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";
import toast from "react-hot-toast";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/ui/date-picker";
import { formatPhone } from "@/lib/format-utils";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import {
  CALL_OUTCOME_INFO,
  type CallLogsResponse,
  type CallOutcome,
  type CallReason,
} from "./outreach-types";

export interface LogCallPrefill {
  studentId: number;
  studentLabel: string;
  studentPhone: string | null;
  reason: CallReason;
}

interface LogCallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill: LogCallPrefill | null;
}

const OUTCOME_OPTIONS: { value: CallOutcome; label: string }[] = [
  { value: "ANSWERED", label: "Gaplashildi" },
  { value: "NO_ANSWER", label: "Javob bermadi" },
  { value: "WILL_COME", label: "Keladi" },
  { value: "WILL_PAY", label: "To'laydi" },
  { value: "LEFT", label: "O'qishni tashladi" },
];

export function LogCallDialog({
  open,
  onOpenChange,
  prefill,
}: LogCallDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {/* Remount the inner form each time the dialog opens so its useState
         * initializers reset (outcome + note) without an effect. */}
        {open && prefill && (
          <CallForm prefill={prefill} onSuccess={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CallForm({
  prefill,
  onSuccess,
}: {
  prefill: LogCallPrefill;
  onSuccess: () => void;
}) {
  const queryClient = useQueryClient();
  const [outcome, setOutcome] = useState<CallOutcome | null>(null);
  const [note, setNote] = useState("");
  const [promiseDate, setPromiseDate] = useState<Date | null>(null);

  // Oldingi qo'ng'iroq izohlari — admin yangi izoh yozishda kontekst ko'rsin.
  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ["call-logs", "student", prefill.studentId],
    queryFn: () =>
      api
        .get<CallLogsResponse>("/call-logs", {
          params: { studentId: prefill.studentId, pageSize: 5 },
        })
        .then((r) => r.data),
    staleTime: 0,
  });
  const previousCalls = history?.items ?? [];

  const submit = useMutation({
    mutationFn: async () => {
      if (!outcome) throw new Error("Natija tanlanmagan");
      // For "To'laydi" with a chosen date, send it (server creates/updates the
      // payment promise). End-of-day so it isn't flagged overdue the same day.
      let promiseIso: string | undefined;
      if (outcome === "WILL_PAY" && promiseDate) {
        const d = new Date(promiseDate);
        d.setHours(23, 59, 59, 0);
        promiseIso = d.toISOString();
      }
      await api.post("/call-logs", {
        studentId: prefill.studentId,
        reason: prefill.reason,
        outcome,
        note: note.trim() || undefined,
        promiseDate: promiseIso,
      });
    },
    onSuccess: () => {
      toast.success(
        outcome === "WILL_PAY" && promiseDate
          ? "Qo'ng'iroq qayd qilindi, to'lov sanasi belgilandi"
          : "Qo'ng'iroq qayd qilindi",
      );
      // Prefix-invalidate every outreach list + stats, plus the history tab and
      // the debtors page (a payment promise may have been created/updated).
      queryClient.invalidateQueries({ queryKey: ["outreach"] });
      queryClient.invalidateQueries({ queryKey: ["call-logs"] });
      queryClient.invalidateQueries({ queryKey: ["debtors"] });
      onSuccess();
    },
    onError: (error) =>
      toast.error(getErrorMessage(error, "Saqlashda xatolik yuz berdi")),
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Aloqa natijasini qayd qilish</DialogTitle>
      </DialogHeader>

      <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          O&apos;quvchi
        </div>
        <div className="font-medium">{prefill.studentLabel}</div>
        {prefill.studentPhone && (
          <div className="text-xs text-muted-foreground">
            {formatPhone(prefill.studentPhone)}
          </div>
        )}
      </div>

      {(historyLoading || previousCalls.length > 0) && (
        <div className="space-y-1.5">
          <Label className="text-xs">Oldingi izohlar</Label>
          {historyLoading ? (
            <div className="space-y-1">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : (
            <div className="max-h-36 space-y-2 overflow-y-auto overscroll-contain rounded-md border bg-muted/20 p-2">
              {previousCalls.map((item) => {
                const oc = CALL_OUTCOME_INFO[item.outcome];
                return (
                  <div key={item.id} className="text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <Badge
                        variant="outline"
                        className={`${oc.className} hover:${oc.className}`}
                      >
                        {oc.label}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">
                        {format(new Date(item.createdAt), "dd.MM.yyyy, HH:mm")}
                      </span>
                    </div>
                    {item.note && (
                      <p className="mt-0.5 text-muted-foreground">{item.note}</p>
                    )}
                    <div className="text-[11px] text-muted-foreground/80">
                      {item.calledBy.firstName} {item.calledBy.lastName}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Natija</Label>
          <div className="grid grid-cols-2 gap-2">
            {OUTCOME_OPTIONS.map((o) => (
              <Button
                key={o.value}
                type="button"
                size="sm"
                variant={outcome === o.value ? "default" : "outline"}
                className="justify-start"
                onClick={() => setOutcome(o.value)}
              >
                {o.label}
              </Button>
            ))}
          </div>
        </div>

        {outcome === "WILL_PAY" && (
          <div className="space-y-1">
            <Label className="text-xs">To&apos;lov sanasi (ixtiyoriy)</Label>
            <DatePicker
              value={promiseDate}
              onChange={(d) => setPromiseDate(d ?? null)}
              minDate={new Date()}
            />
            <p className="text-[11px] text-muted-foreground">
              Sana kiritilsa, &quot;To&apos;lov sanalari&quot; bo&apos;limiga
              qo&apos;shiladi.
            </p>
          </div>
        )}

        <div className="space-y-1">
          <Label className="text-xs">Izoh (ixtiyoriy)</Label>
          <Textarea
            placeholder="Masalan: ertaga keladi dedi, sababi bor edi"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="resize-none"
          />
        </div>
      </div>

      <DialogFooter>
        <Button
          variant="outline"
          onClick={onSuccess}
          disabled={submit.isPending}
        >
          Bekor qilish
        </Button>
        <Button
          onClick={() => submit.mutate()}
          disabled={!outcome || submit.isPending}
        >
          {submit.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
          Saqlash
        </Button>
      </DialogFooter>
    </>
  );
}
