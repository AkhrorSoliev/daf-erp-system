"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { toApiDateStr } from "@/components/groups/edit-group-form-utils";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PriceInput } from "@/components/ui/price-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocale, useT } from "@/i18n/context";
import api from "@/lib/api";
import { formatPrice } from "@/lib/format-utils";
import { getErrorMessage } from "@/lib/get-error-message";
import { tashkentDayAsLocalDate } from "@/lib/tashkent-time";
import { keepsMonthCapital } from "../salary-utils";
import { accountsByKind, bankPayLine, buildPayBody, payTitle, payToast, sliceCheck } from "./salary-pay-model";
import { SALARY_KEYS, useInvalidateSalary } from "./salary-queries";
import type { SalaryDetail } from "./salary-types";

interface Props {
  /** The person being paid; `null` keeps the dialog shut. */
  detail: SalaryDetail | null;
  onClose: () => void;
  /** The payout went through and the page was refetched. */
  onPaid: () => void;
}

/**
 * «Berildi» (spec §5.1): the day and the cash / card amounts of one person's
 * salary. Mounted only while a person is picked, so every opening starts from
 * the defaults.
 */
export function SalaryPayDialog({ detail, onClose, onPaid }: Props) {
  const payment = detail?.row.payment;
  if (!detail || !payment) return null;
  return (
    <PayForm
      key={payment.id}
      detail={detail}
      total={payment.amount}
      paymentId={payment.id}
      onClose={onClose}
      onPaid={onPaid}
    />
  );
}

function PayForm({
  detail,
  total,
  paymentId,
  onClose,
  onPaid,
}: {
  detail: SalaryDetail;
  total: number;
  paymentId: string;
  onClose: () => void;
  onPaid: () => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const invalidate = useInvalidateSalary();
  const queryClient = useQueryClient();
  const { cash: cashAccounts, card: cardAccounts } = accountsByKind(detail.cashAccounts);

  // Tashkent days: the server reads `paidAt` as one (not in the future, not before the period).
  const [{ today, periodStart }] = useState(() => ({
    today: tashkentDayAsLocalDate(new Date()),
    periodStart: tashkentDayAsLocalDate(detail.period.periodStart),
  }));

  // The whole sum starts in «Naqd»; a branch with only card accounts starts it in «Karta».
  const wholeToCash = cashAccounts.length > 0 || cardAccounts.length === 0;
  const [paidAt, setPaidAt] = useState<Date>(today);
  const [cashId, setCashId] = useState(cashAccounts[0]?.id ?? "");
  const [cardId, setCardId] = useState(cardAccounts[0]?.id ?? "");
  const [cashText, setCashText] = useState(wholeToCash ? String(total) : "0");
  const [cardText, setCardText] = useState(wholeToCash ? "0" : String(total));
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const cash = Number(cashText || 0);
  const card = Number(cardText || 0);
  const check = sliceCheck(total, cash, card, t);
  // An amount with no account to leave from cannot be sent.
  const accountsReady = (cash === 0 || cashId !== "") && (card === 0 || cardId !== "");
  const canSubmit = check.ok && accountsReady && !detail.payeeBranchMissing && !submitting;
  const name = detail.row.user.firstName;
  const cardAccount = cardAccounts.find((a) => a.id === cardId);
  const bankLine = cardAccount?.type === "BANK" ? bankPayLine(card, detail.bankTax, t) : null;

  const submit = async () => {
    setSubmitting(true);
    let notified: boolean;
    try {
      const res = await api.post<{ notified: boolean }>(
        `/salary/payments/${paymentId}/pay`,
        buildPayBody({
          paidAt: toApiDateStr(paidAt),
          total,
          cashAccountId: cashId || null,
          cash,
          cardAccountId: cardId || null,
          card,
          note,
        }),
      );
      notified = res.data.notified;
    } catch (err) {
      toast.error(getErrorMessage(err, t("Saqlashda xatolik yuz berdi")));
      setSubmitting(false);
      return;
    }
    toast.success(payToast(notified, t));
    // Financial data: refetch, never patch the cache by hand. The drawer is shut, so its
    // query for this person is idle and only marked stale; drop it so the reopened drawer
    // waits for the payout instead of flashing the old «Berildi» button.
    queryClient.removeQueries({ queryKey: SALARY_KEYS.detail(detail.row.user.id, detail.month) });
    await invalidate();
    onPaid();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle className="pr-8">{payTitle(name, detail.month, t, !keepsMonthCapital(locale))}</DialogTitle>
          <DialogDescription>{t("Pul tanlangan kassa va kartadan chiqadi. Keyin xodimga bot xabari boradi.")}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <div className="space-y-1.5">
            <Label>{t("Summa")}</Label>
            <div className="text-lg font-semibold tabular-nums">
              {formatPrice(total)} <span className="text-sm font-normal text-muted-foreground">{t("so'm")}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pay-date">{t("Sana")}</Label>
            <DatePicker
              id="pay-date"
              value={paidAt}
              onChange={(d) => d && setPaidAt(d)}
              minDate={periodStart}
              maxDate={today}
              disabled={submitting}
            />
          </div>

          {total > 0 && (
            <>
              <AmountRow
                id="pay-cash"
                label={t("Naqd")}
                accounts={cashAccounts}
                accountId={cashId}
                onAccountChange={setCashId}
                amount={cashText}
                onAmountChange={setCashText}
                disabled={submitting}
              />
              {cardAccounts.length > 0 && (
                <AmountRow
                  id="pay-card"
                  label={t("Karta")}
                  accounts={cardAccounts}
                  accountId={cardId}
                  onAccountChange={setCardId}
                  amount={cardText}
                  onAmountChange={setCardText}
                  disabled={submitting}
                />
              )}
              {bankLine && <p className="text-xs text-muted-foreground">{bankLine}</p>}
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="pay-note">{t("Izoh")}</Label>
            <Input id="pay-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} disabled={submitting} />
          </div>

          <p
            role="status"
            className={check.ok ? "text-sm font-medium text-emerald-600 dark:text-emerald-500" : "text-sm font-medium text-destructive"}
          >
            {check.text}
          </p>
          {detail.payeeBranchMissing && (
            <p className="text-sm font-medium text-destructive">
              {t("Xodimning filiali aniqlanmagan — oylikni berib bo'lmaydi.")}
            </p>
          )}
        </div>

        <DialogFooter className="border-t px-6 py-4">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            {t("Bekor qilish")}
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {submitting && <Loader2 className="animate-spin" data-icon="inline-start" />}
            {t("Berildi")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** «Naqd» / «Karta»: the account the money leaves from, and how much. */
function AmountRow({
  id,
  label,
  accounts,
  accountId,
  onAccountChange,
  amount,
  onAmountChange,
  disabled,
}: {
  id: string;
  label: string;
  accounts: SalaryDetail["cashAccounts"];
  accountId: string;
  onAccountChange: (id: string) => void;
  amount: string;
  onAmountChange: (digits: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label id={`${id}-label`} htmlFor={id}>
        {label}
      </Label>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <Select value={accountId} onValueChange={onAccountChange} disabled={disabled}>
          <SelectTrigger className="w-full" aria-labelledby={`${id}-label`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <PriceInput id={id} value={amount} onChange={(e) => onAmountChange(e.target.value)} disabled={disabled} />
      </div>
    </div>
  );
}
