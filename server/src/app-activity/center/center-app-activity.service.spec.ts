import { CenterAppActivityService } from './center-app-activity.service';
import { OquvchilarSorovi } from './markaz-royxat';

// 2026-09-20, 14:00 Toshkent → bugun '2026-09-20'; 7 kun = 14..20; 30 kun = 22.08..20.09.
const NOW = new Date('2026-09-20T09:00:00Z');

const GURUH = {
  id: 'g-a1',
  name: 'A1-07',
  level: 'A1',
  teachers: [{ teacher: { id: 20001, firstName: 'Sardor', lastName: 'Karimov' } }],
};
const FILIAL = { branch: { id: 1, name: 'Filial A' } };
const yozuv = { startDate: new Date('2026-09-01T00:00:00Z'), createdAt: new Date('2026-09-01T00:00:00Z'), group: GURUH };

const OQUVCHILAR = [
  {
    id: 10001, firstName: 'Nodira', lastName: 'Yusupova', photo: null, phone: '901112233', parentPhone: null,
    createdAt: new Date('2026-06-01T00:00:00Z'), user: { createdAt: new Date('2026-08-01T00:00:00Z') },
    branches: [FILIAL], enrollments: [yozuv],
  },
  {
    id: 10002, firstName: 'Bekzod', lastName: 'Rasulov', photo: null, phone: '902223344', parentPhone: '905556677',
    createdAt: new Date('2026-06-01T00:00:00Z'), user: { createdAt: new Date('2026-09-01T00:00:00Z') },
    branches: [FILIAL], enrollments: [yozuv],
  },
  {
    id: 10003, firstName: 'Zafar', lastName: 'Toshev', photo: null, phone: '903334455', parentPhone: null,
    createdAt: new Date('2026-06-01T00:00:00Z'), user: null,
    branches: [FILIAL], enrollments: [yozuv],
  },
];

const seans = (sana: string) => ({
  studentId: 10001, sana, faolSoniya: 700, radioSoniya: 0, lernenSoniya: 600, kirdi: true,
});

function qur() {
  const prisma = {
    company: {
      findUnique: jest.fn().mockResolvedValue({
        dafKunlikDaqiqa: 10, dafKunlikSavol: 12, dafHaftalikKun: 4, dafSariqKun: 2,
      }),
    },
    student: { findMany: jest.fn().mockResolvedValue(OQUVCHILAR) },
  };
  const queries = {
    kunlikSeanslar: jest.fn().mockResolvedValue([
      seans('2026-09-14'), seans('2026-09-15'), seans('2026-09-16'), seans('2026-09-17'),
    ]),
    kunlikSavollar: jest.fn().mockResolvedValue([
      { studentId: 10001, sana: '2026-09-14', savollar: 12, togri: 9 },
    ]),
    umumanKirganlar: jest.fn().mockResolvedValue(new Set([10001])),
    tugatilganDarsSoni: jest.fn().mockResolvedValue(new Map([[10001, 2]])),
  };
  const umumiyQueries = {
    kuzatuvBoshi: jest.fn().mockResolvedValue('2026-09-13'),
    oxirgiFaolliklar: jest.fn().mockResolvedValue(
      new Map([[10001, { vaqt: '2026-09-17T06:00:00.000Z', platforma: 'WEB' }]]),
    ),
    kursJamisi: jest.fn().mockResolvedValue({ A1: 24 }),
    tugatilganDarslar: jest.fn().mockResolvedValue(new Map([[10001, { A1: 2 }]])),
    oxirgiDarsDarajalari: jest.fn().mockResolvedValue(new Map([[10001, 'A1']])),
  };
  const service = new CenterAppActivityService(
    prisma as never, queries as never, umumiyQueries as never,
  );
  return { prisma, queries, umumiyQueries, service };
}

const SOROV: OquvchilarSorovi = { davr: 7, sort: 'holat', dir: 'asc', page: 1, pageSize: 50 };

describe('CenterAppActivityService.umumiy', () => {
  it('kartalar, voronka, trend va filiallar bitta o\'tishda (dizayn 5)', async () => {
    const { service, prisma } = qur();
    const r = await service.umumiy(1001, null, 7, NOW);

    expect(prisma.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: 1001, deletedAt: null, status: 'ACTIVE' }),
      }),
    );
    expect(r.norma).toEqual({ kunlikDaqiqa: 10, kunlikSavol: 12, haftalikKun: 4, sariqKun: 2 });
    expect(r.kartalar).toEqual({
      oquvchilar: 3,
      akkauntlar: 2,
      birMartaKirganlar: 1,
      davrdaKirganlar: 1,
      yashillar: 1,
      ortachaFaolKunHaftada: 4,
      ortachaKunlikSoniya: 343, // 2400 / 7
      savollar: 12,
      togri: 9,
      foiz: 75,
      tugatilganDarslar: 2,
    });
    expect(r.voronka).toEqual({
      faolOquvchi: 3, akkauntiBor: 2, birMartaKirgan: 1, davrdaKirgan: 1, normaniBajargan: 1,
    });
    expect(r.trend).toHaveLength(30);
    expect(r.trend[0].sana).toBe('2026-08-22');
    expect(r.trend.find((t) => t.sana === '2026-09-14')).toEqual({
      sana: '2026-09-14', kirganlar: 1, faollar: 1,
    });
    expect(r.trend.find((t) => t.sana === '2026-09-19')).toEqual({
      sana: '2026-09-19', kirganlar: 0, faollar: 0,
    });
    expect(r.filiallar).toEqual([
      expect.objectContaining({
        branchId: 1, nomi: 'Filial A', oquvchilar: 3, qamrovFoiz: 33, normaFoiz: 33,
        ortachaFaolKunHaftada: 4, foiz: 75, tugatilganDarslar: 2,
      }),
    ]);
  });

  it("filial tanlangan bo'lsa filiallar jadvali bo'sh va where filial shartini oladi", async () => {
    const { service, prisma } = qur();
    const r = await service.umumiy(1001, [1], 7, NOW);
    expect(r.filiallar).toEqual([]);
    expect(prisma.student.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ branches: { some: { branchId: { in: [1] } } } }),
      }),
    );
  });

  it("bo'sh qamrov ([]) — hech qaysi so'rov ketmaydi, natija bo'sh (fail-closed)", async () => {
    const { service, prisma, queries } = qur();
    const r = await service.umumiy(1001, [], 7, NOW);
    // Normani o'qish ham so'rov — «bazaga so'rov ketmaydi» shu demak.
    expect(prisma.company.findUnique).not.toHaveBeenCalled();
    expect(prisma.student.findMany).not.toHaveBeenCalled();
    expect(queries.kunlikSeanslar).not.toHaveBeenCalled();
    expect(r.kartalar.oquvchilar).toBe(0);
    expect(r.voronka.faolOquvchi).toBe(0);
    expect(r.trend).toHaveLength(30);
  });

  it("30 kunlik davrda tugatilgan darslar 30 kun boshidan so'raladi", async () => {
    const { service, queries } = qur();
    await service.umumiy(1001, null, 30, NOW);
    const dan: Date = queries.tugatilganDarsSoni.mock.calls[0][2];
    // 2026-08-22 Toshkent 00:00 = 2026-08-21T19:00:00Z
    expect(dan.toISOString()).toBe('2026-08-21T19:00:00.000Z');
  });
});

describe('CenterAppActivityService.oquvchilar', () => {
  it('standart tartib: hech kirmagan → yashil → akkaunt yo\'q; kurs faqat sahifadagilar uchun', async () => {
    const { service, umumiyQueries } = qur();
    const r = await service.oquvchilar(1001, null, SOROV, NOW);

    expect(r.jami).toBe(3);
    expect(r.qatorlar.map((q) => [q.studentId, q.holat])).toEqual([
      [10002, 'HECH_KIRMAGAN'],
      [10001, 'YASHIL'],
      [10003, 'AKKAUNT_YOQ'],
    ]);
    const nodira = r.qatorlar[1];
    expect(nodira).toMatchObject({
      ism: 'Nodira Yusupova',
      guruh: { id: 'g-a1', nomi: 'A1-07', daraja: 'A1' },
      oqituvchi: { id: 20001, ism: 'Sardor Karimov' },
      filial: { id: 1, nomi: 'Filial A' },
      kirdi: true, faolKun: 4, maxraj: 7, kerakliKun: 4, sariqKerak: 2,
      lernenSoniya: 2400, ortachaKunlikSoniya: 343, savollar: 12, togri: 9, foiz: 75,
      kurs: { daraja: 'A1', tugatilgan: 2, jami: 24 },
    });
    expect(nodira.kunlar).toHaveLength(7);
    expect(nodira.kunlar[0]).toMatchObject({ sana: '2026-09-14', shugullangan: true, kirdi: true });

    expect(r.filtrVariantlari).toEqual({
      guruhlar: [{ id: 'g-a1', nomi: 'A1-07' }],
      oqituvchilar: [{ id: 20001, ism: 'Sardor Karimov' }],
      darajalar: ['A1'],
    });
    expect(r.filialUstuni).toBe(true);
    expect(umumiyQueries.tugatilganDarslar).toHaveBeenCalledWith([10002, 10001, 10003]);
  });

  it('holat filtri va sahifalash', async () => {
    const { service, umumiyQueries } = qur();
    const r = await service.oquvchilar(1001, null, { ...SOROV, status: ['YASHIL'] }, NOW);
    expect(r.jami).toBe(1);
    expect(r.qatorlar[0].studentId).toBe(10001);

    const s = await service.oquvchilar(1001, null, { ...SOROV, pageSize: 1, page: 2 }, NOW);
    expect(s).toMatchObject({ jami: 3, sahifa: 2, sahifaHajmi: 1 });
    expect(s.qatorlar.map((q) => q.studentId)).toEqual([10001]);
    expect(umumiyQueries.tugatilganDarslar).toHaveBeenLastCalledWith([10001]);
  });

  it("bo'sh qamrov — bo'sh ro'yxat, hech qaysi so'rov chaqirilmaydi", async () => {
    const { service, prisma, umumiyQueries } = qur();
    const r = await service.oquvchilar(1001, [], SOROV, NOW);
    expect(r).toMatchObject({ jami: 0, qatorlar: [], filialUstuni: false });
    expect(prisma.company.findUnique).not.toHaveBeenCalled();
    expect(prisma.student.findMany).not.toHaveBeenCalled();
    expect(umumiyQueries.kursJamisi).not.toHaveBeenCalled();
  });
});

describe('CenterAppActivityService.telefonlar', () => {
  it("joriy filtr bo'yicha hamma qator, ism/guruh/telefonlar bilan", async () => {
    const { service } = qur();
    const r = await service.telefonlar(1001, null, { ...SOROV, status: ['HECH_KIRMAGAN'] }, NOW);
    expect(r).toEqual({
      jami: 1,
      qisqartirildi: false,
      qatorlar: [
        { ism: 'Bekzod Rasulov', guruh: 'A1-07', telefon: '902223344', otaOnaTelefoni: '905556677' },
      ],
    });
  });
});
