"use client";

import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Banknote, CalendarCheck, CalendarClock, CalendarX, FileText, Loader2, Phone, Plus, Users } from "lucide-react";
import toast from "react-hot-toast";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PriceInput } from "@/components/ui/price-input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { CALL_OUTCOME_INFO } from "@/components/outreach/outreach-types";
import type { LogCallPrefill } from "@/components/outreach/log-call-dialog";
import { CanLink } from "@/components/shared/can-link";
import { useCan } from "@/hooks/use-permissions";
import api from "@/lib/api";
import { downloadAuthedFile } from "@/lib/download-file";
import { formatBalance, formatPhone, formatPrice } from "@/lib/format-utils";
import { getErrorMessage } from "@/lib/get-error-message";
import { tashkentInstantOn } from "@/lib/tashkent-time";
import { cn } from "@/lib/utils";
import { PAYMENT_METHOD_LABELS } from "../overview/overview-math";
import { dateFromDay, usePromiseMonth } from "../promise-month";
import { monthLabel } from "../salary-utils";
import { debtSpan, drawerStatus, instantDate, instantDateTime, promiseCard } from "./debt-format";
import { invalidateDebt, useDebtStudent } from "./debt-queries";
import type { DebtDrawer as DrawerData, PayTarget, PromiseCell, PromiseMonthState } from "./debt-types";

/** Row click on the debt page (spec §2.5). The payment and call dialogs open over the page, after it closes. */
export function DebtDrawer({ studentId, onClose, onPay, onLogCall }: {
  studentId: number | null; onClose: () => void; onPay: (t: PayTarget) => void; onLogCall: (p: LogCallPrefill) => void;
}) {
  const { data, isPending, isError } = useDebtStudent(studentId);
  const promise = usePromiseMonth(studentId);
  const canLogCalls = useCan("calls.log");
  const canPdf = useCan("students.details");
  const name = data ? `${data.student.firstName} ${data.student.lastName}` : "";
  return (
    <Sheet open={studentId !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b px-6 py-4">
          {/* pr-8 keeps the name clear of the sheet's own close button. */}
          <div className="flex items-center gap-3 pr-8">
            <Avatar className="size-10">
              <AvatarFallback className="text-sm font-medium">{data ? `${data.student.firstName[0] ?? ""}${data.student.lastName[0] ?? ""}` : "…"}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <SheetTitle className="truncate">{name || "O'quvchi"}</SheetTitle>
              <SheetDescription>{data ? `ID ${data.student.id} · ${drawerStatus(data.kind)}` : "Yuklanmoqda…"}</SheetDescription>
            </div>
          </div>
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
            canLogCalls={canLogCalls}
            canPdf={canPdf}
            onPay={() => onPay({ id: data.student.id, firstName: data.student.firstName, lastName: data.student.lastName, balance: -data.debt, suggested: data.debt })}
            onLogCall={() => onLogCall({ studentId: data.student.id, studentLabel: `#${data.student.id} ${name}`, studentPhone: data.student.phone, reason: "DEBT" })}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="space-y-2">
    <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
    {children}
  </section>
);

const Chip = ({ children }: { children: ReactNode }) => (
  <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs">{children}</span>
);

/** The promise on its own card, coloured by its state — it decides how the next call goes. */
function PromiseCard({ p }: { p: PromiseCell | null }) {
  if (!p) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-dashed px-3 py-2.5 text-muted-foreground">
        <CalendarClock className="size-4 shrink-0" />Va&apos;da yo&apos;q
      </div>
    );
  }
  const { title, detail } = promiseCard(p);
  const open = p.state === "open";
  return (
    <div className={cn("flex items-start gap-3 rounded-lg border px-3 py-2.5",
      open ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/40" : "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40")}>
      {open
        ? <CalendarCheck className="mt-0.5 size-4 shrink-0 text-green-700 dark:text-green-400" />
        : <CalendarX className="mt-0.5 size-4 shrink-0 text-red-700 dark:text-red-400" />}
      <div>
        <p className={cn("font-medium", open ? "text-green-800 dark:text-green-300" : "text-red-800 dark:text-red-300")}>{title}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

/**
 * «Oylar bo'yicha» as columns, so the three amounts of each month line up. A
 * summary of a few months, not a list to page through: the statement months
 * table is unpaginated for the same reason.
 */
function MonthsTable({ months }: { months: DrawerData["months"] }) {
  const money = (v: number | null) => (v === null ? "—" : formatPrice(v));
  const owed = months.reduce((s, m) => s + m.left, 0);
  return (
    <table className="w-full text-sm tabular-nums">
      <thead>
        <tr className="border-b text-xs text-muted-foreground">
          <th className="py-1.5 text-left font-normal">Oy</th>
          <th className="py-1.5 text-right font-normal">Hisoblandi</th>
          <th className="py-1.5 text-right font-normal">To&apos;landi</th>
          <th className="py-1.5 text-right font-normal">Qoldi</th>
        </tr>
      </thead>
      <tbody>
        {months.map((m, i) => (
          <tr key={m.month ?? `${m.label}-${i}`} className="border-b last:border-0">
            {/* A mock fee, a refund paid out, the pack's lessons ahead: the statement's own label. */}
            <td className="py-1.5">{m.month ? monthLabel(m.month) : m.label}</td>
            <td className="py-1.5 text-right">{money(m.charged)}</td>
            <td className="py-1.5 text-right">{m.charged === null ? "—" : money(m.paid ?? 0)}</td>
            <td className="py-1.5 text-right font-medium text-red-600 dark:text-red-400">{formatPrice(m.left)}</td>
          </tr>
        ))}
      </tbody>
      {months.length > 1 && (
        <tfoot>
          <tr className="border-t">
            <td className="pt-1.5 font-medium" colSpan={3}>Jami</td>
            <td className="pt-1.5 text-right font-semibold text-red-600 dark:text-red-400">{formatPrice(owed)}</td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}

export function DebtDrawerBody({ drawer: d, promiseState, promiseFailed = false, canLogCalls, canPdf, onPay, onLogCall }: {
  drawer: DrawerData; promiseState: PromiseMonthState | null; promiseFailed?: boolean; canLogCalls: boolean; canPdf: boolean; onPay: () => void; onLogCall: () => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const monthTaken = promiseState?.monthPromise != null;
  const span = debtSpan(d.months);
  const call = d.lastCall ? CALL_OUTCOME_INFO[d.lastCall.outcome] : null;
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
        {(d.student.phone || d.groups.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {d.student.phone && (
              <a href={`tel:+998${d.student.phone}`} className="rounded-full hover:opacity-80">
                <Chip><Phone className="size-3" />{formatPhone(d.student.phone)}</Chip>
              </a>
            )}
            {d.groups.map((g) => (
              <CanLink key={g.id} href={`/groups/${g.id}`} perm="groups.view" linkClassName="rounded-full hover:opacity-80">
                <Chip><Users className="size-3" />{g.name}{g.teachers.length > 0 && ` · ${g.teachers.map((t) => t.name).join(", ")}`}</Chip>
              </CanLink>
            ))}
          </div>
        )}

        <div className="rounded-lg bg-red-50 px-4 py-3 dark:bg-red-950/40">
          <p className="text-xs text-red-700 dark:text-red-300">Umumiy qarz</p>
          <p className="text-2xl font-bold tabular-nums text-red-600 dark:text-red-400">{formatBalance(d.debt)}</p>
          {span && <p className="text-xs text-red-700/80 dark:text-red-300/80">{span}</p>}
        </div>

        <div className="space-y-1.5">
          {formOpen && promiseState?.create
            ? <PromiseForm studentId={d.student.id} debt={d.debt} range={promiseState.create} onClose={() => setFormOpen(false)} />
            : <PromiseCard p={d.promise} />}
          {monthTaken && <p className="text-xs text-muted-foreground">Bu o&apos;quvchiga shu oy va&apos;da yozilgan</p>}
          {promiseFailed && !monthTaken && <p className="text-xs text-muted-foreground">Va&apos;da holatini yuklab bo&apos;lmadi</p>}
        </div>

        {/* No lines when the statement could not be built (the server sends none). */}
        {d.months.length > 0 && <Section title="Oylar bo'yicha"><MonthsTable months={d.months} /></Section>}

        <Section title="Oxirgi to'lov">
          {d.lastPayment ? (
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <Banknote className="size-4 text-muted-foreground" />
                {instantDate(d.lastPayment.createdAt)} · {PAYMENT_METHOD_LABELS[d.lastPayment.method] ?? d.lastPayment.method}
              </span>
              <span className="font-medium tabular-nums">{formatBalance(d.lastPayment.amount)}</span>
            </div>
          ) : <p className="text-muted-foreground">Hali to&apos;lov qilmagan</p>}
        </Section>

        <Section title="Oxirgi aloqa">
          {d.lastCall && call ? (
            <div className="space-y-1 border-l-2 pl-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", call.className)}>{call.label}</span>
                <span className="text-xs text-muted-foreground">{instantDateTime(d.lastCall.createdAt)} · {d.lastCall.calledByName}</span>
              </div>
              {d.lastCall.note && <p>«{d.lastCall.note}»</p>}
            </div>
          ) : <p className="text-muted-foreground">Hali aloqa bo&apos;lmagan</p>}
        </Section>
      </div>

      <div className="grid grid-cols-2 gap-2 border-t px-6 py-4">
        <Button className="col-span-2" onClick={onPay}><Plus className="mr-1 size-4" />To&apos;lov qayd qilish</Button>
        {canLogCalls && <Button variant="outline" onClick={onLogCall}><Phone className="mr-1 size-4" />Qo&apos;ng&apos;iroq natijasi</Button>}
        <Button variant="outline" className={cn(!canLogCalls && "col-span-2")} disabled={formOpen || monthTaken || !promiseState?.create} onClick={() => setFormOpen(true)}>
          <CalendarCheck className="mr-1 size-4" />Va&apos;da yozish
        </Button>
        {canPdf && (
          <Button variant="ghost" size="sm" className="col-span-2 text-muted-foreground" onClick={pdf}>
            <FileText className="mr-1 size-4" />To&apos;lovlar hisoboti (PDF)
          </Button>
        )}
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
    <form className="space-y-3 rounded-lg border p-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <p className="font-medium">Yangi va&apos;da</p>
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
