import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  // (a) student 10406 — Suhrob Sirojiddinov — all May-Jun payments
  const s = await prisma.student.findUnique({ where: { id: 10406 }, select: { id: true, firstName: true, lastName: true, balance: true, status: true } });
  const p10406 = await prisma.payment.findMany({
    where: { studentId: 10406, createdAt: { gte: new Date('2026-05-01'), lt: new Date('2026-07-01') } },
    select: { amount: true, method: true, source: true, status: true, externalId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  console.log('=== Student 10406 ===', s);
  for (const p of p10406) console.log(`  ${p.createdAt.toISOString().slice(0,16)} | ${String(p.amount).padStart(8)} | ${p.method}/${p.source}/${p.status} ext=${p.externalId ?? '-'}`);

  // (b) unique missing amounts — search ANY method, ANY status, incl REVERSED
  const uniq = [5265845, 2000000, 688000, 665000];
  for (const amt of uniq) {
    const rows = await prisma.payment.findMany({
      where: { amount: amt, createdAt: { gte: new Date('2026-04-15'), lt: new Date('2026-07-15') } },
      select: { studentId: true, amount: true, method: true, source: true, status: true, createdAt: true },
    });
    console.log(`\n=== amount ${amt.toLocaleString()} (any method/status) → ${rows.length} row(s) ===`);
    for (const r of rows) console.log(`  ${r.createdAt.toISOString().slice(0,16)} | st${r.studentId} | ${r.method}/${r.source}/${r.status}`);
  }

  // (c) 400k May CLICK — list all ERP CLICK 400k in May with dates (to see which file dates uncovered)
  const c400 = await prisma.payment.findMany({
    where: { amount: 400000, method: 'CLICK', createdAt: { gte: new Date('2026-05-01'), lt: new Date('2026-06-01') } },
    select: { studentId: true, source: true, status: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`\n=== ERP CLICK 400,000 in MAY: ${c400.length} row(s) ===`);
  for (const r of c400) console.log(`  ${r.createdAt.toISOString().slice(0,16)} | st${r.studentId} | ${r.source}/${r.status}`);

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
