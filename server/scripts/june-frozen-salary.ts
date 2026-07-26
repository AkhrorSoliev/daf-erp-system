/**
 * IYUN USTOZ OYLIGI — MUZLAGAN (01.06–30.06) — READ-ONLY.
 *
 * "01.06 dan 30.06 gacha bo'lgan darslar uchun, IYUN ICHIDA to'lagan
 *  o'quvchilardan kelib chiqqan ustoz oyligi."
 *
 * Filtr:  lessonDate ∈ [01.06, 30.06]  AND  accrual createdAt < 01.07 (Tashkent)
 *         → ya'ni iyun darsi, iyun ichida to'langan (kech to'lovlar CHIQARILGAN).
 * Kech to'lovlar (createdAt ≥ 01.07) → iyul oyligiga (alohida ko'rsatiladi).
 *
 * Har ustoz: Oylik (gross % ulush) · Avans (iyunda berilgan) · Oy oxirida (gross − avans).
 *
 * Usage:  railway run npx ts-node scripts/june-frozen-salary.ts   # PROD
 * Hech narsa yozmaydi.
 */
import { PrismaClient } from '@prisma/client';
import { som, dbEnvLabel, printHeader, section, run } from './lib/check-cli';

const COMPANY_ID = 1001;
const OFFSET = 5 * 60 * 60 * 1000;

const JUNE = { gte: new Date(Date.UTC(2026, 5, 1)), lt: new Date(Date.UTC(2026, 6, 1)) }; // @db.Date
const JULY1_TS = new Date(Date.UTC(2026, 6, 1) - OFFSET); // Tashkent 01.07 00:00

async function main(prisma: PrismaClient) {
  printHeader('IYUN USTOZ OYLIGI — MUZLAGAN (01.06–30.06, iyun ichida to\'langan)');
  console.log(`  Baza: ${dbEnvLabel()}`);

  // Iyun-dars accruallari (reversedAt null)
  const accruals = await prisma.salaryAccrual.findMany({
    where: { companyId: COMPANY_ID, reversedAt: null, lessonDate: { gte: JUNE.gte, lt: JUNE.lt } },
    select: { userId: true, amount: true, createdAt: true },
  });

  type Row = { userId: number; onTime: number; late: number; units: number; advance: number };
  const rows = new Map<number, Row>();
  const get = (id: number): Row => {
    let r = rows.get(id);
    if (!r) { r = { userId: id, onTime: 0, late: 0, units: 0, advance: 0 }; rows.set(id, r); }
    return r;
  };
  for (const a of accruals) {
    const r = get(a.userId);
    if (a.createdAt < JULY1_TS) { r.onTime += a.amount; r.units += 1; }
    else r.late += a.amount;
  }

  // Avans — iyunda berilgan (Expense TEACHER_ADVANCE, date ∈ iyun)
  const advances = await prisma.expense.findMany({
    where: { companyId: COMPANY_ID, deletedAt: null, category: 'TEACHER_ADVANCE', date: { gte: JUNE.gte, lt: JUNE.lt } },
    select: { relatedUserId: true, amount: true },
  });
  for (const e of advances) if (e.relatedUserId) get(e.relatedUserId).advance += e.amount;

  const users = await prisma.user.findMany({
    where: { id: { in: [...rows.keys()] } },
    select: { id: true, firstName: true, lastName: true },
  });
  const nameMap = new Map(users.map((u) => [u.id, `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || `#${u.id}`]));

  const list = [...rows.values()].sort((a, b) => b.onTime - a.onTime);

  section('Per-ustoz (iyun oyligi)');
  console.log(
    '  ' + 'Ustoz'.padEnd(26) + 'Oylik(jami)'.padStart(14) + 'Avans'.padStart(13) + 'Oy oxirida'.padStart(14),
  );
  console.log('  ' + '─'.repeat(67));
  let gT = 0, aT = 0, nT = 0, lT = 0;
  for (const r of list) {
    const gross = r.onTime;
    const net = gross - r.advance;
    gT += gross; aT += r.advance; nT += net; lT += r.late;
    console.log(
      '  ' + (nameMap.get(r.userId) ?? `#${r.userId}`).padEnd(26) +
      som(gross).padStart(14) + som(r.advance).padStart(13) + som(net).padStart(14),
    );
  }
  console.log('  ' + '─'.repeat(67));
  console.log(
    '  ' + 'JAMI'.padEnd(26) + som(gT).padStart(14) + som(aT).padStart(13) + som(nT).padStart(14),
  );

  section('Iyun oyligi — 3 summa (muzlagan)');
  console.log(`  1) Oylik summasi (jami % ulush)          : ${som(gT)}`);
  console.log(`  2) Avans (iyunda berilgan)               : ${som(aT)}`);
  console.log(`  3) Oy oxirida beriladigan (avans ayrilgan): ${som(nT)}`);

  section('Kech to\'lovlar (iyun darsi, IYULDA to\'langan) → iyul oyligiga');
  console.log(`  Kech qism (createdAt ≥ 01.07)            : ${som(lT)}`);
  console.log(`  → Bu iyun oyligiga QO'SHILMAYDI, iyulga o'tadi.`);
  console.log(`  Ma'lumot: iyun + kech = ${som(gT + lT)} (bu MENING oldingi 72,3 mln'im edi — noto'g'ri).\n`);
}

run(main);
