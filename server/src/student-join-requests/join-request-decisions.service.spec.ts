import { ConflictException, ForbiddenException } from '@nestjs/common';
import { JoinRequestDecisionsService } from './join-request-decisions.service';
import * as joinTask from '../tasks/join-request-task';
import * as flow from '../telegram/scenes/student-registration-flow';
import * as branchScope from '../common/auth/branch-scope';
import {
  JOIN_REQUEST_CLOSED,
  JOIN_REQUEST_MESSAGE,
} from './join-request-events';

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

function setup() {
  const tx = {
    studentJoinRequest: {
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
  const service = new JoinRequestDecisionsService(
    prisma,
    upload as any,
    {} as any,
    {} as any,
    events as any,
  );
  return { tx, prisma, upload, events, service };
}

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

describe('JoinRequestDecisionsService', () => {
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
      options?.onCommit?.();
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
      const { service, tx, events, upload } = decide();

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
      // The card owns the photo now: approving never deletes it.
      expect(upload.deleteFile).not.toHaveBeenCalled();
    });

    it('a duplicate the checks could not see yet, before the commit, is a conflict', async () => {
      const { service, events } = decide();
      register.mockRejectedValue(
        Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
      );

      await expect(service.approve('r1', undefined, ADMIN)).rejects.toThrow(
        "Bu ma'lumotlar allaqachon tizimda bor",
      );
      expect(events.emit).not.toHaveBeenCalled();
      expect(events.emitAsync).not.toHaveBeenCalled();
    });

    it('a failure after the commit is logged with the request and the card, closes the bell rows and surfaces as itself', async () => {
      const { service, events, upload } = decide();
      const failure = Object.assign(new Error('history row failed'), {
        code: 'P2002',
      });
      register.mockImplementation(async (...args: unknown[]) => {
        const options = args[6] as flow.RegistrationOptions;
        await options.inTx?.(txFromRegister, 11345);
        options.onCommit?.();
        throw failure;
      });
      const logError = jest
        .spyOn((service as any).logger, 'error')
        .mockImplementation(() => undefined);

      // Not mapped to «allaqachon tizimda bor»: the request IS decided.
      await expect(service.approve('r1', undefined, ADMIN)).rejects.toBe(
        failure,
      );
      expect(logError).toHaveBeenCalledWith(
        expect.stringMatching(/r1.*#11345/),
      );
      expect(events.emit).toHaveBeenCalledWith(JOIN_REQUEST_CLOSED, {
        companyId: 1001,
        taskId: 't1',
      });
      expect(upload.deleteFile).not.toHaveBeenCalled();
      expect(events.emitAsync).not.toHaveBeenCalled();
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
