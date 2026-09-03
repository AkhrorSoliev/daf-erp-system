/**
 * verify-monthly-migration — oylik to'lovga o'tish migratsiyasidan KEYINGI
 * mustaqil tekshiruv (brief 5-qadam).
 *
 * STRICTLY READ-ONLY: `create`/`update`/`delete`/`upsert`/`$executeRaw` YO'Q.
 *
 * Nega alohida skript: `migrate-to-monthly.ts` ning o'z tekshiruvi o'zi
 * yozgan raqamlardan chiqadi. Bu skript esa BAZANI mustaqil o'qiydi va
 * migratsiya nima da'vo qilganini emas, nima QOLGANINI tekshiradi. 3-tekshiruv
 * (bashorat CSV vs bazadagi balans) shu sababli eng qimmatlisi.
 *
 * Tekshiruvlar:
 *   1. QAMROV — har faol oylik yozilishda shu davr uchun hisob bor.
 *      (Bu C1 detektori: kurs bayrog'i almashib, hisobsiz qolgan
 *      "yarim ko'chgan" yozilishlarni aynan shu topadi.)
 *   2. PREPAID — MONTHLY kursdagi hech bir yozilishda
 *      `prepaidLessonsRemaining > 0` qolmagan.
 *   3. LEDGER — har bir davr hisobi o'zining `Transaction` qatoriga bog'langan,
 *      qator bekor qilinmagan va summasi `-chargedAmount` ga TENG; hamda
 *      Σ hisob === Σ ledger.
 *   4. CSV — bashorat CSV'sidagi `yangi_balans` bazadagi haqiqiy balans bilan
 *      qator-qator mos.
 *   5. KURS BAYROG'I — shu davrda hisob yozilgan HAR bir kurs endi
 *      `paymentModel = MONTHLY`. Migratsiyaning yakuniy qadami
 *      (`flipCoursesToMonthly`) o'quvchi tranzaksiyasidan tashqarida
 *      ishlaydi va bloklanishi mumkin — bloklangani jim qolsa, o'quvchi
 *      oylik hisobini to'lagan bo'lardi, dars esa ESKI (LESSON_PACK)
 *      yo'ldan qayta hisoblanardi.
 *
 * Har tekshiruv PASS yoki FAIL chiqaradi; bitta FAIL bo'lsa chiqish kodi 1.
 *
 * Usage:
 *   cd server && npx ts-node scripts/verify-monthly-migration.ts [--period=2026-09] [--csv=<yo'l>]
 *   cd server && railway run npx ts-node scripts/verify-monthly-migration.ts --period=2026-09
 */
import {
  EnrollmentStatus,
  GroupStatus,
  MonthlyChargeStatus,
  PaymentModel,
  Prisma,
  PrismaClient,
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
import { tashkentDateStr } from '../src/attendance/shared/date-utils';
import { MonthlyChargeService } from '../src/billing/monthly-charge.service';
import { lessonDatesInMonth } from '../src/billing/planned-lessons';

interface VerifyArgs {
  period: string;
  csvPath: string | null;
  /** Nechta muammoli qatorni ro'yxatlash (standart 20). */
  show: number;
}

function parseArgs(): VerifyArgs {
  const argv = process.argv.slice(2);
  const periodTok = argv.find((a) => a.startsWith('--period='));
  const period = periodTok
    ? periodTok.split('=')[1]
    : tashkentDateStr(new Date()).slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(period)) {
    throw new Error(
      `--period noto'g'ri format: "${period}" (kutilgan YYYY-MM, masalan 2026-09)`,
    );
  }
  const csvTok = argv.find((a) => a.startsWith('--csv='));
  const showTok = argv.find((a) => a.startsWith('--show='));
  const show = showTok ? Number(showTok.split('=')[1]) : 20;
  return {
    period,
    csvPath: csvTok ? csvTok.split('=')[1] : null,
    show: Number.isInteger(show) && show > 0 ? show : 20,
  };
}

function docsDir(): string {
  return path.join(__dirname, '..', '..', 'docs');
}

/**
 * Eng so'nggi `docs/migration-preview-*.csv`, `mtime` bo'yicha.
 *
 * Nom bo'yicha saralash XATO edi: `migration-preview-<sana>-<HHmmss>.csv`
 * leksikografik tartibda `migration-preview-<sana>.csv` dan OLDIN turadi,
 * ya'ni kunning eng ESKI fayli "eng yangisi" deb tanlanardi. 4-tekshiruv
 * shunda eskirgan bashorat bilan solishtirib, JIM noto'g'ri javob berardi.
 */
function latestPreviewCsv(): string | null {
  const dir = docsDir();
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith('migration-preview-') && f.endsWith('.csv'))
    .map((f) => path.join(dir, f))
    .sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs);
  return files.length ? files[files.length - 1] : null;
}

/**
 * Bashorat CSV'sining `studentId` va `yangi_balans` ustunlari.
 *
 * Qatorlarda tirnoq ichida vergul bor (ism, guruhlar ro'yxati), shuning uchun
 * oddiy `split(',')` yaramaydi — tirnoqni hisobga oluvchi minimal parser.
 */
function parsePreviewCsv(
  text: string,
): { studentId: number; newBalance: number }[] {
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const head = splitCsvLine(lines[0]);
  const idIdx = head.indexOf('studentId');
  const balIdx = head.indexOf('yangi_balans');
  if (idIdx < 0 || balIdx < 0) {
    throw new Error(
      `CSV sarlavhasida "studentId" yoki "yangi_balans" ustuni yo'q: ${lines[0]}`,
    );
  }
  const out: { studentId: number; newBalance: number }[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const studentId = Number(cells[idIdx]);
    const newBalance = Number(cells[balIdx]);
    if (!Number.isFinite(studentId) || !Number.isFinite(newBalance)) continue;
    out.push({ studentId, newBalance });
  }
  return out;
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === ',' && !inQuotes) {
      cells.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

interface CheckResult {
  name: string;
  pass: boolean;
  detail: string;
  rows: string[];
}

async function main(prisma: PrismaClient) {
  const { period, csvPath, show } = parseArgs();
  const [yearStr, monthStr] = period.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);

  printHeader(`MIGRATSIYA TEKSHIRUVI — davr ${period} — ${dbEnvLabel()}`);
  console.log("  Bu skript FAQAT o'qiydi — bazaga hech narsa yozilmaydi.");

  const checks: CheckResult[] = [];

  // ── 1. QAMROV: hisobsiz qolgan faol yozilish yo'q ──────────────────────
  // `migrate-to-monthly.ts` ning qamrov so'rovi bilan AYNAN bir xil shart —
  // ikkovi to'ldiruvchi bo'lishi kerak: u yerda "migratsiya qilinadiganlar",
  // bu yerda "qolib ketganlar".
  const uncharged = await prisma.enrollment.findMany({
    where: {
      status: EnrollmentStatus.ACTIVE,
      deletedAt: null,
      group: {
        deletedAt: null,
        statusEnum: { in: [GroupStatus.ACTIVE, GroupStatus.PAUSED] },
        course: { deletedAt: null },
      },
      student: { deletedAt: null, status: 'ACTIVE' },
      monthlyCharges: {
        none: {
          periodYear: year,
          periodMonth: month,
          // Bekor qilingan hisob "ko'chgan" degani emas — `MonthlyChargeService`
          // ning bo'shliq so'rovi bilan bir xil shart.
          status: MonthlyChargeStatus.CHARGED,
        },
      },
    },
    select: {
      id: true,
      studentId: true,
      startDate: true,
      prepaidLessonsRemaining: true,
      groupId: true,
      group: {
        select: {
          name: true,
          statusEnum: true,
          branchId: true,
          exactDays: true,
          course: { select: { name: true, paymentModel: true } },
        },
      },
    },
  });

  // Hisobsiz qolishning IKKI ta kutilgan sababi bor — ikkalasi ham
  // `createChargeForEnrollment` ning o'z qorovullaridan:
  //   - guruh ACTIVE emas (PAUSED, I2) -> `statusEnum !== ACTIVE` -> null;
  //   - oyda shu yozilish uchun dars kuni yo'q -> `plannedLessons === 0`
  //     yoki `coveredLessons === 0` -> null.
  // Bular BIR MARTALIK emas, DOIMIY holat: qamrovdan chiqishning yagona
  // yo'li hisob yozilishi, demak bu yozilishlar hech qachon chiqmaydi. Ularni
  // FAIL deb ko'rsatish to'g'ri migratsiyadan keyin ham 1 kod berardi va
  // operatorni bu tekshiruvni e'tiborsiz qoldirishga o'rgatardi.
  const unchargedPaused = uncharged.filter(
    (e) => e.group.statusEnum !== GroupStatus.ACTIVE,
  );
  const unchargedActiveGroup = uncharged.filter(
    (e) => e.group.statusEnum === GroupStatus.ACTIVE,
  );

  // Dars kunlari YAGONA manbadan — `MonthlyChargeService.resolveExcludedDates`
  // + `lessonDatesInMonth`, xuddi hisob yozadigan yo'l kabi. Ikkinchi nusxa
  // yozilmaydi. Faqat hisobsiz qolgan (odatda juda kam) yozilishlar uchun
  // hisoblanadi.
  const chargeService = new MonthlyChargeService(
    prisma as unknown as never,
    undefined as unknown as never,
    // SettingsService — `resolveExcludedDates` unga tegmaydi, shuning uchun
    // bu skriptda hech qachon chaqirilmaydi.
    undefined as unknown as never,
  );
  const readTx = prisma as unknown as Prisma.TransactionClient;
  const excludedCache = new Map<string, string[]>();
  const noLessonDays: typeof unchargedActiveGroup = [];
  const genuinelyUncharged: typeof unchargedActiveGroup = [];
  for (const e of unchargedActiveGroup) {
    let excluded = excludedCache.get(e.groupId);
    if (!excluded) {
      excluded = await chargeService.resolveExcludedDates(
        readTx,
        e.groupId,
        e.group.branchId,
        year,
        month,
      );
      excludedCache.set(e.groupId, excluded);
    }
    const planned = lessonDatesInMonth({
      year,
      month,
      exactDays: e.group.exactDays,
      excludedDates: excluded,
    }).length;
    const covered = lessonDatesInMonth({
      year,
      month,
      exactDays: e.group.exactDays,
      excludedDates: excluded,
      fromDate: e.startDate ? tashkentDateStr(e.startDate) : null,
    }).length;
    if (planned === 0 || covered === 0) noLessonDays.push(e);
    else genuinelyUncharged.push(e);
  }

  checks.push({
    name: `1. QAMROV — ${period} hisobi yo'q faol yozilish`,
    pass: genuinelyUncharged.length === 0,
    detail:
      `sababsiz hisobsiz: ${genuinelyUncharged.length} ta` +
      ` · kutilgan qoldiq: PAUSED ${unchargedPaused.length} ta` +
      `, oyda dars kuni yo'q ${noLessonDays.length} ta`,
    rows: genuinelyUncharged
      .slice(0, show)
      .map(
        (e) =>
          `o'quvchi #${e.studentId} · ${e.group.name} · ${e.group.course.name} ` +
          `(${e.group.course.paymentModel}) · prepaid=${e.prepaidLessonsRemaining}`,
      ),
  });

  // ── 2. PREPAID: MONTHLY yozilishda qolib ketmagan ──────────────────────
  const strandedPrepaid = await prisma.enrollment.findMany({
    where: {
      deletedAt: null,
      prepaidLessonsRemaining: { gt: 0 },
      group: {
        deletedAt: null,
        course: { paymentModel: PaymentModel.MONTHLY, deletedAt: null },
      },
    },
    select: {
      id: true,
      studentId: true,
      status: true,
      prepaidLessonsRemaining: true,
      group: { select: { name: true, statusEnum: true } },
    },
  });
  checks.push({
    name: '2. PREPAID — MONTHLY kursda qolgan oldindan to`langan dars',
    pass: strandedPrepaid.length === 0,
    detail: `${strandedPrepaid.length} ta yozilishda prepaid > 0`,
    rows: strandedPrepaid
      .slice(0, show)
      .map(
        (e) =>
          `o'quvchi #${e.studentId} · ${e.group.name} (${e.group.statusEnum}) · ` +
          `${e.status} · prepaid=${e.prepaidLessonsRemaining}`,
      ),
  });

  // ── 3. LEDGER: har hisob o'z Transaction qatoriga langarlangan ─────────
  const charges = await prisma.enrollmentMonthlyCharge.findMany({
    where: {
      periodYear: year,
      periodMonth: month,
      status: MonthlyChargeStatus.CHARGED,
    },
    select: {
      id: true,
      studentId: true,
      chargedAmount: true,
      transactionId: true,
      group: { select: { courseId: true } },
    },
  });
  const txIds = charges
    .map((c) => c.transactionId)
    .filter((id): id is string => !!id);
  const txs = txIds.length
    ? await prisma.transaction.findMany({
        where: { id: { in: txIds } },
        select: { id: true, amount: true, reversedAt: true },
      })
    : [];
  const txById = new Map(txs.map((t) => [t.id, t]));

  const ledgerProblems: string[] = [];
  let sumCharged = 0;
  let sumLedger = 0;
  for (const c of charges) {
    sumCharged += c.chargedAmount;
    if (!c.transactionId) {
      ledgerProblems.push(
        `hisob ${c.id} (o'quvchi #${c.studentId}): ledger qatori YO'Q`,
      );
      continue;
    }
    const t = txById.get(c.transactionId);
    if (!t) {
      ledgerProblems.push(
        `hisob ${c.id} (o'quvchi #${c.studentId}): ${c.transactionId} topilmadi`,
      );
      continue;
    }
    if (t.reversedAt) {
      ledgerProblems.push(
        `hisob ${c.id} (o'quvchi #${c.studentId}): ledger qatori BEKOR qilingan`,
      );
      continue;
    }
    // `chargeMonthlyFee` `-amount` yozadi (ADR-0004: ishora saqlanadi).
    if (t.amount !== -c.chargedAmount) {
      ledgerProblems.push(
        `hisob ${c.id} (o'quvchi #${c.studentId}): hisob ${c.chargedAmount}, ` +
          `ledger ${t.amount} (kutilgan ${-c.chargedAmount})`,
      );
    }
    sumLedger += -t.amount;
  }
  checks.push({
    name: '3. LEDGER — davr hisoblari ledger qatorlariga mos',
    pass: ledgerProblems.length === 0 && sumCharged === sumLedger,
    detail:
      `${charges.length} ta hisob · Σ hisob ${som(sumCharged)} · ` +
      `Σ ledger ${som(sumLedger)} · muammo: ${ledgerProblems.length}`,
    rows: ledgerProblems.slice(0, show),
  });

  // ── 4. CSV: bashorat qilingan yangi balans bazadagi balans bilan mos ───
  const resolvedCsv = csvPath ?? latestPreviewCsv();
  if (!resolvedCsv || !fs.existsSync(resolvedCsv)) {
    checks.push({
      name: '4. CSV — bashorat balansi bazadagi balans bilan mos',
      pass: false,
      detail:
        `Bashorat CSV topilmadi${resolvedCsv ? `: ${resolvedCsv}` : ''}. ` +
        `--csv=<yo'l> bilan ko'rsating.`,
      rows: [],
    });
  } else {
    const rows = parsePreviewCsv(fs.readFileSync(resolvedCsv, 'utf-8'));
    const ids = rows.map((r) => r.studentId);
    const students = ids.length
      ? await prisma.student.findMany({
          where: { id: { in: ids } },
          select: { id: true, balance: true },
        })
      : [];
    const balanceById = new Map(students.map((s) => [s.id, s.balance]));
    const mismatches: string[] = [];
    let missing = 0;
    for (const r of rows) {
      const live = balanceById.get(r.studentId);
      if (live === undefined) {
        missing += 1;
        mismatches.push(`o'quvchi #${r.studentId}: bazada topilmadi`);
        continue;
      }
      if (live !== r.newBalance) {
        mismatches.push(
          `o'quvchi #${r.studentId}: CSV ${som(r.newBalance)}, bazada ${som(live)} ` +
            `(farq ${som(live - r.newBalance)})`,
        );
      }
    }
    checks.push({
      name: '4. CSV — bashorat balansi bazadagi balans bilan mos',
      pass: mismatches.length === 0,
      detail:
        `${path.basename(resolvedCsv)} · ${rows.length} qator · ` +
        `mos kelmagan: ${mismatches.length}` +
        (missing ? ` (shundan ${missing} tasi bazada yo'q)` : ''),
      rows: mismatches.slice(0, show),
    });
  }

  // ── 5. KURS BAYROG'I: hisob yozilgan har bir kurs MONTHLY ─────────────
  // Migratsiya bayroqni ENG OXIRIDA, alohida qadamda almashtiradi
  // (`flipCoursesToMonthly`) — bu ataylab: uni o'quvchi tranzaksiyasi ichida
  // almashtirish hali ko'chmagan kursdoshlarga kunlik qorovul orqali to'liq
  // oylik hisob yozdirardi. Ammo o'sha yakuniy qadam BLOKLANISHI mumkin, va
  // bloklangani jim qolsa eng yomon holat yuzaga kelardi: o'quvchi oylik
  // hisobini to'lagan, kurs esa hamon LESSON_PACK — ya'ni har bir dars
  // ustiga ESKI yo'ldan yana yechilardi.
  const chargedCourseIds = [
    ...new Set(charges.map((c) => c.group.courseId)),
  ].filter((id): id is string => !!id);
  const chargedCourses = chargedCourseIds.length
    ? await prisma.course.findMany({
        where: { id: { in: chargedCourseIds } },
        select: { id: true, name: true, paymentModel: true },
      })
    : [];
  const notFlipped = chargedCourses.filter(
    (c) => c.paymentModel !== PaymentModel.MONTHLY,
  );
  checks.push({
    name: "5. KURS BAYROG'I — hisob yozilgan kurslar MONTHLY",
    pass: notFlipped.length === 0,
    detail:
      `${chargedCourses.length} ta kursda ${period} hisobi bor · ` +
      `MONTHLY emas: ${notFlipped.length} ta`,
    rows: notFlipped
      .slice(0, show)
      .map((c) => `kurs "${c.name}" (${c.id}) — hamon ${c.paymentModel}`),
  });

  // ── natija ────────────────────────────────────────────────────────────
  section('TEKSHIRUV NATIJASI');
  printTable(
    ['tekshiruv', 'holat', 'tafsilot'],
    checks.map((c) => [c.name, c.pass ? 'PASS' : 'FAIL', c.detail]),
    ['l', 'l', 'l'],
  );

  for (const c of checks) {
    if (c.pass || c.rows.length === 0) continue;
    section(c.name);
    for (const r of c.rows) console.log(`  ${r}`);
    console.log(`  (birinchi ${Math.min(c.rows.length, show)} tasi)`);
  }

  const failed = checks.filter((c) => !c.pass);
  console.log('');
  if (failed.length === 0) {
    console.log('Barcha tekshiruvlar PASS.');
    return;
  }
  throw new Error(
    `${failed.length} ta tekshiruv YIQILDI: ${failed.map((c) => c.name).join(', ')}`,
  );
}

run(main);
