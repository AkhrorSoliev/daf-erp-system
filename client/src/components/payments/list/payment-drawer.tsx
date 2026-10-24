"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { useCan } from "@/hooks/use-permissions";
import { useT } from "@/i18n/context";
import { formatPrice } from "@/lib/format-utils";
import { cn } from "@/lib/utils";
import { paymentMethodLabel } from "@/components/payments/overview/overview-math";
import {
  correctionLocked, drawerState, footerHints, headerLine, periodNote, reversalLine, sourceText, sumLabel,
} from "./payment-drawer-model";
import type { PaymentRow, PeriodView } from "./payments-list-types";
import { receiptText, receivedByText } from "./payments-format";
import { usePaymentRow } from "./payments-queries";
import { PART_PILL, PILL_BASE } from "./payments-table";

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
  const t = useT();
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
              {name || t("To'lov")}
              {row?.student.archived && <> <span className={cn(PILL_BASE, "bg-muted align-middle text-muted-foreground")}>{t("arxivda")}</span></>}
            </SheetTitle>
            <SheetDescription>{row ? headerLine(row, t) : t("Yuklanmoqda…")}</SheetDescription>
          </div>
        </SheetHeader>
        {state === "notFound" ? (
          <div className="space-y-3 p-6 text-sm">
            <p className="font-medium">{t("To'lov bu filialda topilmadi")}</p>
            <p className="text-muted-foreground">{t("Tepadagi filial tanlovini tekshiring.")}</p>
            <Button variant="outline" onClick={onClose}>{t("Yopish")}</Button>
          </div>
        ) : state === "error" ? (
          <div className="space-y-3 p-6 text-sm">
            <p>{t("Ma'lumotni yuklab bo'lmadi")}</p>
            <Button variant="outline" onClick={() => query.refetch()}>{t("Qayta urinish")}</Button>
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

/** «Bu pul nimaga ketdi»: the parts, or the reason there are none. The part pills are the server's wording. */
function WhereItWent({ row, period, onOpen }: { row: PaymentRow; period: PeriodView; onOpen: (id: string) => void }) {
  const t = useT();
  if (row.status === "REVERSED") {
    return row.correctedBy ? (
      <div className="space-y-2 text-sm">
        <p>{t("To'lov tuzatilgan — o'rniga {amount} so'mlik to'lov yozilgan.", { amount: formatPrice(row.correctedBy.amount) })}</p>
        <LinkButton onClick={() => onOpen(row.correctedBy!.id)}>{t("Yangi to'lovni ochish →")}</LinkButton>
      </div>
    ) : (
      <p className="text-sm text-muted-foreground">{t("To'lov bekor qilingan — pul hech narsaga ketmagan, balans o'zgarmagan.")}</p>
    );
  }
  if (!row.parts) return <p className="text-sm text-muted-foreground">{t("Bu to'lovni hisoblab bo'lmadi.")}</p>;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {row.parts.map((p) => (
          <span key={`${p.kind}-${p.monthKey}`} className={cn(PILL_BASE, PART_PILL[p.kind])}>{p.label} {formatPrice(p.amount)}</span>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{periodNote(period, t)}</p>
    </div>
  );
}

/** The drawer's content for one payment; exported for the static render test. */
export function PaymentDrawerBody({ row, period, onOpen, onCorrect, onReverse }: {
  row: PaymentRow; period: PeriodView; onOpen: (id: string) => void; onCorrect: () => void; onReverse: () => void;
}) {
  const t = useT();
  const canCorrect = useCan("payments.correct");
  const canUndo = useCan("money.undo");
  const isCeo = useAuth((s) => s.user?.roles.some((r) => r.name === "CEO") ?? false);
  const [now] = useState(() => new Date());
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
  const completed = row.status === "COMPLETED";
  const showCorrect = canCorrect && completed && row.source === "ADMIN_MANUAL";
  const locked = correctionLocked(row, isCeo, now);
  const showUndo = canUndo && completed;
  const hints = footerHints({ correct: canCorrect, undo: canUndo }, t);
  const reversed = reversalLine(row, t);
  const balance = completed && row.balanceBefore !== null && row.balanceAfter !== null ? row : null;

  return (
    <>
      <div className="flex-1 space-y-5 overflow-y-auto px-6 py-4">
        <div className="rounded-lg border bg-muted/40 px-4 py-3">
          <p className="text-xs text-muted-foreground">{sumLabel(row, t)}</p>
          <p className={cn("text-2xl font-semibold tabular-nums", row.status === "REVERSED" && "line-through")}>{formatPrice(row.amount)} {t("so'm")}</p>
        </div>

        <div className="divide-y">
          <Line label={t("Usul")}>
            {paymentMethodLabel(row.method, t)}
            {row.online && <> <span className={cn(PILL_BASE, "bg-muted text-muted-foreground")}>{t("onlayn")}</span></>}
          </Line>
          <Line label={t("Manba")}>{sourceText(row, t)}</Line>
          <Line label={t("Qabul qildi")}>{receivedByText(row, t)}</Line>
          <Line label={t("Kvitansiya")}>{receiptText(row, t)}</Line>
          <Line label={t("Izoh")}>{row.note || "—"}</Line>
          <Line label={t("Guruh")}>{row.groups.length ? row.groups.map((g) => g.name).join(", ") : "—"}</Line>
        </div>

        {row.correctsPayment && (
          <div className="space-y-1 text-sm">
            <p>{t("Bu to'lov {amount} so'mlik to'lovni tuzatgan", { amount: formatPrice(row.correctsPayment.amount) })}</p>
            <LinkButton onClick={() => onOpen(row.correctsPayment!.id)}>{t("Eski to'lovni ochish →")}</LinkButton>
          </div>
        )}

        <section className="space-y-2">
          <Heading>{t("Bu pul nimaga ketdi")}</Heading>
          <WhereItWent row={row} period={period} onOpen={onOpen} />
        </section>

        {balance && (
          <section className="space-y-1">
            <Heading>{t("Balans")}</Heading>
            <p className="text-sm tabular-nums">
              {formatPrice(balance.balanceBefore!)} → <strong>{formatPrice(balance.balanceAfter!)} {t("so'm")}</strong>
            </p>
            <p className="text-xs text-muted-foreground">{t("To'lov paytidagi balans")}</p>
          </section>
        )}

        {reversed && (
          <section className="space-y-1">
            <Heading>{t("Bekor qilindi")}</Heading>
            <p className="text-sm">{reversed}</p>
          </section>
        )}
      </div>

      <div className="space-y-2 border-t px-6 py-4">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <a href={`${apiUrl}/receipts/payment/${row.id}.pdf`} target="_blank" rel="noopener noreferrer">
              <FileText className="mr-2 size-4" />
              {t("Kvitansiya")}
            </a>
          </Button>
          {!row.student.archived && (
            <Button variant="outline" asChild>
              <Link href={`/students/profile/${row.student.id}`}>{t("O'quvchi profili")}</Link>
            </Button>
          )}
          {showCorrect && <Button variant="outline" onClick={onCorrect} disabled={locked}>{t("Tuzatish")}</Button>}
          {showUndo && (
            <Button variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={onReverse}>
              {t("To'lovni bekor qilish")}
            </Button>
          )}
        </div>
        {showCorrect && locked && <p className="text-xs text-muted-foreground">{t("72 soatdan oldingi to'lovni faqat CEO tuzatadi")}</p>}
        {hints.map((h) => <p key={h} className="text-xs text-muted-foreground">{h}</p>)}
      </div>
    </>
  );
}
