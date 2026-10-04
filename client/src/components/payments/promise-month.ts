"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { instantDayMonth } from "./debt/debt-format";
import type { PromiseMonthState } from "./debt/debt-types";

/**
 * `GET /payment-promises/month` — this month's promise and the days a promise
 * may name (ADR-0072: at most 7 days ahead, once a month). The drawer form,
 * the payment dialog and the call dialog read it; the server decides.
 */
export function usePromiseMonth(studentId: number | null) {
  return useQuery({
    queryKey: ["promise-month", studentId],
    queryFn: () => api.get<PromiseMonthState>("/payment-promises/month", { params: { studentId } }).then((r) => r.data),
    enabled: studentId != null,
    staleTime: 0,
  });
}

/** 'YYYY-MM-DD' → local midnight, the value a `<DatePicker>` bound takes. */
export function dateFromDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * What the payment dialog asks of a part payment. The server checks a sent
 * date before the payment, so a date is sent only inside the month's range:
 * the first promise (`create`) or moving its OPEN one (`edit`). A closed
 * promise, or a lookup that failed, asks nothing and says why — a payment is
 * never refused over a promise.
 */
export function paymentPromiseAsk(partPayment: boolean, month: { data?: PromiseMonthState; isError: boolean }) {
  const range = month.data ? (month.data.create ?? month.data.edit) : null;
  if (!partPayment) return { needsPromise: false, range, hint: null };
  if (month.isError) return { needsPromise: false, range, hint: "Va'da holatini yuklab bo'lmadi — sana so'ralmaydi." };
  const closed = range ? null : (month.data?.monthPromise ?? null);
  if (closed) {
    return { needsPromise: false, range, hint: `Shu oy va'da yozilgan: ${instantDayMonth(closed.promiseDate)} gacha. Yangisi so'ralmaydi.` };
  }
  return { needsPromise: true, range, hint: null };
}

/** A default day clamped into the allowed range (no range → unchanged). */
export function capToRange(date: Date | null, range: { from: string; to: string } | null): Date | null {
  if (!date || !range) return date;
  const from = dateFromDay(range.from);
  const to = dateFromDay(range.to);
  return date < from ? from : date > to ? to : date;
}
