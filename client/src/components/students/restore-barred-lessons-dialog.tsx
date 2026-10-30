"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ContractClauseLink } from "@/components/shared/contract-clause-link";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { formatPrice } from "@/lib/format-utils";
import { useT } from "@/i18n/context";

/** `GET /students/:id/barred-lessons` (ADR-0142). */
export interface OutstandingBarredLessons {
  enrollmentId: string;
  groupId: string;
  groupName: string;
  days: { date: string; price: number }[];
}

const keyOf = (enrollmentId: string, date: string) => `${enrollmentId}:${date}`;
const dayLabel = (date: string) =>
  format(new Date(date + "T00:00:00"), "dd.MM.yyyy");

/**
 * Qaytishda admin kelgan kunlarni belgilaydi (ADR-0142): pauza paytida
 * hisobdan chiqarilgan darslardan qaysilariga o'quvchi kelgan edi. Belgilangan
 * kun qarzga qaytadan qo'shiladi va ustozga haq hisoblanadi. «Hech biriga
 * kelmagan» ham qaror: u tarixga yoziladi.
 */
export function RestoreBarredLessonsDialog({
  open,
  onOpenChange,
  studentId,
  items,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: number;
  items: OutstandingBarredLessons[];
  onDone: () => void;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const total = items.reduce((n, i) => n + i.days.length, 0);
  const allKeys = useMemo(
    () => items.flatMap((i) => i.days.map((d) => keyOf(i.enrollmentId, d.date))),
    [items],
  );
  const added = items.reduce(
    (sum, i) =>
      sum +
      i.days
        .filter((d) => picked.has(keyOf(i.enrollmentId, d.date)))
        .reduce((n, d) => n + d.price, 0),
    0,
  );

  const toggle = (key: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const submit = async (days: Set<string>) => {
    setSaving(true);
    try {
      for (const item of items) {
        await api.post(`/students/${studentId}/barred-lessons/restore`, {
          enrollmentId: item.enrollmentId,
          attendedDays: item.days
            .map((d) => d.date)
            .filter((date) => days.has(keyOf(item.enrollmentId, date))),
        });
      }
      toast.success(t("Kunlar belgilandi"));
      await queryClient.invalidateQueries({
        queryKey: ["student-barred-lessons", studentId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["student-lessons-overview", studentId],
      });
      setPicked(new Set());
      onOpenChange(false);
      onDone();
    } catch (error) {
      toast.error(getErrorMessage(error, t("Saqlashda xatolik yuz berdi")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>{t("O'quvchi qaysi darslarga kelgan edi?")}</DialogTitle>
          <DialogDescription>
            {t(
              "Pauza paytida {n} ta dars hisobdan chiqarilgan edi, chunki o'sha kunlarda to'lov yo'qligi uchun davomat olib bo'lmagan. Kelgan kunlarni belgilang: ular qarzga qaytadan qo'shiladi va ustozga shu dars uchun haq hisoblanadi.",
              { n: total },
            )}{" "}
            {t("Asos:")} <ContractClauseLink no="3.2" />
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={() => setPicked(new Set(allKeys))}
            >
              {t("Hammasini belgilash")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving}
              onClick={() => submit(new Set())}
            >
              {t("Hech biriga kelmagan")}
            </Button>
          </div>
          {items.map((item) => (
            <section key={item.enrollmentId} className="space-y-2">
              <h3 className="text-sm font-semibold">{item.groupName}</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {item.days.map((d) => {
                  const key = keyOf(item.enrollmentId, d.date);
                  const on = picked.has(key);
                  return (
                    <label
                      key={key}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
                        on
                          ? "border-violet-400 bg-violet-50 dark:bg-violet-950/40"
                          : ""
                      }`}
                    >
                      <Checkbox
                        checked={on}
                        disabled={saving}
                        onCheckedChange={() => toggle(key)}
                      />
                      <span className="font-medium">{dayLabel(d.date)}</span>
                      <span className="text-muted-foreground ml-auto text-xs">
                        {on
                          ? t("+{price} so'm qarzga", {
                              price: formatPrice(d.price),
                            })
                          : t("hisobda yo'q")}
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>
          ))}
          <p className="bg-muted/40 text-muted-foreground rounded-md border px-3 py-2 text-xs">
            {t(
              "Shartnomaga ko'ra markaz bu kunlar pulini talab qila oladi; markaz qarori bilan hisobdan chiqarilgan.",
            )}
          </p>
        </div>

        <DialogFooter className="border-t px-6 py-4 sm:items-center">
          <div className="mr-auto text-sm">
            <div className="text-muted-foreground">
              {t("Belgilandi: {n} ta", { n: picked.size })} ·{" "}
              {t("qarzga qo'shiladi: {sum} so'm", { sum: formatPrice(added) })}
            </div>
          </div>
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            {t("Bekor qilish")}
          </Button>
          <Button disabled={saving} onClick={() => submit(picked)}>
            {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
            {t("Saqlash")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
