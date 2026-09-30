import type { Prisma } from '@prisma/client';
import { tashkentDateStr } from '../attendance/shared/date-utils';
import { buildHolidayDateSet } from '../holidays/holiday-date-set';

/**
 * The client `resolveMonthPlan` reads through: a transaction or the service.
 * A free function (not a `MonthlyChargeService` method) so the salary module
 * can read the same plan without importing `BillingModule`, which already
 * imports `SalaryModule`.
 */
export type MonthPlanDb = Pick<
  Prisma.TransactionClient,
  'group' | 'holiday' | 'lessonCancellation' | 'lessonReschedule'
>;

/**
 * Oyning MUZLATILADIGAN rejasi — DAVOMAT KALENDARINING KO'ZGUSI.
 *
 * Qaytaradi:
 *  - `excludedDates` — jadvaldagi kunlardan CHIQADIGANLARI;
 *  - `addedDates` — jadvalda yo'q, lekin oyga QO'SHILADIGAN kunlar
 *    (ko'chirilgan darsning yangi kuni).
 *
 * QOIDA BITTA: reja soni oyda ROSTDAN o'tiladigan darslar soniga teng
 * bo'lishi shart. `plannedLessons` endi ikki narsani belgilaydi — bir
 * darsning muzlatilgan narxi (oy narxi / reja) va FIXED_PER_STUDENT
 * o'qituvchi haqining bo'luvchisi (1-javob: haq oydagi dars soniga
 * bog'liq bo'lmasligi kerak). Reja davomatdan bitta kunga farq qilsa,
 * ustoz oyning 12/13 yoki 14/13 ulushini oladi.
 *
 * Shuning uchun bu metod `AttendanceReadService.applyLessonModifications`
 * ni AYNAN takrorlaydi — u "qaysi kun dars kuni" degan savolning yagona
 * javobi:
 *  - bayram kuni asos ro'yxatdan chiqadi (davomatda ham bayram asos
 *    kunlar ichida yo'q);
 *  - bekor qilingan dars chiqadi VA o'sha kunga ko'chirib kelishni ham
 *    to'sadi (davomatdagi `exclude` to'plami);
 *  - ko'chirilgan darsning ASL kuni chiqadi — yangi kun qayerda
 *    bo'lishidan qat'i nazar;
 *  - ko'chirilgan darsning YANGI kuni shu oy ichida bo'lsa qo'shiladi.
 *    Kun allaqachon jadvalda bo'lsa TO'PLAM uni takrorlamaydi, ya'ni oyga
 *    ikkinchi dars qo'shilmaydi.
 *
 * Ilgari bu yerda faqat BAYRAM ko'chirishlari hisobga olinardi
 * (`newDate` shu oy ichida + asl kun bayram bo'lishi shart edi), shuning
 * uchun uchta oddiy ko'chirish rejani davomatdan ayirib yuborardi:
 * keyingi oyga surish (so'rov qatorni umuman qaytarmasdi), jadvaldagi
 * kunga surish (bayram emas deb tashlab ketilardi) va boshqa oydan
 * ko'chirib kelish (reja 13, davomat 14).
 *
 * Bayramning shu oy ichidagi qoplamasi endi ALOHIDA qoida emas: bayram
 * rejadan chiqadi, qoplama kuni esa qo'shiladi — sanoq o'zgarmaydi va
 * `coveredDates` ga dars ROSTDAN o'tiladigan kun tushadi. Qoplama bekor
 * qilingan bo'lsa (1-topilma) yangi kun `vetoed` ichida bo'lgani uchun
 * umuman qo'shilmaydi va bayram rejadan chiqib ketaveradi — alohida
 * "teskari yozuv" qoidasi kerak emas.
 *
 * CHEKLOV — HISOBDAN KEYIN YOZILGAN KO'CHIRISH KO'RINMAYDI. Bu yerda
 * faqat hisob yozilayotgan DAQIQADA bazada turgan qatorlar ko'rinadi.
 * `MonthlyBillingCronService` hisobni oyning belgilangan kunida yozadi va
 * `createChargeForEnrollment` `CHARGED` qatorni qayta hisoblamaydi,
 * `plannedLessons` ni esa boshqa hech kim yangilamaydi. Bu MA'LUM va
 * QABUL QILINGAN kamchilik (dizayn hujjati §4): to'liq yechim
 * `lesson-reschedule.created/updated/deleted` da hisobni qayta
 * hisoblashni talab qiladi va u pul qatorlariga (`TransactionsWrite
 * Service`) ham tegadi — alohida vazifa.
 *
 * Bayramlar `buildHolidayDateSet` orqali olinadi — u ko'p kunlik
 * bayramlarni (date..endDate), filial qamrovini (global + shu filial) va
 * `deletedAt`/`status` filtrlarini to'g'ri hisobga oladi.
 */
export async function resolveMonthPlan(
  tx: MonthPlanDb,
  groupId: string,
  branchId: number,
  year: number,
  month: number,
): Promise<{ excludedDates: string[]; addedDates: string[] }> {
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEndExclusive = new Date(Date.UTC(year, month, 1));
  const monthEndInclusive = new Date(Date.UTC(year, month, 0));
  const monthStartStr = tashkentDateStr(monthStart);
  const monthEndStr = tashkentDateStr(monthEndInclusive);

  const [group, holidayDates, cancellations, reschedules] = await Promise.all([
    tx.group.findUnique({
      where: { id: groupId },
      select: { startDate: true, endDate: true },
    }),
    buildHolidayDateSet(tx, monthStart, monthEndInclusive, branchId),
    tx.lessonCancellation.findMany({
      where: {
        groupId,
        deletedAt: null,
        date: { gte: monthStart, lt: monthEndExclusive },
      },
      select: { date: true },
    }),
    // ASL kun YOKI yangi kun shu oyga tegsa — qator kerak. Faqat `newDate`
    // bo'yicha so'rash keyingi oyga surilgan darsni ko'rinmas qilardi,
    // faqat `originalDate` bo'yicha so'rash esa boshqa oydan ko'chirib
    // kelingan darsni. `AttendanceReadService` ham aynan shu OR ni yozadi.
    tx.lessonReschedule.findMany({
      where: {
        groupId,
        deletedAt: null,
        OR: [
          { originalDate: { gte: monthStart, lt: monthEndExclusive } },
          { newDate: { gte: monthStart, lt: monthEndExclusive } },
        ],
      },
      select: { originalDate: true, newDate: true },
    }),
  ]);

  // `vetoed` — davomatdagi `exclude` to'plami: bu kunlarda dars YO'Q va
  // bu kunlarga boshqa darsni ko'chirib kelib ham bo'lmaydi.
  const vetoed = new Set<string>();
  for (const c of cancellations) vetoed.add(tashkentDateStr(c.date));
  for (const r of reschedules) vetoed.add(tashkentDateStr(r.originalDate));

  // Bayram asos ro'yxatdan chiqadi, LEKIN ko'chirib kelishni to'smaydi:
  // admin darsni ataylab bayram kuniga ko'chirgan bo'lsa davomat o'sha
  // kuni dars deb sanaydi (`applyLessonModifications` aynan shunday).
  const excluded = new Set<string>(vetoed);
  for (const day of holidayDates) excluded.add(day);

  // Guruhning FAOL OYNASI — ko'chirib kelingan kunga (va FAQAT unga)
  // qo'llanadi. `AttendanceReadService.getLessonDates` butun oyni
  // `[group.startDate, group.endDate]` ga qisadi, shuning uchun o'sha
  // oynadan tashqariga ko'chirilgan dars davomatda HECH QACHON o'tmaydi;
  // uni rejaga qo'shish `plannedLessons`ni oshirib, dars narxini
  // pasaytirar va `FIXED_PER_STUDENT` bo'luvchisini kattalashtirardi.
  // Misol: guruh 20.09 da tugaydi, dars 29.08 -> 25.09 ga ko'chirilgan —
  // reja 14, davomat 9.
  //
  // ASOS RO'YXAT esa ATAYLAB qisilmaydi. Guruh oy o'rtasida boshlansa
  // `plannedLessons` baribir butun oyning dars kunlari bo'lib qoladi:
  // dars narxi `oy narxi / plannedLessons` va u BARCHA guruhlarda bir xil
  // bo'lishi kerak. 7 ga qisilsa, 15-sentabrda boshlangan guruhning bitta
  // darsi 64 286 so'mga chiqib ketardi (450 000 / 7), ya'ni o'quvchi
  // guruhi kech boshlangani uchun ikki baravar to'lardi. Hozirgi holda
  // u 450 000 x 7/13 to'laydi va ustoz ham o'sha ulushni oladi —
  // ikkalasi ham proporsional. Demak bu yerda «reja = davomat» tengligi
  // ataylab buziladi; buning sababi dizayn hujjati §4 da yozilgan.
  const groupStartStr = group?.startDate
    ? tashkentDateStr(group.startDate)
    : null;
  const groupEndStr = group?.endDate ? tashkentDateStr(group.endDate) : null;

  const added = new Set<string>();
  for (const r of reschedules) {
    const newDay = tashkentDateStr(r.newDate);
    if (newDay < monthStartStr || newDay > monthEndStr) continue;
    if (groupStartStr && newDay < groupStartStr) continue;
    if (groupEndStr && newDay > groupEndStr) continue;
    if (vetoed.has(newDay)) continue;
    added.add(newDay);
  }

  return { excludedDates: [...excluded], addedDates: [...added] };
}
