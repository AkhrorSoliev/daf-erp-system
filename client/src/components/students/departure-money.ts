import { formatNumber } from "@/lib/format-utils";
import { monthShort } from "@/components/payments/salary-utils";

/**
 * What a departure does to the month's charge (contract 6.2, ADR-0043): the
 * wording of the «Pul (shartnoma bo'yicha)» block in the removal and the
 * expulsion dialogs. Every figure comes from `GET /students/:id/departure-
 * preview`, computed by the same rule the write runs; nothing here decides
 * what is returned — it only says it.
 */

export const DEPARTURE_POLICIES = [
  "STUDENT_CANCELLED",
  "LEVEL_COMPLETED",
  "CENTER_INITIATIVE",
  "QUALITY_CLAIM",
] as const;
export type DeparturePolicy = (typeof DEPARTURE_POLICIES)[number];
export const DEFAULT_DEPARTURE_POLICY: DeparturePolicy = "STUDENT_CANCELLED";

/** Which dialog asks: a removal from one group, or an expulsion. */
export type DepartureContext = "removal" | "expel";

/**
 * The options a dialog offers. A completed level (A1 finished, with a
 * certificate or to move up later) ends a group, not the studies, so an
 * expulsion never offers it; on a removal it is open to everyone. The
 * centre's initiative and a quality claim are a CEO's or branch director's
 * call — the server checks it again.
 */
export function offeredPolicies(
  context: DepartureContext,
  mayChoosePolicy: boolean,
): DeparturePolicy[] {
  const open: DeparturePolicy[] =
    context === "removal"
      ? ["STUDENT_CANCELLED", "LEVEL_COMPLETED"]
      : ["STUDENT_CANCELLED"];
  return mayChoosePolicy
    ? [...open, "CENTER_INITIATIVE", "QUALITY_CLAIM"]
    : open;
}

export interface PolicyOutcome {
  lessons: number;
  amount: number;
  /** True when rule 6.2 keeps money that would otherwise come back. */
  withheld: boolean;
}

export interface DepartureMonth {
  /** "YYYY-MM". */
  period: string;
  /** Tashkent "YYYY-MM-DD": today. */
  departureDay: string;
  /** The month's lesson dates still charged, ascending. */
  lessonDates: string[];
  held: number;
  covered: number;
  heldPercent: number;
  threshold: number;
  /** Whether rule 6.2 is in force for this departure day. */
  contractApplies: boolean;
  /**
   * Contract 3.5: a first-timer leaving after at most one lesson — the whole
   * month comes back under every policy.
   */
  trialLesson?: boolean;
  chargedAmount: number;
  outcomes: Record<DeparturePolicy, PolicyOutcome>;
}

export interface DeparturePreviewEnrollment {
  enrollmentId: string;
  groupId: string;
  groupName: string;
  status: string;
  /** Null: a lesson-pack course, or no charge for this month. */
  month: DepartureMonth | null;
}

export interface DeparturePreview {
  departureDay: string;
  /** The student's balance now; negative is a debt. */
  balance: number;
  /** Whether the signed-in user may choose a policy (read from the database). */
  mayChoosePolicy: boolean;
  defaultPolicy: DeparturePolicy;
  enrollments: DeparturePreviewEnrollment[];
}

export type MonthlyRow = DeparturePreviewEnrollment & { month: DepartureMonth };

export const POLICY_TITLES: Record<DeparturePolicy, string> = {
  STUDENT_CANCELLED: "O'quvchi o'zi to'xtatdi",
  LEVEL_COMPLETED: "Darajani tugatdi",
  CENTER_INITIATIVE: "Markaz tashabbusi",
  QUALITY_CLAIM: "Sifat bo'yicha shikoyat",
};

export const LOCKED_POLICY_NOTE =
  "Markaz tashabbusi yoki sifat shikoyatini faqat direktor yoki CEO tanlaydi";

export const CONTRACT_NOTE =
  "Shartnoma 6.2 · 01.10.2026 dan chiqqanlarga qo'llanadi";

const som = (n: number) => `${formatNumber(n)} so'm`;

/** The enrollments whose month the departure settles; none → no block. */
export function monthlyRows(
  preview: DeparturePreview | undefined,
): MonthlyRow[] {
  return (preview?.enrollments ?? []).filter(
    (e): e is MonthlyRow => e.month !== null,
  );
}

/** "Oktabr: 13 dars, 1 040 000 so'm. Bugun 14.10, o'tgani:" + "6 ta (46%)". */
export function factsLine(month: DepartureMonth): {
  lead: string;
  held: string;
} {
  const [, mm, dd] = month.departureDay.split("-");
  return {
    lead: `${monthShort(month.period)}: ${month.covered} dars, ${som(month.chargedAmount)}. Bugun ${dd}.${mm}, o'tgani:`,
    held: `${month.held} ta (${month.heldPercent}%)`,
  };
}

/** One square per lesson of the month, marked when it is already held. */
export function lessonChips(
  month: DepartureMonth,
): Array<{ date: string; day: number; held: boolean }> {
  return month.lessonDates.map((date) => ({
    date,
    day: Number(date.slice(8, 10)),
    held: date <= month.departureDay,
  }));
}

/** The line under each option: what it means for this month. */
export function policyHint(
  policy: DeparturePolicy,
  month: DepartureMonth,
): string {
  if (month.trialLesson) {
    return "Sinov darsi (3.5) — oyning to'liq puli qaytadi";
  }
  if (policy === "LEVEL_COMPLETED") {
    return "Sertifikat oldi yoki keyingi darajaga o'tadi — o'tilmagan darslar puli qaytadi";
  }
  if (policy === "CENTER_INITIATIVE") return "O'tilmagan darslar puli qaytadi";
  if (policy === "QUALITY_CLAIM") return "Oyning to'liq puli qaytadi";
  if (!month.contractApplies) {
    return "Shartnoma 6.2 hali kuchga kirmagan — o'tilmagan darslar puli qaytadi";
  }
  const share = `${month.covered} darsdan ${month.held} tasi o'tgan`;
  return month.held * 100 > month.threshold * month.covered
    ? `${share} (${month.threshold}% dan ko'p) — pul qaytmaydi`
    : `${share} (${month.threshold}% dan ko'p emas) — o'tilmagan darslar puli qaytadi`;
}

export interface Consequence {
  tone: "warning" | "success" | "neutral";
  head: string;
  line: string;
}

const CASH_NOTE = "Naqd pulni keyin «Pul qaytarish» orqali berasiz.";

function balanceLine(before: number, after: number): string {
  if (before >= 0) {
    return `Balans: ${formatNumber(before)} → ${som(after)}. ${CASH_NOTE}`;
  }
  if (after < 0) return `Qarz: ${formatNumber(-before)} → ${som(-after)}.`;
  if (after === 0) return `Qarz: ${formatNumber(-before)} → 0 so'm.`;
  return `Qarz yopiladi, balansda ${som(after)} qoladi. ${CASH_NOTE}`;
}

/** The box under the options: what confirming with `policy` would do. */
export function departureConsequence(
  preview: DeparturePreview | undefined,
  policy: DeparturePolicy,
): Consequence | null {
  const rows = monthlyRows(preview);
  if (!preview || rows.length === 0) return null;
  const outcomes = rows.map((r) => r.month.outcomes[policy]);
  const amount = outcomes.reduce((s, o) => s + o.amount, 0);
  const lessons = outcomes.reduce((s, o) => s + o.lessons, 0);

  if (amount > 0) {
    const trial = rows.every((r) => r.month.trialLesson);
    const head = trial
      ? `Sinov darsi (3.5): oyning puli to'liq qaytadi — ${som(amount)}`
      : policy === "QUALITY_CLAIM"
        ? `Oyning to'liq puli qaytadi: ${som(amount)}`
        : rows.every((r) => r.month.held === 0)
          ? `Hali dars o'tmagan: ${lessons} dars puli to'liq qaytadi, ${som(amount)}`
          : `${lessons} ta o'tilmagan dars puli qaytadi: ${som(amount)}`;
    const teacher =
      trial || policy === "QUALITY_CLAIM"
        ? " Ustoz oyligi kamaymaydi, farqni markaz qoplaydi."
        : "";
    return {
      tone: "success",
      head,
      line: balanceLine(preview.balance, preview.balance + amount) + teacher,
    };
  }

  const kept = rows.find((r) => r.month.outcomes[policy].withheld);
  if (kept) {
    const balance =
      preview.balance < 0
        ? `Qarz o'zgarmaydi: ${som(-preview.balance)}.`
        : "Balans o'zgarmaydi.";
    return {
      tone: "warning",
      head: "Pul qaytmaydi",
      line: `Oy darslarining ${kept.month.heldPercent}% o'tgan. ${balance}`,
    };
  }

  return {
    tone: "neutral",
    head: "Qaytadigan dars yo'q",
    line: "Oyning hamma darslari o'tgan.",
  };
}

/** The part of a removal or expulsion request that carries the policy. */
export type DepartureChoice = { departurePolicy?: DeparturePolicy };

/**
 * What the request carries. The default is never sent (it is what the
 * server assumes), and nothing the dialog did not offer is sent either —
 * the server would answer 403.
 */
export function departurePolicyPayload(
  policy: DeparturePolicy,
  offered: readonly DeparturePolicy[],
): DepartureChoice {
  return policy !== DEFAULT_DEPARTURE_POLICY && offered.includes(policy)
    ? { departurePolicy: policy }
    : {};
}
