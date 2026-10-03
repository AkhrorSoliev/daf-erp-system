import { formatNumber } from "@/lib/format-utils";
import { monthShort } from "@/components/payments/salary-utils";
import { som } from "@/components/payments/overview/overview-math";

/** One month of `GET /reports/marketing` (ADR-0067 definitions; null = not computed). */
export interface MarketingMonth {
  month: string;
  spend: number;
  newStudents: number;
  cac: number | null;
  cohortPaid: number | null;
  roi: number | null;
  transition: boolean;
}

export interface MarketingReport extends MarketingMonth {
  ltv: { value: number; avgMonths: number; monthlyCharge: number } | null;
  /** The asked month first, back to 2026-05. */
  months: MarketingMonth[];
  /** Lead sources of the month; null before 10.09.2026. `rate` — «Aylanish», 0–100, the server's. */
  sources: { source: string | null; leads: number; students: number; rate: number }[] | null;
}

/** "13" from 10 up, "3,4" below it. */
export function roiNumber(roi: number): string {
  return roi >= 10
    ? formatNumber(Math.round(roi))
    : formatNumber(roi, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** «13×», «3,4×»; nothing to show is «—». */
export function formatRoi(roi: number | null): string {
  return roi == null ? "—" : `${roiNumber(roi)}×`;
}

/** The «Marketing samarasi» sentence (spec B1 §3.3). */
export function roiSentence(r: MarketingMonth): string {
  if (r.transition) return "May–iyun — tizimga o'tish oylari, hisoblanmaydi.";
  const name = monthShort(r.month);
  if (r.spend === 0 || r.roi == null) return `${name}da marketingga sarf yozilmagan.`;
  const head = `${name}da qo'shilgan ${formatNumber(r.newStudents)} o'quvchi hozirgacha ${som(r.cohortPaid)} to'ladi`;
  return r.roi >= 1
    ? `${head} — marketingga sarflangan ${som(r.spend)} dan ${roiNumber(r.roi)} barobar ko'p.`
    : `${head} — sarfning ${Math.round(r.roi * 100)}% i.`;
}
