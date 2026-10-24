import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { loadTeacherChangeDepartures } from '../shared/teacher-change-departures';
import { DepartedOverviewService } from './departed-overview.service';
import type { DepartureFact, Placement, StartMember } from './departed.types';
import { loadDepartureFacts, type FactSets } from './departure-facts.loader';

jest.mock('./departure-facts.loader', () => ({
  ...jest.requireActual('./departure-facts.loader'),
  loadDepartureFacts: jest.fn(),
}));
jest.mock('../shared/teacher-change-departures', () => ({
  loadTeacherChangeDepartures: jest.fn(),
}));

const loadFacts = loadDepartureFacts as jest.Mock;
const loadChanges = loadTeacherChangeDepartures as jest.Mock;

const COMPANY = 1001;
const PRISMA = {} as PrismaService;
const OCT = { startDate: '2026-10-01', endDate: '2026-10-31' };

const course = (id: string) => ({ id, name: `Kurs ${id}` });
const placement = (courseId: string): Placement => ({
  group: { id: `g-${courseId}`, name: `Guruh ${courseId}` },
  course: course(courseId),
  branch: { id: 1, name: 'Bosh' },
  teachers: [{ id: 30001, fullName: 'Ustoz' }],
});

let seq = 0;
const fact = (
  courseId: string,
  studyMonths: number | null = null,
): DepartureFact => {
  seq += 1;
  return {
    key: `${seq}:1`,
    studentId: seq,
    fullName: `Talaba ${seq}`,
    phone: '900000000',
    balance: 0,
    startedAt: new Date('2026-10-10T05:00:00Z'),
    stopKind: 'LEFT_GROUP',
    state: 'confirmed',
    returnedAt: null,
    reason: { id: 'r1', name: 'Narx' },
    comment: null,
    studyMonths,
    ...placement(courseId),
  };
};
const member = (courseId: string): StartMember => {
  seq += 1;
  return { studentId: seq, ...placement(courseId) };
};

const sets = (over: Partial<FactSets> = {}): FactSets => ({
  current: [],
  pendingInRange: [],
  previous: [],
  months: [],
  pendingToday: [],
  startMembers: [],
  floor: null,
  graceDays: { LEFT_GROUP: 21, FROZEN: 60 },
  ...over,
});

describe('DepartedOverviewService', () => {
  const service = new DepartedOverviewService(PRISMA);

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-17T10:00:00Z'));
    loadFacts.mockReset().mockResolvedValue(sets());
    loadChanges.mockReset().mockResolvedValue({ changes: [], departures: [] });
  });
  afterEach(() => jest.useRealTimers());

  it('refuses an empty scope with the report 403 and reads nothing', async () => {
    await expect(service.overview(COMPANY, [], OCT)).rejects.toThrow(
      new ForbiddenException(
        "Bu filial ma'lumotlarini ko'rish huquqingiz yo'q",
      ),
    );
    expect(loadFacts).not.toHaveBeenCalled();
  });

  it('compares a whole month with the month before it', async () => {
    const res = await service.overview(COMPANY, null, OCT);
    expect(res.previous).toEqual({
      startDate: '2026-09-01',
      endDate: '2026-09-30',
    });
    const req = loadFacts.mock.calls[0][3];
    expect(req.range.gte).toEqual(new Date('2026-09-30T19:00:00Z'));
    expect(req.previous.gte).toEqual(new Date('2026-08-31T19:00:00Z'));
    expect(req.previous.lt).toEqual(req.range.gte);
  });

  it('applies the course filter to every block, the start members included', async () => {
    loadFacts.mockResolvedValue(
      sets({
        current: [fact('a'), fact('a'), fact('b')],
        previous: [fact('a'), fact('b')],
        pendingToday: [fact('a'), fact('b'), fact('b')],
        startMembers: [member('a'), member('b'), member('b'), member('b')],
        months: [{ key: '2026-10', provisional: true, facts: [fact('b')] }],
      }),
    );
    const res = await service.overview(COMPANY, null, {
      ...OCT,
      courseId: ['a'],
    });
    expect(res.cards).toMatchObject({
      departed: 2,
      previousDeparted: 1,
      atStart: 1,
    });
    expect(res.pendingToday).toBe(1);
    expect(res.months).toEqual([
      { key: '2026-10', departed: 0, provisional: true },
    ]);
    expect(loadChanges.mock.calls[0][2].groupFilter).toEqual({
      courseIds: ['a'],
      teacherIds: undefined,
    });
  });

  it('asks for six months ending in the end date month; recent ones are provisional', async () => {
    await service.overview(COMPANY, null, OCT);
    const months = loadFacts.mock.calls[0][3].months as {
      key: string;
      provisional: boolean;
    }[];
    // Now is 2026-10-17; the longest grace is 60 days, so a month that
    // closed before 2026-08-18 is final.
    expect(months.map((m) => [m.key, m.provisional])).toEqual([
      ['2026-05', false],
      ['2026-06', false],
      ['2026-07', false],
      ['2026-08', true],
      ['2026-09', true],
      ['2026-10', true],
    ]);
    expect(loadFacts.mock.calls[0][3]).toMatchObject({
      withStartMembers: true,
      withPendingToday: true,
    });
  });

  it('answers with the range, the previous range, the grace days and the teacher-change counts', async () => {
    loadChanges.mockResolvedValue({
      changes: [{}, {}, {}],
      departures: [{}],
    });
    const res = await service.overview(COMPANY, [3], OCT);
    expect(res.range).toEqual(OCT);
    expect(res.graceDays).toEqual({ LEFT_GROUP: 21, FROZEN: 60 });
    expect(res.teacherChange).toEqual({
      totalTeacherChanges: 3,
      departedAfterTeacherChange: 1,
    });
    expect(loadChanges.mock.calls[0][2]).toMatchObject({
      scope: [3],
      start: new Date('2026-09-30T19:00:00Z'),
      end: new Date('2026-10-31T19:00:00Z'),
    });
  });

  describe('the system start date (floor)', () => {
    // 2026-05-01 00:00 Tashkent.
    const FLOOR = new Date('2026-04-30T19:00:00Z');

    it('previous count is null when the previous period starts before the floor', async () => {
      loadFacts.mockResolvedValue(
        sets({ floor: FLOOR, previous: [fact('a')] }),
      );
      // April is before May 1st, so «O'tgan oy» for May has nothing to compare with.
      const res = await service.overview(COMPANY, null, {
        startDate: '2026-05-01',
        endDate: '2026-05-31',
      });
      expect(res.cards.previousDeparted).toBeNull();
    });

    it('previous count is a number when the previous period starts on the floor', async () => {
      loadFacts.mockResolvedValue(
        sets({ floor: FLOOR, previous: [fact('a')] }),
      );
      const res = await service.overview(COMPANY, null, {
        startDate: '2026-06-01',
        endDate: '2026-06-30',
      });
      expect(res.cards.previousDeparted).toBe(1);
    });

    it('months that end on or before the floor are dropped, a partly later one stays', async () => {
      const month = (key: string) => ({ key, provisional: false, facts: [] });
      loadFacts.mockResolvedValue(
        sets({
          floor: new Date('2026-05-14T19:00:00Z'), // mid-May
          months: ['2026-04', '2026-05', '2026-06'].map(month),
        }),
      );
      const res = await service.overview(COMPANY, null, {
        startDate: '2026-06-01',
        endDate: '2026-06-30',
      });
      expect(res.months.map((m) => m.key)).toEqual(['2026-05', '2026-06']);
    });

    it('a month that closes exactly at the floor is dropped', async () => {
      const month = (key: string) => ({ key, provisional: false, facts: [] });
      loadFacts.mockResolvedValue(
        sets({ floor: FLOOR, months: ['2026-04', '2026-05'].map(month) }),
      );
      const res = await service.overview(COMPANY, null, {
        startDate: '2026-05-01',
        endDate: '2026-05-31',
      });
      expect(res.months.map((m) => m.key)).toEqual(['2026-05']);
    });
  });

  describe('averageStudyMonths', () => {
    it('averages the study months of those who left, with no filter', async () => {
      loadFacts.mockResolvedValue(
        sets({ current: [fact('a', 4), fact('b', 7), fact('b', null)] }),
      );
      await expect(
        service.averageStudyMonths(COMPANY, null, OCT),
      ).resolves.toBe(5.5);
      expect(loadFacts.mock.calls[0][3]).not.toHaveProperty('withStartMembers');
    });

    it('is 0 when nobody left', async () => {
      await expect(
        service.averageStudyMonths(COMPANY, null, OCT),
      ).resolves.toBe(0);
    });
  });
});
