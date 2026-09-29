import { EnrollmentStatus } from '@prisma/client';
import { rosterOnDate } from './roster-on-date';

const lesson = new Date('2026-09-28T00:00:00.000Z');
const db = (rows: unknown[]) =>
  ({ enrollment: { findMany: jest.fn().mockResolvedValue(rows) } }) as any;

describe('rosterOnDate', () => {
  it('keeps active students and those who left on or after the lesson day', async () => {
    const rows = [
      {
        id: 'e1',
        studentId: 1,
        status: EnrollmentStatus.ACTIVE,
        statusChangedAt: null,
      },
      // left the next morning (Tashkent)
      {
        id: 'e2',
        studentId: 2,
        status: EnrollmentStatus.DROPPED,
        statusChangedAt: new Date('2026-09-29T06:00:00.000Z'),
      },
      // left the day before
      {
        id: 'e3',
        studentId: 3,
        status: EnrollmentStatus.DROPPED,
        statusChangedAt: new Date('2026-09-27T06:00:00.000Z'),
      },
      // group completed the same evening
      {
        id: 'e4',
        studentId: 4,
        status: EnrollmentStatus.COMPLETED,
        statusChangedAt: new Date('2026-09-28T13:00:00.000Z'),
      },
    ];
    expect(await rosterOnDate(db(rows), 'g1', lesson)).toEqual([
      { id: 'e1', studentId: 1, status: EnrollmentStatus.ACTIVE },
      { id: 'e2', studentId: 2, status: EnrollmentStatus.DROPPED },
      { id: 'e4', studentId: 4, status: EnrollmentStatus.COMPLETED },
    ]);
  });

  it("prefers a returning student's active enrollment", async () => {
    const rows = [
      {
        id: 'old',
        studentId: 5,
        status: EnrollmentStatus.TRANSFERRED,
        statusChangedAt: new Date('2026-09-29T06:00:00.000Z'),
      },
      {
        id: 'new',
        studentId: 5,
        status: EnrollmentStatus.ACTIVE,
        statusChangedAt: null,
      },
    ];
    expect(await rosterOnDate(db(rows), 'g1', lesson)).toEqual([
      { id: 'new', studentId: 5, status: EnrollmentStatus.ACTIVE },
    ]);
  });

  it('leaves out a closed enrollment whose closing day is unknown', async () => {
    const rows = [
      {
        id: 'e6',
        studentId: 6,
        status: EnrollmentStatus.DROPPED,
        statusChangedAt: null,
      },
    ];
    expect(await rosterOnDate(db(rows), 'g1', lesson)).toEqual([]);
  });

  it('asks only for enrollments started by the lesson day', async () => {
    const d = db([]);
    await rosterOnDate(d, 'g1', lesson);
    expect(d.enrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          groupId: 'g1',
          deletedAt: null,
          OR: [{ startDate: null }, { startDate: { lte: lesson } }],
        },
      }),
    );
  });
});
