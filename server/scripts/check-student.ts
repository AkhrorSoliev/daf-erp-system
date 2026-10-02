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
import { chargeMonth, fairBalance } from './lib/fair-balance';

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

  const [atts, payments, txns, charges] = await Promise.all([
    prisma.attendance.findMany({
      where: { studentId: id },
      orderBy: { date: 'asc' },
      select: { id: true, date: true, status: true, groupId: true },
    }),
    prisma.payment.findMany({
      where: { studentId: id },
      orderBy: { createdAt: 'asc' },
      select: { amount: true, method: true, status: true, source: true, createdAt: true, note: true },
    }),
    prisma.transaction.findMany({
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
        attendanceId: true,
        enrollmentId: true,
        metadata: true,
      },
    }),
    prisma.enrollmentMonthlyCharge.findMany({
      where: { studentId: id },
      orderBy: [{ periodYear: 'asc' }, { periodMonth: 'asc' }],
      select: {
        groupId: true,
        periodYear: true,
        periodMonth: true,
        status: true,
        chargedAmount: true,
        coveredLessons: true,
        plannedLessons: true,
        creditAmount: true,
        coveredDates: true,
      },
    }),
  ]);
  const fair = fairBalance({
    balance: s.balance,
    discountPercent: disc,
    todayRate: new Map([...groupInfo].map(([g, gi]) => [g, gi.perLesson])),
    enrollments,
    attendance: atts,
    txns,
    charges,
  });

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
  console.log(`  Prepaid (ushlab)  : ${som(fair.prepaidValue)} so'm  (${fair.prepaidCount} dars)`);
  console.log(`  Pozitsiya         : ${som(fair.position)} so'm  (balans + prepaid)`);

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

  // ── attendance ────────────────────────────────────────────────────────────
  const counts: Record<string, number> = {};
  for (const a of atts) counts[a.status] = (counts[a.status] ?? 0) + 1;
  section(`DAVOMAT (${atts.length})`);
  console.log(`  ${Object.entries(counts).map(([k, v]) => `${k}:${v}`).join('  ') || '—'}`);
  console.log(
    `  Billable (>=01.05, >=start, PRESENT/LATE/ABSENT): ${fair.billableCount} dars ` +
      `(01.09 gacha: ${fair.billableBeforeMonthly}, 01.09 dan: ${fair.billableCount - fair.billableBeforeMonthly})`,
  );
  if (full) {
    printTable(
      ['sana', 'status', 'guruh', 'billable'],
      atts.map((a) => [
        day(a.date),
        a.status,
        groupInfo.get(a.groupId)?.name ?? a.groupId,
        fair.isBillable(a) ? '✓' : '',
      ]),
    );
  }

  // ── payments ──────────────────────────────────────────────────────────────
  const paidSum = payments.filter((p) => p.status === 'COMPLETED').reduce((a, p) => a + p.amount, 0);
  section(`TO'LOVLAR (${payments.length}) — COMPLETED jami: ${som(paidSum)} so'm`);
  printTable(
    ['sana', 'summa', 'method', 'status', 'source'],
    payments.map((p) => [dt(p.createdAt), som(p.amount), p.method, p.status, p.source]),
    ['l', 'r', 'l', 'l', 'l'],
  );

  // ── transactions (ledger) ─────────────────────────────────────────────────
  // Every row is summed, reversed originals AND their reversal rows: the pair
  // nets to zero. Dropping only the original (reversedAt set) kept the
  // reversal's opposite sign — #10082's LESSON_DEDUCTION read -1 874 990
  // instead of -2 166 655.
  const byType: Record<string, { count: number; voided: number; sum: number }> = {};
  for (const t of txns) {
    byType[t.type] = byType[t.type] ?? { count: 0, voided: 0, sum: 0 };
    byType[t.type].count++;
    if (t.reversedAt || t.reversedTransactionId) byType[t.type].voided++;
    byType[t.type].sum += t.amount;
  }
  const ledgerSum = txns.reduce((acc, t) => acc + t.amount, 0);
  section(`LEDGER (${txns.length} ta; jami = barcha qatorlar, bekor juftlari nolga tushadi)`);
  printTable(
    ['type', 'soni', 'shundan bekor', 'jami'],
    Object.entries(byType).map(([k, v]) => [k, v.count, v.voided, som(v.sum)]),
    ['l', 'r', 'r', 'r'],
  );
  console.log(
    `  Σ ledger = ${som(ledgerSum)}  ${
      ledgerSum === s.balance ? '✓ balansga teng' : `⚠ balansdan farq: ${som(s.balance - ledgerSum)}`
    }`,
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

  // ── fair-balance reconciliation (scripts/lib/fair-balance.ts) ─────────────
  section('ADOLATLI BALANS TEKSHIRUVI');
  console.log(`  money-in (to'lov va boshqa kirim)    : ${som(fair.moneyIn)}`);
  console.log(
    `  darsbay haq, paket narxi (chegirmali): ${som(fair.fairLessonFee)}  (${fair.lessonBilledCount} dars` +
      `${fair.guessed ? `, ${fair.guessed} tasi ledger narxisiz — taxmin` : ''}` +
      `${fair.rateCorrection ? `, narx tuzatishi −${som(fair.rateCorrection)}` : ''})`,
  );
  console.log(
    `  oylik hisoblar (01.09 dan)           : ${som(fair.monthlyFee)}  (${fair.liveChargeCount} ta, ${fair.monthlyLessons} dars shu oylarda)`,
  );
  for (const c of charges)
    console.log(
      `      ${chargeMonth(c)}  ${groupInfo.get(c.groupId)?.name ?? c.groupId}  ${som(c.chargedAmount)}  ` +
        `(${c.coveredLessons}/${c.plannedLessons} dars${c.creditAmount ? `, kredit −${som(c.creditAmount)}` : ''})` +
        `${c.status === 'CHARGED' ? '' : `  ${c.status} — hisobga olinmadi`}`,
    );
  console.log(`  → adolatli pozitsiya = money-in − haq : ${som(fair.fairPosition)}`);
  console.log(`  haqiqiy pozitsiya = balans + prepaid  : ${som(fair.position)}`);
  if (fair.adjustmentSum)
    console.log(
      `      (balansdagi ADJUSTMENT tuzatishlari: ${som(fair.adjustmentSum)}` +
        `${fair.overchargeSum ? `, shundan overcharge*: ${som(fair.overchargeSum)}` : ''})`,
    );
  console.log(
    `  ORTIQCHA (adolatli − haqiqiy) = ${som(fair.difference)} so'm  ${
      Math.abs(fair.difference) < 1000
        ? '✓ to\'g\'ri keladi'
        : fair.difference > 0
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
