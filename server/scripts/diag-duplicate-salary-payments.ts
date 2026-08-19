/**
 * diag-duplicate-salary-payments — READ-ONLY. Bir payroll davri uchun bir
 * ustozga NECHTA SalaryPayment yozilganini to'liq timestamp bilan ko'rsatadi.
 * (audit-boundary-probe 2026-05-31 davrida ikkita to'lov topgan edi.)
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const fmt = (n: number) => Math.round(n).toLocaleString('ru-RU');
const iso = (d: Date | null | undefined) =>
  d ? d.toISOString().replace('.000Z', 'Z') : '—';

async function main() {
  const payments = await prisma.salaryPayment.findMany({
    select: {
      id: true,
      userId: true,
      periodStart: true,
      periodEnd: true,
      amount: true,
      status: true,
      createdAt: true,
      user: { select: { firstName: true, lastName: true } },
    },
    orderBy: [{ periodStart: 'asc' }, { userId: 'asc' }, { createdAt: 'asc' }],
  });

  const groups = new Map<string, typeof payments>();
  for (const p of payments) {
    const k = `${p.userId}::${iso(p.periodStart)}`;
    const l = groups.get(k);
    if (l) l.push(p);
    else groups.set(k, [p]);
  }

  console.log('══ BIR DAVRDA >1 SalaryPayment ════════════════════════════');
  let extraTotal = 0;
  let dupGroups = 0;
  for (const [k, list] of groups) {
    if (list.length < 2) continue;
    dupGroups++;
    const name = `${list[0].user?.firstName ?? ''} ${list[0].user?.lastName ?? ''}`.trim();
    console.log(`\n  ${k}  — ${name}`);
    console.log(
      `    davr: ${iso(list[0].periodStart)} … ${iso(list[0].periodEnd)}`,
    );
    list.forEach((p, i) => {
      console.log(
        `    #${p.id}  ${fmt(p.amount).padStart(12)} so'm  ${p.status.padEnd(11)} yaratilgan ${iso(p.createdAt)}${i > 0 ? '   <-- QO\'SHIMCHA' : ''}`,
      );
      if (i > 0) extraTotal += p.amount;
    });
  }
  console.log('');
  console.log(`  Dublikatli (ustoz×davr) juftlik: ${dupGroups} ta`);
  console.log(`  Qo'shimcha to'lovlar jami:       ${fmt(extraTotal)} so'm`);

  // Har bir davrda cron necha marta yozgan — createdAt kunlari bo'yicha
  console.log('');
  console.log('══ DAVRLAR va CRON YURGAN KUNLAR ══════════════════════════');
  const byPeriod = new Map<string, Map<string, number>>();
  for (const p of payments) {
    const pk = iso(p.periodStart);
    const day = p.createdAt.toISOString().slice(0, 10);
    let inner = byPeriod.get(pk);
    if (!inner) {
      inner = new Map();
      byPeriod.set(pk, inner);
    }
    inner.set(day, (inner.get(day) ?? 0) + 1);
  }
  for (const [pk, days] of byPeriod) {
    const parts = Array.from(days.entries())
      .sort()
      .map(([d, c]) => `${d}: ${c} ta`);
    console.log(`  davr ${pk}  →  ${parts.join('   |   ')}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
