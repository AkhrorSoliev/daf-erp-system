import { BarredLessonsService } from './barred-lessons.service';
import { admissionKey } from '../billing/lesson-admission.service';

const TODAY = '2026-10-30';
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

const enrollment = {
  id: 'e1',
  studentId: 11001,
  groupId: 'g031',
  startDate: d('2026-09-01'),
  createdAt: d('2026-09-01'),
  statusChangedAt: null,
};

describe('BarredLessonsService', () => {
  const prisma = {
    enrollment: { findMany: jest.fn() },
    enrollmentMonthlyCharge: { findMany: jest.fn() },
    attendance: { groupBy: jest.fn(), findMany: jest.fn() },
    plannedAbsence: { findMany: jest.fn() },
  };
  const admission = { forLessons: jest.fn() };
  const service = new BarredLessonsService(prisma as never, admission as never);

  const OCT = ['2026-10-02', '2026-10-05', '2026-10-07', '2026-10-09'];

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.enrollment.findMany.mockResolvedValue([enrollment]);
    prisma.enrollmentMonthlyCharge.findMany.mockResolvedValue([
      { enrollmentId: 'e1', coveredDates: OCT, frozenOutDates: [] },
    ]);
    // The teacher took attendance on every day (other students have rows).
    prisma.attendance.groupBy.mockResolvedValue(
      OCT.map((date) => ({ groupId: 'g031', date: d(date) })),
    );
    // Our student came on the 1st lesson only.
    prisma.attendance.findMany.mockResolvedValue([
      {
        studentId: 11001,
        groupId: 'g031',
        date: d('2026-10-02'),
        status: 'PRESENT',
        cancellationId: null,
      },
    ]);
    prisma.plannedAbsence.findMany.mockResolvedValue([]);
  });

  const refused = (days: string[]) =>
    new Map(
      days.map((day) => [
        admissionKey(11001, 'g031', day),
        { admitted: false, reason: 'NOT_PAID', shortfall: 1 },
      ]),
    );

  it('returns the days the admission rule kept the student out of', async () => {
    admission.forLessons.mockResolvedValue(
      refused(['2026-10-05', '2026-10-07', '2026-10-09']),
    );
    const out = await service.forEnrollments(['e1'], { today: TODAY });
    expect(out.get('e1')).toEqual({
      enrollmentId: 'e1',
      studentId: 11001,
      groupId: 'g031',
      days: ['2026-10-05', '2026-10-07', '2026-10-09'],
      streak: 3,
      lastDay: '2026-10-09',
    });
  });

  it('drops days the rule admitted (the student had paid)', async () => {
    admission.forLessons.mockResolvedValue(refused(['2026-10-09']));
    const out = await service.forEnrollments(['e1'], { today: TODAY });
    expect(out.get('e1')?.days).toEqual(['2026-10-09']);
    expect(out.get('e1')?.streak).toBe(1);
  });

  it('returns nothing when every day was admitted and marked', async () => {
    admission.forLessons.mockResolvedValue(new Map());
    prisma.attendance.findMany.mockResolvedValue(
      OCT.map((date) => ({
        studentId: 11001,
        groupId: 'g031',
        date: d(date),
        status: 'PRESENT',
        cancellationId: null,
      })),
    );
    const out = await service.forEnrollments(['e1'], { today: TODAY });
    expect(out.size).toBe(0);
  });

  it('counts an ABSENT mark together with refused days in the streak', async () => {
    admission.forLessons.mockResolvedValue(
      refused(['2026-10-07', '2026-10-09']),
    );
    prisma.attendance.findMany.mockResolvedValue([
      {
        studentId: 11001,
        groupId: 'g031',
        date: d('2026-10-02'),
        status: 'PRESENT',
        cancellationId: null,
      },
      {
        studentId: 11001,
        groupId: 'g031',
        date: d('2026-10-05'),
        status: 'ABSENT',
        cancellationId: null,
      },
    ]);
    const out = await service.forEnrollments(['e1'], { today: TODAY });
    expect(out.get('e1')?.days).toEqual(['2026-10-07', '2026-10-09']);
    expect(out.get('e1')?.streak).toBe(3);
  });

  it('does not judge a day the teacher did not hold', async () => {
    prisma.attendance.groupBy.mockResolvedValue([
      { groupId: 'g031', date: d('2026-10-02') },
    ]);
    admission.forLessons.mockResolvedValue(new Map());
    const out = await service.forEnrollments(['e1'], { today: TODAY });
    expect(admission.forLessons).toHaveBeenCalledWith([]);
    expect(out.size).toBe(0);
  });

  it('reads nothing for an empty list', async () => {
    const out = await service.forEnrollments([], { today: TODAY });
    expect(out.size).toBe(0);
    expect(prisma.enrollment.findMany).not.toHaveBeenCalled();
  });
});
