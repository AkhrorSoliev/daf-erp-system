import { MockRegistrationChannel, PaymentMethod, Prisma } from '@prisma/client';
import { effectiveMockFee } from './mock-exam-pricing.util';
import { inResultsAudience } from './mock-results-audience';

/**
 * The statistics block on a mock exam's «Umumiy» tab (CEO, 2026-09-30):
 * money, where registrations came from, DaF or not, payment method, levels,
 * time slots, and whether results reached people. Every definition lives
 * here, next to its spec.
 */

/**
 * How a paid registration was paid. `BALANCE` is a pre-2026-08 deduction from
 * a student's lesson balance; `UNKNOWN` is a desk payment accepted before the
 * method was stored (ADR-0046). Nothing is guessed.
 */
export type MockStatsMethod = PaymentMethod | 'BALANCE' | 'UNKNOWN';

const METHOD_ORDER: MockStatsMethod[] = [
  PaymentMethod.CASH,
  PaymentMethod.CLICK,
  PaymentMethod.PAYME,
  PaymentMethod.UZUM,
  PaymentMethod.TRANSFER,
  'BALANCE',
  'UNKNOWN',
];

export interface StatsExam {
  price: number;
  offeredLevels: string[];
  examTimes: string[];
  announcedAt: Date | null;
}

export interface StatsParticipant {
  id: string;
  registeredVia: MockRegistrationChannel;
  studentId: number | null;
  convertedAt: Date | null;
  feeAmount: number | null;
  paid: boolean;
  paymentMethod: PaymentMethod | null;
  formData: Prisma.JsonValue;
  level: string | null;
  examTime: string | null;
  telegramChatId: string | null;
  resultSentAt: Date | null;
  resultSendError: string | null;
}

export interface MockExamStats {
  registered: number;
  channel: { bot: number; admin: number };
  /** DaF = matched a student card at registration; a later conversion is not. */
  daf: { student: number; outsider: number; converted: number };
  money: {
    paidCount: number;
    paidSum: number;
    unpaidCount: number;
    unpaidSum: number;
    cashIntentCount: number;
    freeCount: number;
  };
  methods: { method: MockStatsMethod; count: number; sum: number }[];
  levels: { level: string | null; registered: number; paid: number }[];
  times: { time: string | null; registered: number }[];
  /** Null until the results are announced; the four counts split `audience`. */
  results: {
    audience: number;
    delivered: number;
    noTelegram: number;
    failed: number;
    pending: number;
  } | null;
}

function hasCashIntent(formData: Prisma.JsonValue): boolean {
  return (
    typeof formData === 'object' &&
    formData !== null &&
    !Array.isArray(formData) &&
    formData.__payIntent === 'CASH'
  );
}

/**
 * The exam's own values first (even with nobody on them), then values only
 * the rows carry, sorted, then the null bucket when anyone has none.
 */
function bucketKeys(
  offered: string[],
  values: (string | null)[],
): (string | null)[] {
  const extra = [
    ...new Set(
      values.filter((v): v is string => v !== null && !offered.includes(v)),
    ),
  ].sort();
  const keys: (string | null)[] = [...offered, ...extra];
  if (values.includes(null)) keys.push(null);
  return keys;
}

function summarizeResults(examPrice: number, rows: StatsParticipant[]) {
  const audience = rows.filter((p) =>
    inResultsAudience(p.paid, p.feeAmount, examPrice),
  );
  const notSent = audience.filter((p) => p.resultSentAt === null);
  const withChat = notSent.filter((p) => p.telegramChatId !== null);
  const failed = withChat.filter((p) => p.resultSendError !== null).length;
  return {
    audience: audience.length,
    delivered: audience.length - notSent.length,
    noTelegram: notSent.length - withChat.length,
    failed,
    pending: withChat.length - failed,
  };
}

export function summarizeMockExam(
  exam: StatsExam,
  rows: StatsParticipant[],
  paidFromBalance: ReadonlySet<string>,
): MockExamStats {
  const fee = (p: StatsParticipant) =>
    effectiveMockFee(p.feeAmount, exam.price);
  const paid = rows.filter((p) => p.paid);
  const unpaid = rows.filter((p) => !p.paid && fee(p) > 0);
  const dafStudents = rows.filter(
    (p) => p.studentId !== null && p.convertedAt === null,
  ).length;

  const byMethod = new Map<MockStatsMethod, { count: number; sum: number }>();
  for (const p of paid) {
    const method: MockStatsMethod =
      p.paymentMethod ?? (paidFromBalance.has(p.id) ? 'BALANCE' : 'UNKNOWN');
    const total = byMethod.get(method) ?? { count: 0, sum: 0 };
    total.count += 1;
    total.sum += fee(p);
    byMethod.set(method, total);
  }

  return {
    registered: rows.length,
    channel: {
      bot: rows.filter((p) => p.registeredVia === MockRegistrationChannel.BOT)
        .length,
      admin: rows.filter(
        (p) => p.registeredVia === MockRegistrationChannel.ADMIN,
      ).length,
    },
    daf: {
      student: dafStudents,
      outsider: rows.length - dafStudents,
      converted: rows.filter((p) => p.convertedAt !== null).length,
    },
    money: {
      paidCount: paid.length,
      paidSum: paid.reduce((sum, p) => sum + fee(p), 0),
      unpaidCount: unpaid.length,
      unpaidSum: unpaid.reduce((sum, p) => sum + fee(p), 0),
      cashIntentCount: unpaid.filter((p) => hasCashIntent(p.formData)).length,
      freeCount: rows.filter((p) => !p.paid && fee(p) === 0).length,
    },
    methods: METHOD_ORDER.flatMap((method) => {
      const total = byMethod.get(method);
      return total ? [{ method, ...total }] : [];
    }),
    levels: bucketKeys(
      exam.offeredLevels,
      rows.map((p) => p.level),
    ).map((level) => {
      const onLevel = rows.filter((p) => p.level === level);
      return {
        level,
        registered: onLevel.length,
        paid: onLevel.filter((p) => p.paid).length,
      };
    }),
    times: bucketKeys(
      exam.examTimes,
      rows.map((p) => p.examTime),
    ).map((time) => ({
      time,
      registered: rows.filter((p) => p.examTime === time).length,
    })),
    results:
      exam.announcedAt === null ? null : summarizeResults(exam.price, rows),
  };
}
