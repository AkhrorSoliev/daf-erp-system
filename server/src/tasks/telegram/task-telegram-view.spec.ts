import { UserStatus } from '@prisma/client';
import {
  signInStaffWhere,
  staffLinkedToChatWhere,
} from '../../common/auth/staff-telegram';
import {
  loadTaskView,
  staffChatOf,
  staffOfChat,
  taskOpenUrl,
  usersWithTelegram,
} from './task-telegram-view';

const STUDENT_URL = 'https://student.dafzentrum.uz/tg';

describe('staffOfChat (spec §6.5)', () => {
  const db = (rows: unknown[]) => ({
    user: { findMany: jest.fn().mockResolvedValue(rows) },
  });

  it('one live staff account on the chat', async () => {
    const d = db([{ id: 40, companyId: 1, roles: [{ roleId: 4 }] }]);
    await expect(staffOfChat(d as any, '700')).resolves.toEqual({
      kind: 'one',
      userId: 40,
      companyId: 1,
      roleIds: [4],
    });
    expect(d.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: staffLinkedToChatWhere('700'),
        take: 2,
      }),
    );
  });

  it('none, or two — never pick one', async () => {
    await expect(staffOfChat(db([]) as any, '700')).resolves.toEqual({
      kind: 'none',
    });
    await expect(
      staffOfChat(
        db([
          { id: 1, companyId: 1, roles: [] },
          { id: 2, companyId: 1, roles: [] },
        ]) as any,
        '700',
      ),
    ).resolves.toEqual({ kind: 'several' });
  });
});

describe('staffChatOf', () => {
  const db = (row: unknown, owners: number) => ({
    user: {
      findFirst: jest.fn().mockResolvedValue(row),
      count: jest.fn().mockResolvedValue(owners),
    },
  });

  it('the chat of a sign-in staff account that owns it alone', async () => {
    await expect(
      staffChatOf(
        db({ telegramChatId: '700', roles: [{ roleId: 3 }] }, 1) as any,
        40,
      ),
    ).resolves.toEqual({ chatId: '700', roleIds: [3] });
  });

  it('only an ACTIVE, isActive account is a recipient; the owner count stays on sign-in staff', async () => {
    const d = db({ telegramChatId: '700', roles: [] }, 1);
    await staffChatOf(d as any, 40);
    expect(d.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 40,
          ...signInStaffWhere(),
          status: UserStatus.ACTIVE,
          isActive: true,
          telegramChatId: { not: null },
        },
      }),
    );
    expect(d.user.count).toHaveBeenCalledWith({
      where: staffLinkedToChatWhere('700'),
    });
  });

  it('no chat, or a chat two live accounts share → null', async () => {
    await expect(staffChatOf(db(null, 0) as any, 40)).resolves.toBeNull();
    await expect(
      staffChatOf(db({ telegramChatId: '700', roles: [] }, 2) as any, 40),
    ).resolves.toBeNull();
  });
});

describe('usersWithTelegram (the assignee picker, one query for the list)', () => {
  const owner = (
    id: number,
    chat: string,
    over: { status?: UserStatus; isActive?: boolean } = {},
  ) => ({
    id,
    telegramChatId: chat,
    status: UserStatus.ACTIVE,
    isActive: true,
    ...over,
  });
  const db = (rows: unknown[]) => ({
    user: { findMany: jest.fn().mockResolvedValue(rows) },
  });

  it('a live account alone on its chat is linked; no chat is not', async () => {
    const d = db([owner(40, 'a')]);
    const linked = await usersWithTelegram(d as any, [
      { id: 40, telegramChatId: 'a' },
      { id: 41, telegramChatId: null },
    ]);
    expect([...linked]).toEqual([40]);
    expect(d.user.findMany).toHaveBeenCalledTimes(1);
    expect(d.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ...signInStaffWhere(), telegramChatId: { in: ['a'] } },
      }),
    );
  });

  it('an inactive employee, or a chat two live accounts share, is not linked', async () => {
    const linked = await usersWithTelegram(
      db([
        owner(40, 'a', { isActive: false }),
        owner(41, 'b', { status: UserStatus.INACTIVE }),
        owner(42, 'c'),
        owner(43, 'c'),
        owner(44, 'd'),
      ]) as any,
      [
        { id: 40, telegramChatId: 'a' },
        { id: 41, telegramChatId: 'b' },
        { id: 42, telegramChatId: 'c' },
        { id: 44, telegramChatId: 'd' },
      ],
    );
    expect([...linked]).toEqual([44]);
  });

  it('a chat whose owner is somebody else (not a sign-in staff account) is not linked', async () => {
    const linked = await usersWithTelegram(db([owner(99, 'a')]) as any, [
      { id: 40, telegramChatId: 'a' },
    ]);
    expect(linked.size).toBe(0);
  });

  it('nobody has a chat → no query', async () => {
    const d = db([]);
    await usersWithTelegram(d as any, [{ id: 1, telegramChatId: null }]);
    expect(d.user.findMany).not.toHaveBeenCalled();
  });
});

describe('taskOpenUrl', () => {
  it('admin portal for roles 1, 2, 3, 5; teacher portal for a teacher only', () => {
    expect(taskOpenUrl(STUDENT_URL, [3], 't1')).toBe(
      'https://admin.dafzentrum.uz/tasks?task=t1',
    );
    expect(taskOpenUrl(STUDENT_URL, [4], 't1')).toBe(
      'https://lehrer.dafzentrum.uz/tasks?task=t1',
    );
  });

  it('no student Mini App address, or no staff role → no link', () => {
    expect(taskOpenUrl(undefined, [3], 't1')).toBeUndefined();
    expect(taskOpenUrl('https://abc.ngrok.app/tg', [3], 't1')).toBeUndefined();
    expect(taskOpenUrl(STUDENT_URL, [6], 't1')).toBeUndefined();
  });
});

describe('loadTaskView', () => {
  const row = {
    id: 't1',
    companyId: 1,
    kind: 'MANUAL',
    title: 'Banner',
    status: 'NEW',
    priority: 'HIGH',
    dueAt: null,
    requiresPhoto: false,
    authorId: 30,
    entityType: 'Group',
    entityId: 'g1',
    author: { firstName: 'Ahror', lastName: 'Soliyev' },
    participants: [
      {
        userId: 40,
        role: 'ASSIGNEE',
        user: { firstName: 'Aziz', lastName: 'Rahimov' },
      },
    ],
    steps: [{ id: 's1', title: 'Matn', doneAt: new Date() }],
  };
  const db = (task: unknown) => ({
    task: { findUnique: jest.fn().mockResolvedValue(task) },
    group: { findUnique: jest.fn().mockResolvedValue({ name: 'A1-3' }) },
    student: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ firstName: 'Dilnoza', lastName: 'Karimova' }),
    },
    lead: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ firstName: 'Jamshid', lastName: 'Mirzayev' }),
    },
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ firstName: 'Malika', lastName: 'Azizova' }),
    },
  });

  it('maps the row with short names, the link and the steps', async () => {
    await expect(loadTaskView(db(row) as any, 't1')).resolves.toEqual({
      id: 't1',
      companyId: 1,
      kind: 'MANUAL',
      title: 'Banner',
      status: 'NEW',
      priority: 'HIGH',
      dueAt: null,
      requiresPhoto: false,
      authorId: 30,
      authorName: 'Soliyev A.',
      entityLabel: 'A1-3 guruh',
      participants: [{ userId: 40, role: 'ASSIGNEE', name: 'Rahimov A.' }],
      steps: [{ id: 's1', title: 'Matn', done: true }],
    });
  });

  it.each([
    ['Student', '12', 'Karimova Dilnoza'],
    ['Lead', 'l1', 'Mirzayev Jamshid (lid)'],
    ['User', '7', 'Azizova Malika'],
    ['Student', 'abc', null],
  ])('%s %s → %s', async (entityType, entityId, label) => {
    const v = await loadTaskView(
      db({ ...row, entityType, entityId }) as any,
      't1',
    );
    expect(v?.entityLabel).toBe(label);
  });

  it('a deleted task → null', async () => {
    await expect(loadTaskView(db(null) as any, 't1')).resolves.toBeNull();
  });
});
