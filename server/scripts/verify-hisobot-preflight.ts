/**
 * Production pre-flight for the "Hisobot" Excel workbook.
 *
 * READ-ONLY: it issues report READS only — no create/update/delete anywhere,
 * and the Redis stub below discards its writes. The one thing it puts on disk
 * is the workbook it just checked (server/reports/), so a human can open the
 * exact file these assertions ran against.
 *
 *   Prod:  cd server && railway run npx ts-node --transpile-only scripts/verify-hisobot-preflight.ts
 *   Dev:   cd server && npx ts-node --transpile-only scripts/verify-hisobot-preflight.ts
 *
 * `railway run` is what points DATABASE_URL at production; without it dotenv
 * loads server/.env, which is a seeded dev database and will not match the
 * figures below.
 *
 * The expected figures were measured against PRODUCTION on 2026-08-06 for
 * July 2026, company-wide. They are kept in two lists because they do not age
 * alike, and treating them alike would make this script cry wolf every day:
 *
 *   QOTIRILGAN (frozen) — a closed month's cash, expenses and attendance.
 *     Only a reversal can move these, so a mismatch is a real failure and the
 *     script exits non-zero.
 *   JONLI (live) — recognised lesson value, teacher salary and the figures
 *     derived from them, plus today's roster counts. When a July debtor pays in
 *     August, retroactive billing writes the consumption dated to the LESSON,
 *     so July's lesson value and the teacher's covered salary both grow after
 *     the fact. That is the system working; the script prints the delta and
 *     does not fail.
 *
 * Structural assertions (sheet list, forbidden strings, no Cyrillic, block 4's
 * footing, Filiallar vs Xulosa) are always hard failures — they check the
 * workbook's shape, which no amount of elapsed time may change.
 */
import 'dotenv/config'; // dev only; `railway run` env wins in prod (dotenv doesn't override)
import { Workbook, Worksheet } from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../src/prisma/prisma.service';
import { ReportsService } from '../src/reports/reports.service';
import { ReportsExcelService } from '../src/reports/reports-excel.service';
import { ReportsOverviewService } from '../src/reports/reports-overview.service';
import { ReportsAttendanceAnalyticsService } from '../src/reports/reports-attendance-analytics.service';
import { ReportsFinancialService } from '../src/reports/reports-financial.service';
import { ReportsPaymentsService } from '../src/reports/reports-payments.service';
import { ReportsTeacherChangesService } from '../src/reports/reports-teacher-changes.service';
import { ReportsProfitLossService } from '../src/reports/reports-profit-loss.service';
import { ReportsBalanceSheetService } from '../src/reports/reports-balance-sheet.service';
import { ReportsExpectationService } from '../src/reports/reports-expectation.service';
import { ReportsStudentFlowService } from '../src/reports/reports-student-flow.service';
import { HolidaysService } from '../src/holidays/holidays.service';
import { ExpensesService } from '../src/expenses/expenses.service';
import { SalaryService } from '../src/salary/salary.service';
import { SalaryMonthlyService } from '../src/salary/salary-monthly.service';
import { SalaryStaffMonthlyService } from '../src/salary/salary-monthly-staff.service';
import { PaymentsDebtorsService } from '../src/payments/payments-debtors.service';

// ── The period under test ───────────────────────────────────────────────────
const MONTH_START = '2026-07-01';
const MONTH_END = '2026-07-31';
const MONTH_LABEL = 'Iyul 2026';
const NEXT_MONTH_LABEL = 'Avgust 2026';
const MEASURED_ON = '2026-08-06';

const SHEETS = [
  'Xulosa',
  'Oylar',
  'Filiallar',
  'Oyliklar',
  'Xarajatlar',
  "To'lovlar",
  "O'quvchilar",
  'Davomat',
  'Xonalar bandligi',
  'Izoh',
];

/** A cell holding any of these is a rendering bug leaking into the reader's face. */
const FORBIDDEN = ['undefined', 'NaN', 'null', '[object Object]'];

/**
 * Sheets whose every cell is text this codebase WROTE — labels, month names,
 * category names, izoh lines, plus figures. Cyrillic here is a defect in the
 * report's own vocabulary and fails the run.
 *
 * The line-item sheets are deliberately excluded. They echo student, teacher
 * and expense text exactly as staff typed it into the database, and production
 * genuinely holds Cyrillic-spelled student names. A report that transliterated
 * somebody's name would be falsifying a record, so those hits are reported as a
 * warning naming every cell — a data-cleanup list, not a workbook defect.
 */
const NARRATIVE_SHEETS = new Set(['Xulosa', 'Oylar', 'Filiallar', 'Izoh']);

// ── Expected figures, «Xulosa» sheet, column 1 = label / column 2 = value ────

interface Expectation {
  label: string;
  expected: number | string;
  /** Why this figure may (or may not) legitimately differ from the measurement. */
  izoh: string;
}

/** A mismatch here is a real failure — these cannot move without a reversal. */
const QOTIRILGAN: Expectation[] = [
  {
    label: 'Jami tushgan pul',
    expected: 170_378_987,
    izoh: "Iyulda kassaga kirgan pul — yopilgan oy, faqat to'lov bekor qilinsa o'zgaradi.",
  },
  {
    label: `${MONTH_LABEL}ning o'z puli`,
    expected: 142_064_938,
    izoh: "Shu pulning iyul darslariga tegishli qismi — u ham yopilgan.",
  },
  {
    label: '−  Xarajatlar (ijara, marketing, kommunal…)',
    expected: 41_773_000,
    izoh: "O'tgan oyning xarajatlari kiritilib bo'lingan.",
  },
  {
    label: `Darsga qatnashdi (${MONTH_LABEL})`,
    expected: 444,
    izoh: "O'tgan oyning davomati o'zgarmaydi.",
  },
];

/** These grow when a July debtor pays later — print the delta, never fail. */
const JONLI: Expectation[] = [
  {
    label: "O'tilgan darslar qiymati",
    expected: 173_783_991,
    izoh: "Kechikkan to'lov darsning o'z oyiga yoziladi, shuning uchun o'sadi.",
  },
  {
    label: '−  Ustoz oyligi (jami hisoblangan)',
    expected: 95_834_547,
    izoh: "Qoplangan dars ko'paygani sari ustoz oyligi ham o'sadi.",
  },
  {
    label: "o'quvchilar to'lagan qismi",
    expected: 80_321_275,
    izoh: "Yuqoridagi oylikning ichki bo'linishi — u bilan birga siljiydi.",
  },
  {
    label: "markaz qo'shimchasi",
    expected: 15_513_272,
    izoh: "Qarzdor to'laganda markaz qo'shimchasi qoplanadi va kamayadi.",
  },
  {
    label: '=  SOF FOYDA',
    expected: 35_976_444,
    izoh: "Yuqoridagi ikki jonli raqamdan chiqadi.",
  },
  {
    label: `=  ${MONTH_LABEL.toUpperCase()}NING O'Z FOYDASI`,
    expected: 4_257_391,
    izoh: "O'z puli qotirilgan, lekin oylik jonli — shuning uchun siljishi mumkin.",
  },
  {
    label: "Hali to'lanmay qolgan",
    expected: "Yo'q — hammasi to'langan",
    izoh: "Bekor qilingan to'lov bu qatorni qaytadan ochib yuborishi mumkin.",
  },
  {
    label: "Guruhda o'qiyapti",
    expected: 427,
    izoh: "«Bugungi» holat — har kuni o'zgaradi.",
  },
  {
    label: "Guruhsiz (statusi faol, guruhi yo'q)",
    expected: 76,
    izoh: "«Bugungi» holat — har kuni o'zgaradi.",
  },
];

// ── Small output helpers (Latin Uzbek only) ─────────────────────────────────

function num(n: number): string {
  const sign = n < 0 ? '-' : '';
  return sign + Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function show(v: unknown): string {
  return typeof v === 'number' ? num(v) : `«${String(v)}»`;
}

const pad = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));

// ── Verdict collection ──────────────────────────────────────────────────────

let frozenFails = 0;
let structuralFails = 0;
let drifted = 0;
let matched = 0;
let warnings = 0;

function ok(line: string): void {
  matched++;
  console.log(`  MOS       ${line}`);
}

function drift(line: string): void {
  drifted++;
  console.log(`  SILJIDI   ${line}`);
}

function fail(line: string, structural: boolean): void {
  if (structural) structuralFails++;
  else frozenFails++;
  console.log(`  XATO      ${line}`);
}

/** Something a human should fix in the DATA — never a reason to fail the run. */
function warn(line: string): void {
  warnings++;
  console.log(`  DIQQAT    ${line}`);
}

// ── Workbook reading ────────────────────────────────────────────────────────

/** Column-2 value of the FIRST row on `sheet` whose column 1 equals `label`. */
function rowValue(wb: Workbook, sheet: string, label: string): unknown {
  const ws = wb.getWorksheet(sheet);
  if (!ws) return undefined;
  let found: unknown;
  let hit = false;
  ws.eachRow((r) => {
    if (!hit && String(r.getCell(1).value ?? '') === label) {
      hit = true;
      found = r.getCell(2).value;
    }
  });
  return hit ? found : undefined;
}

/** Numeric column-2 value, or 0 when the row is absent (an optional row). */
function optionalNumber(wb: Workbook, sheet: string, label: string): number {
  const v = rowValue(wb, sheet, label);
  return typeof v === 'number' ? v : 0;
}

/**
 * Plain text of a cell. Only STRING content is returned — a null cell would
 * stringify to the literal "null" and trip the forbidden-word scan on nothing.
 */
function cellText(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const v = value as any;
    if (Array.isArray(v.richText)) return v.richText.map((t: any) => t.text).join('');
    if (typeof v.text === 'string') return v.text;
    if (typeof v.result === 'string') return v.result;
  }
  return null;
}

interface CellHit {
  sheet: string;
  address: string;
  text: string;
}

/** Walks every cell of every sheet once, collecting the two content defects. */
function scanCells(wb: Workbook): { forbidden: CellHit[]; cyrillic: CellHit[] } {
  const forbidden: CellHit[] = [];
  const cyrillic: CellHit[] = [];
  const CYRILLIC = /[Ѐ-ԯ]/;
  wb.eachSheet((ws: Worksheet) => {
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        // A non-finite number stringifies to "NaN"/"Infinity" in Excel too.
        if (typeof cell.value === 'number' && !Number.isFinite(cell.value)) {
          forbidden.push({ sheet: ws.name, address: cell.address, text: String(cell.value) });
          return;
        }
        const text = cellText(cell.value);
        if (text == null) return;
        for (const bad of FORBIDDEN) {
          if (text.includes(bad)) {
            forbidden.push({ sheet: ws.name, address: cell.address, text });
            break;
          }
        }
        if (CYRILLIC.test(text)) {
          cyrillic.push({ sheet: ws.name, address: cell.address, text });
        }
      });
    });
  });
  return { forbidden, cyrillic };
}

// ── Checks ──────────────────────────────────────────────────────────────────

function checkFigures(wb: Workbook, list: Expectation[], live: boolean): void {
  for (const e of list) {
    const got = rowValue(wb, 'Xulosa', e.label);
    const head = `${pad(e.label, 44)} kutilgan ${pad(show(e.expected), 14)}`;
    if (got === undefined) {
      // A missing row is a STRUCTURAL defect whichever list it sits in — the
      // sheet no longer carries the line the director is meant to read.
      fail(`${head} — qator topilmadi`, true);
      continue;
    }
    if (got === e.expected) {
      ok(`${head} o'lchandi ${show(got)}`);
      continue;
    }
    const delta =
      typeof got === 'number' && typeof e.expected === 'number'
        ? `  (Δ ${got >= e.expected ? '+' : ''}${num(got - e.expected)})`
        : '';
    const line = `${head} o'lchandi ${show(got)}${delta}`;
    if (live) drift(`${line}\n            ${e.izoh}`);
    else fail(`${line}\n            ${e.izoh}`, false);
  }
}

function checkSheets(wb: Workbook): void {
  const names = wb.worksheets.map((w) => w.name);
  if (names.length === SHEETS.length && names.every((n, i) => n === SHEETS[i])) {
    ok(`Varaqlar ro'yxati aynan kutilgandek (${names.length} ta)`);
  } else {
    fail(`Varaqlar ro'yxati mos emas\n            kutilgan: ${SHEETS.join(', ')}\n            o'lchandi: ${names.join(', ')}`, true);
  }
}

function checkContent(wb: Workbook): void {
  const { forbidden, cyrillic } = scanCells(wb);
  if (forbidden.length === 0) {
    ok(`Hech bir katakda ${FORBIDDEN.map((f) => `'${f}'`).join(' / ')} yo'q`);
  } else {
    const sample = forbidden.slice(0, 5).map((h) => `${h.sheet}!${h.address} = ${h.text}`);
    fail(`${forbidden.length} ta katakda taqiqlangan matn bor\n            ${sample.join('\n            ')}`, true);
  }
  const own = cyrillic.filter((h) => NARRATIVE_SHEETS.has(h.sheet));
  const data = cyrillic.filter((h) => !NARRATIVE_SHEETS.has(h.sheet));
  const narrative = [...NARRATIVE_SHEETS].join(', ');
  if (own.length === 0) {
    ok(`Hisobotning o'z matnida kirill harfi yo'q (${narrative})`);
  } else {
    const sample = own.map((h) => `${h.sheet}!${h.address} = ${h.text}`);
    fail(`${own.length} ta katakda kirill harfi bor\n            ${sample.join('\n            ')}`, true);
  }
  if (data.length > 0) {
    const list = data.map((h) => `${h.sheet}!${h.address} = ${h.text}`);
    warn(
      `${data.length} ta katakda kirill harfi bor — bazaga kirill bilan kiritilgan matn, hisobot uni o'zgartirmaydi (tozalash kerak)\n            ${list.join('\n            ')}`,
    );
  }
}

/**
 * Block 4's four rows must foot to its own total. The «Hali to'lanmay qolgan»
 * row renders the good case as words rather than a bare 0, so a non-numeric
 * value there IS zero.
 */
function checkBlock4(wb: Workbook): void {
  const parts = [
    `${MONTH_LABEL} ichida to'langan`,
    `${MONTH_LABEL}dan oldin to'langan (balansdagi pul)`,
    `${NEXT_MONTH_LABEL}da to'langan (kechikkan)`,
    "Hali to'lanmay qolgan",
  ];
  const totalLabel = `${MONTH_LABEL} darslari qiymati`;
  const values: number[] = [];
  for (const label of parts) {
    const v = rowValue(wb, 'Xulosa', label);
    if (v === undefined) {
      fail(`4-blok: «${label}» qatori topilmadi`, true);
      return;
    }
    values.push(typeof v === 'number' ? v : 0);
  }
  const total = rowValue(wb, 'Xulosa', totalLabel);
  if (typeof total !== 'number') {
    fail(`4-blok: «${totalLabel}» jami qatori topilmadi`, true);
    return;
  }
  const sum = values.reduce((a, b) => a + b, 0);
  if (sum === total) {
    ok(`4-blok qatorlari jamiga teng (${num(sum)})`);
  } else {
    fail(`4-blok qatorlari jamiga teng emas: ${num(sum)} ≠ ${num(total)} (Δ ${num(sum - total)})`, true);
  }
}

/** Σ(filiallar) must equal the company figures «Xulosa» prints. */
function checkBranchTotals(wb: Workbook): void {
  const ws = wb.getWorksheet('Filiallar');
  if (!ws) {
    fail("«Filiallar» varag'i yo'q", true);
    return;
  }
  let jami: any = null;
  ws.eachRow((r) => {
    if (!jami && String(r.getCell(1).value ?? '') === 'Jami') jami = r;
  });
  if (!jami) {
    fail("«Filiallar» varag'ida «Jami» qatori topilmadi", true);
    return;
  }
  const cell = (c: number) => {
    const v = jami.getCell(c).value;
    return typeof v === 'number' ? v : NaN;
  };
  // Column 4 carries teacher + admin pay together, so the Xulosa side adds its
  // two payroll lines. «Xodimlar oyligi» is only printed when non-zero.
  const pairs: Array<[string, number, number]> = [
    ["O'tilgan darslar qiymati", cell(2), optionalNumber(wb, 'Xulosa', "O'tilgan darslar qiymati")],
    ['Kassaga tushgan pul', cell(3), optionalNumber(wb, 'Xulosa', 'Jami tushgan pul')],
    [
      'Ustoz + xodimlar oyligi',
      cell(4),
      optionalNumber(wb, 'Xulosa', '−  Ustoz oyligi (jami hisoblangan)') +
        optionalNumber(wb, 'Xulosa', '−  Xodimlar oyligi'),
    ],
    ['Xarajat', cell(5), optionalNumber(wb, 'Xulosa', '−  Xarajatlar (ijara, marketing, kommunal…)')],
    ['Qaytarilgan', cell(6), optionalNumber(wb, 'Xulosa', "−  O'quvchilarga qaytarilgan")],
    ['SOF FOYDA', cell(7), optionalNumber(wb, 'Xulosa', '=  SOF FOYDA')],
    ["Guruhda o'qiyapti", cell(9), optionalNumber(wb, 'Xulosa', "Guruhda o'qiyapti")],
  ];
  for (const [name, branchSum, summary] of pairs) {
    if (branchSum === summary) {
      ok(`Filiallar «Jami» = Xulosa · ${pad(name, 26)} ${num(summary)}`);
    } else {
      fail(
        `Filiallar «Jami» ≠ Xulosa · ${pad(name, 26)} filiallar ${num(branchSum)} ≠ xulosa ${num(summary)} (Δ ${num(branchSum - summary)})`,
        true,
      );
    }
  }
}

// ── Wiring ──────────────────────────────────────────────────────────────────

/**
 * Builds the REAL ReportsService the HTTP path uses, hand-wired against a
 * PrismaClient instead of Nest DI, so this check exercises the same
 * orchestration a CEO's "Excel yuklab olish" click does. Deps the workbook
 * never touches are left null — a wrong assumption there fails loudly with a
 * TypeError rather than silently reporting a different number.
 */
function buildExcelService(prisma: PrismaService): ReportsExcelService {
  // A no-op cache → always compute fresh (get miss, setex discarded), so the
  // script needs no live Redis and can never read a stale cached figure.
  const redis: any = { get: async () => null, setex: async () => undefined };

  const financial = new ReportsFinancialService(prisma as any);
  const payments = new ReportsPaymentsService(prisma as any);
  const profitLoss = new ReportsProfitLossService(prisma as any);
  const balanceSheet = new ReportsBalanceSheetService(prisma as any);
  const overview = new ReportsOverviewService(prisma as any, redis);
  const attendance = new ReportsAttendanceAnalyticsService(prisma as any, redis);
  const teacherChanges = new ReportsTeacherChangesService(prisma as any);
  const studentFlow = new ReportsStudentFlowService(prisma as any);
  const holidays = new HolidaysService(prisma as any, null as any, null as any, null as any);
  const expectation = new ReportsExpectationService(prisma as any, holidays, redis);
  const expenses = new ExpensesService(prisma as any, null as any, null as any);
  const salaryMonthly = new SalaryMonthlyService(
    prisma as any,
    new SalaryStaffMonthlyService(prisma as any),
  );
  const salary = new SalaryService(
    null as any, // config
    null as any, // accrual
    null as any, // summary
    null as any, // overview
    salaryMonthly,
    null as any, // calculation
    null as any, // payment
    null as any, // settleMonth
  );
  const debtors = new PaymentsDebtorsService(prisma as any);

  const reports = new ReportsService(
    overview,
    attendance,
    financial,
    payments,
    null as any, // teacherPayments
    null as any, // studentPayments
    null as any, // departedStudents
    null as any, // departedLists
    null as any, // departedReasons
    teacherChanges,
    null as any, // centerActivity
    profitLoss,
    null as any, // cashFlow
    balanceSheet,
    expenses,
    null as any, // salaryPayments
    salary,
    debtors,
    redis,
    expectation,
    null as any, // expectationHistory
    studentFlow,
  );

  return new ReportsExcelService(reports);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();

  const company = await prisma.company.findFirst({ select: { id: true, name: true } });
  if (!company) throw new Error('Kompaniya topilmadi');
  const branches = await prisma.branch.findMany({
    where: { companyId: company.id, deletedAt: null },
    select: { id: true, name: true },
  });
  const branchNames: Record<number, string> = Object.fromEntries(
    branches.map((b) => [b.id, b.name]),
  );
  // A CEO id → the salary sheet spans every branch, matching the CEO's own view.
  const ceo = await prisma.user.findFirst({
    where: {
      companyId: company.id,
      deletedAt: null,
      roles: { some: { role: { name: 'CEO' } } },
    },
    select: { id: true },
  });

  const dbHost = (() => {
    try {
      return new URL(process.env.DATABASE_URL ?? '').host;
    } catch {
      return "noma'lum";
    }
  })();

  console.log('='.repeat(78));
  console.log(`HISOBOT PRE-FLIGHT — ${MONTH_LABEL}, butun kompaniya (faqat o'qish)`);
  console.log(`Baza:      ${dbHost}`);
  console.log(`Kompaniya: ${company.name} (#${company.id}), filiallar: ${branches.length}`);
  console.log(`Kutilgan raqamlar ${MEASURED_ON} kuni PRODUCTION'dan o'lchangan`);
  console.log('='.repeat(78));

  const buffer = await buildExcelService(prisma).generate(company.id, {
    branchIds: null, // company-wide, the CEO view
    startDate: MONTH_START,
    endDate: MONTH_END,
    companyName: company.name,
    branchLabel: 'Barcha filiallar',
    branchNames,
    performedById: ceo?.id ?? 0,
    include: [],
  });

  const wb = new Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);

  console.log("\n--- 1. QOTIRILGAN RAQAMLAR (o'zgarmasligi shart) ---");
  checkFigures(wb, QOTIRILGAN, false);

  console.log("\n--- 2. JONLI RAQAMLAR (o'zgarishi mumkin — faqat farq ko'rsatiladi) ---");
  checkFigures(wb, JONLI, true);

  console.log('\n--- 3. TUZILISH ---');
  checkSheets(wb);
  checkContent(wb);
  checkBlock4(wb);
  checkBranchTotals(wb);

  // The workbook itself, so the same file can be opened by eye.
  const outDir = path.join(__dirname, '..', 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `preflight-${MONTH_START}_${MONTH_END}.xlsx`);
  fs.writeFileSync(outPath, buffer);

  console.log('\n' + '='.repeat(78));
  console.log(`Fayl:   ${outPath}  (${(buffer.length / 1024).toFixed(1)} KB)`);
  console.log(`Mos:    ${matched} ta`);
  console.log(`Siljidi: ${drifted} ta (jonli raqam — xato emas)`);
  console.log(`Diqqat: ${warnings} ta (baza ma'lumoti — xato emas)`);
  console.log(`Xato:   ${frozenFails} ta qotirilgan raqam, ${structuralFails} ta tuzilish`);
  const bad = frozenFails + structuralFails;
  console.log(bad === 0 ? 'NATIJA: MUVAFFAQIYATLI' : 'NATIJA: MUVAFFAQIYATSIZ');
  console.log('='.repeat(78));

  await prisma.$disconnect();
  if (bad > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
