/**
 * Faza 0 — APREL CUTOVER AUDIT + OLDINGI-HOLAT.xlsx  (READ-ONLY)
 *
 * Reads the CURRENT financial / attendance / salary state for a company and:
 *   1. Prints a console "landscape" summary.
 *   2. Writes an Excel workbook (default /tmp/OLDINGI-HOLAT.xlsx) with 5 sheets
 *      capturing the state BEFORE the May-1 reset.
 *
 * NOTHING is written to the database — only SELECT / groupBy queries.
 * The "To'lovlar" sheet is the proof that payments are never touched: it must
 * be byte-for-byte identical in the post-reset YANGI-HOLAT.xlsx.
 *
 * Usage (from server/):
 *   # dev DB (reads .env DATABASE_URL):
 *   npx ts-node scripts/audit-april-cutover.ts
 *   # prod (export the Railway caring-courage URL first):
 *   DATABASE_URL="<prod-url>" OUT_PATH=/tmp/OLDINGI-HOLAT.xlsx \
 *     npx ts-node scripts/audit-april-cutover.ts
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as ExcelJS from 'exceljs';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const COMPANY_ID = Number(process.env.COMPANY_ID ?? 1001);
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
// 2026-05-01 00:00 UTC. Attendance.date / SalaryAccrual.lessonDate are @db.Date
// (UTC midnight), so `< CUTOFF` = April-and-earlier, `>= CUTOFF` = May onward.
const CUTOFF = new Date(Date.UTC(2026, 4, 1));
const BILLABLE = ['PRESENT', 'LATE', 'ABSENT'] as const;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function tashkentDateTime(d: Date | null | undefined): string {
  if (!d) return '—';
  const t = new Date(d.getTime() + TASHKENT_OFFSET_MS);
  return `${pad(t.getUTCDate())}.${pad(t.getUTCMonth() + 1)}.${t.getUTCFullYear()} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
}
function tashkentDate(d: Date | null | undefined): string {
  if (!d) return '—';
  const t = new Date(d.getTime() + TASHKENT_OFFSET_MS);
  return `${pad(t.getUTCDate())}.${pad(t.getUTCMonth() + 1)}.${t.getUTCFullYear()}`;
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  row.height = 34;
  row.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F0FA' } };
    c.border = {
      top: { style: 'thin' }, bottom: { style: 'thin' },
      left: { style: 'thin' }, right: { style: 'thin' },
    };
  });
}
function styleTotal(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
    c.border = {
      top: { style: 'thin' }, bottom: { style: 'thin' },
      left: { style: 'thin' }, right: { style: 'thin' },
    };
  });
}

async function main() {
  console.log('================ APREL CUTOVER AUDIT (READ-ONLY) ================');
  console.log('DB host   :', new URL(process.env.DATABASE_URL ?? '').host);
  console.log('companyId :', COMPANY_ID);
  console.log('Cutoff    : lessons/payments before', CUTOFF.toISOString(), '= "aprel va undan oldin"');
  console.log('----------------------------------------------------------------');

  const branches = await prisma.branch.findMany({
    where: { companyId: COMPANY_ID },
    select: { id: true, name: true },
  });
  const branchName = new Map(branches.map((b) => [b.id, b.name]));

  // ───────── 1. PAYMENTS (immutable — must match in YANGI-HOLAT) ─────────
  const payments = await prisma.payment.findMany({
    where: { companyId: COMPANY_ID },
    select: {
      id: true, amount: true, method: true, status: true, source: true,
      externalId: true, providerFee: true, receiptNumber: true, receiptCode: true,
      note: true, branchId: true, createdAt: true,
      student: { select: { id: true, firstName: true, lastName: true } },
      receivedBy: {
        select: {
          firstName: true, lastName: true,
          roles: { select: { role: { select: { name: true } } } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  // ───────── 2. STUDENTS + balances + enrollments ─────────
  const students = await prisma.student.findMany({
    where: { companyId: COMPANY_ID, deletedAt: null },
    select: {
      id: true, firstName: true, lastName: true, phone: true,
      balance: true, discountPercent: true, status: true,
      enrollments: {
        where: { deletedAt: null },
        select: {
          status: true, prepaidLessonsRemaining: true, startDate: true,
          group: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { id: 'asc' },
  });

  // Attendance counts per student (billable only), April vs May.
  const attAprilByStudent = await prisma.attendance.groupBy({
    by: ['studentId'],
    where: { companyId: COMPANY_ID, date: { lt: CUTOFF }, status: { in: BILLABLE as unknown as string[] } as any },
    _count: { _all: true },
  });
  const attMayByStudent = await prisma.attendance.groupBy({
    by: ['studentId'],
    where: { companyId: COMPANY_ID, date: { gte: CUTOFF }, status: { in: BILLABLE as unknown as string[] } as any },
    _count: { _all: true },
  });
  const aprilCntByStudent = new Map(attAprilByStudent.map((r) => [r.studentId, r._count._all]));
  const mayCntByStudent = new Map(attMayByStudent.map((r) => [r.studentId, r._count._all]));

  // April consumed VALUE per student = sum of perLessonCost over active
  // April LESSON_CONSUMPTION rows. This is what becomes "free" after reset
  // (the projected balance improvement).
  const aprilValueRows = await prisma.$queryRaw<
    { studentId: number; cnt: number; aprilValue: number }[]
  >`
    SELECT a."studentId"                                              AS "studentId",
           COUNT(*)::int                                             AS cnt,
           COALESCE(SUM((t.metadata->>'perLessonCost')::int), 0)::int AS "aprilValue"
    FROM "Transaction" t
    JOIN "Attendance" a ON a.id = t."attendanceId"
    WHERE t.type = 'LESSON_CONSUMPTION'
      AND t."reversedAt" IS NULL
      AND t."companyId" = ${COMPANY_ID}
      AND a.date < ${CUTOFF}
    GROUP BY a."studentId"
  `;
  const aprilValueByStudent = new Map(aprilValueRows.map((r) => [r.studentId, r.aprilValue]));

  // ───────── 3. ATTENDANCE per group ─────────
  const groups = await prisma.group.findMany({
    where: { companyId: COMPANY_ID, deletedAt: null },
    select: {
      id: true, name: true, startDate: true,
      course: { select: { name: true } },
    },
    orderBy: { name: 'asc' },
  });
  const attAprilByGroup = await prisma.attendance.groupBy({
    by: ['groupId'],
    where: { companyId: COMPANY_ID, date: { lt: CUTOFF }, status: { in: BILLABLE as unknown as string[] } as any },
    _count: { _all: true },
  });
  const attMayByGroup = await prisma.attendance.groupBy({
    by: ['groupId'],
    where: { companyId: COMPANY_ID, date: { gte: CUTOFF }, status: { in: BILLABLE as unknown as string[] } as any },
    _count: { _all: true },
  });
  const aprilCntByGroup = new Map(attAprilByGroup.map((r) => [r.groupId, r._count._all]));
  const mayCntByGroup = new Map(attMayByGroup.map((r) => [r.groupId, r._count._all]));

  // ───────── 4. SALARY accruals + payments ─────────
  const accAprilByUser = await prisma.salaryAccrual.groupBy({
    by: ['userId'],
    where: { companyId: COMPANY_ID, reversedAt: null, lessonDate: { lt: CUTOFF } },
    _sum: { amount: true }, _count: { _all: true },
  });
  const accMayByUser = await prisma.salaryAccrual.groupBy({
    by: ['userId'],
    where: { companyId: COMPANY_ID, reversedAt: null, lessonDate: { gte: CUTOFF } },
    _sum: { amount: true }, _count: { _all: true },
  });
  const aprAcc = new Map(accAprilByUser.map((r) => [r.userId, { sum: r._sum.amount ?? 0, cnt: r._count._all }]));
  const mayAcc = new Map(accMayByUser.map((r) => [r.userId, { sum: r._sum.amount ?? 0, cnt: r._count._all }]));
  const teacherIds = Array.from(new Set([...aprAcc.keys(), ...mayAcc.keys()]));
  const teacherUsers = await prisma.user.findMany({
    where: { id: { in: teacherIds.length ? teacherIds : [-1] } },
    select: { id: true, firstName: true, lastName: true },
  });
  const teacherName = new Map(teacherUsers.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]));

  const salaryPayments = await prisma.salaryPayment.findMany({
    where: { companyId: COMPANY_ID },
    select: {
      id: true, periodStart: true, periodEnd: true, amount: true, status: true,
      paidAt: true, user: { select: { firstName: true, lastName: true } },
    },
    orderBy: [{ periodStart: 'asc' }, { userId: 'asc' }],
  });

  // ===================== BUILD WORKBOOK =====================
  const wb = new ExcelJS.Workbook();
  wb.creator = 'DaF ERP — aprel cutover audit';
  wb.created = new Date();

  // ---- Sheet 1: Umumiy (landscape) ----
  const totalPaymentsAmount = payments
    .filter((p) => p.status === 'COMPLETED')
    .reduce((s, p) => s + p.amount, 0);
  const totalBalance = students.reduce((s, st) => s + st.balance, 0);
  const debtors = students.filter((st) => st.balance < 0);
  const aprilLessonsTotal = attAprilByStudent.reduce((s, r) => s + r._count._all, 0);
  const mayLessonsTotal = attMayByStudent.reduce((s, r) => s + r._count._all, 0);
  const aprilValueTotal = aprilValueRows.reduce((s, r) => s + r.aprilValue, 0);
  const aprAccTotal = accAprilByUser.reduce((s, r) => s + (r._sum.amount ?? 0), 0);
  const mayAccTotal = accMayByUser.reduce((s, r) => s + (r._sum.amount ?? 0), 0);
  const mixedPayslips = salaryPayments.filter((p) => p.periodStart < CUTOFF);

  const sum = wb.addWorksheet('Umumiy');
  sum.columns = [
    { header: "Ko'rsatkich", key: 'k', width: 56 },
    { header: 'Qiymat', key: 'v', width: 28 },
  ];
  styleHeader(sum.getRow(1));
  const addKV = (k: string, v: string | number) => sum.addRow({ k, v });
  addKV('Kompaniya ID', COMPANY_ID);
  addKV('Hisobot sanasi (Tashkent)', tashkentDateTime(new Date()));
  addKV('Cutoff sana', '2026-05-01 (undan oldin = aprel)');
  addKV('—', '');
  addKV("Jami o'quvchilar (faol, o'chirilmagan)", students.length);
  addKV("Jami to'lovlar (yozuv soni)", payments.length);
  addKV("Jami to'lov summasi (COMPLETED, so'm)", totalPaymentsAmount);
  addKV("Jami o'quvchilar balansi (so'm)", totalBalance);
  addKV('Qarzdor (balans < 0) soni', debtors.length);
  addKV('—', '');
  addKV('APREL billable darslar (PRESENT+LATE+ABSENT)', aprilLessonsTotal);
  addKV('MAY+ billable darslar', mayLessonsTotal);
  addKV("APREL darslari qiymati (perLessonCost yig'indisi, so'm)", aprilValueTotal);
  addKV('  → reset bu summani o\'quvchilarga qaytaradi (taxminiy)', aprilValueTotal);
  addKV('—', '');
  addKV("APREL ustoz accrual yig'indisi (reversed emas, so'm)", aprAccTotal);
  addKV("MAY+ ustoz accrual yig'indisi (so'm)", mayAccTotal);
  addKV('Jami SalaryPayment yozuvlari', salaryPayments.length);
  addKV('Aprelni qamrab olgan payslip (periodStart < 01.05)', mixedPayslips.length);
  sum.getColumn('v').alignment = { horizontal: 'right' };
  sum.getColumn('v').numFmt = '@'; // text by default; numeric cells still right-aligned
  sum.views = [{ state: 'frozen', ySplit: 1 }];

  // ---- Sheet 2: To'lovlar (IMMUTABLE) ----
  const pSheet = wb.addWorksheet("To'lovlar");
  pSheet.columns = [
    { header: '#', key: 'idx', width: 6 },
    { header: "O'quvchi", key: 'student', width: 28 },
    { header: 'ID', key: 'sid', width: 9 },
    { header: "Summa (so'm)", key: 'amount', width: 16 },
    { header: 'Sana + vaqt', key: 'when', width: 20 },
    { header: 'Usul', key: 'method', width: 12 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Manba (source)', key: 'source', width: 18 },
    { header: 'Kim qabul qilgan', key: 'by', width: 26 },
    { header: 'Roli', key: 'byRole', width: 16 },
    { header: 'Filial', key: 'branch', width: 18 },
    { header: 'Kvitansiya', key: 'receipt', width: 16 },
    { header: 'Tashqi ID', key: 'ext', width: 18 },
    { header: 'Izoh', key: 'note', width: 30 },
  ];
  styleHeader(pSheet.getRow(1));
  payments.forEach((p, i) => {
    const by = p.receivedBy
      ? `${p.receivedBy.firstName} ${p.receivedBy.lastName}`.trim()
      : '—';
    const role = p.receivedBy?.roles?.map((r) => r.role.name).join(', ') || '—';
    pSheet.addRow({
      idx: i + 1,
      student: `${p.student.firstName} ${p.student.lastName}`.trim(),
      sid: p.student.id,
      amount: p.amount,
      when: tashkentDateTime(p.createdAt),
      method: p.method,
      status: p.status,
      source: p.source,
      by,
      byRole: role,
      branch: p.branchId ? branchName.get(p.branchId) ?? p.branchId : '—',
      receipt: p.receiptNumber ?? p.receiptCode ?? '—',
      ext: p.externalId ?? '—',
      note: p.note ?? '',
    });
  });
  pSheet.getColumn('amount').numFmt = '#,##0';
  pSheet.getColumn('amount').alignment = { horizontal: 'right' };
  const pTotal = pSheet.addRow({
    student: 'JAMI', amount: payments.reduce((s, p) => s + p.amount, 0),
  });
  styleTotal(pTotal);
  pSheet.views = [{ state: 'frozen', ySplit: 1 }];

  // ---- Sheet 3: O'quvchilar balansi ----
  const bSheet = wb.addWorksheet("O'quvchilar balansi");
  bSheet.columns = [
    { header: '#', key: 'idx', width: 6 },
    { header: "O'quvchi", key: 'name', width: 28 },
    { header: 'ID', key: 'id', width: 9 },
    { header: 'Telefon', key: 'phone', width: 14 },
    { header: 'Status', key: 'status', width: 12 },
    { header: "Balans (so'm)", key: 'balance', width: 16 },
    { header: 'Chegirma %', key: 'disc', width: 10 },
    { header: 'Guruh(lar)', key: 'groups', width: 30 },
    { header: 'Prepaid (jami)', key: 'prepaid', width: 12 },
    { header: 'Aprel darslar', key: 'apr', width: 12 },
    { header: 'May+ darslar', key: 'may', width: 12 },
    { header: "Aprel qiymati (so'm)", key: 'aprVal', width: 18 },
    { header: 'Qarzdor?', key: 'debt', width: 10 },
  ];
  styleHeader(bSheet.getRow(1));
  students.forEach((st, i) => {
    const active = st.enrollments.filter((e) => e.status === 'ACTIVE');
    const prepaid = active.reduce((s, e) => s + e.prepaidLessonsRemaining, 0);
    const groupsStr = st.enrollments.map((e) => e.group.name).join(', ');
    const row = bSheet.addRow({
      idx: i + 1,
      name: `${st.firstName} ${st.lastName}`.trim(),
      id: st.id,
      phone: st.phone,
      status: st.status,
      balance: st.balance,
      disc: st.discountPercent,
      groups: groupsStr || '—',
      prepaid,
      apr: aprilCntByStudent.get(st.id) ?? 0,
      may: mayCntByStudent.get(st.id) ?? 0,
      aprVal: aprilValueByStudent.get(st.id) ?? 0,
      debt: st.balance < 0 ? 'HA' : '',
    });
    if (st.balance < 0) {
      row.getCell('balance').font = { color: { argb: 'FFCC0000' }, bold: true };
      row.getCell('debt').font = { color: { argb: 'FFCC0000' }, bold: true };
    }
  });
  for (const c of ['balance', 'aprVal']) {
    bSheet.getColumn(c).numFmt = '#,##0';
    bSheet.getColumn(c).alignment = { horizontal: 'right' };
  }
  const bTotal = bSheet.addRow({
    name: 'JAMI', balance: totalBalance,
    apr: aprilLessonsTotal, may: mayLessonsTotal, aprVal: aprilValueTotal,
  });
  styleTotal(bTotal);
  bSheet.views = [{ state: 'frozen', ySplit: 1 }];

  // ---- Sheet 4: Davomat (per group) ----
  const aSheet = wb.addWorksheet('Davomat');
  aSheet.columns = [
    { header: '#', key: 'idx', width: 6 },
    { header: 'Guruh', key: 'group', width: 32 },
    { header: 'Kurs', key: 'course', width: 24 },
    { header: 'Hozirgi startDate', key: 'start', width: 18 },
    { header: 'Aprel darslar', key: 'apr', width: 14 },
    { header: 'May+ darslar', key: 'may', width: 14 },
  ];
  styleHeader(aSheet.getRow(1));
  groups.forEach((g, i) => {
    aSheet.addRow({
      idx: i + 1,
      group: g.name,
      course: g.course?.name ?? '—',
      start: tashkentDate(g.startDate),
      apr: aprilCntByGroup.get(g.id) ?? 0,
      may: mayCntByGroup.get(g.id) ?? 0,
    });
  });
  const aTotal = aSheet.addRow({
    group: 'JAMI',
    apr: aprilLessonsTotal,
    may: mayLessonsTotal,
  });
  styleTotal(aTotal);
  aSheet.views = [{ state: 'frozen', ySplit: 1 }];

  // ---- Sheet 5: Ustoz oyligi ----
  const tSheet = wb.addWorksheet('Ustoz oyligi');
  tSheet.columns = [
    { header: '#', key: 'idx', width: 6 },
    { header: 'Ustoz', key: 'name', width: 28 },
    { header: 'ID', key: 'id', width: 9 },
    { header: 'Aprel accrual soni', key: 'aprCnt', width: 16 },
    { header: "Aprel accrual (so'm)", key: 'aprSum', width: 18 },
    { header: 'May+ accrual soni', key: 'mayCnt', width: 16 },
    { header: "May+ accrual (so'm)", key: 'maySum', width: 18 },
  ];
  styleHeader(tSheet.getRow(1));
  teacherIds.forEach((tid, i) => {
    const a = aprAcc.get(tid) ?? { sum: 0, cnt: 0 };
    const m = mayAcc.get(tid) ?? { sum: 0, cnt: 0 };
    tSheet.addRow({
      idx: i + 1,
      name: teacherName.get(tid) ?? `#${tid}`,
      id: tid,
      aprCnt: a.cnt, aprSum: a.sum,
      mayCnt: m.cnt, maySum: m.sum,
    });
  });
  for (const c of ['aprSum', 'maySum']) {
    tSheet.getColumn(c).numFmt = '#,##0';
    tSheet.getColumn(c).alignment = { horizontal: 'right' };
  }
  const tTotal = tSheet.addRow({
    name: 'JAMI', aprSum: aprAccTotal, maySum: mayAccTotal,
  });
  styleTotal(tTotal);

  // SalaryPayment list below, separated by a blank row.
  tSheet.addRow({});
  const spHeaderRow = tSheet.addRow({
    idx: '', name: 'SalaryPayment yozuvlari ↓', id: '',
    aprCnt: 'Davr boshi', aprSum: 'Davr oxiri', mayCnt: 'Summa', maySum: 'Status',
  });
  spHeaderRow.font = { bold: true };
  spHeaderRow.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
  });
  salaryPayments.forEach((p) => {
    const mixed = p.periodStart < CUTOFF;
    const r = tSheet.addRow({
      idx: '',
      name: `${p.user.firstName} ${p.user.lastName}`.trim(),
      id: '',
      aprCnt: tashkentDate(p.periodStart),
      aprSum: tashkentDate(p.periodEnd),
      mayCnt: p.amount,
      maySum: `${p.status}${mixed ? ' ⚠ APREL ARALASH' : ''}${p.paidAt ? " (to'langan: " + tashkentDate(p.paidAt) + ')' : ''}`,
    });
    if (mixed) r.getCell('maySum').font = { color: { argb: 'FFCC0000' }, bold: true };
  });
  tSheet.views = [{ state: 'frozen', ySplit: 1 }];

  const outPath = process.env.OUT_PATH ?? '/tmp/OLDINGI-HOLAT.xlsx';
  await wb.xlsx.writeFile(outPath);

  // ===================== CONSOLE SUMMARY =====================
  console.log('STUDENTS         :', students.length, '| qarzdor:', debtors.length);
  console.log('PAYMENTS         :', payments.length, '| COMPLETED summa:', totalPaymentsAmount.toLocaleString('en-US'));
  console.log('TOTAL BALANCE    :', totalBalance.toLocaleString('en-US'));
  console.log('APRIL lessons    :', aprilLessonsTotal, '| value:', aprilValueTotal.toLocaleString('en-US'));
  console.log('MAY+ lessons     :', mayLessonsTotal);
  console.log('APRIL accrual sum:', aprAccTotal.toLocaleString('en-US'), '| MAY+ accrual sum:', mayAccTotal.toLocaleString('en-US'));
  console.log('SalaryPayments   :', salaryPayments.length, '| aprelni qamragan:', mixedPayslips.length);
  if (mixedPayslips.length) {
    console.log('  ⚠ Aprelni qamrab olgan payslip(lar):');
    for (const p of mixedPayslips) {
      console.log(`    ${`${p.user.firstName} ${p.user.lastName}`.trim().padEnd(26)} | ${tashkentDate(p.periodStart)}–${tashkentDate(p.periodEnd)} | ${p.amount.toLocaleString('en-US').padStart(11)} | ${p.status}${p.paidAt ? ' (' + tashkentDate(p.paidAt) + ')' : ''}`);
    }
  }
  console.log('----------------------------------------------------------------');
  console.log('Saved:', outPath);
  console.log('================================================================');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
