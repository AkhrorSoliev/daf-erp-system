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
 * July 2026, company-wide. Each row carries its OWN drift rule (`drift`),
 * because the figures do not age alike — treating them alike would either make
 * the script cry wolf every day or let a regression through unnoticed:
 *
 *   frozen       — a closed month's cash, expenses and attendance. Only a
 *                  reversal can move these, so any difference is a failure.
 *   monotone-up  — recognised lesson value and the salary it covers. When a
 *                  July debtor pays in August, retroactive billing writes the
 *                  consumption dated to the LESSON, so July's figure GROWS
 *                  after the fact. That mechanism only ever adds: a DECREASE
 *                  means a reversal or a code regression, and fails the run.
 *   band         — figures derived from both a growing revenue and a growing
 *                  cost (the two profit lines), and today's roster counts.
 *                  Direction is not guaranteed, so the bound is a tolerance
 *                  around the recorded value; outside it, the run fails.
 *   report-only  — «Hali to'lanmay qolgan», whose all-paid value is a sentence
 *                  rather than a number, so no band can be drawn around it.
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
import { buildExcelService } from './build-report-services';

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
 * Cells that echo text staff typed into the DATABASE, by sheet and COLUMN
 * index. Cyrillic there is reported as a warning naming every cell — a
 * data-cleanup list, not a workbook defect: production genuinely holds
 * Cyrillic-spelled student names, and a report that transliterated somebody's
 * name would be falsifying a financial record.
 *
 * Everywhere else — every other column of these sheets included — Cyrillic is
 * a defect in the report's OWN vocabulary (a column header, a «Jami» row, a
 * category or status label, a footer) and HARD-FAILS. Exempting whole sheets,
 * as this check first did, would have hidden exactly the bug it exists for.
 *
 * Column indices are read off the sheet builders, not guessed:
 *   To'lovlar  (reports-excel.detail-sheets.ts, paymentsSheet)  3 = O'quvchi,
 *              8 = Qabul qildi — both person names.
 *   Xarajatlar (expensesSheet)  5 = Izoh (free text), 7 = Ustoz,
 *              8 = Kim kiritdi.
 *   Oyliklar   (salariesSheet)  1 = Ustoz/Xodim name, 2 = Lavozim (free text).
 * «O'quvchilar» carries no database text at all — it is pure counts and
 * report-authored labels (reports-excel.students-sheet.ts), so it stays fully
 * hard-failing. Branch, room and group NAMES are deliberately NOT exempt: the
 * centre authored those and can respell them, and «Filiallar» already holds
 * branch names under a hard failure.
 *
 * The residual: column 1 of «Oyliklar» also carries its «Jami» and section
 * labels, so a Cyrillic one there would only warn. Narrowing further would
 * mean tracking row ranges through the builders, which is a heavier coupling
 * than the bug is worth.
 */
const DB_TEXT_COLUMNS: Record<string, number[]> = {
  "To'lovlar": [3, 8],
  Xarajatlar: [5, 7, 8],
  Oyliklar: [1, 2],
};

// ── Expected figures, «Xulosa» sheet, column 1 = label / column 2 = value ────

/**
 * How far this figure may legitimately move away from the recorded value.
 *   frozen       — not at all.
 *   monotone-up  — upwards only; a decrease is a reversal or a regression.
 *   band         — either way, up to `tolerance` (a fraction of the recorded
 *                  value); outside it, the run fails.
 *   report-only  — no bound can be drawn (the value is a sentence).
 */
type Drift =
  | { kind: 'frozen' }
  | { kind: 'monotone-up' }
  | { kind: 'band'; tolerance: number }
  | { kind: 'report-only' };

interface Expectation {
  label: string;
  expected: number | string;
  drift: Drift;
  /** Why this figure may (or may not) legitimately differ from the measurement. */
  izoh: string;
}

const FROZEN: Drift = { kind: 'frozen' };
const GROWS: Drift = { kind: 'monotone-up' };
/** Profit lines: revenue and cost both grow, so the net can move either way. */
const PROFIT_BAND: Drift = { kind: 'band', tolerance: 0.05 };
/** Roster counts are «today» figures — they move with every enrolment. */
const ROSTER_BAND: Drift = { kind: 'band', tolerance: 0.15 };

const KUTILGAN: Expectation[] = [
  {
    label: 'Jami tushgan pul',
    expected: 170_378_987,
    drift: FROZEN,
    izoh: "Iyulda kassaga kirgan pul — yopilgan oy, faqat to'lov bekor qilinsa o'zgaradi.",
  },
  {
    label: `${MONTH_LABEL}ning o'z puli`,
    expected: 142_064_938,
    drift: FROZEN,
    izoh: "Shu pulning iyul darslariga tegishli qismi — u ham yopilgan.",
  },
  {
    label: '−  Xarajatlar (ijara, marketing, kommunal…)',
    expected: 41_773_000,
    drift: FROZEN,
    izoh: "O'tgan oyning xarajatlari kiritilib bo'lingan.",
  },
  {
    label: `Darsga qatnashdi (${MONTH_LABEL})`,
    expected: 444,
    drift: FROZEN,
    izoh: "O'tgan oyning davomati o'zgarmaydi.",
  },
  {
    label: "O'tilgan darslar qiymati",
    expected: 173_783_991,
    drift: GROWS,
    izoh: "Kechikkan to'lov darsning o'z oyiga yoziladi — faqat o'sadi, kamaymaydi.",
  },
  {
    label: '−  Ustoz oyligi (jami hisoblangan)',
    expected: 95_834_547,
    drift: GROWS,
    izoh: "Qoplangan dars ko'paygani sari ustoz oyligi ham o'sadi; kamayishi mumkin emas.",
  },
  {
    label: "o'quvchilar to'lagan qismi",
    expected: 80_321_275,
    drift: GROWS,
    izoh: "Qarzdor to'lagan sari o'quvchilar qoplagan ulush faqat ortadi.",
  },
  {
    // NOT monotone: for a month whose payroll is still being settled the
    // centre's leg carries a forecast sweep, and a debtor paying moves that
    // slice over to «o'quvchilar to'lagan». Its parent line above IS asserted
    // monotone, so a regression in the pair still has to get past a hard bound.
    label: "markaz qo'shimchasi",
    expected: 15_513_272,
    drift: PROFIT_BAND,
    izoh: "Qarzdor to'laganda markaz qo'shimchasi qoplanib kamayishi ham mumkin.",
  },
  {
    label: '=  SOF FOYDA',
    expected: 35_976_444,
    drift: PROFIT_BAND,
    izoh: "Daromad ham, ustoz oyligi ham o'sadi — sof foyda ikki tomonga siljiydi.",
  },
  {
    label: `=  ${MONTH_LABEL.toUpperCase()}NING O'Z FOYDASI`,
    expected: 4_257_391,
    drift: PROFIT_BAND,
    izoh: "O'z puli qotirilgan, lekin oylik o'sadi — shuning uchun ikki tomonga siljiydi.",
  },
  {
    label: "Hali to'lanmay qolgan",
    expected: "Yo'q — hammasi to'langan",
    drift: { kind: 'report-only' },
    izoh: "Hammasi to'langanda bu qator raqam emas, jumla — chegara qo'yib bo'lmaydi.",
  },
  {
    label: "Guruhda o'qiyapti",
    expected: 427,
    drift: ROSTER_BAND,
    izoh: "«Bugungi» holat — har kuni o'zgaradi.",
  },
  {
    label: "Guruhsiz (statusi faol, guruhi yo'q)",
    expected: 76,
    drift: ROSTER_BAND,
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

let figureFails = 0;
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
  else figureFails++;
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

/**
 * «Xulosa» rows that are printed only when non-zero. Every OTHER label must
 * exist: a renamed or dropped row read as 0 would make the Filiallar tie pass
 * vacuously — 0 on both sides proves nothing, and the tie is the check that
 * catches money falling through an unattributed branch.
 */
const OPTIONAL_SUMMARY_ROWS = new Set([
  '−  Xodimlar oyligi',
  "−  O'quvchilarga qaytarilgan",
]);

/**
 * Numeric column-2 value of a «Xulosa» row. A missing row is a structural
 * failure unless the label is legitimately conditional; NaN then propagates
 * into the comparison so the tie can never read as satisfied.
 */
function summaryNumber(wb: Workbook, label: string): number {
  const v = rowValue(wb, 'Xulosa', label);
  if (v === undefined) {
    if (OPTIONAL_SUMMARY_ROWS.has(label)) return 0;
    fail(`Xulosa · «${label}» qatori topilmadi — solishtirish mumkin emas`, true);
    return NaN;
  }
  return typeof v === 'number' ? v : NaN;
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
  /** 1-based column, so a hit can be judged against DB_TEXT_COLUMNS. */
  column: number;
  text: string;
}

/** Walks every cell of every sheet once, collecting the two content defects. */
function scanCells(wb: Workbook): { forbidden: CellHit[]; cyrillic: CellHit[] } {
  const forbidden: CellHit[] = [];
  const cyrillic: CellHit[] = [];
  // Escaped on purpose: a file whose job is finding Cyrillic should not carry
  // Cyrillic characters of its own. U+0400–U+052F = Cyrillic + Supplement.
  const CYRILLIC = /[Ѐ-ԯ]/;
  wb.eachSheet((ws: Worksheet) => {
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const at = { sheet: ws.name, address: cell.address, column: Number(cell.col) };
        // A non-finite number stringifies to "NaN"/"Infinity" in Excel too.
        if (typeof cell.value === 'number' && !Number.isFinite(cell.value)) {
          forbidden.push({ ...at, text: String(cell.value) });
          return;
        }
        const text = cellText(cell.value);
        if (text == null) return;
        for (const bad of FORBIDDEN) {
          if (text.includes(bad)) {
            forbidden.push({ ...at, text });
            break;
          }
        }
        if (CYRILLIC.test(text)) {
          cyrillic.push({ ...at, text });
        }
      });
    });
  });
  return { forbidden, cyrillic };
}

/** True when the cell is one the DATABASE fills in, not the report. */
function echoesDatabaseText(hit: CellHit): boolean {
  return (DB_TEXT_COLUMNS[hit.sheet] ?? []).includes(hit.column);
}

// ── Checks ──────────────────────────────────────────────────────────────────

/** Human wording of a row's drift rule, printed next to every verdict. */
function ruleText(d: Drift): string {
  switch (d.kind) {
    case 'frozen':
      return "qoida: qotirilgan — o'zgarishi mumkin emas";
    case 'monotone-up':
      return "qoida: faqat o'sishi mumkin";
    case 'band':
      return `qoida: ±${Math.round(d.tolerance * 100)}% chegara`;
    case 'report-only':
      return 'qoida: faqat xabar beriladi';
  }
}

/**
 * Applies ONE row's own drift rule. Returns the verdict; the caller prints it.
 * A rule violation is a figure failure (exit 1) — that is the whole point of
 * bounding the live figures instead of releasing them.
 */
function judge(
  e: Expectation,
  got: unknown,
): { verdict: 'mos' | 'siljidi' | 'xato'; sabab?: string } {
  if (got === e.expected) return { verdict: 'mos' };
  if (e.drift.kind === 'report-only') return { verdict: 'siljidi' };
  if (e.drift.kind === 'frozen') {
    return { verdict: 'xato', sabab: e.izoh };
  }
  if (typeof got !== 'number' || typeof e.expected !== 'number') {
    // A number turning into text (or the reverse) is a rendering change, never
    // ordinary drift — no rule below can be applied to it.
    return { verdict: 'xato', sabab: "Qiymat turi o'zgargan (raqam ↔ matn)." };
  }
  if (e.drift.kind === 'monotone-up') {
    if (got > e.expected) return { verdict: 'siljidi' };
    return {
      verdict: 'xato',
      sabab:
        "KAMAYDI. Bu raqamni faqat kechikkan to'lov qimirlatadi, u esa faqat " +
        "qo'shadi. Kamayish — bekor qilingan yozuv yoki koddagi regressiya, oddiy siljish emas.",
    };
  }
  const limit = Math.abs(e.expected) * e.drift.tolerance;
  if (Math.abs(got - e.expected) <= limit) return { verdict: 'siljidi' };
  return {
    verdict: 'xato',
    sabab: `Ruxsat etilgan ±${Math.round(e.drift.tolerance * 100)}% (${num(Math.round(limit))}) chegarasidan chiqdi.`,
  };
}

function checkFigures(wb: Workbook, list: Expectation[]): void {
  for (const e of list) {
    const got = rowValue(wb, 'Xulosa', e.label);
    const head = `${pad(e.label, 44)} kutilgan ${pad(show(e.expected), 14)}`;
    if (got === undefined) {
      // A missing row is a STRUCTURAL defect whichever rule governs it — the
      // sheet no longer carries the line the director is meant to read.
      fail(`${head} — qator topilmadi`, true);
      continue;
    }
    const delta =
      typeof got === 'number' && typeof e.expected === 'number' && got !== e.expected
        ? `  (Δ ${got > e.expected ? '+' : ''}${num(got - e.expected)})`
        : '';
    const line = `${head} o'lchandi ${show(got)}${delta}`;
    const { verdict, sabab } = judge(e, got);
    if (verdict === 'mos') {
      ok(line);
    } else if (verdict === 'siljidi') {
      drift(`${line}\n            ${e.izoh}  [${ruleText(e.drift)}]`);
    } else {
      fail(`${line}\n            ${sabab}  [${ruleText(e.drift)}]`, false);
    }
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
  const own = cyrillic.filter((h) => !echoesDatabaseText(h));
  const data = cyrillic.filter(echoesDatabaseText);
  if (own.length === 0) {
    ok("Hisobotning o'z matnida kirill harfi yo'q (barcha varaqlar, bazadan kelgan ustunlardan tashqari)");
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
 *
 * Do not over-trust a green line here: «oldin to'langan» is computed as a
 * RESIDUAL, so three of the four rows collapse algebraically and what this
 * actually asserts is `recognizedRevenue === expectation.heldValue`. That is
 * still a worthwhile two-engine tie (the revenue leg and the expectation leg
 * are computed independently), but it is not four independent numbers footing.
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
    ["O'tilgan darslar qiymati", cell(2), summaryNumber(wb, "O'tilgan darslar qiymati")],
    ['Kassaga tushgan pul', cell(3), summaryNumber(wb, 'Jami tushgan pul')],
    [
      'Ustoz + xodimlar oyligi',
      cell(4),
      summaryNumber(wb, '−  Ustoz oyligi (jami hisoblangan)') +
        summaryNumber(wb, '−  Xodimlar oyligi'),
    ],
    ['Xarajat', cell(5), summaryNumber(wb, '−  Xarajatlar (ijara, marketing, kommunal…)')],
    ['Qaytarilgan', cell(6), summaryNumber(wb, "−  O'quvchilarga qaytarilgan")],
    ['SOF FOYDA', cell(7), summaryNumber(wb, '=  SOF FOYDA')],
    ["Guruhda o'qiyapti", cell(9), summaryNumber(wb, "Guruhda o'qiyapti")],
  ];
  for (const [name, branchSum, summary] of pairs) {
    // NaN === NaN is false, so a row that could not be read can never tie.
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

  // Printed in two sections purely for readability — the rule that judges each
  // line comes from the row itself, not from the section it is printed under.
  console.log("\n--- 1. QOTIRILGAN RAQAMLAR (o'zgarmasligi shart) ---");
  checkFigures(wb, KUTILGAN.filter((e) => e.drift.kind === 'frozen'));

  console.log('\n--- 2. CHEGARALANGAN RAQAMLAR (siljishi mumkin, lekin chegara bilan) ---');
  checkFigures(wb, KUTILGAN.filter((e) => e.drift.kind !== 'frozen'));

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
  console.log(`Siljidi: ${drifted} ta (chegara ichida — xato emas)`);
  console.log(`Diqqat: ${warnings} ta (baza ma'lumoti — xato emas)`);
  console.log(`Xato:   ${figureFails} ta raqam, ${structuralFails} ta tuzilish`);
  const bad = figureFails + structuralFails;
  console.log(bad === 0 ? 'NATIJA: MUVAFFAQIYATLI' : 'NATIJA: MUVAFFAQIYATSIZ');
  console.log('='.repeat(78));

  await prisma.$disconnect();
  if (bad > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
