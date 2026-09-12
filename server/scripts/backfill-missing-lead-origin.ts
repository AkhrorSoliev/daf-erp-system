/**
 * backfill-missing-lead-origin — lidsiz qolgan o'quvchilarga lid yozuvi yaratadi.
 *
 * Usage: npx tsx scripts/backfill-missing-lead-origin.ts --since <sana|ISO vaqt> [--apply]
 *        railway run npx tsx scripts/backfill-missing-lead-origin.ts --since 2026-09-10T15:25:00Z --apply
 *
 * NEGA KERAK. ADR-0017 «har bir o'quvchi lid sifatida tug'iladi» deb va'da
 * berdi, lekin faqat `/students` eshigini yopdi. Telegram boti va mock imtihon
 * yo'llari bazaga to'g'ridan yozardi, shuning uchun deploydan keyin ham o'quvchi
 * lidsiz tug'ilaverdi (10.09–12.09 oralig'ida 16 tadan 13 tasi).
 *
 * `--since` dan OLDINGI o'quvchilarga ataylab tegilmaydi: ular tuzatishdan
 * oldin kelgan va CEO qarori bo'yicha tegilmaydi (ADR-0017, «Narx» bo'limi).
 * Sana bermasangiz skript ishlamaydi — butun bazani to'ldirib yuborish
 * tasodifan bo'lmasligi kerak. Deploy kuni chegara kun EMAS, soat: o'sha
 * kuni tuzatishdan oldin kelganlar ham tegilmaydigan to'plamda, shuning
 * uchun to'liq ISO vaqt ham qabul qilinadi.
 *
 * `--apply` bermasangiz hech narsa yozilmaydi, faqat nima bo'lishini ko'rsatadi.
 */
import { PrismaClient } from '@prisma/client';
import {
  SELF_SIGNUP_SOURCE,
  StudentLeadOriginService,
} from '../src/common/student-origin/student-lead-origin.service';
import { makePrisma } from './lib/check-cli';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main(prisma: PrismaClient) {
  const since = arg('--since');
  const apply = process.argv.includes('--apply');

  const isDay = since ? /^\d{4}-\d{2}-\d{2}$/.test(since) : false;
  const from = since
    ? new Date(isDay ? `${since}T00:00:00.000Z` : since)
    : new Date(NaN);

  if (!since || Number.isNaN(from.getTime())) {
    console.error(
      "--since YYYY-MM-DD yoki to'liq ISO vaqt bering (masalan 2026-09-10T15:25:00Z).",
    );
    process.exitCode = 1;
    return;
  }

  const students = await prisma.student.findMany({
    where: { deletedAt: null, createdAt: { gte: from } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      companyId: true,
      createdAt: true,
      telegramChatId: true,
      branches: { select: { branchId: true }, take: 1 },
      mockExamParticipations: { select: { id: true }, take: 1 },
    },
    orderBy: { createdAt: 'asc' },
  });

  const linked = new Set(
    (
      await prisma.lead.findMany({
        where: { convertedStudentId: { in: students.map((s) => s.id) } },
        select: { convertedStudentId: true },
      })
    ).map((l) => l.convertedStudentId!),
  );

  const missing = students.filter((s) => !linked.has(s.id));

  console.log(`${from.toISOString()} dan keyingi tirik o'quvchi : ${students.length}`);
  console.log(`lidga bog'langan                  : ${students.length - missing.length}`);
  console.log(`lidsiz (to'ldiriladi)             : ${missing.length}`);
  if (!missing.length) return;

  const origin = new StudentLeadOriginService(prisma as never);
  let written = 0;

  for (const s of missing) {
    const branchId = s.branches[0]?.branchId ?? null;
    // Qaysi yo'ldan kelganini qayta tiklaymiz: mock ishtirokchisi bo'lsa
    // mock, aks holda telegramChatId bor bo'lsa bot. Ikkovi ham bo'lmasa
    // manba noma'lum — bunday qatorni taxmin qilmaymiz, o'tkazib yuboramiz.
    const sourceName = s.mockExamParticipations.length
      ? SELF_SIGNUP_SOURCE.MOCK_EXAM
      : s.telegramChatId
        ? SELF_SIGNUP_SOURCE.TELEGRAM_BOT
        : null;

    if (!sourceName) {
      console.log(
        `  o'tkazildi #${s.id} ${s.firstName} ${s.lastName} — qaysi yo'ldan kelgani aniqlanmadi`,
      );
      continue;
    }

    console.log(
      `  #${s.id} ${s.firstName} ${s.lastName} | ${s.createdAt.toISOString().slice(0, 10)} | manba: ${sourceName}`,
    );
    if (!apply) continue;

    await prisma.$transaction(async (tx) => {
      const sourceId = await origin.resolveSelfSignupSourceId(
        tx,
        sourceName,
        s.companyId,
      );
      await origin.recordDirectOrigin(tx, {
        studentId: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        phone: s.phone,
        branchId,
        companyId: s.companyId,
        sourceId,
      });
      // Lid o'quvchi bilan bir vaqtda tug'ilishi kerak edi, shuning uchun
      // yozuv sanasi ham o'quvchining sanasi bo'ladi — aks holda voronka
      // ularni bugun kelgan deb sanaydi.
      await tx.lead.updateMany({
        where: { convertedStudentId: s.id },
        data: { createdAt: s.createdAt, statusChangedAt: s.createdAt },
      });
    });
    written++;
  }

  console.log(
    apply
      ? `\nYozildi: ${written} ta lid.`
      : "\nHech narsa yozilmadi. Yozish uchun --apply qo'shing.",
  );
}

const prisma = makePrisma();
main(prisma).finally(() => prisma.$disconnect());
