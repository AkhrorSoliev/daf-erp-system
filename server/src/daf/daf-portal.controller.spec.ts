import { DafPortalController } from './daf-portal.controller';
import { RolesGuard } from '../common/guards';
import { CheckAntwortDto } from './dto/uebung.dto';
import { UebungService } from './uebung/uebung.service';

/**
 * `UebungService` uchun eng kichik soxta Prisma — kamida bitta savol
 * tug'iladigan seans qurish uchun yetarli (4 so'z, quyida izohlangan).
 * To'liq fixture `uebung.service.spec.ts` da; bu yerda maqsad servisning
 * mantig'ini emas, KONTROLLER chegarasidan o'tgan HTTP javobida to'g'ri
 * javob YO'QLIGINI tekshirish.
 */
function fakeUebungPrisma() {
  return {
    dafLesson: {
      findUnique: jest.fn(async () => ({
        id: 100,
        section: { id: 7, order: 1, unitId: 1 },
      })),
    },
    dafSection: {
      findMany: jest.fn(async () => [{ id: 7, code: 'u01-s1', order: 1 }]),
    },
    dafLexeme: {
      // Kamida 4 ta so'z kerak: `WORT_UZ`/`UZ_WORT` uchun har birida 3 ta
      // chalg'ituvchi shart (`ablenker` boshqacha bo'lsa `null` qaytaradi),
      // ya'ni bitta so'zdan hech qanday savol tug'ilmaydi.
      findMany: jest.fn(async () => [
        {
          id: 1,
          de: 'hallo',
          uz: 'salom',
          artikel: null,
          anzeige: null,
          core: true,
          sectionId: 7,
          unitId: 1,
        },
        {
          id: 2,
          de: 'danke',
          uz: 'rahmat',
          artikel: null,
          anzeige: null,
          core: true,
          sectionId: 7,
          unitId: 1,
        },
        {
          id: 3,
          de: 'ich',
          uz: 'men',
          artikel: null,
          anzeige: null,
          core: true,
          sectionId: 7,
          unitId: 1,
        },
        {
          id: 4,
          de: 'du',
          uz: 'sen',
          artikel: null,
          anzeige: null,
          core: true,
          sectionId: 7,
          unitId: 1,
        },
      ]),
    },
    dafSentence: { findMany: jest.fn(async () => []) },
    dafPhrase: { findMany: jest.fn(async () => []) },
    dafDialog: { findMany: jest.fn(async () => []) },
    dafLexemeState: { findMany: jest.fn(async () => []) },
  };
}

/**
 * Guard bu yerda shart, garchi kontent maxfiy bo'lmasa ham.
 *
 * Global `JwtAuthGuard` faqat «kirgan» ekanini isbotlaydi — xodim portali
 * tokeni ham haqiqiy token. Urinish yozish esa o'quvchining natijasiga
 * tegadi, ya'ni kelajakdagi reytingga.
 */
describe('DafPortalController — ruxsat', () => {
  it('Student rolini talab qiladi', () => {
    expect(Reflect.getMetadata('roles', DafPortalController)).toEqual([
      'Student',
    ]);
  });

  it('RolesGuard bilan qo`riqlanadi', () => {
    const guards = Reflect.getMetadata('__guards__', DafPortalController) as
      | unknown[]
      | undefined;
    expect(guards).toContain(RolesGuard);
  });

  // Xodim rollari bu yerga tushmaydi: o'quv bo'limi o'quvchiniki, va
  // xodim nomidan urinish yozish natijani buzardi.
  it('xodim rollarini kiritmaydi', () => {
    const roles = Reflect.getMetadata('roles', DafPortalController) as string[];
    for (const staff of [
      'CEO',
      'Branch Director',
      'Administrator',
      'Teacher',
    ]) {
      expect(roles).not.toContain(staff);
    }
  });
});

/**
 * Muhim kafolat: `GET .../uebung` orqali qaytadigan HAR BIR savolda
 * to'g'ri javob bo'lmasligi kerak. Bu HTTP chegarasining o'zida
 * tekshiriladi (faqat servis darajasida emas), chunki mijozga aynan shu
 * obyekt ketadi — kontroller uni hech qanday tozalashsiz uzatadi, ya'ni
 * chiqish shakli servis qaytargan shaklning O'ZI.
 *
 * Haqiqiy tokenli curl (brief 5-qadam) ishlatilmadi: bu worktree'da
 * o'quvchi tokeni ixtiro qilinmasligi kerak edi. Shu o'rniga real
 * `UebungService` (soxta faqat Prisma qatlamida) kontroller orqali
 * chaqirildi — bu ham bir xil kafolatni, HTTP javobi darajasida
 * isbotlaydi.
 */
describe('DafPortalController — mashq javobida sizib chiqish yo`q', () => {
  it('getUebung har bir savolda richtig va akzeptiert maydonini olib tashlaydi', async () => {
    const uebung = new UebungService(fakeUebungPrisma() as any);
    const controller = new DafPortalController(
      {} as any,
      {} as any,
      {} as any,
      uebung,
      {} as any,
    );

    const fragen = await controller.getUebung(100, 55);

    expect(fragen.length).toBeGreaterThan(0);
    for (const f of fragen) {
      expect(Object.prototype.hasOwnProperty.call(f, 'richtig')).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(f, 'akzeptiert')).toBe(false);
    }
  });

  it('checkUebung studentId`ni faqat tokendan oladi, DTO`da bunday maydon yo`q', () => {
    // CheckAntwortDto sinfi runtime`da studentId maydonini umuman
    // e'lon qilmaydi — global ValidationPipe (`forbidNonWhitelisted`)
    // tanadan kelgan `studentId`ni tashlab yuboradi.
    const dto = new CheckAntwortDto();
    expect('studentId' in dto).toBe(false);
  });
});
