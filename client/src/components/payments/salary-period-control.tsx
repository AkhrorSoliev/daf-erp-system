"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CalendarDays, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";

interface Props {
  period: { periodStart: string; periodEnd: string; cycleStartDay: number };
  isCeo: boolean;
  onChanged: () => void;
}

/** "Har oyning N-kunidan ..." — describes the cycle window in Uzbek. */
function describeCycle(startDay: number): string {
  if (startDay === 1) return "har oyning 1-kunidan oy oxirigacha";
  return `har oyning ${startDay}-kunidan keyingi oyning ${startDay - 1}-sanasigacha`;
}

const DAY_OPTIONS = Array.from({ length: 28 }, (_, i) => i + 1);

/**
 * Open (always-visible) salary-cycle control. Shows the current period range +
 * cycle start day inline. CEO can change the start day from the same strip —
 * the change is confirmed (it closes the running cycle on the old schedule and
 * the new one applies from the next cycle, enforced server-side).
 */
export function SalaryPeriodControl({ period, isCeo, onChanged }: Props) {
  const [pendingDay, setPendingDay] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const applyChange = async () => {
    if (pendingDay === null) return;
    setSaving(true);
    try {
      await api.post("/salary/period-settings", { cycleStartDay: pendingDay });
      toast.success("Hisoblash davri yangilandi");
      onChanged();
      setPendingDay(null);
    } catch (err) {
      toast.error(getErrorMessage(err, "Saqlashda xatolik"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border bg-muted/30 px-4 py-2.5 text-sm">
      <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
      <span className="text-muted-foreground">Hisoblash davri:</span>

      {isCeo ? (
        <Select
          value={String(period.cycleStartDay)}
          onValueChange={(v) => setPendingDay(Number(v))}
        >
          <SelectTrigger className="h-8 w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DAY_OPTIONS.map((d) => (
              <SelectItem key={d} value={String(d)}>
                {d}-kun
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <span className="font-medium">{period.cycleStartDay}-kun</span>
      )}

      <span className="text-muted-foreground">
        ({describeCycle(period.cycleStartDay)})
      </span>

      <span className="ml-auto text-muted-foreground tabular-nums">
        Joriy davr: {format(new Date(period.periodStart), "dd.MM.yyyy")} —{" "}
        {format(new Date(period.periodEnd), "dd.MM.yyyy")}
      </span>

      <AlertDialog
        open={pendingDay !== null}
        onOpenChange={(o) => {
          if (!o && !saving) setPendingDay(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hisoblash davrini o&apos;zgartirish</AlertDialogTitle>
            <AlertDialogDescription>
              Yangi davr: <b>{pendingDay && describeCycle(pendingDay)}</b>.
              <br />
              Joriy davr eski jadval bo&apos;yicha yopiladi, yangisi keyingi
              davrdan kuchga kiradi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                applyChange();
              }}
              disabled={saving}
            >
              {saving && <Loader2 className="size-4 animate-spin mr-2" />}
              Saqlash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
