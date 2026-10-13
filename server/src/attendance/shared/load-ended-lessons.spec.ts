import { loadEndedLessonsToday } from './load-ended-lessons';

// 2026-10-12 — dushanba. 05:30Z = 10:30 Toshkent.
const NOW = new Date('2026-10-12T05:30:00Z');

function group(id: string, branchId = 1) {
  return {
    id,
    name: `#${id}`,
    companyId: 1,
    branchId,
    exactDays: ['monday'],
    lessonStartTime: '08:30',
    lessonEndTime: '10:00',
    startDate: null,
    endDate: null,
  };
}

function setup(over: {
  groups?: ReturnType<typeof group>[];
  cancelled?: string[];
  holidayBranches?: number[];
}) {
  const prisma = {
    group: { findMany: jest.fn().mockResolvedValue(over.groups ?? []) },
    lessonReschedule: { findMany: jest.fn().mockResolvedValue([]) },
    lessonCancellation: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          (over.cancelled ?? []).map((groupId) => ({ groupId })),
        ),
    },
  };
  const holidays = {
    findActiveHolidayCovering: jest.fn(async (_d: Date, branchId: number) =>
      (over.holidayBranches ?? []).includes(branchId)
        ? { id: 'h', name: 'Bayram', date: NOW, endDate: NOW }
        : null,
    ),
  };
  return { prisma, holidays };
}

describe('loadEndedLessonsToday', () => {
  it('returns today and the lessons that have ended', async () => {
    const { prisma, holidays } = setup({ groups: [group('a')] });
    const r = await loadEndedLessonsToday(prisma as never, holidays, NOW);
    expect(r.todayStr).toBe('2026-10-12');
    expect(r.nowMinutes).toBe(10 * 60 + 30);
    expect(r.today.toISOString()).toBe('2026-10-12T00:00:00.000Z');
    expect(r.lessons.map((l) => l.groupId)).toEqual(['a']);
    expect(r.lessons[0].endTime).toBe('10:00');
  });

  it('leaves out a cancelled lesson and a branch on holiday', async () => {
    const { prisma, holidays } = setup({
      groups: [group('a'), group('b'), group('c', 2)],
      cancelled: ['a'],
      holidayBranches: [2],
    });
    const r = await loadEndedLessonsToday(prisma as never, holidays, NOW);
    expect(r.lessons.map((l) => l.groupId)).toEqual(['b']);
  });

  it('asks nothing more when there are no active groups', async () => {
    const { prisma, holidays } = setup({ groups: [] });
    const r = await loadEndedLessonsToday(prisma as never, holidays, NOW);
    expect(r.lessons).toEqual([]);
    expect(holidays.findActiveHolidayCovering).not.toHaveBeenCalled();
  });
});
