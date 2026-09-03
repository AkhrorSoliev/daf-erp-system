/**
 * Migratsiyaning YAKUNIY qadami — `Course.paymentModel = MONTHLY`.
 *
 * Alohida faylda, chunki bu qadam alohida sinaladi: u butun o'tishning
 * eng xavfli bitta qatori.
 */
import {
  EnrollmentStatus,
  GroupStatus,
  MonthlyChargeStatus,
  PaymentModel,
  PrismaClient,
} from '@prisma/client';

/**
 * YAKUNIY QADAM: kurslarni `MONTHLY` ga o'tkazish.
 *
 * ATAYLAB o'quvchi tranzaksiyasidan TASHQARIDA va butun o'tish tugagandan
 * KEYIN. Sabab `scripts/lib/monthly-migration-apply.ts` sarlavhasida
 * to'liq yozilgan: `paymentModel` KURS darajasidagi bayroq, prodda bitta
 * kursda 51 guruh bor, va uni birinchi o'quvchida almashtirish ishlab
 * turgan backendni ~300 ta hali ko'chmagan kursdoshga qarshi qurollantirardi
 * (kunlik qorovul har biriga to'liq oylik hisob yozardi, ~135 mln so'm, va
 * o'sha hisoblar ularni migratsiyaning qamrovidan chiqarib, keyingi ishga
 * tushirishni "muvaffaqiyat" deb yakunlatardi).
 *
 * Bayroq har bir kurs uchun ALOHIDA hal qilinadi va SHART: o'sha kursda
 * shu davr uchun hisobi yo'q, ACTIVE guruhdagi, ACTIVE yozilish qolmasligi
 * kerak. So'rov `MonthlyChargeService.createChargesForPeriod` ning
 * so'rovidan faqat `paymentModel` filtri bilan farq qiladi — ya'ni javob
 * so'zma-so'z "bayroq shu lahzada almashsa, qorovul kimga hisob yozardi".
 * Nol bo'lsa — hech kimga; boshqa har qanday son bayroqni bloklaydi.
 *
 * `skippedEnrollmentIds` — shu ishning O'ZI bilib o'tkazib yuborganlari
 * (PAUSED guruh, oyda dars kuni yo'q). Ular hech qachon hisob olmaydi,
 * shuning uchun ro'yxatdan chiqariladi; aks holda bayroq abadiy bloklanardi.
 * Ular qorovul uchun ham xavfsiz: PAUSED guruh uning so'roviga tushmaydi,
 * dars kuni yo'q yozilishga esa `createChargeForEnrollment` `null` qaytaradi.
 */
export async function flipCoursesToMonthly(params: {
  prisma: PrismaClient;
  courseIds: string[];
  skippedEnrollmentIds: string[];
  year: number;
  month: number;
}): Promise<{
  flipped: string[];
  blocked: { courseId: string; courseName: string; remaining: number }[];
}> {
  const flipped: string[] = [];
  const blocked: { courseId: string; courseName: string; remaining: number }[] =
    [];

  for (const courseId of params.courseIds) {
    const course = await params.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, name: true, paymentModel: true },
    });
    if (!course) {
      blocked.push({ courseId, courseName: '(topilmadi)', remaining: -1 });
      continue;
    }

    const remaining = await params.prisma.enrollment.count({
      where: {
        id: { notIn: params.skippedEnrollmentIds },
        status: EnrollmentStatus.ACTIVE,
        deletedAt: null,
        group: {
          deletedAt: null,
          statusEnum: GroupStatus.ACTIVE,
          courseId,
          course: { deletedAt: null },
        },
        student: { deletedAt: null, status: 'ACTIVE' },
        monthlyCharges: {
          none: {
            periodYear: params.year,
            periodMonth: params.month,
            status: MonthlyChargeStatus.CHARGED,
          },
        },
      },
    });

    if (remaining > 0) {
      blocked.push({ courseId, courseName: course.name, remaining });
      continue;
    }

    if (course.paymentModel !== PaymentModel.MONTHLY) {
      await params.prisma.course.update({
        where: { id: courseId },
        data: { paymentModel: PaymentModel.MONTHLY },
      });
    }
    flipped.push(course.name);
  }

  return { flipped, blocked };
}
