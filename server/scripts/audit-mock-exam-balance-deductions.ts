/**
 * audit-mock-exam-balance-deductions — READ-ONLY.
 *
 * "Mock imtihon tufayli o'quvchining DARS uchun to'lagan pulidan mock puli
 * yechib olindi" — kimdan, qancha, qachon.
 *
 * Mock to'lovi Student.balance dan yechiladi (MockExamBillingService), ya'ni
 * dars puli bilan BITTA hamyondan. Shuning uchun balansdan yechilgan har bir
 * mock to'lovi "dars pulidan olingan" hisoblanadi. Skript shuni ko'rsatadi va
 * zarar darajasini o'lchaydi: yechilgandan keyin balans darsga yetdimi.
 *
 * Usage:
 *   railway run npx ts-node scripts/audit-mock-exam-balance-deductions.ts <examId>   (PROD)
 *   npx ts-node scripts/audit-mock-exam-balance-deductions.ts <examId>               (dev)
 *   --all   → barcha mock imtihonlar bo'yicha
 */
import { PrismaClient } from '@prisma/client';
import { som, day, dt, printHeader, section, printTable, run, parseArgs } from './lib/check-cli';

interface FeeRow {
  txId: string;
  studentId: number;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  createdAt: Date;
  reversedAt: Date | null;
  examId: string;
  participantId: string | null;
}

async function main(prisma: PrismaClient) {
  const { positional } = parseArgs();
  const all = process.argv.includes('--all');
  const examId = positional[0];
  if (!examId && !all) {
    console.error('Usage: npx ts-node scripts/audit-mock-exam-balance-deductions.ts <examId> | --all');
    process.exitCode = 1;
    return;
  }

  printHeader('MOCK IMTIHON — BALANSDAN YECHILGAN TO\'LOVLAR AUDITI');

  // ── 1. Imtihon(lar) ─────────────────────────────────────────────────────
  const exams = await prisma.mockExam.findMany({
    where: all ? {} : { id: examId },
    select: {
      id: true,
      title: true,
      status: true,
      price: true,
      studentPrice: true,
      examDate: true,
      registrationDeadline: true,
      createdAt: true,
      deletedAt: true,
      companyId: true,
      branch: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (exams.length === 0) {
    console.log(`\n  Imtihon topilmadi: ${examId}`);
    return;
  }

  section('Imtihon(lar)');
  printTable(
    ['id', 'Nomi', 'Holat', 'Narx', 'DaF narxi', 'Sana', 'Filial'],
    exams.map((e) => [
      e.id.slice(0, 8),
      e.title,
      e.status + (e.deletedAt ? ' (o\'chirilgan)' : ''),
      som(e.price),
      e.studentPrice == null ? '—' : som(e.studentPrice),
      day(e.examDate),
      e.branch?.name ?? '—',
    ]),
    ['l', 'l', 'l', 'r', 'r', 'l', 'l'],
  );

  const examIds = exams.map((e) => e.id);
  const examById = new Map(exams.map((e) => [e.id, e]));

  // ── 2. MOCK_EXAM_FEE ledger qatorlari ───────────────────────────────────
  // metadata.mockExamId bo'yicha filtrlash — JSON path.
  const rawFees = await prisma.$queryRaw<
    {
      id: string;
      studentId: number | null;
      amount: number;
      balanceBefore: number;
      balanceAfter: number;
      createdAt: Date;
      reversedAt: Date | null;
      examId: string | null;
      participantId: string | null;
    }[]
  >`
    SELECT t.id,
           t."studentId",
           t.amount,
           t."balanceBefore",
           t."balanceAfter",
           t."createdAt",
           t."reversedAt",
           t.metadata->>'mockExamId'        AS "examId",
           t.metadata->>'mockParticipantId' AS "participantId"
    FROM "Transaction" t
    WHERE t.type = 'MOCK_EXAM_FEE'
      AND t.metadata->>'mockExamId' = ANY(${examIds})
    ORDER BY t."createdAt" ASC
  `;

  const fees: FeeRow[] = rawFees
    .filter((r) => r.studentId != null && r.examId != null)
    .map((r) => ({
      txId: r.id,
      studentId: r.studentId as number,
      amount: Number(r.amount),
      balanceBefore: Number(r.balanceBefore),
      balanceAfter: Number(r.balanceAfter),
      createdAt: r.createdAt,
      reversedAt: r.reversedAt,
      examId: r.examId as string,
      participantId: r.participantId,
    }));

  // Faqat haqiqiy yechib olishlar (manfiy). Qaytarish qatori musbat bo'ladi.
  const debits = fees.filter((f) => f.amount < 0);
  const credits = fees.filter((f) => f.amount > 0);

  // ── 3. Ishtirokchilar ───────────────────────────────────────────────────
  const participants = await prisma.mockExamParticipant.findMany({
    where: { examId: { in: examIds } },
    select: {
      id: true,
      examId: true,
      firstName: true,
      lastName: true,
      phone: true,
      publicId: true,
      studentId: true,
      feeAmount: true,
      paid: true,
      paidAt: true,
      registeredAt: true,
      deletedAt: true,
      level: true,
    },
    orderBy: { registeredAt: 'asc' },
  });

  const pById = new Map(participants.map((p) => [p.id, p]));

  // ── 4. Zarar tahlili uchun o'quvchi ma'lumotlari ─────────────────────────
  const studentIds = [...new Set(debits.map((d) => d.studentId))];
  const students = await prisma.student.findMany({
    where: { id: { in: studentIds } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      balance: true,
      status: true,
      deletedAt: true,
      enrollments: {
        where: { status: 'ACTIVE' },
        select: {
          id: true,
          prepaidLessonsRemaining: true,
          group: {
            select: {
              id: true,
              name: true,
              course: { select: { price: true, lessonPaymentCount: true } },
            },
          },
        },
      },
    },
  });
  const sById = new Map(students.map((s) => [s.id, s]));

  // Yechilgandan KEYIN qarzga tushgan darslar bormi — LESSON_DEDUCTION siz
  // qolgan davomatlar (retroaktiv billing yopmagan).
  const unbilled = await prisma.$queryRaw<{ studentId: number; cnt: bigint; firstDate: Date }[]>`
    SELECT a."studentId", COUNT(*)::bigint AS cnt, MIN(a.date) AS "firstDate"
    FROM "Attendance" a
    JOIN "Enrollment" e ON e."studentId" = a."studentId" AND e."groupId" = a."groupId"
    WHERE a."studentId" = ANY(${studentIds})
      AND a.status IN ('PRESENT', 'LATE', 'ABSENT')
      AND a.date >= DATE '2026-05-01'
      AND NOT EXISTS (
        SELECT 1 FROM "Transaction" c
        WHERE c."attendanceId" = a.id
          AND c.type = 'LESSON_CONSUMPTION'
          AND c."reversedAt" IS NULL
      )
    GROUP BY a."studentId"
  `;
  const unbilledById = new Map(unbilled.map((u) => [u.studentId, u]));

  // ── 5. Asosiy jadval ────────────────────────────────────────────────────
  section(`Balansdan yechilgan mock to'lovlari — ${debits.length} ta`);

  let total = 0;
  const rows = debits.map((d) => {
    const s = sById.get(d.studentId);
    const p = d.participantId ? pById.get(d.participantId) : undefined;
    const course = s?.enrollments[0]?.group.course;
    const perLesson = course ? Math.round(course.price / (course.lessonPaymentCount || 1)) : 0;
    total += -d.amount;

    // Zarar bahosi: yechilgandan keyingi balans bitta darsga yetdimi?
    let harm = 'yo\'q';
    if (d.balanceAfter < 0) harm = 'QARZGA TUSHDI';
    else if (perLesson > 0 && d.balanceAfter < perLesson) harm = '1 darsga yetmaydi';
    if (d.reversedAt) harm = 'qaytarilgan';

    return [
      String(d.studentId),
      s ? `${s.lastName} ${s.firstName}` : '—',
      s?.phone ?? '—',
      som(-d.amount),
      som(d.balanceBefore),
      som(d.balanceAfter),
      dt(d.createdAt),
      p?.level ?? '—',
      perLesson ? som(perLesson) : '—',
      harm,
      som(s?.balance),
    ];
  });

  printTable(
    ['ID', 'O\'quvchi', 'Telefon', 'Yechildi', 'Oldin', 'Keyin', 'Sana', 'Lvl', '1 dars', 'Zarar', 'Hozirgi bal.'],
    rows,
    ['l', 'l', 'l', 'r', 'r', 'r', 'l', 'l', 'r', 'l', 'r'],
  );
  console.log(`\n  JAMI yechilgan: ${som(total)} so'm  (${debits.length} o'quvchi)`);
  if (credits.length) {
    const back = credits.reduce((a, c) => a + c.amount, 0);
    console.log(`  Qaytarilgan:    ${som(back)} so'm  (${credits.length} qator)`);
  }

  // ── 6. Zarar ko'rganlar ─────────────────────────────────────────────────
  const harmed = debits.filter((d) => !d.reversedAt && d.balanceAfter < 0);
  section(`Yechilgandan keyin QARZGA tushganlar — ${harmed.length} ta`);
  printTable(
    ['ID', 'O\'quvchi', 'Yechildi', 'Balans keyin', 'Hozirgi balans', 'Yopilmagan darslar'],
    harmed.map((d) => {
      const s = sById.get(d.studentId);
      const u = unbilledById.get(d.studentId);
      return [
        String(d.studentId),
        s ? `${s.lastName} ${s.firstName}` : '—',
        som(-d.amount),
        som(d.balanceAfter),
        som(s?.balance),
        u ? `${Number(u.cnt)} ta (${day(u.firstDate)} dan)` : '—',
      ];
    }),
    ['l', 'l', 'r', 'r', 'r', 'l'],
  );

  const thin = debits.filter((d) => !d.reversedAt && d.balanceAfter >= 0);
  section(`Qarzga tushmaganlar, lekin balansi kamaydi — ${thin.length} ta`);
  printTable(
    ['ID', 'O\'quvchi', 'Yechildi', 'Balans keyin', 'Hozirgi balans', 'Yopilmagan darslar'],
    thin.map((d) => {
      const s = sById.get(d.studentId);
      const u = unbilledById.get(d.studentId);
      return [
        String(d.studentId),
        s ? `${s.lastName} ${s.firstName}` : '—',
        som(-d.amount),
        som(d.balanceAfter),
        som(s?.balance),
        u ? `${Number(u.cnt)} ta (${day(u.firstDate)} dan)` : '—',
      ];
    }),
    ['l', 'l', 'r', 'r', 'r', 'l'],
  );

  // ── 7. Ishtirokchilar bo'yicha to'liq manzara ────────────────────────────
  const debitByParticipant = new Map(debits.map((d) => [d.participantId ?? '', d]));

  section('Barcha ishtirokchilar — to\'lov usuli');
  const partRows = participants
    .filter((p) => !p.deletedAt)
    .map((p) => {
      const d = debitByParticipant.get(p.id);
      const isStudent = p.studentId != null;
      let method: string;
      if (d) method = 'BALANSDAN (dars puli)';
      else if (p.paid && isStudent) method = 'to\'langan, balansdan EMAS';
      else if (p.paid) method = 'tashqi (naqd/gateway)';
      else method = 'TO\'LANMAGAN';
      return [
        String(p.publicId),
        `${p.lastName} ${p.firstName}`,
        p.phone,
        isStudent ? String(p.studentId) : '— (tashqi)',
        som(p.feeAmount ?? examById.get(p.examId)?.price ?? 0),
        p.paid ? 'ha' : 'yo\'q',
        dt(p.paidAt),
        method,
      ];
    });
  printTable(
    ['publicId', 'Ism', 'Telefon', 'studentId', 'To\'lov', 'paid', 'paidAt', 'Usul'],
    partRows,
    ['l', 'l', 'l', 'l', 'r', 'l', 'l', 'l'],
  );

  // ── 8. Ikki marta to'lash xavfi: balansdan ham, gateway orqali ham ───────
  const gw = await prisma.mockExamGatewayTransaction.findMany({
    where: { mockParticipant: { examId: { in: examIds } } },
    select: {
      id: true,
      mockParticipantId: true,
      provider: true,
      amount: true,
      amountInSom: true,
      state: true,
      createdAt: true,
    },
  });
  const gwByParticipant = new Map<string, typeof gw>();
  for (const g of gw) {
    const list = gwByParticipant.get(g.mockParticipantId) ?? [];
    list.push(g);
    gwByParticipant.set(g.mockParticipantId, list);
  }
  const doubled = debits.filter((d) => d.participantId && gwByParticipant.has(d.participantId));

  section(`IKKI MARTA to'lash xavfi (balans + gateway) — ${doubled.length} ta`);
  printTable(
    ['studentId', 'Balansdan', 'Gateway', 'Holat'],
    doubled.map((d) => {
      const g = gwByParticipant.get(d.participantId!) ?? [];
      return [
        String(d.studentId),
        som(-d.amount),
        g.map((x) => `${x.provider} ${som(x.amountInSom)} [state=${x.state}]`).join(', '),
        'TEKSHIRISH KERAK',
      ];
    }),
    ['l', 'r', 'l', 'l'],
  );

  // ── 9. Xulosa ───────────────────────────────────────────────────────────
  section('Xulosa');
  console.log(`  Ishtirokchilar (faol):        ${participants.filter((p) => !p.deletedAt).length}`);
  console.log(`  DaF o'quvchisi:               ${participants.filter((p) => !p.deletedAt && p.studentId).length}`);
  console.log(`  Balansdan yechilgan:          ${debits.length} ta, ${som(total)} so'm`);
  console.log(`  Shundan qarzga tushgan:       ${harmed.length} ta`);
  console.log(`  Tashqi to'lov (naqd/gateway): ${participants.filter((p) => !p.deletedAt && p.paid && !debitByParticipant.has(p.id)).length}`);
  console.log(`  To'lanmagan:                  ${participants.filter((p) => !p.deletedAt && !p.paid).length}`);
}

run(main);
