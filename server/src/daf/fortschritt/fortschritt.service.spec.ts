import { FortschrittService } from './fortschritt.service';

function fakePrisma() {
  return {
    dafAttempt: {
      aggregate: jest.fn(async () => ({ _sum: { points: 0 } })),
      findMany: jest.fn(async () => []),
      groupBy: jest.fn(async () => []),
    },
    enrollment: { findFirst: jest.fn(async () => null), findMany: jest.fn(async () => []) },
    student: { findMany: jest.fn(async () => []) },
  } as any;
}

describe('uebersicht', () => {
  it("umumiy balldan darajani chiqaradi", async () => {
    const prisma = fakePrisma();
    prisma.dafAttempt.aggregate = jest.fn(async () => ({ _sum: { points: 1_600 } }));
    const f = await new FortschrittService(prisma).uebersicht(55, 1);
    expect(f.gesamt).toBe(1_600);
    expect(f.stufe.de).toBe('Kenner');
    // `stufe.ab` — HOZIRGI darajaning pastki chegarasi, `naechsteStufe.ab`dan
    // FARQLI: mijoz chiziqni "shu daraja ichida qancha bosib o'tildi" deb
    // hisoblashi uchun ikkalasi ham kerak — faqat naechsteStufe.ab bo'lsa,
    // chiziq darajaga yangi kirgan o'quvchida ham noldan boshlanmay,
    // avvalgi darajaning ballarini hisobga olib qoladi.
    expect(f.stufe.ab).toBe(1_500);
    expect(f.naechsteStufe?.ab).toBe(4_000);
  });

  it('hech qachon mashq qilmagan o`quvchi yiqilmaydi', async () => {
    const f = await new FortschrittService(fakePrisma()).uebersicht(55, 1);
    expect(f.gesamt).toBe(0);
    expect(f.serie).toBe(0);
    expect(f.stufe.de).toBe('Anfänger');
    expect(f.stufe.ab).toBe(0);
    expect(f.wochePlatzGruppe).toBeNull();
  });

  it("guruhi yo'q o'quvchining guruh o'rni null, markaz o'rni bor", async () => {
    const prisma = fakePrisma();
    prisma.enrollment.findFirst = jest.fn(async () => null);
    prisma.dafAttempt.groupBy = jest.fn(async () => [
      { studentId: 55, _sum: { points: 40 } },
    ]);
    const f = await new FortschrittService(prisma).uebersicht(55, 1);
    expect(f.wochePlatzGruppe).toBeNull();
    expect(f.wochePlatzZentrum).toBe(1);
  });
});

describe('reyting', () => {
  it('ballga qarab kamayish tartibida saralaydi va o`rin qo`yadi', async () => {
    const prisma = fakePrisma();
    prisma.dafAttempt.groupBy = jest.fn(async () => [
      { studentId: 7, _sum: { points: 300 } },
      { studentId: 55, _sum: { points: 900 } },
    ]);
    prisma.student.findMany = jest.fn(async () => [
      { id: 7, firstName: 'Malika', lastName: 'Sodiqova' },
      { id: 55, firstName: 'Javohir', lastName: 'Toshev' },
    ]);
    const r = await new FortschrittService(prisma).reyting(55, 1, 'zentrum');
    expect(r.map((z) => z.platz)).toEqual([1, 2]);
    expect(r[0].name).toBe('Javohir Toshev');
    expect(r[0].selbst).toBe(true);
    expect(r[1].punkte).toBe(300);
  });

  it("nol ballilar ham ko'rinadi", async () => {
    // Hafta boshida jadval bo'sh bo'lsa o'quvchi o'zini topa olmaydi va
    // tizimni buzuq deb o'ylaydi.
    const prisma = fakePrisma();
    prisma.enrollment.findFirst = jest.fn(async () => ({ groupId: 'g-1' }));
    prisma.enrollment.findMany = jest.fn(async () => [
      { studentId: 55 }, { studentId: 7 },
    ]);
    prisma.dafAttempt.groupBy = jest.fn(async () => []);
    const r = await new FortschrittService(prisma).reyting(55, 1, 'gruppe');
    expect(r).toHaveLength(2);
    expect(r.every((z) => z.punkte === 0)).toBe(true);
  });

  it('teng ballda tartib BARQAROR (studentId bo`yicha)', async () => {
    const prisma = fakePrisma();
    prisma.dafAttempt.groupBy = jest.fn(async () => [
      { studentId: 9, _sum: { points: 100 } },
      { studentId: 4, _sum: { points: 100 } },
    ]);
    prisma.student.findMany = jest.fn(async () => [
      { id: 4, firstName: 'A', lastName: 'A' },
      { id: 9, firstName: 'B', lastName: 'B' },
    ]);
    const r = await new FortschrittService(prisma).reyting(55, 1, 'zentrum');
    expect(r.map((z) => z.studentId)).toEqual([4, 9]);
  });

  it("guruhi yo'q o'quvchi guruh jadvalini so'rasa bo'sh ro'yxat", async () => {
    const prisma = fakePrisma();
    prisma.enrollment.findFirst = jest.fn(async () => null);
    const r = await new FortschrittService(prisma).reyting(55, 1, 'gruppe');
    expect(r).toEqual([]);
  });

  it('markaz jadvali FILIALGA cheklanmaydi', async () => {
    const prisma = fakePrisma();
    await new FortschrittService(prisma).reyting(55, 1, 'zentrum');
    const where = prisma.dafAttempt.groupBy.mock.calls[0][0].where;
    expect(where).not.toHaveProperty('branchId');
    expect(where.companyId).toBe(1);
  });

  it(
    "uebersicht().wochePlatzGruppe reyting('gruppe')dagi platz bilan mos " +
      "keladi — mashq qilmagan a'zolar ham hisobga olinadi",
    async () => {
      // Guruhda ikkita mashq qilmagan a'zo bor (10 va 30), ikkalasi ham
      // so'ragan o'quvchi (55)dan KICHIK id bilan. Ular bu hafta hech narsa
      // qilmagan, ya'ni `groupBy` ularni umuman qaytarmaydi — faqat
      // roster (`enrollment.findMany`) orqali ma'lum bo'ladi. So'ragan
      // o'quvchi ham bu hafta mashq qilmagan (0 ball), shuning uchun
      // teng ballda `studentId` bo'yicha tartib mashq qilmagan a'zolarni
      // undan OLDINGA chiqaradi. Faqat "shu hafta mashq qilganlar"
      // populyatsiyasida hisoblangan eski kod bu ikki a'zoni ko'rmaydi va
      // noto'g'ri (yuqoriroq) o'rin beradi.
      const prisma = fakePrisma();
      prisma.enrollment.findFirst = jest.fn(async () => ({ groupId: 'g-1' }));
      prisma.enrollment.findMany = jest.fn(async () => [
        { studentId: 10 },
        { studentId: 30 },
        { studentId: 55 },
        { studentId: 7 },
      ]);
      prisma.dafAttempt.groupBy = jest.fn(async () => [
        { studentId: 7, _sum: { points: 100 } },
      ]);

      const service = new FortschrittService(prisma);
      const f = await service.uebersicht(55, 1);
      const r = await service.reyting(55, 1, 'gruppe');
      const oʻzQatori = r.find((z) => z.studentId === 55)!;

      expect(f.wochePlatzGruppe).toBe(oʻzQatori.platz);
      expect(f.wochePlatzGruppe).toBe(4);
    },
  );
});
