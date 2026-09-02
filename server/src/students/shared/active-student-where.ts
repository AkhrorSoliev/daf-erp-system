import {
  EnrollmentStatus,
  GroupStatus,
  Prisma,
  StudentStatus,
} from '@prisma/client';

/**
 * «Faol o'quvchi» nima degani — YAGONA ta'rif.
 *
 * Faol o'quvchi = statusi `ACTIVE` **va** hozir faol guruhda faol yozuvi bor.
 * Guruhga umuman qo'shilmagan yoki guruhi tugagan/tashlab ketilgan o'quvchi
 * faol emas — u «guruhlashtirilmagan», ya'ni hali joylashtirilishi kerak.
 *
 * NEGA BITTA FAYLDA: ilgari bu ta'rif uch xil edi va uchtasi ham boshqacha
 * javob berardi (2026-09-02 dagi o'lchov, 12 011 faol statusli o'quvchi):
 *
 *   - `getKpis` (bosh sahifa, Excel «KPI paneli») guruh shartini UMUMAN
 *     qo'ymasdi → 12 011, ya'ni 1 348 ta guruhsiz o'quvchi «faol» sanalardi.
 *   - `/students` «Faol» filtri «o'chirilmagan biror yozuvi bor» derdi,
 *     yozuv DROPPED bo'lsa ham → 11 159.
 *   - `/students` «Guruhlashtirilmagan» filtri esa quyidagi to'g'ri shartni
 *     ishlatardi → 1 348.
 *
 * Birinchi ikkitasi bir-biriga ham, uchinchisiga ham mos kelmasdi: 11 159 +
 * 1 348 = 12 507, ya'ni **496 ta o'quvchi ikkala ro'yxatda ham** turardi,
 * holbuki bu ikki toifa bir-birini istisno qilishi kerak.
 *
 * Quyidagi ikki funksiya AYNAN bitta shartdan quriladi (`some` va `none`),
 * shuning uchun ular har doim bir-birining to'ldiruvchisi bo'lib qoladi:
 * faol + guruhlashtirilmagan = statusi ACTIVE bo'lgan hamma o'quvchi.
 * Buni `active-student-where.spec.ts` tekshiradi.
 */
export const ACTIVE_ENROLLMENT_WHERE: Prisma.EnrollmentWhereInput = {
  deletedAt: null,
  status: EnrollmentStatus.ACTIVE,
  group: { deletedAt: null, statusEnum: GroupStatus.ACTIVE },
};

/** Statusi faol VA faol guruhda o'qiyotgan o'quvchi. */
export function activeStudentWhere(): Prisma.StudentWhereInput {
  return {
    status: StudentStatus.ACTIVE,
    enrollments: { some: ACTIVE_ENROLLMENT_WHERE },
  };
}

/**
 * Statusi faol, LEKIN hozir hech qaysi faol guruhda o'qimayotgan o'quvchi.
 * Hech qachon guruhga qo'shilmaganlar ham, guruhi DROPPED / TRANSFERRED /
 * tugagan bo'lganlar ham shu yerga tushadi — hammasi joylashtirilishi kerak.
 */
export function ungroupedStudentWhere(): Prisma.StudentWhereInput {
  return {
    status: StudentStatus.ACTIVE,
    enrollments: { none: ACTIVE_ENROLLMENT_WHERE },
  };
}
