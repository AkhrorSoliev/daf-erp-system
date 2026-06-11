import { PrismaClient, SalaryType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as ExcelJS from 'exceljs';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const COMPANY_ID = Number(process.env.COMPANY_ID ?? 1001);
const TEACHER_ROLE_ID = 4;
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

const LESSON_DATE_START = new Date(Date.UTC(2026, 4, 1));
const LESSON_DATE_END = new Date(Date.UTC(2026, 5, 1));

interface LessonDetail {
  date: Date;
  groupName: string;
  studentName: string;
  studentId: number;
  perLessonCost: number;
  isPaid: boolean;
  paidOn: Date | null;
}

interface TeacherRow {
  teacherId: number;
  teacherName: string;
  branchName: string;
  groupCount: number;
  paidStudentsCount: number;
  paidLessonsCount: number;
  unpaidLessonsCount: number;
  paidAmount: number;
  unpaidAmount: number;
  percentage: number | null;
  calculatedSalary: number;
  details: LessonDetail[];
}

function tashkentDateStr(d: Date): string {
  const tashkent = new Date(d.getTime() + TASHKENT_OFFSET_MS);
  const y = tashkent.getUTCFullYear();
  const m = String(tashkent.getUTCMonth() + 1).padStart(2, '0');
  const day = String(tashkent.getUTCDate()).padStart(2, '0');
  const hh = String(tashkent.getUTCHours()).padStart(2, '0');
  const mm = String(tashkent.getUTCMinutes()).padStart(2, '0');
  return `${day}.${m}.${y} ${hh}:${mm}`;
}

function sanitizeSheetName(name: string): string {
  return name.replace(/[\/\\?*\[\]:]/g, ' ').trim().slice(0, 31) || 'Sheet';
}

/** Teachers (with their groups + salary configs) for the report period. */
function fetchTeachers() {
  return prisma.user.findMany({
    where: {
      companyId: COMPANY_ID,
      deletedAt: null,
      roles: { some: { role: { id: TEACHER_ROLE_ID } } },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      mainBranch: true,
      groupTeachers: {
        select: {
          group: {
            select: {
              id: true,
              name: true,
              branchId: true,
              branch: { select: { name: true } },
              course: { select: { price: true, lessonPaymentCount: true } },
            },
          },
        },
      },
      salaryConfigs: {
        where: { companyId: COMPANY_ID, isActive: true },
        select: { groupId: true, salaryType: true, value: true },
      },
    },
  });
}
type TeacherWithRels = Awaited<ReturnType<typeof fetchTeachers>>[number];

/**
 * Aggregate one teacher's May lessons into a payroll row: paid vs unpaid
 * (debt) lessons, paid amount, the active PERCENTAGE rate, and the salary owed
 * (paid lessons × percentage). A lesson is "paid" iff it has a non-reversed
 * LESSON_CONSUMPTION row — its `metadata.perLessonCost` is the real charged price.
 */
async function computeTeacherRow(
  t: TeacherWithRels,
  branchNameById: Map<number, string>,
): Promise<TeacherRow> {
  const groupMap = new Map(t.groupTeachers.map((gt) => [gt.group.id, gt.group]));
  const groupIds = Array.from(groupMap.keys());

  let paidLessonsCount = 0;
  let unpaidLessonsCount = 0;
  let paidAmount = 0;
  let unpaidAmount = 0;
  const paidStudents = new Set<number>();
  const details: LessonDetail[] = [];

  if (groupIds.length > 0) {
    const attendances = await prisma.attendance.findMany({
      where: {
        companyId: COMPANY_ID,
        groupId: { in: groupIds },
        date: { gte: LESSON_DATE_START, lt: LESSON_DATE_END },
        status: { in: ['PRESENT', 'LATE'] },
      },
      select: {
        id: true,
        date: true,
        studentId: true,
        groupId: true,
        student: { select: { firstName: true, lastName: true } },
      },
      orderBy: [{ date: 'asc' }, { studentId: 'asc' }],
    });

    const attendanceIds = attendances.map((a) => a.id);
    const consumptionTxs =
      attendanceIds.length === 0
        ? []
        : await prisma.transaction.findMany({
            where: {
              type: 'LESSON_CONSUMPTION',
              attendanceId: { in: attendanceIds },
              reversedAt: null,
              companyId: COMPANY_ID,
            },
            select: { attendanceId: true, metadata: true, createdAt: true },
          });
    const consumptionByAttId = new Map<
      string,
      { perLessonCost: number; paidOn: Date }
    >();
    for (const tx of consumptionTxs) {
      if (!tx.attendanceId) continue;
      const meta = tx.metadata as { perLessonCost?: number } | null;
      if (meta?.perLessonCost == null) continue;
      consumptionByAttId.set(tx.attendanceId, {
        perLessonCost: meta.perLessonCost,
        paidOn: tx.createdAt,
      });
    }

    for (const att of attendances) {
      const group = groupMap.get(att.groupId)!;
      const lessonPaymentCount = group.course.lessonPaymentCount || 12;
      const fallbackCost = Math.round(group.course.price / lessonPaymentCount);
      const c = consumptionByAttId.get(att.id);
      const isPaid = !!c;
      const perLessonCost = c?.perLessonCost ?? fallbackCost;

      details.push({
        date: att.date,
        groupName: group.name,
        studentName: `${att.student.firstName} ${att.student.lastName}`.trim(),
        studentId: att.studentId,
        perLessonCost,
        isPaid,
        paidOn: c?.paidOn ?? null,
      });

      if (isPaid) {
        paidLessonsCount++;
        paidAmount += perLessonCost;
        paidStudents.add(att.studentId);
      } else {
        unpaidLessonsCount++;
        unpaidAmount += perLessonCost;
      }
    }
  }

  const percentageConfig =
    t.salaryConfigs.find(
      (c) => c.salaryType === SalaryType.PERCENTAGE && c.groupId === null,
    ) ?? t.salaryConfigs.find((c) => c.salaryType === SalaryType.PERCENTAGE);
  const percentage = percentageConfig ? percentageConfig.value : null;
  const calculatedSalary =
    percentage != null ? Math.round((paidAmount * percentage) / 100) : 0;

  let branchName = '—';
  if (t.mainBranch != null) {
    branchName = branchNameById.get(t.mainBranch) ?? '—';
  } else {
    const firstGroup = t.groupTeachers[0]?.group;
    if (firstGroup) branchName = firstGroup.branch.name;
  }

  return {
    teacherId: t.id,
    teacherName: `${t.firstName} ${t.lastName}`.trim(),
    branchName,
    groupCount: groupIds.length,
    paidStudentsCount: paidStudents.size,
    paidLessonsCount,
    unpaidLessonsCount,
    paidAmount,
    unpaidAmount,
    percentage,
    calculatedSalary,
    details,
  };
}

/** The "Umumiy" summary sheet: one row per teacher + a JAMI totals row. */
function buildSummarySheet(wb: ExcelJS.Workbook, rows: TeacherRow[]): void {
  const summary = wb.addWorksheet('Umumiy');
  summary.columns = [
    { header: 'Tartib raqami', key: 'idx', width: 8 },
    { header: 'Ustoz ID raqami', key: 'teacherId', width: 14 },
    { header: 'Ustozning ismi va familiyasi', key: 'teacherName', width: 32 },
    { header: 'Filialning nomi', key: 'branchName', width: 20 },
    {
      header: "Ustoz o'qitayotgan guruhlar soni",
      key: 'groupCount',
      width: 22,
    },
    {
      header: "May oyida o'tilgan va to'langan darslari bo'lgan o'quvchilar soni",
      key: 'paidStudentsCount',
      width: 36,
    },
    {
      header: "May oyida o'tilgan to'langan darslar soni",
      key: 'paidLessonsCount',
      width: 30,
    },
    {
      header: "May oyida o'tilgan qarz (to'lanmagan) darslar soni",
      key: 'unpaidLessonsCount',
      width: 32,
    },
    {
      header: "May darslari uchun haqiqatda to'langan summa (so'mda)",
      key: 'paidAmount',
      width: 40,
    },
    { header: 'Ustozning oylik foizi (%)', key: 'percentage', width: 22 },
    {
      header: "Ustozga to'lash uchun summa (to'langan dars × foiz, so'mda)",
      key: 'calculatedSalary',
      width: 42,
    },
  ];
  rows.forEach((r, i) =>
    summary.addRow({
      idx: i + 1,
      teacherId: r.teacherId,
      teacherName: r.teacherName,
      branchName: r.branchName,
      groupCount: r.groupCount,
      paidStudentsCount: r.paidStudentsCount,
      paidLessonsCount: r.paidLessonsCount,
      unpaidLessonsCount: r.unpaidLessonsCount,
      paidAmount: r.paidAmount,
      percentage: r.percentage != null ? `${r.percentage}%` : '—',
      calculatedSalary: r.calculatedSalary,
    }),
  );
  styleHeader(summary.getRow(1));
  for (const col of ['paidAmount', 'calculatedSalary']) {
    summary.getColumn(col).numFmt = '#,##0';
    summary.getColumn(col).alignment = { horizontal: 'right' };
  }
  summary.getColumn('percentage').alignment = { horizontal: 'center' };
  const uniqPayingStudents = new Set<number>();
  for (const r of rows)
    for (const d of r.details) if (d.isPaid) uniqPayingStudents.add(d.studentId);
  const sTotalsRow = summary.addRow({
    idx: '',
    teacherId: '',
    teacherName: 'JAMI',
    branchName: '',
    groupCount: rows.reduce((s, r) => s + r.groupCount, 0),
    paidStudentsCount: uniqPayingStudents.size,
    paidLessonsCount: rows.reduce((s, r) => s + r.paidLessonsCount, 0),
    unpaidLessonsCount: rows.reduce((s, r) => s + r.unpaidLessonsCount, 0),
    paidAmount: rows.reduce((s, r) => s + r.paidAmount, 0),
    percentage: '',
    calculatedSalary: rows.reduce((s, r) => s + r.calculatedSalary, 0),
  });
  styleTotal(sTotalsRow);
  summary.views = [{ state: 'frozen', ySplit: 1 }];
  summary.getRow(1).height = 60;
}

/** One per-teacher detail sheet (grouped by group, with subtotals + grand total). */
function buildTeacherSheet(
  wb: ExcelJS.Workbook,
  r: TeacherRow,
  usedNames: Set<string>,
): void {
  const base = sanitizeSheetName(`${r.teacherName}`);
  let name = base;
  let suffix = 2;
  while (usedNames.has(name)) {
    name = sanitizeSheetName(`${base.slice(0, 28)} (${suffix})`);
    suffix++;
  }
  usedNames.add(name);

  const sh = wb.addWorksheet(name);
  const teacherFoiz = r.percentage ?? 0;
  sh.columns = [
    { header: 'Tartib raqami', key: 'idx', width: 8 },
    { header: 'Dars sanasi', key: 'date', width: 16 },
    { header: 'Guruh nomi', key: 'group', width: 26 },
    { header: "O'quvchining ismi va familiyasi", key: 'student', width: 32 },
    { header: "O'quvchi ID raqami", key: 'studentId', width: 16 },
    { header: "Dars haqi (so'mda)", key: 'cost', width: 20 },
    { header: 'Holati', key: 'status', width: 16 },
    { header: "To'langan sana", key: 'paidOn', width: 18 },
    {
      header: `Ustozning ulushi (foiz ${teacherFoiz}%, so'mda)`,
      key: 'share',
      width: 28,
    },
  ];

  // Title row above headers
  sh.spliceRows(1, 0, []);
  sh.mergeCells('A1:I1');
  const titleCell = sh.getCell('A1');
  titleCell.value = `Ustoz: ${r.teacherName}  |  Filial: ${r.branchName}  |  Davr: 2026-yil May darslari (01.05 – 31.05)  |  Foiz: ${r.percentage != null ? r.percentage + '%' : '—'}`;
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
  sh.getRow(1).height = 24;
  styleHeader(sh.getRow(2));

  if (r.details.length === 0) {
    sh.addRow({
      idx: '',
      date: '',
      group: '',
      student: "Ushbu ustozning May oyida o'tilgan darsi yo'q",
      studentId: '',
      cost: '',
      status: '',
      paidOn: '',
      share: '',
    });
  } else {
    const byGroup = new Map<string, LessonDetail[]>();
    for (const d of r.details) {
      const arr = byGroup.get(d.groupName) ?? [];
      arr.push(d);
      byGroup.set(d.groupName, arr);
    }
    const sortedGroups = Array.from(byGroup.keys()).sort();
    let idx = 1;
    for (const groupName of sortedGroups) {
      const items = byGroup
        .get(groupName)!
        .slice()
        .sort(
          (a, b) =>
            a.date.getTime() - b.date.getTime() || a.studentId - b.studentId,
        );
      const groupHeaderRow = sh.addRow({
        idx: '',
        date: '',
        group: `▸ Guruh nomi: ${groupName}`,
        student: '',
        studentId: '',
        cost: '',
        status: '',
        paidOn: '',
        share: '',
      });
      groupHeaderRow.font = { bold: true };
      groupHeaderRow.eachCell((c) => {
        c.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF2F2F2' },
        };
      });

      let subPaidLessons = 0;
      let subUnpaidLessons = 0;
      let subPaidCost = 0;
      let subShare = 0;
      for (const d of items) {
        const share =
          r.percentage != null && d.isPaid
            ? Math.round((d.perLessonCost * r.percentage) / 100)
            : 0;
        const lessonDate = new Date(d.date.getTime() + TASHKENT_OFFSET_MS);
        const lessonDateStr = `${String(lessonDate.getUTCDate()).padStart(2, '0')}.${String(lessonDate.getUTCMonth() + 1).padStart(2, '0')}.${lessonDate.getUTCFullYear()}`;
        const row = sh.addRow({
          idx: idx++,
          date: lessonDateStr,
          group: d.groupName,
          student: d.studentName,
          studentId: d.studentId,
          cost: d.perLessonCost,
          status: d.isPaid ? "To'langan" : "Qarz (to'lanmagan)",
          paidOn: d.paidOn ? tashkentDateStr(d.paidOn).slice(0, 10) : '—',
          share: d.isPaid ? share : 0,
        });
        if (!d.isPaid) {
          row.getCell('status').font = {
            color: { argb: 'FFCC0000' },
            bold: true,
          };
        }
        if (d.isPaid) {
          subPaidLessons++;
          subPaidCost += d.perLessonCost;
          subShare += share;
        } else {
          subUnpaidLessons++;
        }
      }
      const subRow = sh.addRow({
        idx: '',
        date: '',
        group: '',
        student: '',
        studentId: `Guruh bo'yicha jami (${subPaidLessons} to'langan + ${subUnpaidLessons} qarz):`,
        cost: subPaidCost,
        status: '',
        paidOn: '',
        share: subShare,
      });
      subRow.font = { italic: true, bold: true };
      subRow.eachCell((c) => {
        c.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFBFBE6' },
        };
      });
      sh.addRow({});
    }

    const grandTotalRow = sh.addRow({
      idx: '',
      date: '',
      group: '',
      student: '',
      studentId: `JAMI: ${r.paidLessonsCount} ta to'langan + ${r.unpaidLessonsCount} ta qarz dars`,
      cost: r.paidAmount,
      status: '',
      paidOn: '',
      share: r.calculatedSalary,
    });
    styleTotal(grandTotalRow);

    const noteRow = sh.addRow({
      idx: '',
      date: '',
      group: 'Izoh:',
      student:
        "May oyida o'tilgan barcha darslar ko'rsatilgan. \"To'langan\" — o'quvchi balansidan dars haqi ushlangan (qachon to'langani — 'To'langan sana' ustunida; 1-2 iyun ham bo'lishi mumkin, agar shu sanada pul tushgan bo'lsa). \"Qarz\" — dars o'tilgan, lekin balansda pul yo'q edi, hali to'lanmagan. Ustozga to'lash uchun summa faqat \"To'langan\" darslar bo'yicha hisoblanadi.",
      studentId: '',
      cost: '',
      status: '',
      paidOn: '',
      share: '',
    });
    noteRow.font = { italic: true, color: { argb: 'FF666666' } };
    sh.mergeCells(`D${noteRow.number}:I${noteRow.number}`);
  }

  sh.getColumn('cost').numFmt = '#,##0';
  sh.getColumn('cost').alignment = { horizontal: 'right' };
  sh.getColumn('share').numFmt = '#,##0';
  sh.getColumn('share').alignment = { horizontal: 'right' };
  sh.getColumn('status').alignment = { horizontal: 'center' };
  sh.views = [{ state: 'frozen', ySplit: 2 }];
}

/** Plain-text rollup printed to the console after the workbook is written. */
function printConsoleSummary(rows: TeacherRow[], outPath: string): void {
  console.log('---');
  for (const r of rows) {
    console.log(
      `  ${r.teacherName.padEnd(28)} | grp=${String(r.groupCount).padStart(2)}` +
        ` | paid_lessons=${String(r.paidLessonsCount).padStart(4)}` +
        ` | unpaid=${String(r.unpaidLessonsCount).padStart(3)}` +
        ` | paid_sum=${r.paidAmount.toLocaleString('en-US').padStart(12)}` +
        ` | foiz=${(r.percentage ?? '—').toString().padStart(3)}%` +
        ` | salary=${r.calculatedSalary.toLocaleString('en-US').padStart(11)}`,
    );
  }
  console.log('---');
  console.log('Teachers in report     :', rows.length);
  console.log(
    'Total paid lessons     :',
    rows.reduce((s, r) => s + r.paidLessonsCount, 0),
  );
  console.log(
    'Total unpaid lessons   :',
    rows.reduce((s, r) => s + r.unpaidLessonsCount, 0),
  );
  console.log(
    'Total paid amount      :',
    rows.reduce((s, r) => s + r.paidAmount, 0).toLocaleString('en-US'),
  );
  console.log(
    'Total unpaid amount    :',
    rows.reduce((s, r) => s + r.unpaidAmount, 0).toLocaleString('en-US'),
  );
  console.log(
    'Total salary to pay    :',
    rows.reduce((s, r) => s + r.calculatedSalary, 0).toLocaleString('en-US'),
  );
  console.log('Saved:', outPath);
}

async function main() {
  console.log(
    'Lesson date period (UTC):',
    LESSON_DATE_START.toISOString(),
    '→',
    LESSON_DATE_END.toISOString(),
  );
  console.log('companyId =', COMPANY_ID);

  const teachers = await fetchTeachers();
  const branches = await prisma.branch.findMany({
    where: { companyId: COMPANY_ID },
    select: { id: true, name: true },
  });
  const branchNameById = new Map(branches.map((b) => [b.id, b.name]));
  console.log(`Found ${teachers.length} teachers`);

  const rows: TeacherRow[] = [];
  for (const t of teachers) {
    rows.push(await computeTeacherRow(t, branchNameById));
  }
  rows.sort((a, b) => b.calculatedSalary - a.calculatedSalary);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'DaF ERP';
  wb.created = new Date();
  buildSummarySheet(wb, rows);
  const usedNames = new Set<string>(['Umumiy']);
  for (const r of rows) buildTeacherSheet(wb, r, usedNames);

  const outPath = process.env.OUT_PATH ?? '/tmp/may-2026-ustozlar-oyligi.xlsx';
  await wb.xlsx.writeFile(outPath);
  printConsoleSummary(rows, outPath);
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  row.height = 30;
  row.eachCell((c) => {
    c.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE6F0FA' },
    };
    c.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
    };
  });
}

function styleTotal(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.eachCell((c) => {
    c.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFFF2CC' },
    };
    c.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
    };
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
