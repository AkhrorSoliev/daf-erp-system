"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { CalendarDays, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/ui/date-picker";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";

interface PeriodSetting {
  id: string;
  cycleStartDay: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: string;
  changedBy: { id: number; firstName: string; lastName: string } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const FORM_ID = "salary-period-setting-form";

/**
 * CEO-only side sheet for managing the salary cycle start day. Layout
 * follows the project's standard drawer skeleton:
 *   SheetContent (p-0, flex column)
 *   ├ SheetHeader  (border-b, px-6 py-4)
 *   ├ scrollable   (flex-1, internal sections px-6 py-5 space-y-5)
 *   └ SheetFooter  (border-t, px-6 py-4)
 */
export function SalaryPeriodSettingsSheet({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["salary-period-settings"],
    queryFn: () =>
      api.get<PeriodSetting[]>("/salary/period-settings").then((r) => r.data),
    enabled: open,
  });

  const current = data?.find((s) => s.effectiveTo === null);

  const [cycleStartDay, setCycleStartDay] = useState("8");
  const [effectiveFrom, setEffectiveFrom] = useState<Date | undefined>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (current) setCycleStartDay(String(current.cycleStartDay));
    if (!open) {
      setEffectiveFrom(undefined);
      setSubmitting(false);
    }
  }, [current, open]);

  const parsedDay = parseInt(cycleStartDay, 10);
  const dayInvalid = !parsedDay || parsedDay < 1 || parsedDay > 28;
  const noChange = !!current && parsedDay === current.cycleStartDay;
  const canSubmit = !submitting && !dayInvalid && !noChange;

  const handleSubmit = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await api.post("/salary/period-settings", {
        cycleStartDay: parsedDay,
        effectiveFrom: effectiveFrom
          ? format(effectiveFrom, "yyyy-MM-dd")
          : undefined,
      });
      toast.success("Yangi sozlama saqlandi");
      queryClient.invalidateQueries({ queryKey: ["salary-period-settings"] });
      setEffectiveFrom(undefined);
    } catch (err) {
      toast.error(getErrorMessage(err, "Saqlashda xatolik"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!submitting) onOpenChange(v);
      }}
    >
      <SheetContent
        side="right"
        className="sm:max-w-xl flex flex-col overflow-hidden p-0"
      >
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle className="text-lg">Hisoblash davri</SheetTitle>
          <SheetDescription>
            Oylik qaysi kundan boshlab hisoblanishini belgilang. O&apos;zgartirish
            joriy davrni eski jadval bo&apos;yicha yopadi va yangisi belgilangan
            sanadan boshlab kuchga kiradi.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {/* === Joriy davr === */}
          <section className="space-y-3 px-6 py-5">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Joriy davr
            </h3>
            <div className="rounded-lg border p-4 flex items-start gap-3 bg-muted/30">
              <CalendarDays className="size-5 mt-0.5 shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                {isLoading ? (
                  <>
                    <Skeleton className="h-5 w-56 mb-1" />
                    <Skeleton className="h-3.5 w-32" />
                  </>
                ) : current ? (
                  <>
                    <div className="font-semibold leading-tight">
                      {describeCycle(current.cycleStartDay)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {format(new Date(current.effectiveFrom), "dd.MM.yyyy")}{" "}
                      dan kuchda
                    </div>
                  </>
                ) : (
                  <div className="text-muted-foreground text-sm">
                    Sozlama topilmadi
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* === Yangi sozlama === */}
          <section className="space-y-5 px-6 py-5 border-t">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Yangi sozlama
            </h3>

            <form
              id={FORM_ID}
              onSubmit={handleSubmit}
              className="space-y-4"
              noValidate
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="period-day">Boshlanish kuni</Label>
                  <Input
                    id="period-day"
                    type="number"
                    min={1}
                    max={28}
                    value={cycleStartDay}
                    onChange={(e) => setCycleStartDay(e.target.value)}
                    disabled={submitting}
                  />
                  <p className="text-xs text-muted-foreground">
                    Oyning 1 dan 28 gacha bo&apos;lgan kuni
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label>Kuchga kirish sanasi</Label>
                  <DatePicker
                    value={effectiveFrom}
                    onChange={setEffectiveFrom}
                    disabled={submitting}
                    placeholder="Bugundan boshlab"
                  />
                  <p className="text-xs text-muted-foreground">
                    Bo&apos;sh qoldirilsa — bugundan
                  </p>
                </div>
              </div>

              {!dayInvalid && !noChange && (
                <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 px-3 py-2 text-xs text-blue-900 dark:text-blue-300">
                  Yangi davr: <b>{describeCycle(parsedDay)}</b>
                </div>
              )}
              {noChange && (
                <p className="text-xs text-muted-foreground">
                  Bu allaqachon joriy qiymat — boshqa kun tanlang
                </p>
              )}
            </form>
          </section>

          {/* === Tarix === */}
          <section className="space-y-3 px-6 py-5 border-t">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Tarix
            </h3>
            {isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : !data?.length ? (
              <p className="text-muted-foreground text-sm py-6 text-center border rounded-md">
                Sozlama topilmadi
              </p>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12 border-r">#</TableHead>
                      <TableHead className="w-20">Kun</TableHead>
                      <TableHead>Davr</TableHead>
                      <TableHead className="w-20">Holat</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.map((s, i) => (
                      <TableRow key={s.id} className="align-top">
                        <TableCell className="border-r text-muted-foreground tabular-nums">
                          {i + 1}
                        </TableCell>
                        <TableCell className="font-medium tabular-nums">
                          {s.cycleStartDay}-kun
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="tabular-nums">
                            {format(new Date(s.effectiveFrom), "dd.MM.yyyy")}
                            {" — "}
                            {s.effectiveTo
                              ? format(new Date(s.effectiveTo), "dd.MM.yyyy")
                              : "hozirgacha"}
                          </div>
                          {s.changedBy && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {s.changedBy.firstName} {s.changedBy.lastName}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {s.effectiveTo === null ? (
                            <Badge variant="default">Faol</Badge>
                          ) : (
                            <Badge variant="outline">Yopilgan</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </div>

        <SheetFooter className="border-t px-6 py-4">
          <div className="flex w-full justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Yopish
            </Button>
            <Button type="submit" form={FORM_ID} disabled={!canSubmit}>
              {submitting && <Loader2 className="size-4 animate-spin mr-2" />}
              Saqlash
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** "Har oyning 1-kunidan oyning oxirgi sanasigacha" formatlari. */
function describeCycle(startDay: number): string {
  if (startDay === 1) return "Har oyning 1-kunidan oyning oxirgi sanasigacha";
  return `Har oyning ${startDay}-kunidan keyingi oyning ${startDay - 1}-sanasigacha`;
}
