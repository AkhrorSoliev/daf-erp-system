import { loadUnmarkedLessonInfos } from './unmarked-lesson-info';

it('keys each lesson and names who took it', async () => {
  const db = {
    unmarkedLesson: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'u1',
          groupId: 'g1',
          date: new Date('2026-09-28T00:00:00.000Z'),
          status: 'PENDING',
          teacherPayExempt: true,
          lessonStartTime: '18:00',
          lessonEndTime: '19:30',
          claimedById: 3,
        },
        {
          id: 'u2',
          groupId: 'g2',
          date: new Date('2026-09-28T00:00:00.000Z'),
          status: 'HELD',
          teacherPayExempt: false,
          lessonStartTime: '09:00',
          lessonEndTime: '10:30',
          claimedById: null,
        },
      ]),
    },
    user: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: 3, firstName: 'Ali', lastName: 'Valiyev' }]),
    },
  } as any;
  const infos = await loadUnmarkedLessonInfos(db, {
    groupId: { in: ['g1', 'g2'] },
  });
  expect(infos.get('g1:2026-09-28')).toEqual({
    id: 'u1',
    status: 'PENDING',
    teacherPayExempt: true,
    lessonStartTime: '18:00',
    lessonEndTime: '19:30',
    claimedBy: { id: 3, firstName: 'Ali', lastName: 'Valiyev' },
  });
  expect(infos.get('g2:2026-09-28')).toEqual({
    id: 'u2',
    status: 'HELD',
    teacherPayExempt: false,
    lessonStartTime: '09:00',
    lessonEndTime: '10:30',
    claimedBy: null,
  });
});
