import { recurrenceCanManage, toRecurrenceViews } from './task-recurrence-view';
import { toTaskCard } from './task-select';

const ceo = { id: 1, roleIds: [1], branchIds: 'all' as const };
const director = { id: 2, roleIds: [2], branchIds: [7] };
const admin = { id: 3, roleIds: [3], branchIds: [7] };
const person = (id: number) => ({
  id,
  firstName: `F${id}`,
  lastName: `L${id}`,
  photo: null,
});
const row = {
  id: 'r1',
  branchId: 7,
  authorId: 3,
  freq: 'WEEKLY' as const,
  weekdays: [1],
  dayOfMonth: null,
  dueTime: '10:00',
  title: 'Hisobot',
  assigneeIds: [20, 99],
  separateCopies: false,
  active: true,
  nextRunDate: new Date('2026-10-19T00:00:00.000Z'),
  author: person(3),
};

describe('recurrenceCanManage', () => {
  it('the author, a director of its branch and the CEO; nobody else', () => {
    expect(recurrenceCanManage(admin, row)).toBe(true);
    expect(recurrenceCanManage(director, row)).toBe(true);
    expect(recurrenceCanManage(ceo, row)).toBe(true);
    expect(
      recurrenceCanManage({ id: 4, roleIds: [3], branchIds: [7] }, row),
    ).toBe(false);
    expect(
      recurrenceCanManage({ id: 5, roleIds: [2], branchIds: [8] }, row),
    ).toBe(false);
  });
});

describe('toRecurrenceViews', () => {
  const makePrisma = () => ({
    user: { findMany: jest.fn().mockResolvedValue([person(20)]) },
  });

  it('names the assignees in one read, keeps the date as a day, and skips an id no longer found', async () => {
    const prisma = makePrisma();
    const [v] = await toRecurrenceViews(prisma as never, [row], ceo);
    expect(prisma.user.findMany).toHaveBeenCalledTimes(1);
    expect(v).toEqual({
      id: 'r1',
      freq: 'WEEKLY',
      weekdays: [1],
      dayOfMonth: null,
      dueTime: '10:00',
      title: 'Hisobot',
      active: true,
      separateCopies: false,
      nextRunDate: '2026-10-19',
      author: person(3),
      assignees: [person(20)],
      canManage: true,
    });
  });

  it('asks only for live people, so a departed assignee is neither shown nor prefilled', async () => {
    const prisma = makePrisma();
    await toRecurrenceViews(prisma as never, [row], ceo);
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: [20, 99] },
          deletedAt: null,
          isActive: true,
          status: 'ACTIVE',
        },
      }),
    );
  });

  it('names nobody, and reads nobody, when the viewer may not see the people', async () => {
    const prisma = makePrisma();
    const [v] = await toRecurrenceViews(prisma as never, [row], ceo, false);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
    expect(v.assignees).toEqual([]);
  });
});

describe('the badge on a card', () => {
  const card = (recurrence: unknown) =>
    toTaskCard({
      id: 't1',
      author: person(3),
      participants: [],
      steps: [],
      _count: { steps: 0, events: 0 },
      unmarkedLesson: null,
      recurrence,
    } as never);

  it('shows the rule while it runs, nothing once it is stopped or absent', () => {
    const rule = { freq: 'WEEKLY', weekdays: [1], dayOfMonth: null };
    expect(card({ ...rule, active: true }).recurrence).toEqual(rule);
    expect(card({ ...rule, active: false }).recurrence).toBeNull();
    expect(card(null).recurrence).toBeNull();
  });
});
