import { formatNumber } from "@/lib/format-utils";
import { monthShort } from "@/components/payments/salary-utils";
import { msg } from "@/i18n/msg";
import { interpolate, type Params } from "@/i18n/translate";

/** `t` of a page with a language; the default says the Uzbek text. */
export type Translate = (source: string, params?: Params) => string;

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
  /**
   * Contract 3.5 waits for a «Dars bo'ldimi?» answer (CEO, 01.10.2026): the
   * server refuses the departure with these words until it is given.
   */
  trialAwaitsAnswer?: string | null;
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

// The texts below are drawn with `t(…)` by the block.
export const POLICY_TITLES: Record<DeparturePolicy, string> = {
  STUDENT_CANCELLED: msg("O'quvchi o'zi to'xtatdi"),
  LEVEL_COMPLETED: msg("Darajani tugatdi"),
  CENTER_INITIATIVE: msg("Markaz tashabbusi"),
  QUALITY_CLAIM: msg("Sifat bo'yicha shikoyat"),
};

/** The option's title in the page's language. */
export function policyTitle(
  policy: DeparturePolicy,
  t: Translate = interpolate,
): string {
  const title = POLICY_TITLES[policy];
  return t(title);
}

export const LOCKED_POLICY_NOTE = msg(
  "Markaz tashabbusi yoki sifat shikoyatini faqat direktor yoki CEO tanlaydi",
);

export const CONTRACT_NOTE = msg(
  "Shartnoma 6.2 · 01.10.2026 dan chiqqanlarga qo'llanadi",
);

const som = (n: number, t: Translate) => `${formatNumber(n)} ${t("so'm")}`;

/** «oktabr» → «Oktabr»: a month name opens a sentence (the Russian one is written in lower case). */
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The enrollments whose month the departure settles; none → no block. */
export function monthlyRows(
  preview: DeparturePreview | undefined,
): MonthlyRow[] {
  return (preview?.enrollments ?? []).filter(
    (e): e is MonthlyRow => e.month !== null,
  );
}

/** "Oktabr: 13 dars, 1 040 000 so'm. Bugun 14.10, o'tgani:" + "6 ta (46%)". */
export function factsLine(
  month: DepartureMonth,
  t: Translate = interpolate,
): {
  lead: string;
  held: string;
} {
  const [, mm, dd] = month.departureDay.split("-");
  return {
    lead: t("{month}: {covered} dars, {amount}. Bugun {date}, o'tgani:", {
      month: capitalize(monthShort(month.period, t)),
      covered: month.covered,
      amount: som(month.chargedAmount, t),
      date: `${dd}.${mm}`,
    }),
    held: t("{held} ta ({percent}%)", {
      held: month.held,
      percent: month.heldPercent,
    }),
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
  t: Translate = interpolate,
): string {
  if (month.trialLesson) {
    return t("Sinov darsi (3.5) — oyning to'liq puli qaytadi");
  }
  if (policy === "LEVEL_COMPLETED") {
    return t(
      "Sertifikat oldi yoki keyingi darajaga o'tadi — o'tilmagan darslar puli qaytadi",
    );
  }
  if (policy === "CENTER_INITIATIVE") {
    return t("O'tilmagan darslar puli qaytadi");
  }
  if (policy === "QUALITY_CLAIM") return t("Oyning to'liq puli qaytadi");
  if (!month.contractApplies) {
    return t(
      "Shartnoma 6.2 hali kuchga kirmagan — o'tilmagan darslar puli qaytadi",
    );
  }
  const figures = {
    covered: month.covered,
    held: month.held,
    threshold: month.threshold,
  };
  return month.held * 100 > month.threshold * month.covered
    ? t(
        "{covered} darsdan {held} tasi o'tgan ({threshold}% dan ko'p) — pul qaytmaydi",
        figures,
      )
    : t(
        "{covered} darsdan {held} tasi o'tgan ({threshold}% dan ko'p emas) — o'tilmagan darslar puli qaytadi",
        figures,
      );
}

export interface Consequence {
  tone: "warning" | "success" | "neutral";
  head: string;
  /** Empty when the head says everything. */
  line: string;
}

const CASH_NOTE = msg("Naqd pulni keyin «Pul qaytarish» orqali berasiz.");
const NO_TEACHER_PAY = msg("Ustozga bu oyning darslari uchun haq yozilmaydi.");

function balanceLine(before: number, after: number, t: Translate): string {
  if (before >= 0) {
    const balance = t("Balans: {before} → {after}.", {
      before: formatNumber(before),
      after: som(after, t),
    });
    return `${balance} ${t(CASH_NOTE)}`;
  }
  if (after < 0) {
    return t("Qarz: {before} → {after}.", {
      before: formatNumber(-before),
      after: som(-after, t),
    });
  }
  if (after === 0) {
    return t("Qarz: {before} → 0 so'm.", { before: formatNumber(-before) });
  }
  const closed = t("Qarz yopiladi, balansda {after} qoladi.", {
    after: som(after, t),
  });
  return `${closed} ${t(CASH_NOTE)}`;
}

/** The box under the options: what confirming with `policy` would do. */
export function departureConsequence(
  preview: DeparturePreview | undefined,
  policy: DeparturePolicy,
  t: Translate = interpolate,
): Consequence | null {
  const rows = monthlyRows(preview);
  if (!preview || rows.length === 0) return null;
  const awaiting = rows.find((r) => r.month.trialAwaitsAnswer)?.month
    .trialAwaitsAnswer;
  if (awaiting) return { tone: "warning", head: awaiting, line: "" };
  const outcomes = rows.map((r) => r.month.outcomes[policy]);
  const amount = outcomes.reduce((s, o) => s + o.amount, 0);
  const lessons = outcomes.reduce((s, o) => s + o.lessons, 0);
  const trial = rows.every((r) => r.month.trialLesson);

  // A trial month that cost nothing (a 100% discount, the excused credit):
  // nothing comes back, and the teacher is still not paid for it.
  if (amount === 0 && trial) {
    return {
      tone: "neutral",
      head: t("Sinov darsi (3.5): qaytadigan pul yo'q"),
      line: t(NO_TEACHER_PAY),
    };
  }

  if (amount > 0) {
    const money = som(amount, t);
    let head: string;
    if (trial) {
      head = t("Sinov darsi (3.5): oyning puli to'liq qaytadi — {amount}", {
        amount: money,
      });
    } else if (policy === "QUALITY_CLAIM") {
      head = t("Oyning to'liq puli qaytadi: {amount}", { amount: money });
    } else if (rows.every((r) => r.month.held === 0)) {
      head = t("Hali dars o'tmagan: {lessons} dars puli to'liq qaytadi, {amount}", {
        lessons,
        amount: money,
      });
    } else {
      head = t("{lessons} ta o'tilmagan dars puli qaytadi: {amount}", {
        lessons,
        amount: money,
      });
    }
    // Contract 3.5 (CEO, 28.09.2026): a trial lesson is paid by nobody.
    let teacher = "";
    if (trial) teacher = ` ${t(NO_TEACHER_PAY)}`;
    else if (policy === "QUALITY_CLAIM") {
      teacher = ` ${t("Ustoz oyligi kamaymaydi, farqni markaz qoplaydi.")}`;
    }
    return {
      tone: "success",
      head,
      line: balanceLine(preview.balance, preview.balance + amount, t) + teacher,
    };
  }

  const kept = rows.find((r) => r.month.outcomes[policy].withheld);
  if (kept) {
    const balance =
      preview.balance < 0
        ? t("Qarz o'zgarmaydi: {debt}.", { debt: som(-preview.balance, t) })
        : t("Balans o'zgarmaydi.");
    const passed = t("Oy darslarining {percent}% o'tgan.", {
      percent: kept.month.heldPercent,
    });
    return {
      tone: "warning",
      head: t("Pul qaytmaydi"),
      line: `${passed} ${balance}`,
    };
  }

  return {
    tone: "neutral",
    head: t("Qaytadigan dars yo'q"),
    line: t("Oyning hamma darslari o'tgan."),
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

export interface WithheldWarning {
  tone: "warning" | "success";
  title: string;
  body: string;
}

/**
 * Removal only: contract 6.2 keeps the month's money when the student leaves
 * after more than 40% of the lessons. A reason that says the student moved to
 * another group («ko'chdi») is settled as a transfer on the server (ADR-0124):
 * the unheld lessons come back, and the box says so. Otherwise it warns that a
 * move done through «Chiqarish» would lose the money. Blocks nothing.
 */
export function withheldWarning(
  preview: DeparturePreview | undefined,
  { looksLikeMove = false }: { looksLikeMove?: boolean } = {},
  t: Translate = interpolate,
): WithheldWarning | null {
  const withheld = monthlyRows(preview).filter(
    (r) => r.month.outcomes.STUDENT_CANCELLED.withheld,
  );
  if (withheld.length === 0) return null;
  const { heldPercent, threshold } = withheld[0].month;
  const amount = withheld.reduce(
    (s, r) => s + r.month.outcomes.CENTER_INITIATIVE.amount,
    0,
  );
  const title =
    amount > 0
      ? t("Oy to'lovi qaytarilmaydi — {amount} ushlab qolinadi", {
          amount: som(amount, t),
        })
      : t("Oy to'lovi qaytarilmaydi");
  const body = t(
    "Oyning {percent}% i o'tgan (shartnoma 6.2: {threshold}% dan ko'p). O'quvchi boshqa guruhga o'tayotgan bo'lsa, bu oynani yopib, profildagi «Guruhni o'zgartirish» dan foydalaning: u o'tmagan darslarning pulini balansga qaytaradi. «Chiqarish» faqat o'quvchi haqiqatan ketganda.",
    { percent: heldPercent, threshold },
  );
  if (looksLikeMove) {
    return {
      tone: "success",
      title:
        amount > 0
          ? t("Ko'chish sifatida hisoblanadi — {amount} balansga qaytadi", {
              amount: som(amount, t),
            })
          : t("Ko'chish sifatida hisoblanadi"),
      body: t(
        "«Ko'chdi» sababi tanlandi: o'tmagan darslarning puli o'quvchi balansiga qaytariladi (shartnoma 6.2 qo'llanmaydi). O'quvchi haqiqatan ketayotgan bo'lsa, boshqa sabab tanlang.",
      ),
    };
  }
  return { tone: "warning", title, body };
}
