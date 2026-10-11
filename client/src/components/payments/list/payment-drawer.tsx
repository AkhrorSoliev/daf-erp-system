"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useCan } from "@/hooks/use-permissions";
import { formatPrice } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import {
  correctionLocked, drawerState, footerHints, headerLine, periodNote, reversalLine, sourceText, sumLabel,
} from "./payment-drawer-model";
import type { PaymentRow, PeriodView } from "./payments-list-types";
import { METHOD_FILTER, receiptText, receivedByText } from "./payments-format";
import { usePaymentRow } from "./payments-queries";
import { PART_PILL, PILL_BASE } from "./payments-table";

const METHOD_LABEL = Object.fromEntries(METHOD_FILTER.map((m) => [m.value, m.label]));

type Period = { startDate: string; endDate: string };

/**
 * Row click on «To'lovlar» (spec B4 §3.8). The row the list already holds is used as it is; a payment
 * that is not on the page (a `?tolov=` link, the «tuzatildi» pill) is fetched. The correction and
 * cancellation dialogs open over the page after the drawer closes.
 */
export function PaymentDrawer({ id, period, initialRow, initialPeriod, onClose, onOpen, onCorrect, onReverse }: {
  id: string | null;
  /** The page's period, sent with the single-payment read. */
  period: Period | null;
  /** The clicked row when it is on the current page, with the list's period. */
  initialRow?: PaymentRow;
  initialPeriod?: PeriodView;
  onClose: () => void;
  onOpen: (id: string) => void;
  onCorrect: (row: PaymentRow) => void;
  onReverse: (row: PaymentRow) => void;
}) {
  const query = usePaymentRow(initialRow ? null : id, period);
  const row = initialRow ?? query.data?.row;
  const view = initialRow ? initialPeriod : query.data?.period;
  const state = initialRow ? "ok" : drawerState(query.error);
  const name = row ? `${row.student.firstName} ${row.student.lastName}` : "";
  return (
    <Sheet open={id !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-6 py-4">
          {/* pr-8 keeps the name clear of the sheet's own close button. */}
          <div className="min-w-0 pr-8">
            <SheetTitle className="truncate">
              {name || "To'lov"}
              {row?.student.archived && <> <span className={cn(PILL_BASE, "bg-muted align-middle text-muted-foreground")}>arxivda</span></>}
            </SheetTitle>
            <SheetDescription>{row ? headerLine(row) : "Yuklanmoqda…"}</SheetDescription>
          </div>
        </SheetHeader>
        {state === "notFound" ? (
          <div className="space-y-3 p-6 text-sm">
            <p className="font-medium">To&apos;lov bu filialda topilmadi</p>
            <p className="text-muted-foreground">Tepadagi filial tanlovini tekshiring.</p>
            <Button variant="outline" onClick={onClose}>Yopish</Button>
          </div>
        ) : state === "error" ? (
          <div className="space-y-3 p-6 text-sm">
            <p>Ma&apos;lumotni yuklab bo&apos;lmadi</p>
            <Button variant="outline" onClick={() => query.refetch()}>Qayta urinish</Button>
          </div>
        ) : !row || !view ? (
          <div className="space-y-3 p-6">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : (
          <PaymentDrawerBody row={row} period={view} onOpen={onOpen} onCorrect={() => onCorrect(row)} onReverse={() => onReverse(row)} />
        )}
      </SheetContent>
    </Sheet>
  );
}

const Heading = ({ children }: { children: ReactNode }) => (
  <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{children}</h3>
);

const Line = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
    <span className="shrink-0 text-muted-foreground">{label}</span>
    <span className="min-w-0 text-right">{children}</span>
  </div>
);

const LinkButton = ({ onClick, children }: { onClick: () => void; children: ReactNode }) => (
  <button type="button" onClick={onClick} className="text-sm font-medium text-primary hover:underline">{children}</button>
);

/** «Bu pul nimaga ketdi»: the parts, or the reason there are none. */
function WhereItWent({ row, period, onOpen }: { row: PaymentRow; period: PeriodView; onOpen: (id: string) => void }) {
  if (row.status === "REVERSED") {
    return row.correctedBy ? (
      <div className="space-y-2 text-sm">
        <p>To&apos;lov tuzatilgan — o&apos;rniga {formatPrice(row.correctedBy.amount)} so&apos;mlik to&apos;lov yozilgan.</p>
        <LinkButton onClick={() => onOpen(row.correctedBy!.id)}>Yangi to&apos;lovni ochish →</LinkButton>
      </div>
    ) : (
      <p className="text-sm text-muted-foreground">To&apos;lov bekor qilingan — pul hech narsaga ketmagan, balans o&apos;zgarmagan.</p>
    );
  }
  if (!row.parts) return <p className="text-sm text-muted-foreground">Bu to&apos;lovni hisoblab bo&apos;lmadi.</p>;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {row.parts.map((p) => (
          <span key={`${p.kind}-${p.monthKey}`} className={cn(PILL_BASE, PART_PILL[p.kind])}>{p.label} {formatPrice(p.amount)}</span>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{periodNote(period)}</p>
    </div>
  );
}

/** The drawer's content for one payment; exported for the static render test. */
export function PaymentDrawerBody({ row, period, onOpen, onCorrect, onReverse }: {
  row: PaymentRow; period: PeriodView; onOpen: (id: string) => void; onCorrect: () => void; onReverse: () => void;
}) {
  const canCorrect = useCan("payments.correct");
  const canUndo = useCan("money.undo");
  const isCeo = useAuth((s) => s.user?.roles.some((r) => r.name === "CEO") ?? false);
  const [now] = useState(() => new Date());
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
  const completed = row.status === "COMPLETED";
  const showCorrect = canCorrect && completed && row.source === "ADMIN_MANUAL";
  const locked = correctionLocked(row, isCeo, now);
  const showUndo = canUndo && completed;
  const hints = footerHints({ correct: canCorrect, undo: canUndo });
  const reversed = reversalLine(row);
  const balance = completed && row.balanceBefore !== null && row.balanceAfter !== null ? row : null;

  return (
    <>
      <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">
        <div className="rounded-lg border bg-muted/40 px-4 py-3">
          <p className="text-xs text-muted-foreground">{sumLabel(row)}</p>
          <p className={cn("text-2xl font-semibold tabular-nums", row.status === "REVERSED" && "line-through")}>{formatPrice(row.amount)} so&apos;m</p>
        </div>

        <div className="divide-y">
          <Line label="Usul">
            {METHOD_LABEL[row.method] ?? row.method}
            {row.online && <> <span className={cn(PILL_BASE, "bg-muted text-muted-foreground")}>onlayn</span></>}
          </Line>
          <Line label="Manba">{sourceText(row)}</Line>
          <Line label="Qabul qildi">{receivedByText(row)}</Line>
          <Line label="Kvitansiya">{receiptText(row)}</Line>
          <Line label="Izoh">{row.note || "—"}</Line>
          <Line label="Guruh">{row.groups.length ? row.groups.map((g) => g.name).join(", ") : "—"}</Line>
        </div>

        {row.correctsPayment && (
          <div className="space-y-1 text-sm">
            <p>Bu to&apos;lov {formatPrice(row.correctsPayment.amount)} so&apos;mlik to&apos;lovni tuzatgan</p>
            <LinkButton onClick={() => onOpen(row.correctsPayment!.id)}>Eski to&apos;lovni ochish →</LinkButton>
          </div>
        )}

        <section className="space-y-2">
          <Heading>Bu pul nimaga ketdi</Heading>
          <WhereItWent row={row} period={period} onOpen={onOpen} />
        </section>

        {balance && (
          <section className="space-y-1">
            <Heading>Balans</Heading>
            <p className="text-sm tabular-nums">
              {formatPrice(balance.balanceBefore!)} → <strong>{formatPrice(balance.balanceAfter!)} so&apos;m</strong>
            </p>
            <p className="text-xs text-muted-foreground">To&apos;lov paytidagi balans</p>
          </section>
        )}

        {reversed && (
          <section className="space-y-1">
            <Heading>Bekor qilindi</Heading>
            <p className="text-sm">{reversed}</p>
          </section>
        )}
      </div>

      <div className="space-y-2 border-t px-6 py-4">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <a href={`${apiUrl}/receipts/payment/${row.id}.pdf`} target="_blank" rel="noopener noreferrer">
              <FileText className="mr-2 size-4" />
              Kvitansiya
            </a>
          </Button>
          {!row.student.archived && (
            <Button variant="outline" asChild>
              <Link href={`/students/profile/${row.student.id}`}>O&apos;quvchi profili</Link>
            </Button>
          )}
          {showCorrect && <Button variant="outline" onClick={onCorrect} disabled={locked}>Tuzatish</Button>}
          {showUndo && (
            <Button variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={onReverse}>
              Bekor qilish
            </Button>
          )}
        </div>
        {showCorrect && locked && <p className="text-xs text-muted-foreground">72 soatdan oldingi to&apos;lovni faqat CEO tuzatadi</p>}
        {hints.map((h) => <p key={h} className="text-xs text-muted-foreground">{h}</p>)}
      </div>
    </>
  );
}
