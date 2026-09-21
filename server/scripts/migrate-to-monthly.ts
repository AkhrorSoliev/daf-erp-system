/**
 * migrate-to-monthly — Oylik to'lovga o'tish MIGRATSIYASI.
 *
 * `--dry-run` (standart, majburiy birinchi): STRICTLY READ-ONLY. Bazadan
 * hozirgi (LESSON_PACK) holatni o'qiydi, sentabr oyi uchun "agar MONTHLY'ga
 * o'tilsa nima o'zgaradi" degan rejani hisoblab, konsolga sarhisob + guruh
 * kesimi chiqaradi va to'liq o'quvchi ro'yxatini CSV'ga yozadi. HECH QANDAY
 * `create`/`update`/`delete`/`upsert`/`$executeRaw` ishlatilmaydi.
 *
 * `--apply --ha-men-tasdiqlayman --zaxira-olindi`: migratsiyani haqiqatda
 * qo'llaydi. Uchala bayroq ham kerak, va ustiga `docs/migration-preview-
 * <bugun>*.csv` (CEO ko'rib chiqqan bashorat) MAVJUD bo'lishi shart.
 *
 * QAMROV yozilishning O'Z holatidan: "shu davr uchun `EnrollmentMonthlyCharge`
 * yo'q" (kurs darajasidagi `paymentModel` bayrog'idan EMAS — pastdagi
 * `scopeWhere` izohiga qarang). Shuning uchun qayta ishga tushirish
 * bajarilganlarni takrorlamaydi VA bajarilmaganlarni o'tkazib yubormaydi.
 *
 * Qo'llagandan keyin ALBATTA:
 *   npx ts-node scripts/verify-monthly-migration.ts --period=2026-09
 *
 * Arifmetika `scripts/lib/monthly-migration-report.ts` (buildMigrationPlan)
 * dan keladi — bu skript faqat MigrationRow[] ni bazadan yig'adi. Dars
 * kunlari va bayramlar `MonthlyChargeService.resolveExcludedDates` orqali —
 * bu YAGONA manba, ikkinchi nusxasi yozilmaydi (Task 6 buzilgan sabab shu
 * edi).
 *
 * Usage:
 *   cd server && npx ts-node scripts/migrate-to-monthly.ts --dry-run [--period=2026-09]
 *     — DEV bazaga (server/.env) ulanadi.
 *   cd server && railway run npx ts-node scripts/migrate-to-monthly.ts --dry-run --period=2026-09
 *     — PROD bazaga ulanadi (Railway DATABASE_URL'ni in'ektsiya qiladi).
 *
 * Muhit konsol sarlavhasida aniq ko'rsatiladi (`printHeader` → dbEnvLabel) —
 * DEV raqamlarini PROD deb adashtirmaslik uchun.
 */
import {
  EnrollmentStatus,
  GroupStatus,
  MonthlyChargeStatus,
  PaymentModel,
  Prisma,
  PrismaClient,
  TransactionType,
} from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import {
  dbEnvLabel,
  printHeader,
  printTable,
  run,
  section,
  som,
} from './lib/check-cli';
import {
  tashkentDateStr,
  tashkentDayRangeUtc,
} from '../src/attendance/shared/date-utils';
import { baseLessonPrice } from '../src/billing/lesson-price';
import { MonthlyChargeService } from '../src/billing/monthly-charge.service';
import {
  applyDiscount,
  clampDiscount,
  perLessonCostForMonth,
  proratedMonthlyAmount,
} from '../src/billing/monthly-price';
import { lessonDatesInMonth } from '../src/billing/planned-lessons';
import {
  perLessonAccrual,
  RateVersion,
} from '../src/salary/shared/deserved-math';
import {
  buildMigrationPlan,
  MigrationRow,
  renderStudentCsv,
  renderSummary,
  scopeResidueVerdict,
} from './lib/monthly-migration-report';
import {
  resolvePackPerLessonCost,
  resolvePrepaidRefundTotal,
  type PrepaidRefundBatch,
} from './lib/prepaid-refund-price';
import {
  flipCoursesToMonthly,
  flipDefaultModelSettingToMonthly,
} from './lib/monthly-course-flip';
import {
  applyMigrationForStudent,
  type ApplyMigrationDeps,
  type ApplyStudentResult,
  type EnrollmentToMigrate,
} from './lib/monthly-migration-apply';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { CashMovementsService } from '../src/cash-accounts/cash-movements.service';
import { TransactionsWriteService } from '../src/transactions/transactions-write.service';
import { TransactionsReadService } from '../src/transactions/transactions-read.service';
import { TransactionsService } from '../src/transactions/transactions.service';
import { SalaryAccrualService } from '../src/salary/salary-accrual.service';
import { EnrollmentBillingService } from '../src/billing/enrollment-billing.service';

/**
 * `--apply` uchun eng kichik DI grafigi. To'liq `AppModule` ko'tarilmaydi:
 * u Redis, Telegram va cron'larni ham yoqadi — migratsiya skriptida ular
 * na kerak, na xavfsiz.
 */
@Module({
  imports: [PrismaModule],
  providers: [
    CashMovementsService,
    TransactionsWriteService,
    TransactionsReadService,
    TransactionsService,
    SalaryAccrualService,
    EnrollmentBillingService,
    MonthlyChargeService,
  ],
})
class MigrationModule {}

interface CliArgs {
  apply: boolean;
  /** Faqat birinchi N o'quvchini migratsiya qiladi. Prodda bosqichma-bosqich
   * chiqish uchun: avval `--limit=5`, natijani tekshirasiz, keyin limitsiz
   * qayta ishga tushirasiz — bajarilganlar takrorlanmaydi. */
  limit: number | null;
  /** `--apply` yolg'iz yetarli emas: xato bosilgan bayroq 370 o'quvchining
   * balansini qayta yozmasligi uchun ikkinchi, ataylab uzun tasdiq kerak. */
  confirmed: boolean;
  /** Brief 2-qadam: `pg_dump` olinganini alohida tasdiqlash. */
  backedUp: boolean;
  period: string;
}

function parseCliArgs(): CliArgs {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const confirmed = argv.includes('--ha-men-tasdiqlayman');
  const backedUp = argv.includes('--zaxira-olindi');
  const limitTok = argv.find((a) => a.startsWith('--limit='));
  const limit = limitTok ? Number(limitTok.split('=')[1]) : null;
  if (limit !== null && (!Number.isInteger(limit) || limit <= 0)) {
    throw new Error(`--limit musbat butun son bo'lishi kerak: "${limitTok}"`);
  }
  const periodTok = argv.find((a) => a.startsWith('--period='));
  const period = periodTok
    ? periodTok.split('=')[1]
    : tashkentDateStr(new Date()).slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(period)) {
    throw new Error(
      `--period noto'g'ri format: "${period}" (kutilgan YYYY-MM, masalan 2026-09)`,
    );
  }
  return { apply, confirmed, backedUp, limit, period };
}

interface GroupSummaryRow {
  groupName: string;
  courseName: string;
  studentCount: number;
  plannedLessons: number;
  oldPerLesson: number;
  newPerLesson: number;
  expectedIncome: number;
  teacherPayDelta: number;
}

/** Repo ildizidagi `docs/` — server/ ichida emas. */
function docsDir(): string {
  return path.join(__dirname, '..', '..', 'docs');
}

/** `HHmmss` (Toshkent) — bir kunda ikkinchi ishga tushirish birinchisining
 * dalilini bosib ketmasligi uchun (M3). */
function tashkentClockStamp(): string {
  const d = new Date(Date.now() + 5 * 60 * 60 * 1000);
  return d.toISOString().slice(11, 19).replace(/:/g, '');
}

/**
 * `docs/migration-preview-<sana>.csv` — bir kunda birinchi ishga tushirish.
 * Fayl allaqachon bo'lsa YANGISI vaqt bilan yoziladi
 * (`migration-preview-<sana>-<HHmmss>.csv`) — CEO ko'rib chiqqan hisobot
 * ustiga yozilmasligi kerak (M3).
 */
function nextPreviewPath(): string {
  const today = tashkentDateStr(new Date());
  const base = path.join(docsDir(), `migration-preview-${today}.csv`);
  if (!fs.existsSync(base)) return base;
  return path.join(
    docsDir(),
    `migration-preview-${today}-${tashkentClockStamp()}.csv`,
  );
}

/**
 * Shu kunga tegishli barcha bashorat CSV'lari, ENG YANGISI OXIRIDA.
 *
 * Saralash `mtime` bo'yicha, nom bo'yicha EMAS: `migration-preview-<sana>-
 * <HHmmss>.csv` leksikografik tartibda `migration-preview-<sana>.csv` dan
 * OLDIN turadi, ya'ni nom bo'yicha saralash kunning ENG ESKI faylini
 * "eng yangisi" deb ko'rsatardi.
 */
function existingPreviewFiles(): string[] {
  const today = tashkentDateStr(new Date());
  const dir = docsDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(
      (f) => f.startsWith(`migration-preview-${today}`) && f.endsWith('.csv'),
    )
    .map((f) => path.join(dir, f))
    .sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs);
}

/** Qo'llash natijasi CSV'si — bashorat CSV'si bilan qator-qator solishtirish
 * uchun ayni ustunlar tartibida. */
function renderOutcomeCsv(rows: ApplyStudentResult[]): string {
  const head = [
    'studentId',
    'oldBalance',
    'prepaidRefund',
    'reversedSeptember',
    'monthlyCharge',
    'newBalance',
    'reversedDeductionCount',
    'accrualsRecomputed',
    'chargesCreated',
    'chargesSkipped',
  ].join(',');
  const body = rows
    .map((r) =>
      [
        r.studentId,
        r.oldBalance,
        r.prepaidRefund,
        r.reversedSeptember,
        r.monthlyCharge,
        r.newBalance,
        r.reversedDeductionCount,
        r.accrualsRecomputed,
        r.chargesCreated,
        r.chargesSkipped,
      ].join(','),
    )
    .join('\n');
  return `${head}\n${body}\n`;
}

interface RunApplyParams {
  prisma: PrismaClient;
  plan: ReturnType<typeof buildMigrationPlan>;
  migrateByStudent: Map<
    number,
    { companyId: number; enrollments: EnrollmentToMigrate[] }
  >;
  /** Qamrovni QAYTA hisoblaydigan funksiya — migratsiyadan keyin nechta
   * yozilish hali qamrovda qolganini bazadan mustaqil o'qish uchun (C1). */
  countInScope: () => Promise<number>;
  year: number;
  month: number;
  period: string;
  limit: number | null;
}

/**
 * Migratsiyani HAQIQATDA qo'llaydi.
 *
 * Har o'quvchi — o'zining alohida Serializable tranzaksiyasida. Bittasi
 * yiqilsa qolgan 369 tasi davom etadi; xatolar oxirida ro'yxat bilan
 * chiqariladi va chiqish kodi 1 bo'ladi, shunda "jimgina yarim bajarildi"
 * degan holat bo'lmaydi.
 *
 * Qayta ishga tushirish xavfsiz: `applyMigrationForStudent` ning har qadami
 * idempotent, `@@unique([enrollmentId, periodYear, periodMonth])` esa
 * ikki marta hisoblashning oxirgi to'sig'i.
 */
async function runApply(params: RunApplyParams): Promise<void> {
  const { prisma, plan, migrateByStudent, year, month, period, limit } = params;

  const targets =
    limit === null
      ? [...migrateByStudent.entries()]
      : [...migrateByStudent.entries()].slice(0, limit);

  section(`MIGRATSIYA QO'LLANMOQDA — davr ${period} — ${dbEnvLabel()}`);

  // ── C1: "0 ta o'quvchi" JIM MUVAFFAQIYAT bo'lmasligi kerak ──────────────
  // Avvalgi versiyada qamrov kurs darajasidagi `paymentModel` bayrog'idan
  // kelardi, va 4-qadam o'sha bayroqni almashtirardi — bitta o'quvchi
  // migratsiya qilingani butun kursdoshlarini qamrovdan CHIQARIB YUBORARDI.
  // Keyingi ishga tushirish "enrollments=0" topib, "hech qanday xato yo'q"
  // deb chiqardi, holbuki yarmi ko'chmagan edi. Endi qamrov yozilishning
  // O'Z holatidan (shu davr uchun `EnrollmentMonthlyCharge` bormi) —
  // va bo'sh qamrov BALAND aytiladi.
  if (targets.length === 0) {
    section('QAMROV BO`SH');
    console.log(
      `Davr ${period} uchun migratsiya qilinadigan yozilish TOPILMADI.\n` +
        `Bu ikki narsadan biri:\n` +
        `  1) migratsiya allaqachon to'liq bajarilgan — buni\n` +
        `     \`npx ts-node scripts/verify-monthly-migration.ts --period=${period}\`\n` +
        `     bilan TASDIQLANG;\n` +
        `  2) qamrov so'rovi noto'g'ri filtrlayapti — bu holda hech narsa\n` +
        `     yozilmagani "muvaffaqiyat" emas.\n` +
        `Hech narsa yozilmadi.`,
    );
    throw new Error(
      `Qamrov bo'sh: ${period} uchun 0 ta o'quvchi. Tekshiruv skriptini ishga tushiring.`,
    );
  }

  console.log(
    `O'quvchi: ${targets.length} ta` +
      (limit === null ? '' : ` (jami ${migrateByStudent.size} tadan --limit)`) +
      '. Har biri alohida tranzaksiyada.',
  );
  console.log('');

  const app = await NestFactory.createApplicationContext(MigrationModule, {
    logger: ['error'],
  });
  const prismaService = app.get(PrismaService);
  const transactionsWrite = app.get(TransactionsWriteService);
  const enrollmentBilling = app.get(EnrollmentBillingService);
  const chargeService = app.get(MonthlyChargeService);
  const accrualService = app.get(SalaryAccrualService);

  const deps: ApplyMigrationDeps = {
    reverseTransaction: (originalId, p, tx) =>
      transactionsWrite.reverseTransaction(originalId, p, tx) as Promise<{
        amount: number;
      }>,
    refundPrepaidToBalance: (tx, p) =>
      enrollmentBilling.refundPrepaidToBalance(tx, p),
    createChargeForEnrollment: (tx, p) =>
      chargeService.createChargeForEnrollment(tx, p),
    reverseAccrualForAttendance: (p) =>
      accrualService.reverseAccrualForAttendance(p),
    createAccrual: (p) => accrualService.createAccrual(p),
  };

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const { gte: periodGte } = tashkentDayRangeUtc(`${period}-01`);
  const { lt: periodLt } = tashkentDayRangeUtc(
    `${period}-${String(daysInMonth).padStart(2, '0')}`,
  );

  const results: ApplyStudentResult[] = [];
  const failures: { studentId: number; message: string }[] = [];

  // C3: mustaqil ledger tekshiruvi uchun BAZA soatidan boshlanish nuqtasi
  // (Node soati emas — `Transaction.createdAt` bazada qo'yiladi).
  const [{ now: runStartedAt }] = await prismaService.$queryRaw<
    { now: Date }[]
  >`SELECT now() AS now`;

  const startedMs = Date.now();
  let processed = 0;
  for (const [studentId, bucket] of targets) {
    try {
      const res = await prismaService.$transaction(
        (tx) =>
          applyMigrationForStudent({
            tx,
            deps,
            studentId,
            companyId: bucket.companyId,
            periodYear: year,
            periodMonth: month,
            periodGte,
            periodLt,
            enrollments: bucket.enrollments,
          }),
        { isolationLevel: 'Serializable', timeout: 30_000, maxWait: 15_000 },
      );
      results.push(res);
    } catch (err) {
      failures.push({
        studentId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
    // M5: ~20 daqiqalik prod ishida jim qolmaslik.
    processed += 1;
    if (processed % 25 === 0 || processed === targets.length) {
      const secs = Math.round((Date.now() - startedMs) / 1000);
      const rate = processed / Math.max(1, secs);
      const etaSecs = Math.round(
        (targets.length - processed) / Math.max(rate, 0.001),
      );
      console.log(
        `  ${processed}/${targets.length} — ${secs}s o'tdi, ` +
          `taxminan ${etaSecs}s qoldi, yiqilgan: ${failures.length}`,
      );
    }
  }

  await app.close();

  // ── natija ────────────────────────────────────────────────────────────
  const totalPrepaid = results.reduce((a, r) => a + r.prepaidRefund, 0);
  const totalReversed = results.reduce((a, r) => a + r.reversedSeptember, 0);
  const totalCharged = results.reduce((a, r) => a + r.monthlyCharge, 0);
  const totalDelta = results.reduce(
    (a, r) => a + (r.newBalance - r.oldBalance),
    0,
  );
  const chargesCreated = results.reduce((a, r) => a + r.chargesCreated, 0);
  const chargesSkipped = results.reduce((a, r) => a + r.chargesSkipped, 0);

  const outPath = path.join(
    docsDir(),
    `migration-outcome-${tashkentDateStr(new Date())}-${tashkentClockStamp()}.csv`,
  );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, renderOutcomeCsv(results), 'utf-8');

  // ── C3: MUSTAQIL ledger tekshiruvi ────────────────────────────────────
  // `totalDelta === totalPrepaid + totalReversed - totalCharged` tekshiruvi
  // AYNIYAT edi: `applyMigrationForStudent` aynan shu tenglikni har o'quvchi
  // uchun tranzaksiya ichida talab qiladi, ya'ni `results`ga faqat uni
  // qanoatlantirganlar tushadi. Yig'indi hech qachon yiqila olmasdi — va
  // prepaid ikki barobar qaytarilganda ham "mos keldi" deb chiqarardi.
  //
  // Mustaqil manba: run boshlanganidan keyin O'SHA o'quvchilarga YOZILGAN
  // `Transaction.amount` qatorlarining yig'indisi. Balans harakati
  // ledger'ga langarlangan (ADR-0004), demak ikkovi teng bo'lishi SHART —
  // va bu tenglik boshqa jadvaldan o'qilgani uchun yiqila OLADI.
  const migratedIds = results.map((r) => r.studentId);
  const ledger = migratedIds.length
    ? await prisma.transaction.aggregate({
        _sum: { amount: true },
        where: {
          studentId: { in: migratedIds },
          createdAt: { gte: runStartedAt },
        },
      })
    : { _sum: { amount: 0 } };
  const ledgerDelta = ledger._sum.amount ?? 0;

  // Ikkinchi mustaqil manba: commit'dan KEYIN qayta o'qilgan balanslar.
  const liveBalances = migratedIds.length
    ? await prisma.student.findMany({
        where: { id: { in: migratedIds } },
        select: { id: true, balance: true },
      })
    : [];
  const liveById = new Map(liveBalances.map((s) => [s.id, s.balance]));
  const balanceDrift = results.filter(
    (r) => liveById.get(r.studentId) !== r.newBalance,
  );

  const remainingInScope = await params.countInScope();

  // ── Qamrov qoldig'i: KUTILGAN qism va KUTILMAGAN qism ─────────────────
  // Qamrovdan chiqishning yagona yo'li — shu davr uchun hisob yozilishi.
  // Ikki toifa buni hech qachon qila olmaydi va qamrovda QOLADI:
  //   - `chargesSkipped` — PAUSED guruh (ataylab hisobsiz, I2), yoki
  //     `createChargeForEnrollment` null qaytargan holat (oyda dars kuni
  //     yo'q / yozilish oy tugagach boshlangan);
  //   - yiqilgan o'quvchilarning BARCHA yozilishlari (tranzaksiya qaytdi).
  // Shu ikkisini hisobga olmasdan "qoldiq > 0 -> xato" deb qo'yish TO'G'RI
  // to'liq ishni ham 1 kod bilan yiqitardi (prodda 7 ta PAUSED yozilish bor).
  // Bu esa operatorni aynan C3 qo'ygan tekshiruvni e'tiborsiz qoldirishga
  // o'rgatardi — shuning uchun qoldiq ANIQ solishtiriladi, "> 0" emas.
  const failedEnrollmentCount = failures.reduce(
    (a, f) => a + (migrateByStudent.get(f.studentId)?.enrollments.length ?? 0),
    0,
  );
  const residue = scopeResidueVerdict({
    remainingInScope,
    chargesSkipped,
    failedEnrollments: failedEnrollmentCount,
    limited: limit !== null,
  });
  const expectedRemainingInScope = residue.expected;

  section('NATIJA');
  printTable(
    ["ko'rsatkich", 'qiymat'],
    [
      ["Muvaffaqiyatli o'quvchi", String(results.length)],
      ['Yiqilgan', String(failures.length)],
      ['Prepaid qaytarildi', som(totalPrepaid)],
      ['Davr ichi bekor qilindi', som(totalReversed)],
      ['Oylik hisoblandi', som(totalCharged)],
      ['Yozilgan oylik hisob', String(chargesCreated)],
      ['Hisobsiz qolgan yozilish', String(chargesSkipped)],
      ['Balanslar jami o`zgarishi', som(totalDelta)],
      ['Ledger qatorlari yig`indisi', som(ledgerDelta)],
      ['Qamrovda qolgan yozilish', String(remainingInScope)],
      [
        '  shundan kutilgan qoldiq',
        `${expectedRemainingInScope} (hisobsiz ${chargesSkipped} + yiqilgan ${failedEnrollmentCount})`,
      ],
    ],
    ['l', 'r'],
  );

  console.log('');
  console.log(`Natija CSV: ${outPath}`);
  console.log(`Bashorat CSV bilan qator-qator solishtiring.`);

  // Bashorat bilan haqiqat mos keldimi? `--limit` bilan ishlanganda taqqoslash
  // ma'nosiz — bashorat butun qamrov uchun, qo'llangani esa faqat bir qismi.
  const predictedCharge = plan.students.reduce(
    (a, st) => a + st.monthlyCharge,
    0,
  );
  if (limit === null && predictedCharge !== totalCharged) {
    console.log('');
    console.log(
      `DIQQAT: bashorat ${som(predictedCharge)} edi, haqiqatda ${som(totalCharged)} hisoblandi.`,
    );
  }

  const problems: string[] = [];
  if (ledgerDelta !== totalDelta) {
    problems.push(
      `Ledger mos kelmadi: balanslar ${totalDelta}, yozilgan Transaction qatorlari ${ledgerDelta}.`,
    );
  }
  if (balanceDrift.length > 0) {
    problems.push(
      `Commit'dan keyin ${balanceDrift.length} ta o'quvchining balansi natijadan farq qiladi ` +
        `(masalan #${balanceDrift[0].studentId}: kutilgan ${balanceDrift[0].newBalance}, ` +
        `bazada ${liveById.get(balanceDrift[0].studentId)}).`,
    );
  }
  if (!residue.ok) {
    problems.push(
      `Qamrov qoldig'i kutilganidan farq qiladi: bazada ${remainingInScope} ta ` +
        `yozilish hali qamrovda, kutilgan ${expectedRemainingInScope} ta ` +
        `(hisobsiz ${chargesSkipped} + yiqilgan ${failedEnrollmentCount}). ` +
        `Farq ${remainingInScope - expectedRemainingInScope} ta — bular jim ` +
        `qolmasligi kerak, \`verify-monthly-migration.ts\` ularni ro'yxatlaydi.`,
    );
  } else if (limit === null && expectedRemainingInScope > 0) {
    console.log('');
    console.log(
      `Eslatma: ${expectedRemainingInScope} ta yozilish qamrovda QOLDI va bu ` +
        `KUTILGAN (hisobsiz ${chargesSkipped} + yiqilgan ${failedEnrollmentCount}). ` +
        `Har birini \`verify-monthly-migration.ts\` nomma-nom ko'rsatadi.`,
    );
  }

  if (failures.length > 0) {
    section("YIQILGAN O'QUVCHILAR");
    for (const f of failures) {
      console.log(`  #${f.studentId}: ${f.message}`);
    }
    problems.push(
      `${failures.length} ta o'quvchi migratsiya qilinmadi. ` +
        `Tuzatib, skriptni QAYTA ishga tushiring — qamrov yozilishning o'z ` +
        `holatidan olinadi, shuning uchun bajarilganlar takrorlanmaydi va ` +
        `BAJARILMAGANLAR o'tkazib yuborilmaydi.`,
    );
  }

  // ── YAKUNIY QADAM: kurs bayrog'i ────────────────────────────────────
  // ATAYLAB eng oxirida, va faqat butun o'tish TOZA tugagandan keyin.
  // Bayroqni o'quvchi tranzaksiyasi ichida almashtirish (avvalgi 4-qadam)
  // ishlab turgan backendni hali ko'chmagan kursdoshlarga qarshi
  // qurollantirardi — `monthly-migration-apply.ts` sarlavhasiga qarang.
  section("KURS BAYROG'I");
  if (limit !== null) {
    console.log(
      `--limit bilan ishlandi -> \`Course.paymentModel\` ALMASHTIRILMADI.\n` +
        `Bu ataylab: bayroq kurs darajasida, uni yarim ko'chgan kursda\n` +
        `almashtirish qolgan kursdoshlarga qorovul orqali noto'g'ri hisob\n` +
        `yozardi.\n` +
        `\n` +
        `DIQQAT: bayroq almashmaguncha migratsiya qilingan o'quvchilar\n` +
        `davomat yo'lida HALI ESKI (LESSON_PACK) mantiqda qoladi. Bu oynada\n` +
        `ularga davomat belgilanmasligi kerak. Limitsiz to'liq ishga\n` +
        `tushirishni DARHOL bajaring:\n` +
        `  npx ts-node scripts/migrate-to-monthly.ts --apply --ha-men-tasdiqlayman --zaxira-olindi --period=${period}`,
    );
  } else if (problems.length > 0) {
    console.log(
      `Yuqoridagi tekshiruvlar yiqilgani uchun \`Course.paymentModel\`\n` +
        `ALMASHTIRILMADI. Avval muammolarni tuzatib, skriptni qayta ishga\n` +
        `tushiring — bayroq faqat toza yakundan keyin almashadi.`,
    );
  } else {
    const courseIds = [
      ...new Set(
        [...migrateByStudent.values()].flatMap((b) =>
          b.enrollments.map((e) => e.courseId),
        ),
      ),
    ];
    const skippedEnrollmentIds = results.flatMap((r) => r.skippedEnrollmentIds);
    const flip = await flipCoursesToMonthly({
      prisma,
      courseIds,
      skippedEnrollmentIds,
      year,
      month,
    });
    console.log(
      `MONTHLY'ga o'tkazilgan kurs: ${flip.flipped.length}/${courseIds.length}` +
        (flip.flipped.length ? ` — ${flip.flipped.join(', ')}` : ''),
    );
    if (flip.blocked.length > 0) {
      for (const b of flip.blocked) {
        console.log(
          `  BLOKLANDI: "${b.courseName}" (${b.courseId}) — shu kursda hali ` +
            `${b.remaining} ta hisobsiz faol yozilish bor.`,
        );
      }
      problems.push(
        `${flip.blocked.length} ta kursning bayrog'i ALMASHTIRILMADI: ularda ` +
          `hisobsiz qolgan faol yozilish bor. Bayroqni shunday almashtirish ` +
          `kunlik qorovulga o'sha yozilishlarga to'liq oylik hisob yozdirardi.`,
      );
    } else {
      // Kurs bayrog'i faqat MAVJUD kurslarni ko'chiradi; cutover'dan keyin
      // ochilgan YANGI kurs modelni `payment.defaultModel` dan oladi va
      // uning kodlangan boshlang'ichi ataylab `LESSON_PACK`. Ikkalasi shu
      // yerda BIRGA almashadi — aks holda kafolat qo'lda bosiladigan
      // tugmaga qolardi va unutilgan bosish jim kutib turardi.
      const companyIds = [
        ...new Set([...migrateByStudent.values()].map((b) => b.companyId)),
      ];
      const setting = await flipDefaultModelSettingToMonthly({
        prisma,
        companyIds,
      });
      console.log(
        `payment.defaultModel = MONTHLY: ${setting.written.length} ta kompaniyaga yozildi` +
          (setting.alreadyMonthly.length
            ? `, ${setting.alreadyMonthly.length} tasida allaqachon MONTHLY edi`
            : ''),
      );
      console.log(
        `Sozlamalar keshi (TTL 5 daqiqa) o'zi yangilanadi — shu oynada YANGI\n` +
          `KURS yaratmang, u hali LESSON_PACK olishi mumkin.`,
      );
      for (const o of setting.branchOverrides) {
        // Filial qiymati kompaniya qiymatidan USTUN — jim qoldirilsa
        // o'sha filialda ochilgan yangi kurs paketda qolaverardi.
        console.log(
          `  DIQQAT: filial #${o.branchId} (kompaniya ${o.companyId}) uchun ` +
            `alohida qiymat saqlangan: ${JSON.stringify(o.value)}. Uni ` +
            `Sozlamalar → To'lov dan MONTHLY qiling yoki o'chiring.`,
        );
      }
    }
  }

  if (problems.length > 0) {
    section('TEKSHIRUV YIQILDI');
    for (const p of problems) console.log(`  - ${p}`);
    throw new Error(problems.join(' | '));
  }

  console.log('');
  console.log(
    "Migratsiya tugadi. Hech qanday xato yo'q.\n" +
      (limit === null
        ? `Kurs bayrog'i ham, \`payment.defaultModel\` sozlamasi ham MONTHLY —\n` +
          `keyin ochilgan yangi kurs ham oylik bo'ladi.\n`
        : '') +
      `Endi tekshiruvni ishga tushiring:\n` +
      `  npx ts-node scripts/verify-monthly-migration.ts --period=${period}`,
  );
}

async function main(prisma: PrismaClient) {
  const { apply, confirmed, backedUp, limit, period } = parseCliArgs();

  if (apply && !confirmed) {
    throw new Error(
      "--apply yolg'iz ishlamaydi. 370 o'quvchining balansi qayta yoziladi.\n" +
        "Rostdan ham qo'llamoqchi bo'lsangiz, qo'shimcha bayroqni ham bering:\n" +
        '  npx ts-node scripts/migrate-to-monthly.ts --apply --ha-men-tasdiqlayman --zaxira-olindi',
    );
  }

  // ── I3: brief 1-qadam — CEO ko'rib chiqqan bashorat hisoboti bo'lmasa
  // hech narsa yozilmaydi. ────────────────────────────────────────────────
  if (apply) {
    const previews = existingPreviewFiles();
    if (previews.length === 0) {
      const today = tashkentDateStr(new Date());
      throw new Error(
        "Avval --dry-run ishga tushiring va hisobotni CEO bilan ko'rib chiqing. " +
          `Kutilgan fayl: ${path.join(docsDir(), `migration-preview-${today}.csv`)}`,
      );
    }
    console.log(`Bashorat hisoboti topildi: ${previews[previews.length - 1]}`);
  }

  // ── I3: brief 2-qadam — zaxira nusxa. ──────────────────────────────────
  if (apply && !backedUp) {
    throw new Error(
      "DIQQAT: o'quvchilarning balansi o'zgaradi.\n" +
        'Zaxira nusxa olindimi? (pg_dump)\n' +
        "Davom etish uchun --zaxira-olindi bayrog'ini ham qo'shing.",
    );
  }

  const [yearStr, monthStr] = period.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);

  // I1: `--apply` da "HECH NARSA YOZILMAYDI" deb yozish YOLG'ON edi — pul
  // yozilishidan bir necha qator oldin chiqardi.
  printHeader(
    apply
      ? `MIGRATSIYA QO'LLANMOQDA — davr ${period} — BAZAGA YOZILADI`
      : `MIGRATSIYA OLDINDAN HISOBOTI — davr ${period} — DRY RUN, HECH NARSA YOZILMAYDI`,
  );

  // resolveExcludedDates() (va uning ichidagi resolveMonthPlan) INJEKSIYA
  // QILINGAN bog'liqliklarga tegmaydi — faqat o'z parametrlaridan va `tx`
  // dan ishlaydi. Shuning uchun servisni to'liq Nest DI grafigisiz, faqat
  // shu bitta metod uchun qo'lda yasash xavfsiz (lekin `new` SHART:
  // metod `this.resolveMonthPlan` ni chaqiradi). TransactionsWriteService
  // hech qachon chaqirilmaydi.
  const chargeService = new MonthlyChargeService(
    prisma as unknown as never,
    undefined as unknown as never,
    // SettingsService — `resolveExcludedDates` unga tegmaydi, shuning uchun
    // bu skriptda hech qachon chaqirilmaydi.
    undefined as unknown as never,
  );
  const tx = prisma as unknown as Prisma.TransactionClient;

  const companies = await prisma.company.findMany({ select: { id: true } });

  /**
   * MIGRATSIYA QAMROVI — yozilishning O'Z holatidan, kurs bayrog'idan EMAS.
   *
   * Avval bu yerda `course: { paymentModel: LESSON_PACK }` turardi. Lekin
   * `paymentModel` KURS darajasidagi maydon va migratsiyaning 4-qadami uni
   * almashtiradi: prodda bitta "Standart" kursda 51 guruh bor, ya'ni birinchi
   * migratsiya qilingan o'quvchi qolgan barcha kursdoshlarini qamrovdan
   * ABADIY chiqarib yuborardi — sentabr hisobi yozilmagan, prepaid'i qotib
   * qolgan, kursi esa allaqachon MONTHLY. Keyingi ishga tushirish
   * "enrollments=0" topib "Migratsiya tugadi, hech qanday xato yo'q" deb
   * chiqardi. Ya'ni brief tavsiya qilgan bosqichma-bosqich (`--limit`)
   * chiqish aynan buzuvchi edi.
   *
   * To'g'ri belgi — shu davr uchun `EnrollmentMonthlyCharge` bormi. U
   * yozilish darajasida, migratsiyaning haqiqiy natijasidan kelib chiqadi
   * va `verify-monthly-migration.ts` ning 1-tekshiruvi bilan AYNAN
   * to'ldiruvchi (biri "qamrovda qolganlar", ikkinchisi "hisobi borlar").
   *
   * Ogohlantirish: bu skript endi "shu davr uchun hisobi yo'q har qanday
   * faol yozilish"ni oladi. Migratsiya tugagach oylik hisoblarni oy boshi
   * cron'i yozadi — bu skriptni keyingi oylarda ishlatish uchun mo'ljallanmagan.
   */
  const scopeWhere = (companyId: number) => ({
    status: EnrollmentStatus.ACTIVE,
    deletedAt: null,
    group: {
      deletedAt: null,
      companyId,
      statusEnum: { in: [GroupStatus.ACTIVE, GroupStatus.PAUSED] },
      course: { deletedAt: null },
    },
    student: { deletedAt: null, status: 'ACTIVE' as const },
    monthlyCharges: {
      // `status` shart: bekor qilingan hisob "bu yozilish ko'chgan" degani
      // emas (`MonthlyChargeService` ning bo'shliq so'rovi bilan bir xil).
      none: {
        periodYear: year,
        periodMonth: month,
        status: MonthlyChargeStatus.CHARGED,
      },
    },
  });

  const countInScope = async (): Promise<number> => {
    let total = 0;
    for (const c of companies) {
      total += await prisma.enrollment.count({ where: scopeWhere(c.id) });
    }
    return total;
  };

  const allRows: MigrationRow[] = [];
  const reversedDeductions: Record<number, number> = {};
  const groupSummaries: GroupSummaryRow[] = [];
  // `--apply` uchun: o'quvchi -> uning barcha yozilishlari. Bir o'quvchi
  // bitta tranzaksiyada migratsiya qilinadi, shuning uchun yozilishlari
  // birga turishi kerak.
  const migrateByStudent = new Map<
    number,
    { companyId: number; enrollments: EnrollmentToMigrate[] }
  >();

  for (const company of companies) {
    const enrollments = await prisma.enrollment.findMany({
      where: scopeWhere(company.id),
      select: {
        id: true,
        studentId: true,
        groupId: true,
        status: true,
        startDate: true,
        prepaidLessonsRemaining: true,
        student: {
          select: {
            firstName: true,
            lastName: true,
            balance: true,
            discountPercent: true,
          },
        },
        group: {
          select: {
            id: true,
            name: true,
            groupNumber: true,
            branchId: true,
            companyId: true,
            statusEnum: true,
            exactDays: true,
            courseId: true,
            teachers: { select: { teacherId: true } },
            course: {
              select: {
                name: true,
                price: true,
                lessonPaymentCount: true,
                paymentModel: true,
              },
            },
          },
        },
      },
    });

    if (enrollments.length === 0) continue;

    // ── guruh kesimida bir marta hisoblanadigan narsalar (N+1 emas) ────────
    const uniqueGroups = new Map<
      string,
      (typeof enrollments)[number]['group']
    >();
    for (const e of enrollments) uniqueGroups.set(e.groupId, e.group);

    const excludedByGroup = new Map<string, string[]>();
    for (const [groupId, group] of uniqueGroups) {
      excludedByGroup.set(
        groupId,
        await chargeService.resolveExcludedDates(
          tx,
          groupId,
          group.branchId,
          year,
          month,
        ),
      );
    }

    const plannedByGroup = new Map<string, number>();
    for (const [groupId, group] of uniqueGroups) {
      plannedByGroup.set(
        groupId,
        lessonDatesInMonth({
          year,
          month,
          exactDays: group.exactDays,
          excludedDates: excludedByGroup.get(groupId),
        }).length,
      );
    }

    // ── har enrollment uchun eng so'nggi (bekor qilinmagan) LESSON_DEDUCTION —
    // prepaid qaytarish shu BATCH'ning o'z summasidan hisoblanadi (bitta
    // so'rov), xuddi EnrollmentBillingService.prepaidRefundValue kabi —
    // metadata.perLessonCost ATAYLAB chegirmasiz, uni to'g'ridan-to'g'ri
    // ishlatish chegirmali o'quvchini 2x ortiqcha ko'rsatardi. ─────────────
    const enrollmentsWithPrepaid = enrollments.filter(
      (e) => e.prepaidLessonsRemaining > 0,
    );
    const deductions = enrollmentsWithPrepaid.length
      ? await prisma.transaction.findMany({
          where: {
            type: TransactionType.LESSON_DEDUCTION,
            reversedAt: null,
            enrollmentId: { in: enrollmentsWithPrepaid.map((e) => e.id) },
          },
          orderBy: { createdAt: 'asc' },
          select: {
            enrollmentId: true,
            amount: true,
            metadata: true,
            createdAt: true,
          },
        })
      : [];
    const lastDeductionByEnrollment = new Map<
      string,
      PrepaidRefundBatch & { createdAt: Date }
    >();
    for (const d of deductions) {
      if (!d.enrollmentId) continue;
      const meta = d.metadata as
        | { perLessonCost?: number; lessonsCovered?: number }
        | null
        | undefined;
      lastDeductionByEnrollment.set(d.enrollmentId, {
        amount: d.amount,
        lessonsCovered: meta?.lessonsCovered,
        perLessonCost: meta?.perLessonCost,
        createdAt: d.createdAt,
      });
    }

    // ── shu davrda (masalan 02.09) yechilib, migratsiyada bekor qilinadigan
    // LESSON_DEDUCTION'lar, o'quvchi bo'yicha yig'ilgan. ─────────────────────
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const { gte: periodGte } = tashkentDayRangeUtc(`${period}-01`);
    const { lt: periodLt } = tashkentDayRangeUtc(
      `${period}-${String(daysInMonth).padStart(2, '0')}`,
    );
    // `--apply` HAR YOZILISH bo'yicha bekor qiladi (`enrollmentId: enr.id`) va
    // faqat ACTIVE guruhda (I2) — bashorat ham aynan shu to'plamdan olinishi
    // kerak. Avvalgi versiya `studentId` bo'yicha olardi: qamrovga
    // kirmaydigan yozilishning (masalan chiqib ketgani, yoki PAUSED guruhdagi)
    // yechimini ham sanardi.
    const chargeableEnrollmentIds = enrollments
      .filter((e) => e.group.statusEnum === GroupStatus.ACTIVE)
      .map((e) => e.id);
    const periodDeductions = chargeableEnrollmentIds.length
      ? await prisma.transaction.findMany({
          where: {
            type: TransactionType.LESSON_DEDUCTION,
            reversedAt: null,
            createdAt: { gte: periodGte, lt: periodLt },
            enrollmentId: { in: chargeableEnrollmentIds },
          },
          select: { studentId: true, amount: true },
        })
      : [];
    for (const t of periodDeductions) {
      if (t.studentId == null) continue;
      // ADR-0004: teskari qatorning summasi asl qatorning ISHORASIDAN
      // chiqadi (`reverseTransaction`: `-original.amount`). `Math.abs`
      // taqiqlangan — u musbat qatorni ham "qaytariladi" deb sanardi.
      reversedDeductions[t.studentId] =
        (reversedDeductions[t.studentId] ?? 0) + -t.amount;
    }

    // ── o'qituvchi stavkalari (guruh-maxsus, aks holda global) ──────────────
    const teacherIds = [
      ...new Set(
        enrollments.flatMap((e) => e.group.teachers.map((t) => t.teacherId)),
      ),
    ];
    const groupIds = [...uniqueGroups.keys()];
    const salaryConfigs = teacherIds.length
      ? await prisma.employeeSalaryConfig.findMany({
          where: {
            userId: { in: teacherIds },
            isActive: true,
            companyId: company.id,
            OR: [{ groupId: null }, { groupId: { in: groupIds } }],
          },
          select: {
            userId: true,
            groupId: true,
            salaryType: true,
            value: true,
          },
        })
      : [];
    const configFor = (teacherId: number, groupId: string) =>
      salaryConfigs.find(
        (c) => c.userId === teacherId && c.groupId === groupId,
      ) ??
      salaryConfigs.find((c) => c.userId === teacherId && c.groupId === null) ??
      null;

    // ── MigrationRow[] ni yig'ish ─────────────────────────────────────────
    for (const e of enrollments) {
      const course = e.group.course;

      // EnrollmentBillingService.prepaidRefundValue bilan bir xil ustuvorlik
      // (scripts/lib/prepaid-refund-price.ts izohiga qarang) — chegirmani
      // batch summasidan to'g'ri o'qiydi, metadata.perLessonCost'ga
      // (chegirmasiz) faqat batch ma'lumoti yo'q bo'lganda tushadi.
      const batch = lastDeductionByEnrollment.get(e.id) ?? null;
      const packPerLessonCost = resolvePackPerLessonCost({
        remaining: e.prepaidLessonsRemaining,
        course,
        batch,
      });

      // I2: PAUSED guruhga `createChargeForEnrollment` hisob yozmaydi
      // (`statusEnum !== ACTIVE` -> null), shuning uchun bashorat ham
      // hisoblamaydi va `--apply` sentabr yechimlarini bekor qilmaydi.
      const chargeable = e.group.statusEnum === GroupStatus.ACTIVE;

      // C2: prepaid'ni qoplab turgan batch shu davr ichida bo'lsa VA u
      // bekor qilinadigan bo'lsa, prepaid ALOHIDA qaytarilmaydi — bekor
      // qilish o'sha pulni allaqachon qaytaradi (aks holda bir batch ikki
      // marta qaytarilardi). Batafsil: `lib/monthly-migration-apply.ts`
      // fayli boshidagi izoh.
      const fundedInPeriod =
        !!batch && batch.createdAt >= periodGte && batch.createdAt < periodLt;
      const prepaidValue = resolvePrepaidRefundTotal({
        remaining: e.prepaidLessonsRemaining,
        course,
        batch,
      });
      const skipPrepaidRefund = chargeable && fundedInPeriod;
      const prepaidRefundTotal = skipPrepaidRefund ? 0 : prepaidValue;
      // O'tkazib yuborilganda: bekor qilish qoplashi KUTILAYOTGAN summa.
      // `--apply` buni dalil bilan tekshiradi (EnrollmentToMigrate izohi).
      const prepaidCoveredByReversal = skipPrepaidRefund ? prepaidValue : 0;

      const plannedLessons = plannedByGroup.get(e.groupId) ?? 0;
      const coveredLessons = lessonDatesInMonth({
        year,
        month,
        exactDays: e.group.exactDays,
        excludedDates: excludedByGroup.get(e.groupId),
        fromDate: e.startDate ? tashkentDateStr(e.startDate) : null,
      }).length;

      allRows.push({
        enrollmentId: e.id,
        studentId: e.studentId,
        studentName: `${e.student.firstName} ${e.student.lastName}`,
        groupId: e.groupId,
        groupName: e.group.groupNumber
          ? `#${e.group.groupNumber} ${e.group.name}`
          : e.group.name,
        branchId: e.group.branchId,
        balance: e.student.balance,
        prepaidLessons: e.prepaidLessonsRemaining,
        packPerLessonCost,
        prepaidRefundTotal,
        chargeable,
        monthlyPrice: course.price,
        plannedLessons,
        coveredLessons,
        discountPercent: e.student.discountPercent,
      });

      const bucket = migrateByStudent.get(e.studentId) ?? {
        companyId: company.id,
        enrollments: [],
      };
      bucket.enrollments.push({
        enrollment: {
          id: e.id,
          studentId: e.studentId,
          groupId: e.groupId,
          status: e.status,
          startDate: e.startDate,
          group: {
            id: e.group.id,
            branchId: e.group.branchId,
            companyId: e.group.companyId,
            statusEnum: e.group.statusEnum,
            exactDays: e.group.exactDays,
            // Hisob yaratilayotganda kurs allaqachon MONTHLY bo'lgan
            // bo'ladi (5-qadam kursni oldin almashtiradi), shuning uchun
            // bu yerda MONTHLY deb beriladi — aks holda
            // createChargeForEnrollment o'z qorovulida to'xtardi.
            course: {
              price: e.group.course.price,
              paymentModel: PaymentModel.MONTHLY,
            },
          },
        },
        courseId: e.group.courseId,
        discountPercent: e.student.discountPercent,
        chargeable,
        expectedPrepaidRefund: prepaidRefundTotal,
        prepaidCoveredByReversal,
      });
      migrateByStudent.set(e.studentId, bucket);
    }

    // ── guruh kesimi (CEO qatlami 2) ─────────────────────────────────────
    for (const [groupId, group] of uniqueGroups) {
      const rowsInGroup = enrollments.filter((e) => e.groupId === groupId);
      const plannedLessons = plannedByGroup.get(groupId) ?? 0;
      const newPerLesson = perLessonCostForMonth(
        group.course.price,
        plannedLessons,
      );
      const oldPerLesson = baseLessonPrice(
        group.course.price,
        group.course.lessonPaymentCount,
      );

      // CEO shu hisobotdan qarorni oladi, shuning uchun bu qatlam 1/3/4
      // qatlamlar bilan FOOTING berishi shart. Ilgari bu yerda proratsiya
      // formulasining UCHINCHI qo'lda yozilgan nusxasi turardi va u
      // `applyDiscount`ni ham, PAUSED guruh (`chargeable`) bayrog'ini ham
      // qo'llamasdi: prodda kutilayotgan daromadni ~709 000 (3 chegirmali
      // o'quvchi) + ~3.15 mln (7 PAUSED yozilish) ~ 3.9 mln so'mga
      // OSHIRIB ko'rsatardi.
      const groupChargeable = group.statusEnum === GroupStatus.ACTIVE;
      const expectedIncome = rowsInGroup.reduce((sum, e) => {
        if (!groupChargeable) return sum;
        const covered = lessonDatesInMonth({
          year,
          month,
          exactDays: group.exactDays,
          excludedDates: excludedByGroup.get(groupId),
          fromDate: e.startDate ? tashkentDateStr(e.startDate) : null,
        }).length;
        const full = proratedMonthlyAmount(
          group.course.price,
          plannedLessons,
          covered,
        );
        return (
          sum +
          applyDiscount(full, clampDiscount(e.student.discountPercent ?? 0))
        );
      }, 0);

      // Faqat "yangi dars narxi almashishi teacher haqiga qanday ta'sir
      // qiladi" — sentabrda haqiqatda o'tiladigan dars soni O'ZGARMAYDI,
      // faqat shu darslardan hisoblanadigan perLessonCost o'zgaradi.
      let teacherPayDelta = 0;
      for (const t of group.teachers) {
        const cfg = configFor(t.teacherId, groupId);
        if (!cfg) continue;
        const version: RateVersion = {
          salaryType: cfg.salaryType,
          value: cfg.value,
          effectiveFrom: new Date(0),
          effectiveTo: null,
        };
        const oldAccrual = perLessonAccrual(
          version,
          oldPerLesson,
          group.course.lessonPaymentCount,
        );
        const newAccrual = perLessonAccrual(
          version,
          newPerLesson,
          plannedLessons,
        );
        teacherPayDelta +=
          (newAccrual - oldAccrual) * plannedLessons * rowsInGroup.length;
      }

      groupSummaries.push({
        groupName: group.groupNumber
          ? `#${group.groupNumber} ${group.name}`
          : group.name,
        courseName: group.course.name,
        studentCount: rowsInGroup.length,
        plannedLessons,
        oldPerLesson,
        newPerLesson,
        expectedIncome,
        teacherPayDelta,
      });
    }
  }

  const plan = buildMigrationPlan({ rows: allRows, reversedDeductions });

  console.log('');
  // I1: `--apply` da "HECH NARSA YOZILMADI" sarlavhasi bilan chiqarish
  // pul yozilishidan sal oldin yolg'on gapirish edi.
  console.log(
    renderSummary(
      plan,
      apply
        ? "MIGRATSIYA REJASI — HOZIR QO'LLANADI, BAZAGA YOZILADI"
        : undefined,
    ),
  );

  if (apply) {
    await runApply({
      prisma,
      plan,
      migrateByStudent,
      countInScope,
      year,
      month,
      period,
      limit,
    });
    return;
  }

  section('GURUHLAR KESIMI (CEO qatlami 2)');
  printTable(
    [
      'guruh',
      'kurs',
      "o'quvchi",
      'sent. dars',
      'eski/dars',
      'yangi/dars',
      'kutilgan tushum',
      "o'qituvchi delta",
    ],
    groupSummaries
      .sort((a, b) => b.expectedIncome - a.expectedIncome)
      .map((g) => [
        g.groupName,
        g.courseName,
        g.studentCount,
        g.plannedLessons,
        som(g.oldPerLesson),
        som(g.newPerLesson),
        som(g.expectedIncome),
        som(g.teacherPayDelta),
      ]),
    ['l', 'l', 'r', 'r', 'r', 'r', 'r', 'r'],
  );

  section("ENG KATTA 20 TA BALANS O'ZGARISHI (CEO qatlami 4)");
  printTable(
    [
      'studentId',
      'ism',
      'eski balans',
      'prepaid qaytdi',
      'davr ichi bekor',
      'oylik hisobi',
      'yangi balans',
      "o'zgarish",
      'holat',
    ],
    plan.biggestChanges.map((s) => [
      s.studentId,
      s.studentName,
      som(s.oldBalance),
      som(s.prepaidRefund),
      som(s.reversedSeptember),
      som(s.monthlyCharge),
      som(s.newBalance),
      som(s.newBalance - s.oldBalance),
      s.state,
    ]),
    ['r', 'l', 'r', 'r', 'r', 'r', 'r', 'r', 'l'],
  );

  // ── to'liq o'quvchi ro'yxati CSV'ga (CEO qatlami 3) ─────────────────────
  const csv = renderStudentCsv(plan);
  const outPath = nextPreviewPath();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, csv, 'utf-8');

  console.log('');
  console.log(`To'liq o'quvchi ro'yxati (${plan.students.length} ta) yozildi:`);
  console.log(`  ${outPath}`);
  console.log(`Muhit: ${dbEnvLabel()}`);
  console.log(
    "Bu skript FAQAT o'qidi — bazaga hech qanday create/update/delete/upsert yozilmadi.",
  );

  if (plan.students.length === 0) {
    section('QAMROV BO`SH');
    console.log(
      `Davr ${period} uchun migratsiya qilinadigan yozilish TOPILMADI.\n` +
        `Agar migratsiya allaqachon bajarilgan bo'lsa buni TASDIQLANG:\n` +
        `  npx ts-node scripts/verify-monthly-migration.ts --period=${period}\n` +
        `Aks holda qamrov so'rovi noto'g'ri filtrlayapti — bo'sh ro'yxat\n` +
        `"hammasi joyida" degani EMAS.`,
    );
  }
}

run(main);
