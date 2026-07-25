/**
 * IYUN USTOZ OYLIGI — ANIQ BREAKDOWN — READ-ONLY.
 *
 * Savol (CEO): "Ustozlar oyligi 72,3 mln — bu aniqmi? Avans qanday hisoblangan?
 * Ustozlarga iyunda ~60 mln berilgan, bu yerda 72,3 mln — tushunmayapman."
 *
 * Ko'rsatadi:
 *   GROSS ishlab topilgan (accrual, lessonDate ∈ iyun)  = ustozning % ulushi
 *     — bu shu oy darslari uchun ustoz TOPGAN pul (naqd chiqqan-chiqmaganidan qat'i nazar)
 *   shundan: to'langan (salaryPaymentId bor) / kutilayotgan (null) / markaz top-up
 *   AVANS iyunda berilgan (Expense TEACHER_ADVANCE, date ∈ iyun) — CASH
 *   Iyun sikli SalaryPayment: net summa, status, settled avans
 *
 * Reconciliation:  GROSS = NET to'lov + settled AVANS  (avans — oldindan berilgan
 *   oylikning bir qismi, ALOHIDA xarajat emas). Cardda ustoz xarajati = GROSS.
 *
 * Usage (server/ ichidan):
 *   railway run npx ts-node scripts/breakdown-june-teacher-salary.ts        # PROD
 *   flags: --month=2026-06  --full (barcha ustozlar)
 * Hech narsa yozmaydi.
 */
import { PrismaClient } from '@prisma/client';
import { som, dbEnvLabel, printHeader, section, run } from './lib/check-cli';

const COMPANY_ID = 1001;
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

const argv = process.argv.slice(2);
const MONTH = (argv.find((a) => a.startsWith('--month=')) ?? '--month=2026-06').split('=')[1];
const FULL = argv.includes('--full');

function dateFieldRange(monthStr: string): { gte: Date; lt: Date } {
  const [y, m] = monthStr.split('-').map(Number);
  return { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) };
}
function tsRange(monthStr: string): { gte: Date; lt: Date } {
  const [y, m] = monthStr.split('-').map(Number);
  return {
    gte: new Date(Date.UTC(y, m - 1, 1) - TASHKENT_OFFSET_MS),
    lt: new Date(Date.UTC(y, m, 1) - TASHKENT_OFFSET_MS),
  };
}

async function main(prisma: PrismaClient) {
  printHeader(`IYUN USTOZ OYLIGI — ANIQ BREAKDOWN (${MONTH})`);
  console.log(`  Baza: ${dbEnvLabel()}`);

  const df = dateFieldRange(MONTH);
  const ts = tsRange(MONTH);

  // 1) GROSS accrual — shu oy darslari uchun (lessonDate ∈ month, reversedAt null)
  const accruals = await prisma.salaryAccrual.findMany({
    where: { companyId: COMPANY_ID, reversedAt: null, lessonDate: { gte: df.gte, lt: df.lt } },
    select: { userId: true, amount: true, salaryPaymentId: true, isCenterTopUp: true },
  });

  type Row = {
    userId: number;
    gross: number;
    paid: number;
    pending: number;
    topup: number;
    units: number;
    advance: number;
  };
  const rows = new Map<number, Row>();
  const get = (id: number): Row => {
    let r = rows.get(id);
    if (!r) {
      r = { userId: id, gross: 0, paid: 0, pending: 0, topup: 0, units: 0, advance: 0 };
      rows.set(id, r);
    }
    return r;
  };
  for (const a of accruals) {
    const r = get(a.userId);
    r.gross += a.amount;
    r.units += 1;
    if (a.salaryPaymentId) r.paid += a.amount;
    else r.pending += a.amount;
    if (a.isCenterTopUp) r.topup += a.amount;
  }

  // 2) AVANS — iyunda berilgan (Expense TEACHER_ADVANCE, date ∈ month)
  const advances = await prisma.expense.findMany({
    where: {
      companyId: COMPANY_ID,
      deletedAt: null,
      category: 'TEACHER_ADVANCE',
      date: { gte: df.gte, lt: df.lt },
    },
    select: { relatedUserId: true, amount: true },
  });
  for (const e of advances) if (e.relatedUserId) get(e.relatedUserId).advance += e.amount;

  // Ismlar
  const users = await prisma.user.findMany({
    where: { id: { in: [...rows.keys()] } },
    select: { id: true, firstName: true, lastName: true },
  });
  const nameMap = new Map(
    users.map((u) => [u.id, `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || `#${u.id}`]),
  );

  // 3) Iyun sikli SalaryPayment: iyun darslariga bog'langan accruallar orqali
  const paidAccrualPayments = await prisma.salaryAccrual.findMany({
    where: {
      companyId: COMPANY_ID,
      reversedAt: null,
      lessonDate: { gte: df.gte, lt: df.lt },
      salaryPaymentId: { not: null },
    },
    select: { salaryPaymentId: true },
    distinct: ['salaryPaymentId'],
  });
  const paymentIds = paidAccrualPayments
    .map((p) => p.salaryPaymentId)
    .filter((x): x is string => !!x);
  const payments =
    paymentIds.length > 0
      ? await prisma.salaryPayment.findMany({
          where: { id: { in: paymentIds } },
          select: { id: true, amount: true, status: true, paidAt: true },
        })
      : [];
  const settledAdv =
    paymentIds.length > 0
      ? await prisma.expense.aggregate({
          where: { settledBySalaryPaymentId: { in: paymentIds } },
          _sum: { amount: true },
        })
      : { _sum: { amount: 0 } };

  // 4) Naqd chiqqan — iyunda: avanslar + iyunda PAID bo'lgan SalaryPayment
  const salaryPaidInMonth = await prisma.salaryPayment.aggregate({
    where: { companyId: COMPANY_ID, status: 'PAID', paidAt: { gte: ts.gte, lt: ts.lt } },
    _sum: { amount: true },
  });

  // ── Totals ──
  const list = [...rows.values()].sort((a, b) => b.gross - a.gross);
  const T = list.reduce(
    (s, r) => ({
      gross: s.gross + r.gross,
      paid: s.paid + r.paid,
      pending: s.pending + r.pending,
      topup: s.topup + r.topup,
      advance: s.advance + r.advance,
      units: s.units + r.units,
    }),
    { gross: 0, paid: 0, pending: 0, topup: 0, advance: 0, units: 0 },
  );

  section('Per-ustoz jadval (gross = ishlab topilgan % ulush)');
  console.log(
    '  ' +
      'Ustoz'.padEnd(24) +
      'GROSS'.padStart(14) +
      'To\'langan'.padStart(14) +
      'Kutilmoqda'.padStart(14) +
      'Avans(iyun)'.padStart(14),
  );
  console.log('  ' + '─'.repeat(80));
  const show = FULL ? list : list.slice(0, 20);
  for (const r of show) {
    console.log(
      '  ' +
        (nameMap.get(r.userId) ?? `#${r.userId}`).padEnd(24) +
        som(r.gross).padStart(14) +
        som(r.paid).padStart(14) +
        som(r.pending).padStart(14) +
        som(r.advance).padStart(14),
    );
  }
  if (!FULL && list.length > 20) console.log(`  … yana ${list.length - 20} ustoz (--full bilan ko'ring)`);
  console.log('  ' + '─'.repeat(80));
  console.log(
    '  ' +
      'JAMI'.padEnd(24) +
      som(T.gross).padStart(14) +
      som(T.paid).padStart(14) +
      som(T.pending).padStart(14) +
      som(T.advance).padStart(14),
  );

  section('Xulosa raqamlar');
  console.log(`  GROSS ishlab topilgan (accrual, ${T.units} ta dars×ustoz) : ${som(T.gross)}`);
  console.log(`    shundan markaz top-up (isCenterTopUp)                  : ${som(T.topup)}`);
  console.log(`    shundan allaqachon to'langan (salaryPaymentId bor)     : ${som(T.paid)}`);
  console.log(`    shundan kutilayotgan (hali to'lanmagan)                : ${som(T.pending)}`);
  console.log('');
  console.log(`  AVANS iyunda berilgan (cash, TEACHER_ADVANCE)            : ${som(T.advance)}`);
  console.log(`  Iyunda PAID bo'lgan SalaryPayment (paidAt ∈ iyun)        : ${som(salaryPaidInMonth._sum.amount ?? 0)}`);
  console.log('');
  console.log('  Iyun darslariga bog\'langan SalaryPayment(lar):');
  if (payments.length === 0) {
    console.log('    (yo\'q — iyun darslari oyligi hali run qilinmagan / to\'lanmagan)');
  } else {
    const net = payments.reduce((s, p) => s + p.amount, 0);
    for (const p of payments) {
      console.log(
        `    ${p.id.slice(0, 8)}  net=${som(p.amount)}  status=${p.status}  paidAt=${p.paidAt ? p.paidAt.toISOString().slice(0, 10) : '—'}`,
      );
    }
    console.log(`    NET jami                 : ${som(net)}`);
    console.log(`    Settled avans (bu run)   : ${som(settledAdv._sum.amount ?? 0)}`);
    console.log(`    NET + settled avans      : ${som(net + (settledAdv._sum.amount ?? 0))}  (≈ GROSS bo'lishi kerak)`);
  }

  section('Tushuntirish');
  console.log('  • GROSS (72 mln) = ustozlarning shu oy darslaridagi % ulushi — TOPGAN puli.');
  console.log('  • AVANS oylikning bir qismini OLDINDAN berish, ALOHIDA xarajat EMAS.');
  console.log('    SalaryPayment.net = GROSS − settled avans. Ya\'ni avans netdan ayriladi,');
  console.log('    lekin GROSS (ustoz xarajati) o\'zgarmaydi. Foyda cardida ustoz xarajati = GROSS.');
  console.log('  • "60 mln berilgan" ≈ naqd chiqqan (avans + net run) — bu CASH oqimi;');
  console.log('    GROSS esa shu oyda ISHLAB TOPILGAN. Farq — vaqt (qachon berilgani), miqdor emas.');
  console.log('  • Sizning mantiq: 400k to\'lov → ustoz %, qolgani markazniki.');
  console.log('    Foyda = darsTushum − GROSS(ustoz %) − xarajat. Aynan shunday hisoblanadi.\n');
}

run(main);
