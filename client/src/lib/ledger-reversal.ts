import { format } from "date-fns";
import { formatBalance } from "@/lib/format-utils";
import { interpolate, type Params } from "@/i18n/translate";

/**
 * How a ledger row relates to a cancellation (`reversal` on the rows of
 * `GET /transactions/student/:id` and `GET /student-portal/payments`; built
 * by the server's `reversal-view.ts`).
 *
 * A cancellation keeps both rows: the original, and a counter-row of the same
 * type that undoes it. Without a mark the original read as a charge still
 * standing next to its own undo.
 */
export type LedgerReversal =
  | { kind: "reversed"; at: string; reason: string | null }
  | {
      kind: "undo";
      originalAt: string;
      originalAmount: number;
      reason: string | null;
    };

const day = (iso: string) => format(new Date(iso), "dd.MM.yyyy");

/**
 * One line saying what happened: "26.09.2026 da bekor qilingan: <sabab>" on
 * the cancelled row, "18.09.2026 dagi -37 500 so'm bekor qilindi: <sabab>"
 * on the row that cancelled it. The student portal leaves the reason out:
 * it is written for staff. The reason is the staff's own text and is never
 * translated; `t` puts the rest into the page's language (the default says the
 * Uzbek text, so the student portal is unchanged).
 */
export function reversalNote(
  reversal: LedgerReversal,
  {
    withReason = true,
    t = interpolate,
  }: {
    withReason?: boolean;
    t?: (source: string, params?: Params) => string;
  } = {},
): string {
  const head =
    reversal.kind === "reversed"
      ? t("{date} da bekor qilingan", { date: day(reversal.at) })
      : t("{date} dagi {amount} bekor qilindi", {
          date: day(reversal.originalAt),
          amount: formatBalance(reversal.originalAmount, t("so'm")),
        });
  return withReason && reversal.reason ? `${head}: ${reversal.reason}` : head;
}
