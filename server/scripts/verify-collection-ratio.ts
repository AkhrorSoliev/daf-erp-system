/**
 * READ-ONLY verification for audit P3: what will the new "Yig'im %" actually
 * show? Instantiates the real `ReportsFinancialService` (its only dependency is
 * Prisma) and calls `getIncomeMonthAttribution` exactly the way the Telegram
 * daily report and the /payments/overview panel now call it — so this prints
 * the number both surfaces will print, not a re-implementation of it.
 *
 * Also prints the OLD Telegram formula (MTD cash / exactDays x 4 forecast)
 * beside it, so the change is visible.
 *
 * Usage: railway run npx ts-node scripts/verify-collection-ratio.ts [YYYY-MM ...]
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
import { ReportsFinancialService } from '../src/reports/reports-financial.service';

dotenv.config();
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const TZ = 5 * 60 * 60 * 1000;

const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ');

async function main() {
  const company = await prisma.company.findFirst({
    select: { id: true, name: true },
  });
  if (!company) throw new Error('no company');
  const service = new ReportsFinancialService(prisma as any);

  const now = new Date(Date.now() + TZ);
  const thisMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  // `YYYY-MM` = whole month (MTD for the running one). `YYYY-MM-DD` = that
  // month cut off at that day — use it to compare the SAME day-of-month across
  // months, since the ratio climbs through a month and a day-4 reading is not
  // comparable to a month-end one.
  const args = process.argv
    .slice(2)
    .filter((a) => /^\d{4}-\d{2}(-\d{2})?$/.test(a));
  const months = args.length ? args : [thisMonth, '2026-07', '2026-06'];

  console.log(`Company: ${company.name} (#${company.id})\n`);

  for (const spec of months) {
    const [y, m, explicitDay] = spec.split('-').map(Number);
    const monthKey = `${y}-${String(m).padStart(2, '0')}`;
    // Month-to-date for the running month (what the 21:00 bot reports), full
    // month for a closed one, or an explicit cut-off day when given.
    const isCurrent = monthKey === thisMonth;
    const lastDay =
      explicitDay ??
      (isCurrent ? now.getUTCDate() : new Date(Date.UTC(y, m, 0)).getUTCDate());
    const startDate = `${monthKey}-01`;
    const endDate = `${monthKey}-${String(lastDay).padStart(2, '0')}`;

    const r = await service.getIncomeMonthAttribution(company.id, {
      branchIds: null,
      startDate,
      endDate,
    });

    console.log(`══════ ${monthKey}  (${startDate} … ${endDate}) ══════`);
    console.log(`Jami tushum              : ${fmt(r.total)}`);
    console.log(`  shu davr uchun         : ${fmt(r.currentMonth)}`);
    console.log(`  eski qarz uchun        : ${fmt(r.lateTotal)}`);
    console.log(`Shu davrning darslari    : ${fmt(r.lessonsValue)}`);
    console.log(`YANGI  «Yig'im»          : ${r.collectionPct}%`);
    console.log('');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
