import { Test, TestingModule } from '@nestjs/testing';
import { SalaryAdvanceCalendarService } from './salary-advance-calendar.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Kunlik avans kalendari — bitta oyning TEACHER_ADVANCE xarajatlarini kun
 * bo'yicha guruhlaydi. Faqat o'qish: hech narsa yozmaydi, hech qanday
 * hisob-kitob mantig'iga tegmaydi.
 */
describe('SalaryAdvanceCalendarService', () => {
  let service: SalaryAdvanceCalendarService;
  let prisma: any;

  const ceoCaller = { mainBranch: 1, roles: [{ role: { name: 'CEO' } }] };
  const bdCaller = {
    mainBranch: 7,
    roles: [{ role: { name: 'Branch Director' } }],
  };
  const bdNoBranch = {
    mainBranch: null,
    roles: [{ role: { name: 'Branch Director' } }],
  };

  /** Bitta TEACHER_ADVANCE qatorini yasaydi (Prisma qaytaradigan shaklda). */
  function advance(over: Partial<any> = {}) {
    return {
      id: over.id ?? 'e1',
      amount: over.amount ?? 500_000,
      date: over.date ?? new Date('2026-07-15T00:00:00.000Z'),
      paymentMethod: over.paymentMethod ?? 'CASH',
      description: over.description ?? 'Avans',
      createdAt: over.createdAt ?? new Date('2026-07-15T09:00:00.000Z'),
      relatedUser: over.relatedUser ?? {
        id: 10005,
        firstName: 'Aziz',
        lastName: 'Karimov',
        roles: [{ role: { id: 4, name: 'Teacher' } }],
      },
      createdBy: over.createdBy ?? {
        id: 10001,
        firstName: 'Admin',
        lastName: 'A',
      },
    };
  }

  beforeEach(async () => {
    prisma = {
      company: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ systemStartDate: new Date('2026-05-01') }),
      },
      salaryPeriodSetting: {
        findFirst: jest.fn().mockResolvedValue({ cycleStartDay: 1 }),
      },
      user: { findUnique: jest.fn().mockResolvedValue(ceoCaller) },
      expense: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalaryAdvanceCalendarService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(SalaryAdvanceCalendarService);
  });

  it('avanslarni kun bo‘yicha guruhlaydi va naqd/kartani ajratadi', async () => {
    prisma.expense.findMany.mockResolvedValue([
      advance({ id: 'a', amount: 1_000_000, paymentMethod: 'CASH' }),
      advance({
        id: 'b',
        amount: 600_000,
        paymentMethod: 'CARD',
        relatedUser: {
          id: 10006,
          firstName: 'Malika',
          lastName: 'Tosheva',
          roles: [],
        },
      }),
      advance({
        id: 'c',
        amount: 800_000,
        paymentMethod: 'CASH',
        date: new Date('2026-07-07T00:00:00.000Z'),
      }),
    ]);

    const res = await service.getCalendar({ month: '2026-07' }, 1, 10001);

    expect(res.days).toEqual([
      {
        date: '2026-07-07',
        total: 800_000,
        count: 1,
        cash: 800_000,
        card: 0,
      },
      {
        date: '2026-07-15',
        total: 1_600_000,
        count: 2,
        cash: 1_000_000,
        card: 600_000,
      },
    ]);
  });

  it('jamlarni hisoblaydi — summa, soni, kunlar, xodimlar, eng katta kun', async () => {
    prisma.expense.findMany.mockResolvedValue([
      advance({ id: 'a', amount: 1_000_000 }),
      advance({ id: 'b', amount: 600_000 }), // o'sha xodim, o'sha kun
      advance({
        id: 'c',
        amount: 800_000,
        date: new Date('2026-07-07T00:00:00.000Z'),
        relatedUser: {
          id: 10006,
          firstName: 'Malika',
          lastName: 'Tosheva',
          roles: [],
        },
      }),
    ]);

    const res = await service.getCalendar({ month: '2026-07' }, 1, 10001);

    expect(res.totals).toEqual({
      total: 2_400_000,
      count: 3,
      daysWithAdvances: 2,
      employeeCount: 2,
      maxDay: { date: '2026-07-15', total: 1_600_000 },
    });
  });

  it('avans yo‘q oyda bo‘sh natija va maxDay=null qaytaradi', async () => {
    prisma.expense.findMany.mockResolvedValue([]);

    const res = await service.getCalendar({ month: '2026-07' }, 1, 10001);

    expect(res.days).toEqual([]);
    expect(res.advances).toEqual([]);
    expect(res.totals).toEqual({
      total: 0,
      count: 0,
      daysWithAdvances: 0,
      employeeCount: 0,
      maxDay: null,
    });
  });

  it('oy chegarasi @db.Date qoidasi bo‘yicha: gte oy boshi, lt keyingi oy boshi', async () => {
    await service.getCalendar({ month: '2026-07' }, 1, 10001);

    const where = prisma.expense.findMany.mock.calls[0][0].where;
    expect(where.date).toEqual({
      gte: new Date(Date.UTC(2026, 6, 1)),
      lt: new Date(Date.UTC(2026, 7, 1)),
    });
    expect(where.category).toBe('TEACHER_ADVANCE');
    expect(where.deletedAt).toBeNull();
    expect(where.relatedUserId).toEqual({ not: null });
  });

  it('filial direktori uchun oluvchi xodimning filiali bo‘yicha filtrlaydi', async () => {
    prisma.user.findUnique.mockResolvedValue(bdCaller);

    await service.getCalendar({ month: '2026-07' }, 1, 10002);

    const where = prisma.expense.findMany.mock.calls[0][0].where;
    expect(where.relatedUser).toEqual({ branches: { some: { branchId: 7 } } });
  });

  it('CEO uchun filial filtri qo‘yilmaydi', async () => {
    await service.getCalendar({ month: '2026-07' }, 1, 10001);

    const where = prisma.expense.findMany.mock.calls[0][0].where;
    expect(where.relatedUser).toBeUndefined();
  });

  it('filiali yo‘q filial direktoriga hech narsa ko‘rsatmaydi (fail closed)', async () => {
    prisma.user.findUnique.mockResolvedValue(bdNoBranch);

    const res = await service.getCalendar({ month: '2026-07' }, 1, 10003);

    expect(res.advances).toEqual([]);
    expect(res.totals.total).toBe(0);
    expect(prisma.expense.findMany).not.toHaveBeenCalled();
  });

  it('so‘ralgan oyni kompaniya boshlanish oyigacha ko‘taradi', async () => {
    const res = await service.getCalendar({ month: '2026-01' }, 1, 10001);

    expect(res.month).toBe('2026-05');
    expect(res.floorMonth).toBe('2026-05');
  });
});
