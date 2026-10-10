import { ConflictException, ForbiddenException } from '@nestjs/common';
import { StudentJoinRequestsService } from './student-join-requests.service';
import * as joinTask from '../tasks/join-request-task';
import { TASK_EVENTS } from '../tasks/task-events';
import * as flow from '../telegram/scenes/student-registration-flow';
import * as branchScope from '../common/auth/branch-scope';
import {
  JOIN_REQUEST_CLOSED,
  JOIN_REQUEST_MESSAGE,
} from './join-request-events';

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

const REQUEST = {
  id: 'r1',
  companyId: 1001,
  branchId: 7,
  groupId: 'g1',
  chatId: '555444',
  telegramUsername: 'dilnoza_a',
  firstName: 'Dilnoza',
  lastName: 'Aliyeva',
  phone: '901234567',
  photo: 'https://r2/p.jpg',
  status: 'PENDING',
  taskId: 't1',
  decidedById: null,
  decidedAt: null,
  rejectReason: null,
  approvedGroupId: null,
  studentId: null,
  createdAt: new Date('2026-10-01T09:00:00.000Z'),
};
const ADMIN = { id: 10002, companyId: 1001, roles: ['Administrator'] };

describe('StudentJoinRequestsService — decisions', () => {
  // The transaction the mocked registration hands to `inTx`.
  let txFromRegister: any;
  let closeTask: jest.SpyInstance;
  const register = jest.mocked(flow.registerStudentFromTelegram);

  beforeEach(() => {
    jest.spyOn(branchScope, 'assertCallerInBranch').mockResolvedValue();
    closeTask = jest
      .spyOn(joinTask, 'closeJoinRequestTask')
      .mockResolvedValue(undefined);
    register.mockReset();
    register.mockImplementation(async (...args: unknown[]) => {
      const options = args[6] as flow.RegistrationOptions | undefined;
      await options?.inTx?.(txFromRegister, 11345);
      return { plainPassword: 'k7Pq2xZa' };
    });
  });
  afterEach(() => jest.restoreAllMocks());

  function decide() {
    const s = setup();
    s.prisma.studentJoinRequest.findFirst.mockResolvedValue({ ...REQUEST });
    txFromRegister = s.tx;
    return s;
  }

  describe('approve', () => {
    it('writes the card through registration, takes the request and the task in its transaction', async () => {
      const { service, tx, events } = decide();

      const out = await service.approve('r1', undefined, ADMIN);

      expect(out).toEqual({
        status: 'APPROVED',
        studentId: 11345,
        delivered: true,
      });
      expect(register).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.anything(),
        {
          firstName: 'Dilnoza',
          lastName: 'Aliyeva',
          phone: '901234567',
          photo: 'https://r2/p.jpg',
          branchId: 7,
          groupId: 'g1',
          groupName: 'A1-07',
        },
        '555444',
        events,
        expect.objectContaining({ actorId: 10002 }),
      );
      expect(tx.studentJoinRequest.updateMany).toHaveBeenCalledWith({
        where: { id: 'r1', status: 'PENDING' },
        data: {
          status: 'APPROVED',
          decidedById: 10002,
          decidedAt: expect.any(Date),
          approvedGroupId: 'g1',
          studentId: 11345,
        },
      });
      expect(closeTask).toHaveBeenCalledWith(tx, 't1', 10002, 'JOIN_APPROVED');
      expect(events.emit).toHaveBeenCalledWith(JOIN_REQUEST_CLOSED, {
        companyId: 1001,
        taskId: 't1',
      });
      const [event, message] = events.emitAsync.mock.calls[0];
      expect(event).toBe(JOIN_REQUEST_MESSAGE);
      expect(message.chatId).toBe('555444');
      expect(message.photo).toBe('https://r2/p.jpg');
      expect(message.text).toContain('🔑 Parol: <b>k7Pq2xZa</b>');
    });

    it('enrols into the group the administrator chose', async () => {
      const { service, prisma } = decide();
      prisma.group.findFirst.mockResolvedValue({
        ...GROUP,
        id: 'g2',
        name: 'A1-09',
      });

      await service.approve('r1', 'g2', ADMIN);

      expect(prisma.group.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'g2' } }),
      );
      expect(register.mock.calls[0][3]).toEqual(
        expect.objectContaining({ groupId: 'g2', groupName: 'A1-09' }),
      );
    });

    it('a second approval finds the request taken and writes no second card', async () => {
      const { service, tx } = decide();
      tx.studentJoinRequest.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.approve('r1', undefined, ADMIN),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(closeTask).not.toHaveBeenCalled();
    });

    it('says when the message did not reach the person', async () => {
      const { service, events } = decide();
      events.emitAsync.mockResolvedValue([false]);

      const out = await service.approve('r1', undefined, ADMIN);

      expect(out.delivered).toBe(false);
    });

    it.each([
      ['a group of another branch', { ...GROUP, branchId: 8 }],
      ['a completed group', { ...GROUP, statusEnum: 'COMPLETED' }],
      [
        'a closed branch',
        { ...GROUP, branch: { status: 'CLOSED', deletedAt: null } },
      ],
    ])('refuses %s, writing nothing', async (_n, group) => {
      const { service, prisma } = decide();
      prisma.group.findFirst.mockResolvedValue(group);

      await expect(service.approve('r1', undefined, ADMIN)).rejects.toThrow();
      expect(register).not.toHaveBeenCalled();
    });

    it('refuses a phone or a chat a live card took meanwhile', async () => {
      const { service, prisma } = decide();
      prisma.student.findFirst.mockResolvedValue({ id: 11001 });

      await expect(service.approve('r1', undefined, ADMIN)).rejects.toThrow(
        '#11001',
      );
      expect(register).not.toHaveBeenCalled();
    });

    it('refuses a request already decided', async () => {
      const { service, prisma } = decide();
      prisma.studentJoinRequest.findFirst.mockResolvedValue({
        ...REQUEST,
        status: 'REJECTED',
      });

      await expect(service.approve('r1', undefined, ADMIN)).rejects.toThrow(
        "Bu so'rov allaqachon ko'rib chiqilgan",
      );
    });

    it('refuses an administrator of another branch', async () => {
      const { service } = decide();
      jest
        .spyOn(branchScope, 'assertCallerInBranch')
        .mockRejectedValue(new ForbiddenException('x'));

      await expect(
        service.approve('r1', undefined, ADMIN),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('refuses an administrator when another one took the task; a director passes', async () => {
      const { service, prisma } = decide();
      prisma.task.findUnique.mockResolvedValue({ claimedById: 10003 });
      prisma.user.findUnique.mockResolvedValue({
        firstName: 'Kamola',
        lastName: 'Rahimova',
      });

      await expect(service.approve('r1', undefined, ADMIN)).rejects.toThrow(
        "Bu so'rovni Kamola Rahimova ko'rib chiqmoqda",
      );
      await expect(
        service.approve('r1', undefined, {
          id: 10001,
          companyId: 1001,
          roles: ['Branch Director'],
        }),
      ).resolves.toEqual(expect.objectContaining({ status: 'APPROVED' }));
    });
  });

  describe('reject', () => {
    it('closes the request and its task, drops the photo, and tells the person without the reason', async () => {
      const { service, prisma, tx, upload, events } = decide();

      expect(await service.reject('r1', 'begona odam', ADMIN)).toEqual({
        status: 'REJECTED',
      });
      expect(tx.studentJoinRequest.updateMany).toHaveBeenCalledWith({
        where: { id: 'r1', status: 'PENDING' },
        data: {
          status: 'REJECTED',
          decidedById: 10002,
          decidedAt: expect.any(Date),
          rejectReason: 'begona odam',
          photo: null,
        },
      });
      expect(closeTask).toHaveBeenCalledWith(tx, 't1', 10002, 'JOIN_REJECTED');
      expect(upload.deleteFile).toHaveBeenCalledWith('https://r2/p.jpg');
      const message = events.emitAsync.mock.calls[0][1];
      expect(message.text).toContain("so'rovingiz tasdiqlanmadi");
      expect(message.text).not.toContain('begona');
      expect(register).not.toHaveBeenCalled();
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('a request decided meanwhile is a conflict', async () => {
      const { service, tx } = decide();
      tx.studentJoinRequest.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.reject('r1', 'x', ADMIN)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('expireOld', () => {
    it('closes requests older than 7 days and tells each person', async () => {
      const { service, prisma, tx, events } = decide();
      prisma.studentJoinRequest.findMany.mockResolvedValue([
        { ...REQUEST },
        { ...REQUEST, id: 'r2', taskId: 't2' },
      ]);
      const now = new Date('2026-10-10T04:00:00.000Z');
      jest
        .spyOn((service as any).logger, 'log')
        .mockImplementation(() => undefined);

      expect(await service.expireOld(now)).toBe(2);
      expect(prisma.studentJoinRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: 'PENDING',
            createdAt: { lt: new Date('2026-10-03T04:00:00.000Z') },
          },
        }),
      );
      expect(tx.studentJoinRequest.updateMany).toHaveBeenCalledWith({
        where: { id: 'r1', status: 'PENDING' },
        data: {
          status: 'EXPIRED',
          decidedById: null,
          decidedAt: expect.any(Date),
          rejectReason: null,
          photo: null,
        },
      });
      expect(closeTask).toHaveBeenCalledWith(tx, 't1', null, 'JOIN_EXPIRED');
      expect(events.emitAsync.mock.calls[0][1].text).toContain(
        "7 kun ichida ko'rib chiqa olmadik",
      );
    });

    it('one failure does not stop the others', async () => {
      const { service, prisma } = decide();
      prisma.studentJoinRequest.findMany.mockResolvedValue([
        { ...REQUEST },
        { ...REQUEST, id: 'r2', taskId: 't2' },
      ]);
      prisma.$transaction.mockRejectedValueOnce(new Error('deadlock'));
      jest
        .spyOn((service as any).logger, 'error')
        .mockImplementation(() => undefined);
      jest
        .spyOn((service as any).logger, 'log')
        .mockImplementation(() => undefined);

      expect(
        await service.expireOld(new Date('2026-10-10T04:00:00.000Z')),
      ).toBe(1);
    });
  });
});
