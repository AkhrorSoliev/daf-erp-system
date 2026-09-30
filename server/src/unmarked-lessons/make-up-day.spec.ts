import { closeQuestionOnFormerMakeUpDay } from './make-up-day';

// Tuesday 29.09, the day a move no longer lands on. The group meets on
// Tuesdays, so only the sweep's other rules can leave it without a lesson.
const day = new Date('2026-09-29T00:00:00.000Z');
const now = new Date('2026-09-30T09:00:00.000Z');
const args = { groupId: 'g1', day, actorId: 9, now };
const group = {
  id: 'g1',
  name: '#014',
  companyId: 1,
  branchId: 2,
  exactDays: ['tuesday'],
  lessonStartTime: '16:00',
  lessonEndTime: '17:30',
  startDate: null,
  endDate: null,
};

function makeTx() {
  return {
    unmarkedLesson: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'u2',
        status: 'PENDING',
        taskCommentId: 'c3',
      }),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    group: { findUnique: jest.fn().mockResolvedValue(group) },
    lessonReschedule: { findMany: jest.fn().mockResolvedValue([]) },
    lessonCancellation: { findFirst: jest.fn().mockResolvedValue(null) },
    holiday: { findMany: jest.fn().mockResolvedValue([]) },
    commentAssignee: {
      findUnique: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn(),
    },
  } as any;
}

// The rule is the lesson-end sweep's own (`lessonsOn`), read the way the
// sweep reads it: holidays for the group's branch, live moves of that day.
describe('closeQuestionOnFormerMakeUpDay', () => {
  it("closes it on a weekly lesson day that is the branch's holiday", async () => {
    const tx = makeTx();
    tx.holiday.findMany.mockResolvedValue([{ date: day, endDate: day }]);

    await closeQuestionOnFormerMakeUpDay(tx, args);

    expect(tx.holiday.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ branchId: null }, { branchId: 2 }],
        }),
      }),
    );
    expect(tx.unmarkedLesson.update).toHaveBeenCalledWith({
      where: { id: 'u2' },
      data: { status: 'NOT_HELD', decidedById: 9, decidedAt: now },
    });
    expect(tx.commentAssignee.updateMany).toHaveBeenCalled();
  });

  it('keeps it on a day another live move still lands on', async () => {
    const tx = makeTx();
    tx.group.findUnique.mockResolvedValue({ ...group, exactDays: ['monday'] });
    tx.lessonReschedule.findMany.mockResolvedValue([
      {
        groupId: 'g1',
        originalDate: new Date('2026-09-21T00:00:00.000Z'),
        newDate: day,
        newLessonStartTime: null,
        newLessonEndTime: null,
      },
    ]);

    await closeQuestionOnFormerMakeUpDay(tx, args);

    expect(tx.lessonReschedule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          groupId: 'g1',
          deletedAt: null,
          OR: [{ originalDate: day }, { newDate: day }],
        },
      }),
    );
    expect(tx.unmarkedLesson.update).not.toHaveBeenCalled();
  });
});
