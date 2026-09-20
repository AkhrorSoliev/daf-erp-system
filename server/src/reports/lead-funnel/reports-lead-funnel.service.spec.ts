import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ReportsLeadFunnelService,
  splitByStatus,
  statusBucket,
} from './reports-lead-funnel.service';
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
            sourceId: 'src-ig',
            branchId: 1,
            branch: { id: 1, name: "Farg'ona" },
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
            sourceId: 'src-tg',
            branchId: 2,
            branch: { id: 2, name: 'Namangan' },
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
          .mockResolvedValue([{ id: 10, status: 'ACTIVE', deletedAt: null }]),
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
    // #10 darsga kelgan, to'lamagan, faol.
    expect(r.unpaid).toEqual({
      total: 1,
      active: 1,
      frozen: 0,
      expelled: 0,
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

  it("bitirgan/eski holatlar ham bo'laklarga tushadi — yig'indi jamiga teng", () => {
    expect(
      splitByStatus([
        { status: 'ACTIVE' },
        { status: 'INACTIVE' },
        { status: 'GRADUATED' },
        { status: 'EXPELLED' },
        { status: 'ARCHIVED' },
      ]),
    ).toEqual({ total: 5, active: 1, frozen: 1, expelled: 1, other: 2 });
  });

  describe("to'lamaganlar kartasi", () => {
    // CEO qarori (13.09.2026): faqat voronkadagilar — lidsiz eski o'quvchilar emas.
    it("tanlangan davrdan qat'i nazar 10.09 dan bugungacha kelganlarni oladi", async () => {
      await service.getFunnel(
        COMPANY,
        { startDate: '2026-10-01', endDate: '2026-10-31' },
        null,
      );
      const unpaidWhere = prisma.lead.findMany.mock.calls[1][0].where;
      expect(unpaidWhere.createdAt.gte).toEqual(
        new Date('2026-09-09T19:00:00.000Z'),
      );
    });

    it("to'lov qilgan odam kartaga tushmaydi", async () => {
      prisma.payment.groupBy.mockResolvedValue([{ studentId: 10 }]);
      const { unpaid } = await service.getFunnel(COMPANY, {}, null);
      expect(unpaid.total).toBe(0);
    });

    it("lidsiz o'quvchilarni bazadan qidirmaydi — faqat kogorta o'quvchilari", async () => {
      await service.getFunnel(COMPANY, {}, null);
      for (const [args] of prisma.student.findMany.mock.calls) {
        expect(args.where).toEqual({ id: { in: [10] } });
      }
    });

    it("o'chirilgan o'quvchi «Arxivlangan» bo'lib boshqaga tushadi", async () => {
      prisma.student.findMany.mockResolvedValue([
        { id: 10, status: 'ACTIVE', deletedAt: new Date() },
      ]);
      const { unpaid } = await service.getFunnel(COMPANY, {}, null);
      expect(unpaid).toMatchObject({ total: 1, active: 0, other: 1 });
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

    it("to'lamaganlar kogortasi ham xuddi shu predikat bilan", async () => {
      await service.getFunnel(COMPANY, {}, [7]);
      expect(prisma.lead.findMany.mock.calls[1][0].where.branchId).toEqual({
        in: [7],
      });
    });

    it("CEO uchun hech qanday filial predikati qo'shmaydi", async () => {
      await service.getFunnel(COMPANY, {}, null);
      expect(prisma.lead.findMany.mock.calls[0][0].where).not.toHaveProperty(
        'branchId',
      );
      expect(prisma.lead.findMany.mock.calls[1][0].where).not.toHaveProperty(
        'branchId',
      );
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
      prisma.student.findMany.mockResolvedValue([
        { id: 10, status: 'FROZEN', deletedAt: null },
      ]);
      const r = await service.getPeople(
        COMPANY,
        { stage: 'unpaid', mode: 'all', page: 1, pageSize: 10 },
        null,
      );
      expect(r.total).toBe(1);
      expect(r.data[0]).toMatchObject({
        key: 's:10',
        name: 'Vali Aliyev',
        source: 'Telegram bot',
        studentId: 10,
        studentStatus: 'FROZEN',
      });
    });
  });

  it('oldingi davr, manba va filial taqsimotini qaytaradi', async () => {
    const r = await service.getFunnel(
      COMPANY,
      { startDate: '2026-10-01', endDate: '2026-10-31' },
      null,
    );

    expect(r.previous).toEqual({
      period: { startDate: '2026-09-10', endDate: '2026-09-30' },
      stages: { lead: 2, enrolled: 1, attended: 1, paid: 0 },
    });
    expect(r.bySource).toEqual([
      {
        id: 'src-ig',
        name: 'Instagram',
        lead: 1,
        enrolled: 0,
        attended: 0,
        paid: 0,
      },
      {
        id: 'src-tg',
        name: 'Telegram bot',
        lead: 1,
        enrolled: 1,
        attended: 1,
        paid: 0,
      },
    ]);
    expect(r.byBranch).toEqual([
      { id: 1, name: "Farg'ona", lead: 1, paid: 0 },
      { id: 2, name: 'Namangan', lead: 1, paid: 0 },
    ]);
    // Uchinchi chaqiruv — oldingi davr kogortasi: chaqiruvlar soni yagona
    // o'zi noto'g'ri sana oralig'i yuborilishini ushlamaydi, shuning uchun
    // aynan shu chaqiruvning `where.createdAt` chegarasi tekshiriladi.
    // 10.09 00:00 Toshkent = 09.09 19:00 UTC; yuqori chegara ochiq (lt) —
    // 01.10 00:00 Toshkent = 30.09 19:00 UTC.
    expect(prisma.lead.findMany.mock.calls[2][0].where.createdAt).toEqual({
      gte: new Date('2026-09-09T19:00:00.000Z'),
      lt: new Date('2026-09-30T19:00:00.000Z'),
    });
    // Oldingi davr uchun alohida kogorta so'rovi: jami 3 (joriy, to'lamaganlar, oldingi).
    expect(prisma.lead.findMany).toHaveBeenCalledTimes(3);
  });

  it("voronka boshlangan oyda oldingi davr yo'q", async () => {
    const r = await service.getFunnel(
      COMPANY,
      { startDate: '2026-09-10', endDate: '2026-09-30' },
      null,
    );
    expect(r.previous).toBeNull();
    expect(prisma.lead.findMany).toHaveBeenCalledTimes(2);
  });

  it("odamlar ro'yxati manba bo'yicha filtrlanadi", async () => {
    const ig = await service.getPeople(
      COMPANY,
      {
        stage: 'lead',
        mode: 'all',
        sourceId: 'src-ig',
        page: 1,
        pageSize: 10,
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      },
      null,
    );
    expect(ig.total).toBe(1);
    expect(ig.data[0]).toMatchObject({
      name: 'Ali Valiyev',
      sourceId: 'src-ig',
    });

    const none = await service.getPeople(
      COMPANY,
      {
        stage: 'lead',
        mode: 'all',
        sourceId: 'none',
        page: 1,
        pageSize: 10,
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      },
      null,
    );
    expect(none.total).toBe(0);
  });

  it("to'lamaganlar holat bo'yicha filtrlanadi", async () => {
    const active = await service.getPeople(
      COMPANY,
      { stage: 'unpaid', mode: 'all', status: 'active', page: 1, pageSize: 10 },
      null,
    );
    expect(active.total).toBe(1);
    const frozen = await service.getPeople(
      COMPANY,
      { stage: 'unpaid', mode: 'all', status: 'frozen', page: 1, pageSize: 10 },
      null,
    );
    expect(frozen.total).toBe(0);
  });
});

describe('statusBucket', () => {
  it('FROZEN va INACTIVE bitta guruh, noma\'lumlar "other"', () => {
    expect(statusBucket('ACTIVE')).toBe('active');
    expect(statusBucket('FROZEN')).toBe('frozen');
    expect(statusBucket('INACTIVE')).toBe('frozen');
    expect(statusBucket('EXPELLED')).toBe('expelled');
    expect(statusBucket('GRADUATED')).toBe('other');
    expect(statusBucket(null)).toBe('other');
  });
});
