/**
 * verify-center-topup-tab — READ-ONLY.
 *
 * Runs the REAL SalaryCenterTopUpService against production and prints what
 * the /payments/debt?tab=markaz table will now render. DebtAgeService is
 * stubbed (it only feeds the per-month debt breakdown, which the table no
 * longer shows) so the script does not need Redis.
 */
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { DebtAgeService } from '../src/common/finance/debt-age.service';
import { RedisService } from '../src/redis/redis.service';
import { SalaryCenterTopUpService } from '../src/salary/salary-center-topup.service';

@Module({
  imports: [PrismaModule],
  providers: [
    SalaryCenterTopUpService,
    DebtAgeService,
    // Real debt-age replay, cache permanently cold: Redis lives inside
    // Railway's network and is unreachable from a laptop. The service treats
    // the cache as an optimisation, so a miss just costs a full replay.
    {
      provide: RedisService,
      useValue: { get: async () => null, setex: async () => undefined },
    },
  ],
})
class VerifyModule {}

const f = (n: number) => Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ');

(async () => {
  const app = await NestFactory.createApplicationContext(VerifyModule, { logger: ['error'] });
  const prisma = app.get(PrismaService);
  const svc = app.get(SalaryCenterTopUpService);

  const ceo = await prisma.user.findFirst({
    where: { roles: { some: { role: { name: 'CEO' } } } },
    select: { id: true, companyId: true },
  });
  if (!ceo) { console.log('CEO topilmadi'); await app.close(); return; }

  const res = await svc.getStudents({ allMonths: true } as any, ceo.companyId, ceo.id);

  console.log('══════ /payments/debt?tab=markaz — JADVAL ══════\n');
  console.log("#id     o'quvchi                   darslar   Markaz hali olmagan   Jami qarzi   qarz oylari");
  console.log('──────  ─────────────────────────  ───────   ───────────────────   ──────────   ───────────');
  for (const r of res.data.slice(0, 12))
    console.log([String(r.student.id).padEnd(6), `${r.student.firstName} ${r.student.lastName}`.slice(0,25).padEnd(25),
      String(r.lessons).padStart(7), f(r.centerUnrecovered).padStart(21), f(r.studentDebt).padStart(12),
      '   ' + (r.debtByMonth.length ? r.debtByMonth.map((m:any)=>m.monthKey.slice(5)).join(',') : '—')].join('  '));
  const over = res.data.filter((r) => r.centerUnrecovered > r.studentDebt);
  console.log(`\n⚠ markazniki jami qarzdan KATTA bo'lgan qatorlar: ${over.length}`);
  for (const r of over.slice(0, 8))
    console.log(`   #${r.student.id} ${`${r.student.firstName} ${r.student.lastName}`.slice(0,24).padEnd(24)} markaz ${f(r.centerUnrecovered).padStart(9)} > qarz ${f(r.studentDebt).padStart(9)}`);
  const multi = res.data.filter((r) => r.debtByMonth.length > 1);
  console.log(`\nqarzi bir necha oyga tegishli o'quvchilar: ${multi.length} / ${res.data.length}`);
  if (res.data.length > 12) console.log(`  … yana ${res.data.length - 12} qator`);

  const last = res.data[res.data.length - 1];
  if (last) console.log(`\noxirgi qator: #${last.student.id} ${last.student.firstName} ${last.student.lastName} → ${f(last.centerUnrecovered)}`);

  const ab = res.data.find((r) => r.student.id === 10593);
  console.log(`\n#10593 Abdulloh: ${ab ? `ro'yxatda, markaz hali olmagan = ${f(ab.centerUnrecovered)} (chiqargani ${f(ab.centerPaid)})` : "ro'yxatda YO'Q"}`);

  console.log('\n── JAMI ──');
  console.log(`  ro'yxatdagi o'quvchilar   : ${res.data.length}`);
  console.log(`  markaz chiqargani (karta) : ${f(res.totals.centerPaid)}   ← oylik kartasi bilan teng bo'lishi kerak`);
  console.log(`  hali qaytmagani           : ${f(res.totals.centerUnrecovered)}`);
  console.log(`  farqi (qaytib bo'lgan)    : ${f(res.totals.centerPaid - res.totals.centerUnrecovered)}`);
  await app.close();
})();
