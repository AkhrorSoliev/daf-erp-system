/**
 * IYUN OYLIGI RECONCILIATION — DRY-RUN (HECH NARSA YOZMAYDI).
 *
 * Fakt: har ustozga jadvaldagi GROSS ("O'quvchilar to'lagani") berildi
 *   = avans + to'lanadigan. Jami 66 704 430.  Manba: rasm (getMonthly snapshot).
 *
 * Maqsad: iyulda double-pay bo'lmasligi uchun rejani ko'rsatish —
 *   • qaysi accruallar "to'langan" deb belgilanadi (June PAID paymentga bog'lanadi)
 *   • qaysi qoldiq HAQIQATAN to'lanmagan → IYULga o'tadi
 *
 * Mantiq (har ustoz):
 *   earned  = Σ iyun-dars accrual (lessonDate ∈ iyun, reversedAt null) — HOZIRGI
 *   linked  = shundan salaryPaymentId bor (run)
 *   paid    = jadvaldagi gross (ustoz haqiqatan oldi)
 *   markPaidFromUnlinked = max(0, paid − linked)  ← bog'lanmaganlardan to'langani (eng eski)
 *   toJuly  = earned − paid                        ← haqiqatan to'lanmagan qoldiq
 *
 * Usage:  railway run npx ts-node scripts/reconcile-june-salary-dryrun.ts
 */
import { PrismaClient } from '@prisma/client';
import { som, dbEnvLabel, printHeader, section, run } from './lib/check-cli';

const COMPANY_ID = 1001;
const JUNE = { gte: new Date(Date.UTC(2026, 5, 1)), lt: new Date(Date.UTC(2026, 6, 1)) };

// Jadvaldagi GROSS ("O'quvchilar to'lagani") = har ustoz haqiqatan olgan summa
const PAID_GROSS: Record<number, number> = {
  10010: 25_200_500, // Jamsher
  10008: 7_916_825,  // Eldor
  10007: 6_900_138,  // Ibrohimjon
  10006: 6_466_796,  // Sohibaxon
  10003: 6_400_128,  // Saidaxon
  10005: 6_366_794,  // Gulnozaxon
  10014: 3_519_912,  // Islomiddin
  10002: 2_266_712,  // Hojiali
  10473: 1_599_960,  // Malikaxon
  10505: 66_665,     // Muzzammila
};

async function main(prisma: PrismaClient) {
  printHeader('IYUN OYLIGI RECONCILIATION — DRY-RUN (yozmaydi)');
  console.log(`  Baza: ${dbEnvLabel()}`);
  const paidTotalExpected = Object.values(PAID_GROSS).reduce((a, b) => a + b, 0);
  console.log(`  Jadval bo'yicha berilgan (gross): ${som(paidTotalExpected)}`);

  const accruals = await prisma.salaryAccrual.findMany({
    where: { companyId: COMPANY_ID, reversedAt: null, lessonDate: { gte: JUNE.gte, lt: JUNE.lt } },
    select: { id: true, userId: true, amount: true, createdAt: true, salaryPaymentId: true, creditPeriodDate: true },
    orderBy: { createdAt: 'asc' },
  });

  const byTeacher = new Map<number, typeof accruals>();
  for (const a of accruals) {
    const arr = byTeacher.get(a.userId) ?? [];
    arr.push(a);
    byTeacher.set(a.userId, arr);
  }

  const users = await prisma.user.findMany({
    where: { id: { in: [...byTeacher.keys()] } },
    select: { id: true, firstName: true, lastName: true },
  });
  const nameMap = new Map(users.map((u) => [u.id, `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || `#${u.id}`]));

  section('Reja — har ustoz');
  console.log(
    '  ' + 'Ustoz'.padEnd(24) + 'Earned'.padStart(13) + 'Linked'.padStart(13) +
    'Paid(jadv)'.padStart(13) + '→IYUL'.padStart(13),
  );
  console.log('  ' + '─'.repeat(76));

  let tEarned = 0, tLinked = 0, tPaid = 0, tJuly = 0, tMarkUnlinked = 0, tFlag = 0;
  const plan: { userId: number; markPaidIds: string[]; toJulyIds: string[] }[] = [];

  for (const [userId, arr] of byTeacher) {
    const earned = arr.reduce((s, a) => s + a.amount, 0);
    const linked = arr.filter((a) => a.salaryPaymentId != null).reduce((s, a) => s + a.amount, 0);
    const paid = PAID_GROSS[userId] ?? 0;
    const unlinked = arr.filter((a) => a.salaryPaymentId == null); // oldest-first (query order)

    // Bog'lanmaganlardan qanchasi to'langan (eng eskidan)
    let need = Math.max(0, paid - linked);
    const markPaidIds: string[] = [];
    const toJulyIds: string[] = [];
    for (const a of unlinked) {
      if (need >= a.amount) { markPaidIds.push(a.id); need -= a.amount; }
      else toJulyIds.push(a.id);
    }
    const markUnlinkedSum = unlinked
      .filter((a) => markPaidIds.includes(a.id))
      .reduce((s, a) => s + a.amount, 0);
    const toJuly = unlinked
      .filter((a) => toJulyIds.includes(a.id))
      .reduce((s, a) => s + a.amount, 0);

    const flag = paid > earned ? '  ⚠️ paid>earned' : linked > paid ? '  ⚠️ linked>paid' : '';
    if (flag) tFlag += 1;

    tEarned += earned; tLinked += linked; tPaid += paid; tJuly += toJuly; tMarkUnlinked += markUnlinkedSum;
    plan.push({ userId, markPaidIds, toJulyIds });

    console.log(
      '  ' + (nameMap.get(userId) ?? `#${userId}`).padEnd(24) +
      som(earned).padStart(13) + som(linked).padStart(13) +
      som(paid).padStart(13) + som(toJuly).padStart(13) + flag,
    );
  }
  console.log('  ' + '─'.repeat(76));
  console.log(
    '  ' + 'JAMI'.padEnd(24) + som(tEarned).padStart(13) + som(tLinked).padStart(13) +
    som(tPaid).padStart(13) + som(tJuly).padStart(13),
  );

  section('Reja — jami');
  console.log(`  Ustozlar EARNED (hozir, iyun darslari) : ${som(tEarned)}`);
  console.log(`  Ustozlar OLDI (jadval bo'yicha)        : ${som(tPaid)}`);
  console.log(`  → IYULga o'tadigan qoldiq (to'lanmagan): ${som(tJuly)}`);
  console.log('');
  console.log(`  Tizimda RASMAN belgilanadi:`);
  console.log(`   • ${som(tLinked)} linked accrual → June SalaryPayment PAID qilinadi`);
  console.log(`   • ${som(tMarkUnlinked)} bog'lanmagan accrual → June PAID paymentga bog'lanadi (to'langan)`);
  console.log(`   • ${som(tJuly)} bog'lanmagan accrual → IYULga qoldiriladi (creditPeriodDate=iyul)`);
  if (tFlag) console.log(`   ⚠️ ${tFlag} ustozda paid/linked/earned nomuvofiqligi — qo'lda ko'rib chiqish kerak`);

  section('Tekshiruv');
  console.log(`  linked + markUnlinked = ${som(tLinked + tMarkUnlinked)}  (≈ paid ${som(tPaid)} bo'lishi kerak)`);
  console.log(`  paid + toJuly         = ${som(tPaid + tJuly)}  (≈ earned ${som(tEarned)} bo'lishi kerak)`);
  console.log('');
  console.log('  Bu DRY-RUN — hech narsa o\'zgartirilmadi. Tasdiqласангиз, mutatsiya skriptini yozaman.\n');
}

run(main);
