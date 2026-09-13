import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ReportsLeadFunnelService } from './reports-lead-funnel.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('ReportsLeadFunnelService', () => {
  let service: ReportsLeadFunnelService;
  let prisma: any;
  const COMPANY = 1001;

  beforeEach(async () => {
    prisma = {
      lead: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'a',
            convertedStudentId: null,
            sectionId: 'sec-1',
            firstName: 'Ali',
            lastName: 'Valiyev',
            phone: '901',
            createdAt: new Date('2026-09-02T05:00:00Z'),
            source: { name: 'Instagram' },
          },
          {
            id: 'b',
            convertedStudentId: 10,
            sectionId: null,
            firstName: 'Vali',
            lastName: 'Aliyev',
            phone: '902',
            createdAt: new Date('2026-09-03T05:00:00Z'),
            source: { name: 'Telegram bot' },
          },
        ]),
      },
      enrollment: {
        groupBy: jest.fn().mockResolvedValue([{ studentId: 10 }]),
      },
      attendance: {
        groupBy: jest.fn().mockResolvedValue([{ studentId: 10 }]),
      },
      payment: { groupBy: jest.fn().mockResolvedValue([]) },
      student: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { status: 'ACTIVE' },
            { status: 'ACTIVE' },
            { status: 'FROZEN' },
            { status: 'EXPELLED' },
          ]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsLeadFunnelService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(ReportsLeadFunnelService);
  });

  it("bosqichlar, bo'linish va to'lamaganlarni qaytaradi", async () => {
    const r = await service.getFunnel(
      COMPANY,
      { startDate: '2026-10-01', endDate: '2026-10-31' },
      null,
    );

    expect(r.stages).toEqual({ lead: 2, enrolled: 1, attended: 1, paid: 0 });
    expect(r.leadSplit).toEqual({ board: 1, direct: 1 });
    expect(r.unpaid).toEqual({
      total: 4,
      active: 2,
      frozen: 1,
      expelled: 1,
      other: 0,
    });
    expect(r.period).toEqual({
      startDate: '2026-10-01',
      endDate: '2026-10-31',
    });
  });

  it('kogortani Toshkent kuni chegarasi va kompaniya bilan cheklaydi', async () => {
    await service.getFunnel(
      COMPANY,
      { startDate: '2026-10-01', endDate: '2026-10-31' },
      null,
    );

    const where = prisma.lead.findMany.mock.calls[0][0].where;
    expect(where.companyId).toBe(COMPANY);
    // 01.10 00:00 Toshkent = 30.09 19:00 UTC; yuqori chegara ochiq (lt).
    expect(where.createdAt).toEqual({
      gte: new Date('2026-09-30T19:00:00.000Z'),
      lt: new Date('2026-10-31T19:00:00.000Z'),
    });
  });

  // Yo'qotilgan (arxivlangan) lid — voronkadan tushib qolgan odam. Uni chiqarib
  // tashlash birinchi blokni kichraytirib, konversiyani yolg'on oshirardi.
  it("arxivlangan lidlarni ham sanaydi — deletedAt bo'yicha filtrlamaydi", async () => {
    await service.getFunnel(COMPANY, {}, null);
    expect(prisma.lead.findMany.mock.calls[0][0].where).not.toHaveProperty(
      'deletedAt',
    );
  });

  it("bitirgan/eski holatlar ham bo'laklarga tushadi — yig'indi jamiga teng", async () => {
    prisma.student.findMany.mockResolvedValueOnce([
      { status: 'ACTIVE' },
      { status: 'INACTIVE' },
      { status: 'GRADUATED' },
      { status: 'EXPELLED' },
    ]);
    const { unpaid } = await service.getFunnel(COMPANY, {}, null);
    expect(unpaid).toEqual({
      total: 4,
      active: 1,
      frozen: 1,
      expelled: 1,
      other: 1,
    });
  });

  it("bosqich to'plamlari bazada GROUP BY bilan olinadi", async () => {
    await service.getFunnel(COMPANY, {}, null);
    expect(prisma.attendance.groupBy.mock.calls[0][0]).toMatchObject({
      by: ['studentId'],
    });
  });

  it.each([
    [{ startDate: '2026-09-01' }],
    [{ startDate: '2026-09-30', endDate: '2026-09-01' }],
    [{ startDate: '2026-02-31', endDate: '2026-03-10' }],
  ])('buzilgan oraliqni rad etadi: %j', async (input) => {
    await expect(service.getFunnel(COMPANY, input, null)).rejects.toThrow(
      BadRequestException,
    );
  });

  describe('boshlanish sanasi (10.09.2026)', () => {
    it('undan oldingi boshlanishni shu kunga suradi', async () => {
      const r = await service.getFunnel(
        COMPANY,
        { startDate: '2026-09-01', endDate: '2026-09-30' },
        null,
      );
      expect(r.period).toEqual({
        startDate: '2026-09-10',
        endDate: '2026-09-30',
      });
      // 10.09 00:00 Toshkent = 09.09 19:00 UTC.
      expect(prisma.lead.findMany.mock.calls[0][0].where.createdAt.gte).toEqual(
        new Date('2026-09-09T19:00:00.000Z'),
      );
    });

    it('butunlay undan oldingi oraliqni rad etadi', async () => {
      await expect(
        service.getFunnel(
          COMPANY,
          { startDate: '2026-08-01', endDate: '2026-08-31' },
          null,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('keyingi oylarga tegmaydi', async () => {
      const r = await service.getFunnel(
        COMPANY,
        { startDate: '2026-10-01', endDate: '2026-10-31' },
        null,
      );
      expect(r.period.startDate).toBe('2026-10-01');
    });
  });

  it('sana berilmasa joriy Toshkent oyini oladi', async () => {
    const r = await service.getFunnel(COMPANY, {}, null);
    // Oyning 1-kuni, yoki sentyabr 2026 da — voronka boshlangan kun.
    expect(r.period.startDate >= '2026-09-10').toBe(true);
    expect(r.period.startDate).toMatch(/^\d{4}-\d{2}-(01|10)$/);
  });

  describe('filial qamrovi', () => {
    it("lidni filial bo'yicha SANASH predikati bilan cheklaydi (belgilanmaganlarsiz)", async () => {
      await service.getFunnel(COMPANY, {}, [7]);
      expect(prisma.lead.findMany.mock.calls[0][0].where.branchId).toEqual({
        in: [7],
      });
    });

    it("to'lamaganlarni o'quvchi filiali bo'yicha cheklaydi", async () => {
      await service.getFunnel(COMPANY, {}, [7]);
      expect(prisma.student.findMany.mock.calls[0][0].where).toMatchObject({
        companyId: COMPANY,
        deletedAt: null,
        branches: { some: { branchId: { in: [7] } } },
      });
    });

    it("CEO uchun hech qanday filial predikati qo'shmaydi", async () => {
      await service.getFunnel(COMPANY, {}, null);
      expect(prisma.lead.findMany.mock.calls[0][0].where).not.toHaveProperty(
        'branchId',
      );
      expect(prisma.student.findMany.mock.calls[0][0].where).not.toHaveProperty(
        'branches',
      );
    });
  });

  it("to'lamaganlar: davomati bor, yakunlangan to'lovi yo'q tirik o'quvchilar", async () => {
    await service.getFunnel(COMPANY, {}, null);
    expect(prisma.student.findMany.mock.calls[0][0].where).toMatchObject({
      attendances: { some: { status: { in: ['PRESENT', 'LATE'] } } },
      payments: { none: { status: 'COMPLETED' } },
    });
  });

  describe('getPeople', () => {
    it("'stuck' rejimida keyingi bosqichga o'tganlarni chiqaradi va sahifalaydi", async () => {
      const r = await service.getPeople(
        COMPANY,
        { stage: 'lead', mode: 'stuck', page: 1, pageSize: 10 },
        null,
      );
      // #10 guruhga yozilgan — lid bosqichida «to'xtab qolgan» emas.
      expect(r.data.map((p) => p.key)).toEqual(['l:a']);
      expect(r.total).toBe(1);
    });

    it("'unpaid' ro'yxati o'quvchi holati bilan qaytadi", async () => {
      prisma.student.findMany.mockResolvedValueOnce([
        {
          id: 10,
          firstName: 'Vali',
          lastName: 'Aliyev',
          phone: '902',
          status: 'FROZEN',
          createdAt: new Date('2026-09-03'),
        },
      ]);
      const r = await service.getPeople(
        COMPANY,
        { stage: 'unpaid', mode: 'all', page: 1, pageSize: 10 },
        null,
      );
      expect(r.data[0]).toMatchObject({
        studentId: 10,
        studentStatus: 'FROZEN',
      });
    });
  });
});
