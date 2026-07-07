/**
 * export-june-salary-excel — READ-ONLY. Builds an Excel (.xlsx) salary report
 * for a single month (default Iyun 2026 = "2026-06").
 *
 * Sheet 1 "Umumiy" — one row per teacher: lessons given + amount to pay
 *   (covered = students-paid portion; top-up / center gap is EXCLUDED, matching
 *   how June is actually paid — full-deserved top-up only starts July 2026).
 * Per-teacher sheets — "pul qayerdan kelgani": every accrual (student × lesson)
 *   that funded the teacher's pay, grouped by student, with a full detail table.
 *
 * The covered / period math mirrors SalaryMonthlyService.getMonthly + the
 * carry-over OR from salary-breakdown.service (creditPeriodDate | lessonDate).
 *
 * Usage:
 *   railway run npx ts-node scripts/export-june-salary-excel.ts            (prod, 2026-06)
 *   railway run npx ts-node scripts/export-june-salary-excel.ts 2026-06    (explicit month)
 *   npx ts-node scripts/export-june-salary-excel.ts                        (dev/.env)
 */
import ExcelJS from 'exceljs';
import * as path from 'path';
import * as fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { makePrisma, dbEnvLabel, dbHost, som } from './lib/check-cli';

// ── Tashkent period math (inlined from salary/shared/resolve-current-period) ──
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
const DEFAULT_CYCLE_START_DAY = 8;

function parseTashkentDateStart(input: string): Date {
  const utc = new Date(`${input}T00:00:00.000Z`);
  return new Date(utc.getTime() - TASHKENT_OFFSET_MS);
}

function computePeriodBounds(now: Date, cycleStartDay: number) {
  const t = new Date(now.getTime() + TASHKENT_OFFSET_MS);
  const y = t.getUTCFullYear();
  const m = t.getUTCMonth();
  const d = t.getUTCDate();
  let startT: Date;
  let endExclT: Date;
  if (d >= cycleStartDay) {
    startT = new Date(Date.UTC(y, m, cycleStartDay));
    endExclT = new Date(Date.UTC(y, m + 1, cycleStartDay));
  } else {
    startT = new Date(Date.UTC(y, m - 1, cycleStartDay));
    endExclT = new Date(Date.UTC(y, m, cycleStartDay));
  }
  const periodStart = new Date(startT.getTime() - TASHKENT_OFFSET_MS);
  const periodEnd = new Date(endExclT.getTime() - TASHKENT_OFFSET_MS - 1);
  return { periodStart, periodEnd };
}

const MONTH_LABELS: Record<string, string> = {
  '01': 'Yanvar', '02': 'Fevral', '03': 'Mart', '04': 'Aprel',
  '05': 'May', '06': 'Iyun', '07': 'Iyul', '08': 'Avgust',
  '09': 'Sentabr', '10': 'Oktabr', '11': 'Noyabr', '12': 'Dekabr',
};

// Tashkent calendar date of an instant. Safe for @db.Date lesson dates (UTC
// midnight + 5h stays the same calendar day) and fixes period-bound display,
// where periodStart/End are UTC instants of Tashkent midnight.
const day = (d: Date) =>
  new Date(new Date(d).getTime() + TASHKENT_OFFSET_MS).toISOString().slice(0, 10);

function rateLabel(v: { salaryType: string; value: number } | null): string {
  if (!v) return '—';
  if (v.salaryType === 'PERCENTAGE') return `${v.value}%`;
  if (v.salaryType === 'FIXED_PER_STUDENT') return `${som(v.value)}/sikl`;
  if (v.salaryType === 'FIXED_MONTHLY') return 'Belgilangan oylik';
  return v.salaryType;
}

function accrualNote(a: {
  creditPeriodDate: Date | null;
  attendanceId: string | null;
}): string {
  const parts: string[] = [];
  if (a.attendanceId == null) parts.push('Balans hisobidan');
  if (a.creditPeriodDate != null) parts.push('Oldingi oydan');
  return parts.join(', ');
}

// Excel sheet name: max 31 chars, no  \ / ? * [ ] :  — prefix with #id for uniqueness.
function sheetName(id: number, first: string, last: string): string {
  const raw = `${id} ${first} ${last}`.replace(/[\\/?*[\]:]/g, ' ').trim();
  return raw.length <= 31 ? raw : raw.slice(0, 31);
}

// ── styling helpers ─────────────────────────────────────────────────────────
const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1E3A5F' },
};
const SUBHEAD_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFDCE6F1' },
};
const TOTAL_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFFF2CC' },
};
const THIN = { style: 'thin' as const, color: { argb: 'FFB0B0B0' } };
const BORDER: Partial<ExcelJS.Borders> = {
  top: THIN, left: THIN, bottom: THIN, right: THIN,
};
const MONEY_FMT = '#,##0';

function styleHeaderRow(row: ExcelJS.Row) {
  row.eachCell((c) => {
    c.fill = HEADER_FILL;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    c.border = BORDER;
  });
  row.height = 26;
}

function borderRow(row: ExcelJS.Row) {
  row.eachCell((c) => (c.border = BORDER));
}

async function main(prisma: PrismaClient) {
  const argMonth = process.argv.slice(2).find((a) => /^\d{4}-\d{2}$/.test(a));
  const MONTH = argMonth ?? '2026-06';
  const [yy, mm] = MONTH.split('-');
  const monthTitle = `${MONTH_LABELS[mm] ?? mm} ${yy}`;

  console.log('═'.repeat(74));
  console.log(`  ${monthTitle} — oyliklar hisoboti (Excel)`);
  console.log(`  DB host: ${dbHost()}  [${dbEnvLabel()}]`);
  console.log('═'.repeat(74));

  // ── company + period ────────────────────────────────────────────────────
  const teachers = await prisma.user.findMany({
    where: {
      deletedAt: null,
      roles: { some: { role: { name: 'Teacher' } } },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      isActive: true,
      companyId: true,
      branches: { select: { branch: { select: { id: true, name: true } } } },
    },
  });
  if (teachers.length === 0) {
    console.log('Ustozlar topilmadi. Bekor qilindi.');
    return;
  }
  const companyIds = [...new Set(teachers.map((t) => t.companyId))];
  const companyId = companyIds[0];
  if (companyIds.length > 1) {
    console.log(
      `⚠ Bir nechta company topildi (${companyIds.join(', ')}). ${companyId} ishlatiladi.`,
    );
  }

  const asOf = parseTashkentDateStart(`${MONTH}-15`);
  const setting = await prisma.salaryPeriodSetting.findFirst({
    where: {
      companyId,
      effectiveFrom: { lte: asOf },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: asOf } }],
    },
    orderBy: { effectiveFrom: 'desc' },
    select: { cycleStartDay: true },
  });
  const cycleStartDay = setting?.cycleStartDay ?? DEFAULT_CYCLE_START_DAY;
  const { periodStart, periodEnd } = computePeriodBounds(asOf, cycleStartDay);
  console.log(
    `  Davr: ${day(periodStart)} → ${day(periodEnd)}  (cycleStartDay=${cycleStartDay})`,
  );

  const teacherMap = new Map(teachers.map((t) => [t.id, t]));
  const ids = teachers.map((t) => t.id);

  // ── accruals bucketed into the period (carry-over OR), non-reversed ───────
  const accruals = await prisma.salaryAccrual.findMany({
    where: {
      companyId,
      userId: { in: ids },
      reversedAt: null,
      OR: [
        { creditPeriodDate: { gte: periodStart, lte: periodEnd } },
        {
          creditPeriodDate: null,
          lessonDate: { gte: periodStart, lte: periodEnd },
        },
      ],
    },
    select: {
      id: true,
      userId: true,
      amount: true,
      perLessonCost: true,
      lessonDate: true,
      creditPeriodDate: true,
      attendanceId: true,
      groupId: true,
      student: { select: { id: true, firstName: true, lastName: true } },
      group: {
        select: {
          id: true,
          name: true,
          course: { select: { name: true, lessonPaymentCount: true } },
        },
      },
      salaryConfigVersion: { select: { salaryType: true, value: true } },
    },
    orderBy: [{ userId: 'asc' }, { lessonDate: 'asc' }],
  });

  // ── advances given in the calendar month (accounting date) ────────────────
  const [my, mnum] = MONTH.split('-').map(Number);
  const monthStart = new Date(Date.UTC(my, mnum - 1, 1));
  const nextMonthStart = new Date(Date.UTC(my, mnum, 1));
  const advAgg = await prisma.expense.groupBy({
    by: ['relatedUserId'],
    where: {
      relatedUserId: { in: ids },
      category: 'TEACHER_ADVANCE',
      companyId,
      deletedAt: null,
      date: { gte: monthStart, lt: nextMonthStart },
    },
    _sum: { amount: true },
  });
  const advByUser = new Map(
    advAgg.map((a) => [a.relatedUserId as number, a._sum.amount ?? 0]),
  );

  // ── per-teacher aggregation ───────────────────────────────────────────────
  type Acc = (typeof accruals)[number];
  const byTeacher = new Map<number, Acc[]>();
  for (const a of accruals) {
    const arr = byTeacher.get(a.userId) ?? [];
    arr.push(a);
    byTeacher.set(a.userId, arr);
  }

  // teachers relevant to this month = has accruals OR an advance
  const relevantIds = [
    ...new Set([...byTeacher.keys(), ...advByUser.keys()]),
  ].filter((id) => teacherMap.has(id));

  interface Row {
    id: number;
    name: string;
    branch: string;
    sessions: number; // distinct (group, lessonDate)
    units: number; // accrual rows (student × lesson)
    tuition: number; // O'quvchilar to'lagan — Σ perLessonCost (100% dars qiymati)
    earned: number; // Ustoz ishlagan — Σ accrual amount (ustoz ulushi)
    advance: number;
    net: number; // Beriladigan = earned − advance
  }
  const rows: Row[] = relevantIds.map((id) => {
    const t = teacherMap.get(id)!;
    const accs = byTeacher.get(id) ?? [];
    const earned = accs.reduce((s, a) => s + a.amount, 0);
    const tuition = accs.reduce((s, a) => s + (a.perLessonCost || 0), 0);
    const sessions = new Set(
      accs.map((a) => `${a.groupId}|${day(a.lessonDate)}`),
    ).size;
    const advance = advByUser.get(id) ?? 0;
    return {
      id,
      name: `${t.firstName} ${t.lastName}`,
      branch: t.branches[0]?.branch?.name ?? '—',
      sessions,
      units: accs.length,
      tuition,
      earned,
      advance,
      net: Math.max(0, earned - advance),
    };
  });
  rows.sort((a, b) => b.earned - a.earned || a.name.localeCompare(b.name));

  console.log(
    `  Ustozlar (faol): ${rows.length}   Accrual: ${accruals.length}   ` +
      `Jami ishlagan: ${som(rows.reduce((s, r) => s + r.earned, 0))} so'm   ` +
      `Jami beriladigan: ${som(rows.reduce((s, r) => s + r.net, 0))} so'm`,
  );

  // ── workbook ──────────────────────────────────────────────────────────────
  const wb = new ExcelJS.Workbook();
  wb.creator = 'DaF ERP';
  wb.created = asOf;

  // ===== Sheet 1: Umumiy =====
  const s1 = wb.addWorksheet('Umumiy', {
    views: [{ state: 'frozen', ySplit: 4 }],
  });
  s1.columns = [
    { width: 5 }, // №
    { width: 26 }, // Ustoz
    { width: 8 }, // ID
    { width: 18 }, // Filial
    { width: 14 }, // O'tilgan darslar
    { width: 24 }, // O'quvchilar to'lagan (100%)
    { width: 22 }, // Ustoz ishlagan (ulush)
    { width: 16 }, // Avans
    { width: 22 }, // Beriladigan
  ];

  s1.mergeCells('A1:I1');
  const t1 = s1.getCell('A1');
  t1.value = `${monthTitle} — Ustozlar oyliklari (umumiy ro‘yxat)`;
  t1.font = { bold: true, size: 15, color: { argb: 'FF1E3A5F' } };
  t1.alignment = { vertical: 'middle', horizontal: 'left' };
  s1.getRow(1).height = 28;

  s1.mergeCells('A2:I2');
  const t2 = s1.getCell('A2');
  t2.value =
    `Davr: ${day(periodStart)} → ${day(periodEnd)}   ·   ` +
    `Ustoz ishlagan = o‘quvchilar to‘lagan darslardan ustoz ulushi   ·   ` +
    `Beriladigan = Ustoz ishlagan − Avans   ·   DB: ${dbEnvLabel()}`;
  t2.font = { italic: true, size: 10, color: { argb: 'FF666666' } };
  s1.getRow(3).height = 4;

  const head1 = s1.addRow([
    '№',
    'Ustoz',
    'ID',
    'Filial',
    'O‘tilgan darslar',
    'O‘quvchilar to‘lagan (so‘m)',
    'Ustoz ishlagan (so‘m)',
    'Avans (so‘m)',
    'Beriladigan (so‘m)',
  ]);
  styleHeaderRow(head1);

  rows.forEach((r, i) => {
    const row = s1.addRow([
      i + 1,
      r.name,
      r.id,
      r.branch,
      r.sessions,
      r.tuition,
      r.earned,
      r.advance,
      r.net,
    ]);
    borderRow(row);
    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(3).alignment = { horizontal: 'center' };
    row.getCell(5).alignment = { horizontal: 'center' };
    [6, 7, 8, 9].forEach((c) => (row.getCell(c).numFmt = MONEY_FMT));
    // highlight the final "Beriladigan" column
    row.getCell(9).font = { bold: true, color: { argb: 'FF1B5E20' } };
    if (i % 2 === 1) {
      row.eachCell(
        (c) =>
          (c.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFF5F8FC' },
          }),
      );
    }
  });

  const totalRow = s1.addRow([
    '',
    'JAMI',
    '',
    '',
    rows.reduce((s, r) => s + r.sessions, 0),
    rows.reduce((s, r) => s + r.tuition, 0),
    rows.reduce((s, r) => s + r.earned, 0),
    rows.reduce((s, r) => s + r.advance, 0),
    rows.reduce((s, r) => s + r.net, 0),
  ]);
  totalRow.eachCell((c) => {
    c.fill = TOTAL_FILL;
    c.font = { bold: true };
    c.border = BORDER;
  });
  [6, 7, 8, 9].forEach((c) => (totalRow.getCell(c).numFmt = MONEY_FMT));
  totalRow.getCell(2).alignment = { horizontal: 'right' };

  // ===== Per-teacher sheets =====
  for (const r of rows) {
    const t = teacherMap.get(r.id)!;
    const accs = (byTeacher.get(r.id) ?? []).slice();
    const ws = wb.addWorksheet(sheetName(r.id, t.firstName, t.lastName), {
      views: [{ state: 'frozen', ySplit: 8 }],
    });
    ws.columns = [
      { width: 5 }, // №
      { width: 12 }, // Sana
      { width: 24 }, // O'quvchi
      { width: 20 }, // Guruh
      { width: 18 }, // Kurs
      { width: 14 }, // Dars narxi
      { width: 16 }, // Stavka
      { width: 14 }, // Summa
      { width: 20 }, // Izoh
    ];

    ws.mergeCells('A1:I1');
    const h = ws.getCell('A1');
    h.value = `${t.firstName} ${t.lastName}  ·  #${r.id}`;
    h.font = { bold: true, size: 14, color: { argb: 'FF1E3A5F' } };
    ws.getRow(1).height = 26;

    ws.mergeCells('A2:I2');
    ws.getCell('A2').value =
      `Filial: ${r.branch}    ·    Davr: ${day(periodStart)} → ${day(periodEnd)}`;
    ws.getCell('A2').font = { size: 10, color: { argb: 'FF666666' } };

    ws.mergeCells('A3:I3');
    ws.getCell('A3').value =
      `O‘tilgan darslar: ${r.sessions}    ·    ` +
      `O‘quvchilar to‘lagan (100%): ${som(r.tuition)} so‘m    ·    ` +
      `Ustoz ishlagan: ${som(r.earned)} so‘m    ·    ` +
      `Avans: ${som(r.advance)} so‘m    ·    Beriladigan: ${som(r.net)} so‘m`;
    ws.getCell('A3').font = { bold: true, size: 11, color: { argb: 'FF2E7D32' } };
    ws.getRow(3).height = 20;

    // ── Section A: per-student ──
    ws.mergeCells('A5:I5');
    ws.getCell('A5').value = 'Pul qayerdan keldi — o‘quvchilar kesimida';
    ws.getCell('A5').font = { bold: true, size: 12, color: { argb: 'FF1E3A5F' } };

    interface Stud {
      name: string;
      id: number;
      groups: Set<string>;
      units: number;
      tuition: number; // Σ perLessonCost — o'quvchi to'lagan (100%)
      amount: number; // Σ accrual — ustoz ishlagan (ulush)
    }
    const studMap = new Map<number, Stud>();
    for (const a of accs) {
      const s = studMap.get(a.student.id) ?? {
        name: `${a.student.firstName} ${a.student.lastName}`,
        id: a.student.id,
        groups: new Set<string>(),
        units: 0,
        tuition: 0,
        amount: 0,
      };
      s.groups.add(a.group.name);
      s.units += 1;
      s.tuition += a.perLessonCost || 0;
      s.amount += a.amount;
      studMap.set(a.student.id, s);
    }
    const studs = [...studMap.values()].sort((a, b) => b.amount - a.amount);

    const NC = 6; // number of columns in this section (A..F)
    const sHead = ws.addRow([
      'O‘quvchi',
      'ID',
      'Guruh(lar)',
      'Darslar',
      'O‘quvchi to‘lagan (so‘m)',
      'Ustoz ishlagan (so‘m)',
    ]);
    sHead.eachCell((c, col) => {
      if (col > NC) return;
      c.fill = SUBHEAD_FILL;
      c.font = { bold: true, size: 10, color: { argb: 'FF1E3A5F' } };
      c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      c.border = BORDER;
    });
    for (const s of studs) {
      const row = ws.addRow([
        s.name,
        s.id,
        [...s.groups].join(', '),
        s.units,
        s.tuition,
        s.amount,
      ]);
      for (let col = 1; col <= NC; col++) row.getCell(col).border = BORDER;
      row.getCell(2).alignment = { horizontal: 'center' };
      row.getCell(4).alignment = { horizontal: 'center' };
      row.getCell(5).numFmt = MONEY_FMT;
      row.getCell(6).numFmt = MONEY_FMT;
    }
    const stTot = ws.addRow([
      'JAMI',
      '',
      '',
      studs.reduce((s, x) => s + x.units, 0),
      studs.reduce((s, x) => s + x.tuition, 0),
      studs.reduce((s, x) => s + x.amount, 0),
    ]);
    for (let col = 1; col <= NC; col++) {
      stTot.getCell(col).fill = TOTAL_FILL;
      stTot.getCell(col).font = { bold: true };
      stTot.getCell(col).border = BORDER;
    }
    stTot.getCell(5).numFmt = MONEY_FMT;
    stTot.getCell(6).numFmt = MONEY_FMT;

    // ── Section B: full detail ──
    ws.addRow([]);
    const detTitleRow = ws.addRow(['Batafsil — har bir dars']);
    ws.mergeCells(`A${detTitleRow.number}:I${detTitleRow.number}`);
    detTitleRow.getCell(1).font = {
      bold: true,
      size: 12,
      color: { argb: 'FF1E3A5F' },
    };

    const dHead = ws.addRow([
      '№',
      'Sana',
      'O‘quvchi',
      'Guruh',
      'Kurs',
      'Dars narxi (100%)',
      'Stavka',
      'Ustoz ishlagan (so‘m)',
      'Izoh',
    ]);
    styleHeaderRow(dHead);

    accs.sort(
      (a, b) =>
        a.student.firstName.localeCompare(b.student.firstName) ||
        +new Date(a.lessonDate) - +new Date(b.lessonDate),
    );
    accs.forEach((a, i) => {
      const row = ws.addRow([
        i + 1,
        day(a.lessonDate),
        `${a.student.firstName} ${a.student.lastName}`,
        a.group.name,
        a.group.course?.name ?? '—',
        a.perLessonCost || 0,
        rateLabel(a.salaryConfigVersion),
        a.amount,
        accrualNote(a),
      ]);
      borderRow(row);
      row.getCell(1).alignment = { horizontal: 'center' };
      row.getCell(2).alignment = { horizontal: 'center' };
      row.getCell(6).numFmt = MONEY_FMT;
      row.getCell(8).numFmt = MONEY_FMT;
      if (a.creditPeriodDate || a.attendanceId == null) {
        row.getCell(9).font = { italic: true, color: { argb: 'FF8A5A00' } };
      }
    });
    const dTot = ws.addRow([
      '',
      '',
      '',
      '',
      '',
      '',
      'JAMI',
      accs.reduce((s, a) => s + a.amount, 0),
      '',
    ]);
    dTot.eachCell((c) => {
      c.fill = TOTAL_FILL;
      c.font = { bold: true };
      c.border = BORDER;
    });
    dTot.getCell(8).numFmt = MONEY_FMT;
    dTot.getCell(7).alignment = { horizontal: 'right' };
  }

  // ── write file ────────────────────────────────────────────────────────────
  const outDir = path.resolve(__dirname, '../reports');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${monthTitle.replace(' ', '-')}-oyliklar-hisoboti.xlsx`);
  await wb.xlsx.writeFile(outFile);

  console.log('─'.repeat(74));
  console.log(`✔ Excel tayyor: ${outFile}`);
  console.log(`  Varaqlar: 1 ta "Umumiy" + ${rows.length} ta ustoz tab`);
  console.log('─'.repeat(74));
}

const prisma = makePrisma();
main(prisma)
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
