"use client";

import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, FileText, Loader2, Phone, Plus } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PriceInput } from "@/components/ui/price-input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { CALL_OUTCOME_INFO } from "@/components/outreach/outreach-types";
import type { LogCallPrefill } from "@/components/outreach/log-call-dialog";
import { useAuth } from "@/hooks/use-auth";
import api from "@/lib/api";
import { downloadAuthedFile } from "@/lib/download-file";
import { formatBalance, formatPhone } from "@/lib/format-utils";
import { getErrorMessage } from "@/lib/get-error-message";
import { CALL_LOG_ROLES, hasAnyRole, STATEMENT_ROLES } from "@/lib/role-access";
import { tashkentInstantOn } from "@/lib/tashkent-time";
import { PAYMENT_METHOD_LABELS } from "../overview/overview-math";
import { dateFromDay, usePromiseMonth } from "../promise-month";
import { monthLabel } from "../salary-utils";
import { drawerMonthText, instantDate, instantDayMonth, KIND_LABEL, promiseLine } from "./debt-format";
import { invalidateDebt, useDebtStudent } from "./debt-queries";
import { PromiseCellView } from "./debt-table";
import type { DebtDrawer as DrawerData, PayTarget, PromiseMonthState } from "./debt-types";

/** Row click on the debt page (spec §2.5). The payment and call dialogs open over the page, after it closes. */
export function DebtDrawer({ studentId, onClose, onPay, onLogCall }: {
  studentId: number | null; onClose: () => void; onPay: (t: PayTarget) => void; onLogCall: (p: LogCallPrefill) => void;
}) {
  const { data, isPending, isError } = useDebtStudent(studentId);
  const promise = usePromiseMonth(studentId);
  const roles = useAuth((s) => s.user?.roles);
  const name = data ? `${data.student.firstName} ${data.student.lastName}` : "";
  return (
    <Sheet open={studentId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>{name || "O'quvchi"}</SheetTitle>
          <SheetDescription className="sr-only">O&apos;quvchining qarzi, to&apos;lovlari va va&apos;dasi</SheetDescription>
        </SheetHeader>
        {isError ? (
          <p className="p-6 text-sm text-muted-foreground">Ma&apos;lumotni yuklab bo&apos;lmadi</p>
        ) : isPending || !data ? (
          <div className="space-y-3 p-6">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : (
          <DebtDrawerBody
            key={data.student.id}
            drawer={data}
            promiseState={promise.data ?? null}
            promiseFailed={promise.isError}
            canLogCalls={hasAnyRole(roles, CALL_LOG_ROLES)}
            canPdf={hasAnyRole(roles, STATEMENT_ROLES)}
            onPay={() => onPay({ id: data.student.id, firstName: data.student.firstName, lastName: data.student.lastName, balance: -data.debt, suggested: data.debt })}
            onLogCall={() => onLogCall({ studentId: data.student.id, studentLabel: `#${data.student.id} ${name}`, studentPhone: data.student.phone, reason: "DEBT" })}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="space-y-1.5">
    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
    {children}
  </section>
);

export function DebtDrawerBody({ drawer: d, promiseState, promiseFailed = false, canLogCalls, canPdf, onPay, onLogCall }: {
  drawer: DrawerData; promiseState: PromiseMonthState | null; promiseFailed?: boolean; canLogCalls: boolean; canPdf: boolean; onPay: () => void; onLogCall: () => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const monthTaken = promiseState?.monthPromise != null;
  const meta = [`ID ${d.student.id}`, d.student.phone && formatPhone(d.student.phone), d.groups.map((g) => g.name).join(", ") || null, d.kind && KIND_LABEL[d.kind].toLowerCase()]
    .filter(Boolean).join(" · ");
  const pdf = async () => {
    try {
      await downloadAuthedFile(`/students/${d.student.id}/statement.pdf`, `tolovlar-${d.student.id}.pdf`);
    } catch (e) {
      toast.error(getErrorMessage(e, "PDF yuklab olishda xatolik"));
    }
  };
  return (
    <>
      <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4 text-sm">
        <p className="text-muted-foreground">{meta}</p>
        <div className="flex items-baseline justify-between rounded-xl border px-3 py-2">
          <span className="text-muted-foreground">Qarz</span>
          <span className="text-xl font-bold text-red-600 dark:text-red-400">{formatBalance(d.debt)}</span>
        </div>
        {/* No lines when they would not add up to the debt (the server sends none). */}
        {d.months.length > 0 && (
          <Section title="Oylar bo'yicha">
            {d.months.map((m, i) => (
              <div key={m.month ?? `${m.label}-${i}`} className="flex justify-between gap-3 border-b py-1.5 last:border-0">
                {m.month ? (
                  <><span>{monthLabel(m.month)}</span><span className="text-right text-muted-foreground">{drawerMonthText(m)}</span></>
                ) : (
                  // A mock fee, a refund paid out, the pack's lessons ahead: the statement's own label.
                  <span>{m.label} — <span className="text-muted-foreground">{drawerMonthText(m)}</span></span>
                )}
              </div>
            ))}
          </Section>
        )}
        <Section title="Oxirgi to'lov">
          <p>{d.lastPayment
            ? `${instantDate(d.lastPayment.createdAt)} · ${formatBalance(d.lastPayment.amount)} · ${PAYMENT_METHOD_LABELS[d.lastPayment.method] ?? d.lastPayment.method}`
            : "Hali to'lov qilmagan"}</p>
        </Section>
        <Section title="Aloqa va va'da">
          {d.lastCall && (
            <p>{instantDayMonth(d.lastCall.createdAt)} · {CALL_OUTCOME_INFO[d.lastCall.outcome].label}{d.lastCall.note ? ` · ${d.lastCall.note}` : ""}</p>
          )}
          {d.promise && <p className="flex items-center justify-between gap-2"><span>{promiseLine(d.promise)}</span><PromiseCellView p={d.promise} /></p>}
          {!d.lastCall && !d.promise && <p className="text-muted-foreground">Hali aloqa bo&apos;lmagan</p>}
        </Section>
        {formOpen && promiseState?.create && <PromiseForm studentId={d.student.id} debt={d.debt} range={promiseState.create} onClose={() => setFormOpen(false)} />}
      </div>
      <div className="flex flex-wrap gap-2 border-t px-6 py-4">
        <Button onClick={onPay}><Plus className="mr-1 size-4" />To&apos;lov qayd qilish</Button>
        <Button variant="outline" disabled={monthTaken || !promiseState?.create} onClick={() => setFormOpen(true)}>
          <CalendarCheck className="mr-1 size-4" />Va&apos;da yozish
        </Button>
        {canLogCalls && <Button variant="outline" onClick={onLogCall}><Phone className="mr-1 size-4" />Qo&apos;ng&apos;iroq natijasi</Button>}
        {canPdf && <Button variant="outline" onClick={pdf}><FileText className="mr-1 size-4" />To&apos;lovlar hisoboti (PDF)</Button>}
        {monthTaken && <p className="w-full text-xs text-muted-foreground">Bu o&apos;quvchiga shu oy va&apos;da yozilgan</p>}
        {promiseFailed && !monthTaken && <p className="w-full text-xs text-muted-foreground">Va&apos;da holatini yuklab bo&apos;lmadi</p>}
      </div>
    </>
  );
}

/** «Va'da yozish» (spec §2.5): Summa (the whole debt), Qachongacha (today … +7), Izoh. */
export function PromiseForm({ studentId, debt, range, onClose }: {
  studentId: number; debt: number; range: { from: string; to: string }; onClose: () => void;
}) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState(String(debt));
  const [day, setDay] = useState<Date | null>(null);
  const [note, setNote] = useState("");
  const save = useMutation({
    // 23:00 Tashkent of the picked day: the server reads its Tashkent day.
    mutationFn: () => api.post("/payment-promises", { studentId, promiseDate: tashkentInstantOn(day!, 23), comment: note.trim(), promisedAmount: Number(amount) || undefined }),
    onSuccess: () => {
      toast.success("Va'da yozildi");
      invalidateDebt(qc);
      onClose();
    },
    onError: (e) => {
      toast.error(getErrorMessage(e, "Va'dani saqlashda xatolik"));
      // A refusal may mean someone else wrote this month's promise meanwhile: the button and the form follow the fresh state.
      qc.invalidateQueries({ queryKey: ["promise-month", studentId] });
    },
  });
  const row = "grid grid-cols-[110px_1fr] items-center gap-2";
  return (
    <form className="space-y-3 rounded-xl border p-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <div className={row}><Label htmlFor="pf-sum">Summa</Label><PriceInput id="pf-sum" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
      <div className={row}>
        <Label htmlFor="pf-date">Qachongacha</Label>
        <DatePicker id="pf-date" value={day} onChange={(v) => setDay(v ?? null)} minDate={dateFromDay(range.from)} maxDate={dateFromDay(range.to)} defaultMonth={dateFromDay(range.from)} />
      </div>
      <div className={row}><Label htmlFor="pf-note">Izoh</Label><Input id="pf-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Masalan: maosh olgach to'laydi" /></div>
      <p className="text-xs text-muted-foreground">Ko&apos;pi bilan 7 kunga, oyiga 1 marta.</p>
      <div className="flex gap-2">
        <Button type="submit" disabled={!day || !note.trim() || save.isPending}>{save.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}Saqlash</Button>
        <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>Bekor qilish</Button>
      </div>
    </form>
  );
}
