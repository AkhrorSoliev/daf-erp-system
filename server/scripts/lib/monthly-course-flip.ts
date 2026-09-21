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
import type { SettingKey } from '../../src/settings/settings.types';

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

/**
 * YAKUNIY QADAMNING IKKINCHI YARMI: `payment.defaultModel = MONTHLY`.
 *
 * `flipCoursesToMonthly` faqat MAVJUD kurslarni ko'chiradi. Cutover'dan
 * KEYIN ochilgan YANGI kurs esa modelni shu sozlamadan oladi
 * (`CoursesService.create`), uning kodlangan boshlang'ichi esa ataylab
 * `LESSON_PACK` — kod chiqqan kuni yaratilgan kurs jimgina oylikka o'tib
 * ketmasligi uchun. Ya'ni migratsiyadan keyin ikkinchi, teskari teshik
 * ochiladi: `--apply` toza tugagach ochilgan birinchi kurs 12 talik
 * paketda qolardi, `MonthlyBillingCronService` unga hisob yozmasdi va
 * o'sha guruh oylik hisob va qarz hisobotlarida umuman ko'rinmasdi.
 * Kafolat «CEO panelda tugmani bosishni unutmasin» bo'lib qolmasligi
 * uchun bayroq va sozlama BITTA qadamda almashadi.
 *
 * `upsert` EMAS: `Setting` ning `@@unique([companyId, branchId, key])`
 * indeksida `branchId = null` Postgres uchun har doim "boshqa" qiymat —
 * `SettingsService.set` dagi `findFirst` + create/update naqshi (u yerda
 * sabab to'liq yozilgan).
 *
 * Sozlamalar keshi (`settings:company:<id>`, TTL 5 daqiqa) bu yerdan
 * o'chirilmaydi: skript Redis'siz DI grafigi bilan ishlaydi
 * (`MigrationModule` ataylab RedisModule'ni ko'tarmaydi). Kesh o'zi
 * eskiradi, shuning uchun chaqiruvchi shu 5 daqiqa oynasini baland aytadi.
 *
 * `branchOverrides` — shu kalit bo'yicha saqlangan filial qatorlari.
 * Ular kompaniya qiymatidan USTUN, shuning uchun jim qoldirilmaydi.
 *
 * Yozuv `EntityHistory` ga TUSHMAYDI (yonidagi `flipCoursesToMonthly` dagi
 * `Course.paymentModel` yozuvi ham shunday): skript `SettingsService` ni
 * emas, `PrismaClient` ni ishlatadi. Dalil — migratsiyaning o'z hisoboti va
 * shu yerdagi konsol yozuvlari; sozlamani keyin kim o'zgartirgani esa
 * panel orqali odatdagidek tarixga tushadi.
 */
export async function flipDefaultModelSettingToMonthly(params: {
  prisma: PrismaClient;
  companyIds: number[];
}): Promise<{
  written: number[];
  alreadyMonthly: number[];
  branchOverrides: { companyId: number; branchId: number; value: unknown }[];
}> {
  const key: SettingKey = 'payment.defaultModel';
  const written: number[] = [];
  const alreadyMonthly: number[] = [];
  const branchOverrides: {
    companyId: number;
    branchId: number;
    value: unknown;
  }[] = [];

  for (const companyId of params.companyIds) {
    const rows = await params.prisma.setting.findMany({
      where: { companyId, key },
      select: { id: true, branchId: true, value: true },
    });

    for (const row of rows) {
      if (row.branchId != null && row.value !== PaymentModel.MONTHLY) {
        branchOverrides.push({
          companyId,
          branchId: row.branchId,
          value: row.value,
        });
      }
    }

    const companyRow = rows.find((r) => r.branchId === null);
    if (companyRow && companyRow.value === PaymentModel.MONTHLY) {
      alreadyMonthly.push(companyId);
      continue;
    }

    if (companyRow) {
      await params.prisma.setting.update({
        where: { id: companyRow.id },
        data: { value: PaymentModel.MONTHLY },
      });
    } else {
      await params.prisma.setting.create({
        data: {
          companyId,
          branchId: null,
          key,
          value: PaymentModel.MONTHLY,
        },
      });
    }
    written.push(companyId);
  }

  return { written, alreadyMonthly, branchOverrides };
}
