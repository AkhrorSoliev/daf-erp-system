/**
 * fix-mock-exam-balance-overcharge — «DaF Mock Imtihoni» (1ba9ff96) tuzatishi.
 *
 * MUAMMO. Imtihon puli kassada naqd yig'ilgan (barcha 72 ishtirokchining balli
 * kiritilgan = hammasi to'lagan), lekin MockExamBillingService o'quvchining DARS
 * balansidan ham avtomatik yechib olgan. Ustiga-ustak billing so'rovi imtihon
 * HOLATINI tekshirmaydi (`paid=false` bo'lsa kifoya), shuning uchun arxivlangan
 * imtihon hamon yechishga tayyor turibdi.
 *
 * IKKI QADAM (ikkalasi ham idempotent):
 *   1. Arxivlangan imtihonning `paid=false` qatorlarini yopadi (naqd to'langan)
 *      → kelajakdagi 810 000 so'mlik avtomatik yechim to'xtaydi. Pul harakati YO'Q.
 *   2. Yechib olingan 23 ta MOCK_EXAM_FEE ni bekor qiladi → 21 o'quvchiga jami
 *      690 000 so'm balansga qaytadi.
 *
 * Reversal `TransactionsWriteService.reverseTransaction` bilan bir xil shaklda
 * yoziladi: originalga `reversedAt` qo'yiladi, so'ng `reversedTransactionId`
 * bog'langan teskari qator yaratiladi. MOCK_EXAM_FEE CASH_FLOW_TYPES ga
 * kirmaydi, shuning uchun qaytariladigan CashMovement yo'q.
 *
 * Usage:
 *   railway run npx ts-node scripts/fix-mock-exam-balance-overcharge.ts            (DRY-RUN)
 *   railway run npx ts-node scripts/fix-mock-exam-balance-overcharge.ts --apply    (YOZADI)
 */
import { PrismaClient, Prisma, TransactionType } from '@prisma/client';
import { som, dt, printHeader, section, printTable, run } from './lib/check-cli';

const EXAM_ID = '1ba9ff96-fd58-4400-b831-323f6f420fc1';
const PERFORMED_BY = 10000; // CEO — Orif Akhmadaliyev
const MARKER = 'mock-overcharge-2026-08';
const REASON =
  "Mock imtihon puli kassada naqd to'langan, balansdan ortiqcha yechilgan (mock-overcharge-2026-08)";

async function main(prisma: PrismaClient) {
  const apply = process.argv.includes('--apply');
  printHeader(
    `MOCK IMTIHON ORTIQCHA YECHIM TUZATISHI — ${apply ? 'YOZISH REJIMI' : 'DRY-RUN'}`,
  );

  const exam = await prisma.mockExam.findUnique({
    where: { id: EXAM_ID },
    select: { id: true, title: true, status: true, companyId: true },
  });
  if (!exam) throw new Error(`Imtihon topilmadi: ${EXAM_ID}`);
  console.log(`\n  Imtihon: ${exam.title} [${exam.status}]`);

  // ── QADAM 1: kutayotgan avtomatik yechimlarni to'xtatish ────────────────
  section("QADAM 1 — kutayotgan avtomatik yechimlarni yopish (paid=true)");

  const pending = await prisma.mockExamParticipant.findMany({
    where: { examId: EXAM_ID, paid: false, deletedAt: null, studentId: { not: null } },
    select: {
      id: true, publicId: true, studentId: true, firstName: true, lastName: true,
      feeAmount: true, totalScore: true, gradedAt: true,
    },
    orderBy: { publicId: 'asc' },
  });

  // Xavfsizlik: faqat imtihonni HAQIQATAN topshirgan (balli kiritilgan)
  // ishtirokchini "to'landi" deb belgilaymiz — bu to'lov dalili.
  const closeable = pending.filter((p) => p.gradedAt != null || p.totalScore != null);
  const skipped = pending.filter((p) => p.gradedAt == null && p.totalScore == null);

  printTable(
    ['publicId', 'studentId', "O'quvchi", 'Ball', "To'lov", 'Amal'],
    pending.map((p) => [
      String(p.publicId), String(p.studentId), `${p.lastName} ${p.firstName}`,
      p.totalScore == null ? '—' : String(p.totalScore),
      som(p.feeAmount ?? 30000),
      closeable.includes(p) ? "paid=true qilinadi" : "TEGILMAYDI (ball yo'q)",
    ]),
    ['l', 'l', 'l', 'r', 'r', 'l'],
  );
  const blocked = closeable.reduce((a, p) => a + (p.feeAmount ?? 30000), 0);
  console.log(`\n  Yopiladi: ${closeable.length} ta → ${som(blocked)} so'm avtomatik yechim to'xtaydi`);
  if (skipped.length) console.log(`  Tegilmaydi (ball kiritilmagan): ${skipped.length} ta`);

  if (apply && closeable.length) {
    const now = new Date();
    const res = await prisma.mockExamParticipant.updateMany({
      where: { id: { in: closeable.map((p) => p.id) }, paid: false },
      data: { paid: true, paidAt: now },
    });
    console.log(`  ✔ ${res.count} ta qator yopildi.`);
  }

  // ── QADAM 2: ortiqcha yechimlarni qaytarish ─────────────────────────────
  section('QADAM 2 — balansdan yechilgan pulni qaytarish');

  const fees = await prisma.$queryRaw<
    { id: string; studentId: number; amount: number; createdAt: Date }[]
  >`
    SELECT t.id, t."studentId", t.amount, t."createdAt"
    FROM "Transaction" t
    WHERE t.type = 'MOCK_EXAM_FEE'
      AND t.amount < 0
      AND t."reversedAt" IS NULL
      AND t.metadata->>'mockExamId' = ${EXAM_ID}
      AND t."studentId" IS NOT NULL
    ORDER BY t."createdAt" ASC
  `;

  const students = await prisma.student.findMany({
    where: { id: { in: [...new Set(fees.map((f) => f.studentId))] } },
    select: { id: true, firstName: true, lastName: true, balance: true, status: true },
  });
  const sById = new Map(students.map((s) => [s.id, s]));

  // Bir o'quvchida bir nechta yechim bo'lishi mumkin (10648, 10710) — jamlab
  // ko'rsatamiz, lekin har bir qator alohida bekor qilinadi.
  const perStudent = new Map<number, number>();
  for (const f of fees) perStudent.set(f.studentId, (perStudent.get(f.studentId) ?? 0) + -f.amount);

  printTable(
    ['ID', "O'quvchi", 'Marta', 'Qaytariladi', 'Hozirgi balans', 'Keyingi balans', 'Holat'],
    [...perStudent.entries()].map(([id, sum]) => {
      const s = sById.get(id);
      const cnt = fees.filter((f) => f.studentId === id).length;
      return [
        String(id), s ? `${s.lastName} ${s.firstName}` : '—', String(cnt), som(sum),
        som(s?.balance), som((s?.balance ?? 0) + sum), s?.status ?? '—',
      ];
    }),
    ['l', 'l', 'r', 'r', 'r', 'r', 'l'],
  );
  const totalBack = fees.reduce((a, f) => a + -f.amount, 0);
  console.log(
    `\n  ${fees.length} ta yechim, ${perStudent.size} o'quvchi, jami ${som(totalBack)} so'm qaytariladi.`,
  );

  if (!apply) {
    console.log('\n  DRY-RUN — hech narsa yozilmadi. Yozish uchun: --apply');
    return;
  }

  let ok = 0;
  let failed = 0;
  for (const fee of fees) {
    try {
      await prisma.$transaction(
        async (tx) => {
          // Idempotentlik: tranzaksiya ichida qayta o'qiymiz.
          const original = await tx.transaction.findUnique({ where: { id: fee.id } });
          if (!original || original.reversedAt) return;

          const [student] = await tx.$queryRaw<{ id: number; balance: number }[]>`
            SELECT id, balance FROM "Student" WHERE id = ${original.studentId!} FOR UPDATE
          `;
          if (!student) throw new Error(`Student ${original.studentId} topilmadi`);

          const reversalAmount = -original.amount; // musbat
          const balanceBefore = student.balance;
          const balanceAfter = balanceBefore + reversalAmount;

          await tx.student.update({
            where: { id: student.id },
            data: { balance: balanceAfter },
          });

          // Originalni AVVAL belgilaymiz — qisman unique indekslar
          // `reversedAt IS NULL` bo'yicha ishlaydi.
          await tx.transaction.update({
            where: { id: original.id },
            data: { reversedAt: new Date(), reversedById: PERFORMED_BY },
          });

          await tx.transaction.create({
            data: {
              type: TransactionType.MOCK_EXAM_FEE,
              amount: reversalAmount,
              balanceBefore,
              balanceAfter,
              studentId: original.studentId,
              branchId: original.branchId,
              companyId: original.companyId,
              performedById: PERFORMED_BY,
              reversedTransactionId: original.id,
              description: `Bekor qilindi: ${REASON}`,
              metadata: {
                ...(original.metadata as object),
                correctionMarker: MARKER,
              } as Prisma.InputJsonValue,
            },
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10000,
          timeout: 15000,
        },
      );
      ok++;
      console.log(`  ✔ ${fee.studentId} — ${som(-fee.amount)} qaytarildi (${dt(fee.createdAt)})`);
    } catch (e) {
      failed++;
      console.error(`  ✖ ${fee.studentId} — ${(e as Error).message}`);
    }
  }

  section('Natija');
  console.log(`  Qaytarildi: ${ok} ta`);
  if (failed) console.log(`  Xato:       ${failed} ta`);

  // Tekshiruv
  const left = await prisma.$queryRaw<{ cnt: bigint }[]>`
    SELECT COUNT(*)::bigint AS cnt FROM "Transaction" t
    WHERE t.type = 'MOCK_EXAM_FEE' AND t.amount < 0 AND t."reversedAt" IS NULL
      AND t.metadata->>'mockExamId' = ${EXAM_ID}
  `;
  const stillPending = await prisma.mockExamParticipant.count({
    where: { examId: EXAM_ID, paid: false, deletedAt: null, studentId: { not: null } },
  });
  console.log(`  Qolgan bekor qilinmagan yechim: ${Number(left[0].cnt)} ta (0 bo'lishi kerak)`);
  console.log(`  Qolgan kutayotgan qator:        ${stillPending} ta`);
}

run(main);
