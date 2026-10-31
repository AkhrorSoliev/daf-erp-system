"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/i18n/context";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { formatPrice, formatBalance } from "@/lib/format-utils";
import { dayKey, summarizeUnusedSelection } from "./unused-departure-lessons-model";

interface UnusedDepartureDay {
  enrollmentId: string;
  groupId: string;
  groupName: string;
  /** "YYYY-MM-DD" */
  date: string;
  amount: number;
}

interface UnusedDepartureLessonsResponse {
  studentId: number;
  balance: number;
  days: UnusedDepartureDay[];
}

const ddmmyyyy = (d: string) =>
  `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;

/**
 * CEO's «Foydalanilmagan darslar qarzini bekor qilish» (31.10.2026, spec
 * 2026-10-31). A DROPPED/EXPELLED enrollment's past days the teacher held
 * class and the student has no row at all — never resolved, never will be.
 * The CEO picks which days to forgive; the price is always the system's,
 * never typed. The server recomputes and re-caps everything — the amount
 * shown here is a preview, not what is sent.
 */
export function UnusedDepartureLessonsDialog({
  studentId,
  open,
  onOpenChange,
  onWrittenOff,
}: {
  studentId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful write-off, so the profile can refresh the balance. */
  onWrittenOff?: () => void;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  // Keys of days the CEO unticked. Every day starts ticked (tracking
  // exceptions means a freshly loaded list needs no effect to pre-tick them).
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");

  const { data, isLoading } = useQuery<UnusedDepartureLessonsResponse>({
    queryKey: ["unused-departure-lessons", studentId],
    queryFn: () =>
      api
        .get<UnusedDepartureLessonsResponse>(
          `/students/${studentId}/unused-departure-lessons`,
        )
        .then((r) => r.data),
    enabled: open,
  });

  const days = data?.days ?? [];
  const { selectedCount, selectedTotal, capped, afterBalance } =
    summarizeUnusedSelection(days, unchecked, data?.balance ?? 0);

  const toggle = (key: string) => {
    setUnchecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const close = () => {
    onOpenChange(false);
    setUnchecked(new Set());
    setReason("");
  };

  const writeOff = useMutation({
    mutationFn: () =>
      api.post(`/students/${studentId}/unused-departure-lessons/write-off`, {
        dates: days
          .filter((d) => !unchecked.has(dayKey(d)))
          .map((d) => ({ enrollmentId: d.enrollmentId, date: d.date })),
        reason: reason.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success(t("Qarz bekor qilindi"));
      queryClient.invalidateQueries({
        queryKey: ["unused-departure-lessons", studentId],
      });
      close();
      onWrittenOff?.();
    },
    onError: (error) => {
      toast.error(
        getErrorMessage(error, t("Bekor qilishda xatolik yuz berdi")),
      );
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!writeOff.isPending) onOpenChange(next);
      }}
    >
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>
            {t("Foydalanilmagan darslar qarzini bekor qilish")}
          </DialogTitle>
          <DialogDescription>
            {t(
              "Bu kunlarda dars o'tilgan, lekin o'quvchi kirmagan va endi kira olmaydi — guruhdan chiqqan.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-2 overflow-y-auto px-6 py-4">
          {isLoading && (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          )}
          {!isLoading && days.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("Foydalanilmagan dars topilmadi")}
            </p>
          )}
          {days.map((d) => {
            const key = dayKey(d);
            const on = !unchecked.has(key);
            return (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 hover:bg-muted/40"
              >
                <Checkbox checked={on} onCheckedChange={() => toggle(key)} />
                <span className="font-mono text-xs text-muted-foreground">
                  {d.groupName}
                </span>
                <span className="flex-1 text-sm font-medium">
                  {ddmmyyyy(d.date)}
                </span>
                <span className="font-mono text-sm tabular-nums">
                  {formatPrice(d.amount)} {t("so'm")}
                </span>
              </label>
            );
          })}
        </div>

        {days.length > 0 && (
          <DialogFooter className="flex-col gap-3 border-t px-6 py-4 sm:flex-col sm:space-x-0">
            <Textarea
              placeholder={t("Sabab (ixtiyoriy)")}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="resize-none"
            />
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">
                {t("Tanlangan: {n} ta dars", { n: String(selectedCount) })}
              </span>
              <span className="font-mono text-lg font-semibold tabular-nums">
                {formatPrice(selectedTotal)} {t("so'm")}
              </span>
            </div>
            {capped && (
              <p className="text-xs text-muted-foreground">
                {t(
                  "Qarzdan ortiqcha bekor qilib bo'lmaydi: faqat qarzcha hisoblanadi.",
                )}
              </p>
            )}
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted-foreground">
                {t("Tasdiqlagandan keyingi qarz:")}
              </span>
              <span className="font-mono font-medium tabular-nums">
                {formatBalance(afterBalance)}
              </span>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={close}
                disabled={writeOff.isPending}
              >
                {t("Bekor qilish")}
              </Button>
              <Button
                onClick={() => writeOff.mutate()}
                disabled={selectedCount === 0 || writeOff.isPending}
              >
                {writeOff.isPending && (
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                )}
                {t("Tasdiqlash")}
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
