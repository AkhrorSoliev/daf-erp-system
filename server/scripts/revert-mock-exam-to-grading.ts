/**
 * revert-mock-exam-to-grading — bitta mock imtihonni ANNOUNCED dan GRADING ga qaytaradi.
 *
 * Nega kerak: imtihon xato bilan baholanmasdan turib e'lon qilinganda ballarni
 * kiritish uchun GRADING holati talab qilinadi (mock-exam-results.service.ts),
 * lekin `MOCK_EXAM_STATUS_TRANSITIONS` da ANNOUNCED → GRADING yo'q, ya'ni UI
 * orqali qaytarib bo'lmaydi. Bu — bir martalik operatsion tuzatish.
 *
 * Nima qiladi (bitta Serializable tranzaksiyada):
 *   1. MockExam.status → GRADING; announcedAt / announcedById tozalanadi
 *      (e'lon chaqirib olindi; qayta e'lon qilinganda changeStatus ularni
 *      yangidan qo'yadi).
 *   2. Qatnashchilardagi yetkazib berish belgilari tozalanadi
 *      (resultSentAt / resultMessageId / resultSendError) — ballar kiritilib
 *      qayta e'lon qilinganda broadcastMockResults hammaga bir marta
 *      to'g'ri PDF yuboradi. Hozir hech qanday xabar YUBORILMAYDI.
 *   3. EntityHistory ga STATUS_CHANGE yozuvi qo'shiladi.
 *
 * resultsPdfFileKey ataylab tegilmaydi — GRADING holatida botning barcha
 * o'qish yo'llari (showMockResultsMenu, sendMockResultPdf) status ANNOUNCED
 * ni talab qiladi, shuning uchun eski PDF hech kimga ko'rinmaydi; qayta
 * e'lon qilinganda u yangisi bilan almashtiriladi.
 *
 * Usage:
 *   railway run npx ts-node --transpile-only scripts/revert-mock-exam-to-grading.ts <examId> --by=<userId>
 *   ... --apply    (yozadi; flagsiz — faqat dry-run)
 */
import { Prisma } from '@prisma/client';
import { makePrisma } from './lib/check-cli';

async function main() {
  const argv = process.argv.slice(2);
  const examId = argv.find((a) => !a.startsWith('--'));
  const apply = argv.includes('--apply');
  const byArg = argv.find((a) => a.startsWith('--by='));
  const changedById = byArg ? Number(byArg.split('=')[1]) : undefined;

  if (!examId) {
    console.error(
      'Usage: npx ts-node scripts/revert-mock-exam-to-grading.ts <examId> --by=<userId> [--apply]',
    );
    process.exitCode = 1;
    return;
  }

  const prisma = makePrisma();
  try {
    const exam = await prisma.mockExam.findFirst({
      where: { id: examId, deletedAt: null },
      select: {
        id: true,
        title: true,
        status: true,
        examDate: true,
        announcedAt: true,
        announcedById: true,
        resultsPdfFileKey: true,
      },
    });
    if (!exam) {
      console.error(`Mock imtihon topilmadi: ${examId}`);
      process.exitCode = 1;
      return;
    }

    const [total, graded, sent] = await Promise.all([
      prisma.mockExamParticipant.count({
        where: { examId, deletedAt: null },
      }),
      prisma.mockExamParticipant.count({
        where: { examId, deletedAt: null, gradedAt: { not: null } },
      }),
      prisma.mockExamParticipant.count({
        where: { examId, deletedAt: null, resultSentAt: { not: null } },
      }),
    ]);

    console.log('=== HOZIRGI HOLAT ===');
    console.log(`  imtihon:      ${exam.title} (${exam.id})`);
    console.log(`  status:       ${exam.status}`);
    console.log(`  e'lon:        ${exam.announcedAt?.toISOString() ?? '—'} (user ${exam.announcedById ?? '—'})`);
    console.log(`  qatnashchi:   ${total} ta`);
    console.log(`  baholangan:   ${graded} ta`);
    console.log(`  PDF olgan:    ${sent} ta`);

    if (exam.status === 'GRADING') {
      console.log('\nImtihon allaqachon GRADING holatida — o‘zgartirish shart emas.');
      return;
    }
    if (exam.status !== 'ANNOUNCED') {
      console.error(
        `\nKutilgan status ANNOUNCED edi, topildi: ${exam.status}. To‘xtatildi.`,
      );
      process.exitCode = 1;
      return;
    }
    if (graded > 0) {
      console.error(
        `\nDIQQAT: ${graded} ta qatnashchi allaqachon baholangan. Bu skript baholangan imtihon uchun mo‘ljallanmagan. To‘xtatildi.`,
      );
      process.exitCode = 1;
      return;
    }

    console.log('\n=== BAJARILADI ===');
    console.log('  1. status ANNOUNCED → GRADING');
    console.log('  2. announcedAt / announcedById → NULL');
    console.log(`  3. ${sent} ta qatnashchida resultSentAt / resultMessageId / resultSendError → NULL`);
    console.log('  4. EntityHistory: STATUS_CHANGE yozuvi');
    console.log('  (hech qanday Telegram xabari yuborilmaydi)');

    if (!apply) {
      console.log('\n[DRY-RUN] Hech narsa yozilmadi. Yozish uchun --apply qo‘shing.');
      return;
    }

    let companyId: number | null = null;
    if (changedById) {
      const u = await prisma.user.findUnique({
        where: { id: changedById },
        select: { companyId: true },
      });
      companyId = u?.companyId ?? null;
    }

    const result = await prisma.$transaction(
      async (tx) => {
        const updated = await tx.mockExam.updateMany({
          where: { id: examId, status: 'ANNOUNCED', deletedAt: null },
          data: { status: 'GRADING', announcedAt: null, announcedById: null },
        });
        if (updated.count !== 1) {
          throw new Error(
            `Status yangilanmadi (updated=${updated.count}) — imtihon holati o‘zgargan bo‘lishi mumkin.`,
          );
        }

        const cleared = await tx.mockExamParticipant.updateMany({
          where: { examId, deletedAt: null, resultSentAt: { not: null } },
          data: {
            resultSentAt: null,
            resultMessageId: null,
            resultSendError: null,
          },
        });

        await tx.entityHistory.create({
          data: {
            entityType: 'MockExam',
            entityId: examId,
            action: 'STATUS_CHANGE',
            oldValues: { status: 'ANNOUNCED' },
            newValues: {
              status: 'GRADING',
              note: `Baholanmasdan e'lon qilingan edi; ballarni kiritish uchun qaytarildi (${cleared.count} ta yuborish belgisi tozalandi)`,
            },
            changedById: changedById ?? null,
            companyId,
          },
        });

        return { cleared: cleared.count };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    console.log(`\n✅ Bajarildi. Status = GRADING, ${result.cleared} ta yuborish belgisi tozalandi.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
