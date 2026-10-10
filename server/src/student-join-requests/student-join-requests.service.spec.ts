import { StudentJoinRequestsService } from './student-join-requests.service';
import * as joinTask from '../tasks/join-request-task';
import { TASK_EVENTS } from '../tasks/task-events';
import { JOIN_REQUEST_CLOSED } from './join-request-events';

jest.mock('../holidays/holiday-date-set', () => ({
  buildHolidayDateSet: jest.fn().mockResolvedValue(new Set<string>()),
}));
jest.mock('../balance-notices/load-transfer-state', () => ({
  loadContactPhone: jest.fn().mockResolvedValue('900000000'),
}));
jest.mock('../telegram/scenes/student-registration-flow', () => ({
  registerStudentFromTelegram: jest.fn(),
}));

const GROUP = {
  id: 'g1',
  name: 'A1-07',
  companyId: 1001,
  branchId: 7,
  statusEnum: 'ACTIVE',
  deletedAt: null,
  days: 'odd',
  exactDays: [],
  lessonStartTime: '15:00',
  lessonEndTime: '16:30',
  branch: { status: 'ACTIVE', deletedAt: null },
  teachers: [{ teacher: { firstName: 'Madina', lastName: 'Karimova' } }],
};

const INPUT = {
  branchId: 7,
  groupId: 'g1',
  chatId: '555444',
  telegramUsername: 'dilnoza_a',
  firstName: 'Dilnoza',
  lastName: 'Aliyeva',
  phone: '901234567',
  photo: 'https://r2/new.jpg',
};

function setup() {
  const tx = {
    studentJoinRequest: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'r1' }),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const prisma: any = {
    student: { findFirst: jest.fn().mockResolvedValue(null) },
    group: {
      findFirst: jest.fn().mockResolvedValue(GROUP),
      findUnique: jest.fn().mockResolvedValue({ name: 'A1-07' }),
    },
    studentJoinRequest: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    task: { findUnique: jest.fn().mockResolvedValue({ claimedById: null }) },
    user: { findUnique: jest.fn() },
    $transaction: jest.fn(async (cb: (t: unknown) => unknown) => cb(tx)),
  };
  const upload = { deleteFile: jest.fn().mockResolvedValue(undefined) };
  const events = {
    emit: jest.fn(),
    emitAsync: jest.fn().mockResolvedValue([true]),
  };
  const service = new StudentJoinRequestsService(
    prisma,
    upload as any,
    {} as any,
    {} as any,
    events as any,
  );
  return { tx, prisma, upload, events, service };
}

const EVENT_TASK = {
  id: 't1',
  companyId: 1001,
  title: 'x',
  kind: 'JOIN_REQUEST',
  authorId: null,
  dueAt: null,
  status: 'NEW' as const,
  participants: [{ userId: 3, role: 'ASSIGNEE' as const }],
};

describe('StudentJoinRequestsService.create', () => {
  let createTask: jest.SpyInstance;
  let closeTask: jest.SpyInstance;

  beforeEach(() => {
    createTask = jest
      .spyOn(joinTask, 'createJoinRequestTask')
      .mockResolvedValue({ id: 't1', assigneeIds: [3], eventTask: EVENT_TASK });
    closeTask = jest
      .spyOn(joinTask, 'closeJoinRequestTask')
      .mockResolvedValue(undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('writes the request and its task, then tells the administrators', async () => {
    const { tx, events, service } = setup();

    const out = await service.create(INPUT);

    expect(out.kind).toBe('created');
    expect(out.kind === 'created' && out.text).toContain(
      "Siz <b>A1-07</b> guruhiga yozilish uchun so'rov yubordingiz.",
    );
    expect(tx.studentJoinRequest.create).toHaveBeenCalledWith({
      data: {
        companyId: 1001,
        branchId: 7,
        groupId: 'g1',
        chatId: '555444',
        telegramUsername: 'dilnoza_a',
        firstName: 'Dilnoza',
        lastName: 'Aliyeva',
        phone: '901234567',
        photo: 'https://r2/new.jpg',
      },
      select: { id: true },
    });
    expect(createTask).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        companyId: 1001,
        branchId: 7,
        groupId: 'g1',
        requestId: 'r1',
        title: "Yangi o'quvchi so'rovi: Dilnoza Aliyeva → A1-07",
      }),
    );
    expect(tx.studentJoinRequest.update).toHaveBeenCalledWith({
      where: { id: 'r1' },
      data: { taskId: 't1' },
    });
    expect(events.emit).toHaveBeenCalledWith(TASK_EVENTS.ASSIGNED, {
      task: EVENT_TASK,
      actorId: null,
      userIds: [3],
      created: true,
    });
  });

  it('refuses a phone a live card holds, writing nothing', async () => {
    const { prisma, service } = setup();
    prisma.student.findFirst.mockImplementation(
      async ({ where }: { where: { phone?: string } }) =>
        where.phone ? { id: 11001 } : null,
    );

    expect(await service.create(INPUT)).toEqual({
      kind: 'refused',
      message:
        "Bu telefon raqam allaqachon tizimda ro'yxatdan o'tgan. Muammo bo'lsa administrator bilan bog'laning.",
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses a chat a live card holds', async () => {
    const { prisma, service } = setup();
    prisma.student.findFirst.mockImplementation(
      async ({ where }: { where: { telegramChatId?: string } }) =>
        where.telegramChatId ? { id: 11002 } : null,
    );

    expect(await service.create(INPUT)).toEqual({
      kind: 'refused',
      message: "Siz allaqachon ro'yxatdan o'tgansiz!",
    });
  });

  it.each([
    ['a completed group', { ...GROUP, statusEnum: 'COMPLETED' }],
    ['a deleted group', { ...GROUP, deletedAt: new Date() }],
    ['another branch', { ...GROUP, branchId: 8 }],
    [
      'a closed branch',
      { ...GROUP, branch: { status: 'CLOSED', deletedAt: null } },
    ],
    ['no group', null],
  ])('refuses %s', async (_name, group) => {
    const { prisma, service } = setup();
    prisma.group.findFirst.mockResolvedValue(group);

    expect(await service.create(INPUT)).toEqual({
      kind: 'refused',
      message:
        "Bu guruhga hozir yozilib bo'lmaydi. Administrator bilan bog'laning.",
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('replaces the chat open request, closing its task and dropping its photo', async () => {
    const { tx, upload, events, service } = setup();
    tx.studentJoinRequest.findFirst.mockResolvedValue({
      id: 'r0',
      companyId: 1001,
      taskId: 't0',
      photo: 'https://r2/old.jpg',
    });

    await service.create(INPUT);

    expect(tx.studentJoinRequest.update).toHaveBeenCalledWith({
      where: { id: 'r0' },
      data: { status: 'REPLACED', decidedAt: expect.any(Date), photo: null },
    });
    expect(closeTask).toHaveBeenCalledWith(tx, 't0', null, 'JOIN_REPLACED');
    expect(upload.deleteFile).toHaveBeenCalledWith('https://r2/old.jpg');
    expect(events.emit).toHaveBeenCalledWith(JOIN_REQUEST_CLOSED, {
      companyId: 1001,
      taskId: 't0',
    });
  });

  it('still writes the request when nobody can take the task', async () => {
    const { tx, events, service } = setup();
    createTask.mockResolvedValue(null);

    const out = await service.create(INPUT);

    expect(out.kind).toBe('created');
    expect(tx.studentJoinRequest.update).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalledWith(
      TASK_EVENTS.ASSIGNED,
      expect.anything(),
    );
  });
});

describe('StudentJoinRequestsService.pendingForChat', () => {
  it("names the chat's waiting request's group", async () => {
    const { prisma, service } = setup();
    prisma.studentJoinRequest.findFirst.mockResolvedValue({ groupId: 'g1' });

    expect(await service.pendingForChat('555444')).toEqual({
      groupName: 'A1-07',
    });
    expect(prisma.studentJoinRequest.findFirst).toHaveBeenCalledWith({
      where: { chatId: '555444', status: 'PENDING' },
      select: { groupId: true },
    });
  });

  it('is null when nothing waits', async () => {
    const { service } = setup();
    expect(await service.pendingForChat('555444')).toBeNull();
  });
});
