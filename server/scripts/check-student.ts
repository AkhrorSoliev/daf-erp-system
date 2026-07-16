/**
 * check-student — deep READ-ONLY diagnostic for one student.
 * Usage: npx ts-node scripts/check-student.ts <studentId> [--full]
 *        railway run npx ts-node scripts/check-student.ts <studentId>   (prod)
 *
 * Sections: profil, balans (headline), enrollmentlar, davomat, to'lovlar,
 * ledger, adolatli balans tekshiruvi (fair-balance reconciliation),
 * to'lov va'dalari, oxirgi qo'ng'iroqlar.
 */
import { PrismaClient } from '@prisma/client';
import {
  SYSTEM_START,
  som,
  day,
  dt,
  pct,
  printHeader,
  section,
  printTable,
  run,
  parseArgs,
} from './lib/check-cli';

async function main(prisma: PrismaClient) {
  const { positional, full } = parseArgs();
  const id = Number(positional[0]);
  if (!id) {
    console.error('Usage: npx ts-node scripts/check-student.ts <studentId> [--full]');
    process.exitCode = 1;
    return;
  }

  const s = await prisma.student.findUnique({
    where: { id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      extraPhone: true,
      parentPhone: true,
      parentName: true,
      telegram: true,
      telegramChatId: true,
      status: true,
      balance: true,
      discountPercent: true,
      companyId: true,
      createdAt: true,
      statusChangedAt: true,
      statusChangeReason: true,
      deletedAt: true,
      branches: { select: { branch: { select: { id: true, name: true } } } },
    },
  });
  if (!s) {
    console.log(`Student #${id} NOT FOUND.`);
    return;
  }

  // ── enrollments (needed for billing + prepaid value) ──────────────────────
  const enrollments = await prisma.enrollment.findMany({
    where: { studentId: id },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      groupId: true,
      status: true,
      startDate: true,
      deletedAt: true,
      prepaidLessonsRemaining: true,
      group: {
        select: {
          name: true,
          groupNumber: true,
          course: { select: { price: true, lessonPaymentCount: true } },
        },
      },
    },
  });
  const groupInfo = new Map<string, { name: string; perLesson: number; cycleLen: number }>();
  for (const e of enrollments) {
    const price = e.group?.course?.price ?? 0;
    const cyc = e.group?.course?.lessonPaymentCount || 1;
    groupInfo.set(e.groupId, {
      name: e.group?.groupNumber ? `#${e.group.groupNumber} ${e.group?.name}` : e.group?.name ?? e.groupId,
      perLesson: Math.round(price / cyc),
      cycleLen: cyc,
    });
  }

  const disc = s.discountPercent || 0;
  const discMul = 1 - disc / 100;
  let prepaidValue = 0;
  let prepaidCount = 0;
  for (const e of enrollments) {
    if (e.status === 'ACTIVE' && e.prepaidLessonsRemaining > 0) {
      prepaidValue += e.prepaidLessonsRemaining * (groupInfo.get(e.groupId)?.perLesson ?? 0);
      prepaidCount += e.prepaidLessonsRemaining;
    }
  }
  prepaidValue = Math.round(prepaidValue * discMul);

  // ── header + profile + headline ───────────────────────────────────────────
  printHeader(`O'QUVCHI #${s.id} — ${s.firstName} ${s.lastName}`);
  if (s.deletedAt) console.log(`  ⚠ ARXIVLANGAN (deletedAt=${day(s.deletedAt)})`);

  section('PROFIL');
  console.log(`  Status        : ${s.status}`);
  console.log(`  Telefon       : ${s.phone}${s.extraPhone ? ` / ${s.extraPhone}` : ''}`);
  console.log(`  Ota-ona       : ${s.parentName ?? '—'}${s.parentPhone ? ` (${s.parentPhone})` : ''}`);
  console.log(`  Telegram      : ${s.telegram ?? '—'}${s.telegramChatId ? ` (chatId set)` : ''}`);
  console.log(`  Chegirma      : ${pct(disc)}`);
  console.log(`  Filial(lar)   : ${s.branches.map((b) => `${b.branch.name}#${b.branch.id}`).join(', ') || '—'}`);
  console.log(`  Ro'yxatga ol. : ${day(s.createdAt)}   companyId=${s.companyId}`);
  if (s.statusChangedAt)
    console.log(`  Status o'zg.  : ${day(s.statusChangedAt)}${s.statusChangeReason ? ` — ${s.statusChangeReason}` : ''}`);

  section('BALANS');
  console.log(`  Balans            : ${som(s.balance)} so'm`);
  console.log(`  Prepaid (ushlab)  : ${som(prepaidValue)} so'm  (${prepaidCount} dars)`);
  console.log(`  Pozitsiya         : ${som(s.balance + prepaidValue)} so'm  (balans + prepaid)`);

  // ── enrollments ───────────────────────────────────────────────────────────
  section(`ENROLLMENTLAR (${enrollments.length})`);
  const statusCount: Record<string, number> = {};
  printTable(
    ['guruh', 'status', 'prepaid', 'start', 'perLesson', 'cikl'],
    enrollments.map((e) => {
      statusCount[e.status] = (statusCount[e.status] ?? 0) + 1;
      const gi = groupInfo.get(e.groupId)!;
      return [
        gi.name + (e.deletedAt ? ' (DEL)' : ''),
        e.status,
        e.prepaidLessonsRemaining,
        day(e.startDate),
        som(gi.perLesson),
        gi.cycleLen,
      ];
    }),
    ['l', 'l', 'r', 'l', 'r', 'r'],
  );
  console.log(`  → ${Object.entries(statusCount).map(([k, v]) => `${k}:${v}`).join('  ') || '—'}`);

  // ── attendance + billable charge ──────────────────────────────────────────
  const atts = await prisma.attendance.findMany({
    where: { studentId: id },
    orderBy: { date: 'asc' },
    select: { date: true, status: true, groupId: true },
  });
  const startByGroup = new Map<string, string | null>();
  for (const e of enrollments) {
    const sd = day(e.startDate);
    const cur = startByGroup.get(e.groupId);
    if (cur === undefined) startByGroup.set(e.groupId, sd);
    else if (sd !== '—' && (!cur || cur === '—' || sd < cur)) startByGroup.set(e.groupId, sd);
  }
  const counts: Record<string, number> = {};
  let billableCharge = 0;
  let billableCount = 0;
  for (const a of atts) {
    counts[a.status] = (counts[a.status] ?? 0) + 1;
    const d = day(a.date);
    const start = startByGroup.get(a.groupId);
    // CLAUDE.md billing matrix: PRESENT/LATE/ABSENT are billable ("lesson held = lesson paid").
    const billable =
      ['PRESENT', 'LATE', 'ABSENT'].includes(a.status) &&
      d >= SYSTEM_START &&
      (!start || start === '—' || d >= start);
    if (billable) {
      billableCharge += groupInfo.get(a.groupId)?.perLesson ?? 0;
      billableCount++;
    }
  }
  section(`DAVOMAT (${atts.length})`);
  console.log(`  ${Object.entries(counts).map(([k, v]) => `${k}:${v}`).join('  ') || '—'}`);
  console.log(
    `  Billable (>=01.05, >=start, PRESENT/LATE/ABSENT): ${billableCount} dars → ${som(billableCharge)} so'm (chegirmasiz)`,
  );
  if (full) {
    printTable(
      ['sana', 'status', 'guruh', 'billable'],
      atts.map((a) => {
        const d = day(a.date);
        const start = startByGroup.get(a.groupId);
        const billable =
          ['PRESENT', 'LATE', 'ABSENT'].includes(a.status) &&
          d >= SYSTEM_START &&
          (!start || start === '—' || d >= start);
        return [d, a.status, groupInfo.get(a.groupId)?.name ?? a.groupId, billable ? '✓' : ''];
      }),
    );
  }

  // ── payments ──────────────────────────────────────────────────────────────
  const payments = await prisma.payment.findMany({
    where: { studentId: id },
    orderBy: { createdAt: 'asc' },
    select: { amount: true, method: true, status: true, source: true, createdAt: true, note: true },
  });
  const paidSum = payments.filter((p) => p.status === 'COMPLETED').reduce((a, p) => a + p.amount, 0);
  section(`TO'LOVLAR (${payments.length}) — COMPLETED jami: ${som(paidSum)} so'm`);
  printTable(
    ['sana', 'summa', 'method', 'status', 'source'],
    payments.map((p) => [dt(p.createdAt), som(p.amount), p.method, p.status, p.source]),
    ['l', 'r', 'l', 'l', 'l'],
  );

  // ── transactions (ledger) ─────────────────────────────────────────────────
  const txns = await prisma.transaction.findMany({
    where: { studentId: id },
    orderBy: { createdAt: 'asc' },
    select: {
      type: true,
      amount: true,
      balanceBefore: true,
      balanceAfter: true,
      createdAt: true,
      reversedAt: true,
      reversedTransactionId: true,
      description: true,
    },
  });
  const byType: Record<string, { count: number; sum: number }> = {};
  for (const t of txns) {
    if (t.reversedAt == null) {
      byType[t.type] = byType[t.type] ?? { count: 0, sum: 0 };
      byType[t.type].count++;
      byType[t.type].sum += t.amount;
    }
  }
  section(`LEDGER (${txns.length} ta, aktiv reversedAt=null bo'yicha guruh)`);
  printTable(
    ['type', 'soni', 'jami'],
    Object.entries(byType).map(([k, v]) => [k, v.count, som(v.sum)]),
    ['l', 'r', 'r'],
  );
  if (full) {
    console.log('');
    printTable(
      ['sana', 'type', 'amount', 'before→after', 'belgi'],
      txns.map((t) => [
        dt(t.createdAt),
        t.type,
        som(t.amount),
        `${som(t.balanceBefore)}→${som(t.balanceAfter)}`,
        t.reversedAt ? 'REVERSED' : t.reversedTransactionId ? 'reversal' : '',
      ]),
      ['l', 'l', 'r', 'l', 'l'],
    );
  }

  // ── fair-balance reconciliation (same model as audit-overcharged-students) ─
  const moneyInOther = txns
    .filter(
      (t) =>
        t.reversedAt == null &&
        // A reversed original (reversedAt set) is excluded above; its REVERSAL row
        // has reversedAt=null but reversedTransactionId set. Counting the reversal
        // row alone double-subtracts the undone pair (e.g. a corrected 3.5M payment
        // showing a phantom -3.5M) — skip reversal rows so the pair nets to zero.
        t.reversedTransactionId == null &&
        !['LESSON_DEDUCTION', 'ADJUSTMENT', 'LESSON_CONSUMPTION'].includes(t.type),
    )
    .reduce((acc, t) => acc + t.amount, 0);
  const fairCharge = Math.round(billableCharge * discMul);
  const fairPosition = moneyInOther - fairCharge;
  const position = s.balance + prepaidValue;
  const overcharge = fairPosition - position;
  section('ADOLATLI BALANS TEKSHIRUVI');
  console.log(`  money-in (deduction/adjustment'siz) : ${som(moneyInOther)}`);
  console.log(`  adolatli dars haqi (chegirmali)     : ${som(fairCharge)}  (${billableCount} dars)`);
  console.log(`  → adolatli pozitsiya = money-in − haq: ${som(fairPosition)}`);
  console.log(`  haqiqiy pozitsiya = balans + prepaid : ${som(position)}`);
  console.log(
    `  ORTIQCHA (adolatli − haqiqiy) = ${som(overcharge)} so'm  ${
      Math.abs(overcharge) < 1000
        ? '✓ to\'g\'ri keladi'
        : overcharge > 0
          ? '⚠ ortiqcha hisoblangan (qaytarish kerak)'
          : '⚠ kam hisoblangan (qarzdor)'
    }`,
  );

  // ── payment promises ──────────────────────────────────────────────────────
  const promises = await prisma.paymentPromise.findMany({
    where: { studentId: id, status: { in: ['OPEN', 'BROKEN'] } },
    orderBy: { promiseDate: 'desc' },
    select: { promisedAmount: true, promiseDate: true, status: true, comment: true },
  });
  if (promises.length) {
    section(`TO'LOV VA'DALARI (${promises.length} ta ochiq/buzilgan)`);
    printTable(
      ['sana', 'summa', 'status', 'izoh'],
      promises.map((p) => [day(p.promiseDate), som(p.promisedAmount), p.status, p.comment ?? '']),
      ['l', 'r', 'l', 'l'],
    );
  }

  // ── recent calls ──────────────────────────────────────────────────────────
  const calls = await prisma.callLog.findMany({
    where: { studentId: id },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { createdAt: true, reason: true, outcome: true, note: true },
  });
  if (calls.length) {
    section(`OXIRGI QO'NG'IROQLAR (${calls.length})`);
    printTable(
      ['sana', 'sabab', 'natija', 'izoh'],
      calls.map((c) => [dt(c.createdAt), c.reason, c.outcome, c.note ?? '']),
    );
  }
}

run(main);
