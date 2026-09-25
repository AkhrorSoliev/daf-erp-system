import { Prisma } from '@prisma/client';

/**
 * Who receives a mock exam's results.
 *
 * CEO, 2026-09-25: only those who paid sit the exam and only they get their
 * results. A registration that owes nothing counts as paid: its fee is 0 (a
 * free exam, or a DaF price of 0), and a row from before fees were frozen on
 * registration reads the exam's price instead (`feeAmount ?? exam.price`, as
 * everywhere else).
 *
 * One filter for every way results go out: the Telegram message after the
 * announcement, the rows of the results PDF, and the bot's «Mock natijalari»
 * list and button. Nest it under `AND` — a caller's own `OR` would clash.
 */
export const RESULTS_AUDIENCE = {
  OR: [
    { paid: true },
    { feeAmount: 0 },
    { feeAmount: null, exam: { price: 0 } },
  ],
} satisfies Prisma.MockExamParticipantWhereInput;
