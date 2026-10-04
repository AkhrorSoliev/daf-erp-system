"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
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

/** A default day clamped into the allowed range (no range → unchanged). */
export function capToRange(date: Date | null, range: { from: string; to: string } | null): Date | null {
  if (!date || !range) return date;
  const from = dateFromDay(range.from);
  const to = dateFromDay(range.to);
  return date < from ? from : date > to ? to : date;
}
