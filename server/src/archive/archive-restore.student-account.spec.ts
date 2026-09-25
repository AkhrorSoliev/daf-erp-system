import { BadRequestException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { ArchiveRestoreService } from './archive-restore.service';
import { ArchiveEntityType } from './dto/archive-query.dto';
import { STUDENT_ONLY_ACCOUNT } from '../common/auth/student-account';

/**
 * ADR-0033: a restored card brings its sign-in account back, with the login
 * re-derived from the card phone, and a card whose number now belongs to
 * another live student is not restored at all.
 */
describe('ArchiveRestoreService — a student card and its account (ADR-0033)', () => {
  const CARD = {
    id: 20001,
    phone: '901112233',
    userId: 30001,
    companyId: 1001,
    status: 'ARCHIVED',
    deletionBatchId: null,
  };
  let prisma: any;
  let tx: any;
  let statusHistory: any;
  let history: any;
  let service: ArchiveRestoreService;

  beforeEach(() => {
    tx = {
      student: { update: jest.fn().mockResolvedValue({}) },
      user: {
        // 1st: the closed account; 2nd: loginForPhone's "is it taken?"
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ id: 30001, login: '901112233' })
          .mockResolvedValueOnce(null),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    prisma = {
      student: {
        // 1st: the archived record; 2nd: another live card on the number
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(CARD)
          .mockResolvedValueOnce(null),
        update: jest.fn(),
      },
      $transaction: jest.fn((fn: (t: any) => unknown) => fn(tx)),
    };
    statusHistory = { changeStatus: jest.fn().mockResolvedValue({}) };
    history = { recordRestore: jest.fn(), recordUpdate: jest.fn() };
    service = new ArchiveRestoreService(prisma, statusHistory, history);
  });

  const restore = () =>
    service.restore(ArchiveEntityType.STUDENTS, 20001, 7, 1001);

  it('reopens the closed account with the card phone as its login', async () => {
    await restore();

    expect(tx.student.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 20001 } }),
    );
    expect(prisma.student.update).not.toHaveBeenCalled();
    expect(tx.user.findFirst.mock.calls[0][0].where).toEqual({
      id: 30001,
      deletedAt: { not: null },
      ...STUDENT_ONLY_ACCOUNT,
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 30001 },
      data: expect.objectContaining({
        status: UserStatus.ACTIVE,
        isActive: true,
        deletedAt: null,
        deletedById: null,
        deletionBatchId: null,
        statusChangedById: 7,
        statusChangeReason: 'Arxivdan tiklandi',
        phone: '901112233',
        login: '901112233',
      }),
    });
    expect(history.recordUpdate).toHaveBeenCalledWith({
      entityType: 'Student',
      entityId: 20001,
      oldValues: { kirishHisobi: 'Yopildi', login: '901112233' },
      newValues: { kirishHisobi: 'Ochiq', login: '901112233' },
      changedById: 7,
      companyId: 1001,
      tx,
    });
  });

  it('leaves the login empty when another live account holds the number', async () => {
    tx.user.findFirst
      .mockReset()
      .mockResolvedValueOnce({ id: 30001, login: '901112233' })
      .mockResolvedValueOnce({ id: 30999 });

    await restore();

    expect(tx.user.update.mock.calls[0][0].data.login).toBeNull();
    expect(tx.user.update.mock.calls[0][0].data.phone).toBe('901112233');
  });

  it('refuses, writing nothing, when the number is on another live card', async () => {
    prisma.student.findFirst
      .mockReset()
      .mockResolvedValueOnce(CARD)
      .mockResolvedValueOnce({ id: 20555 });

    const error = await restore().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toContain('#20555');
    expect(prisma.student.findFirst.mock.calls[1][0].where).toEqual({
      phone: '901112233',
      deletedAt: null,
      id: { not: 20001 },
    });
    expect(statusHistory.changeStatus).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(history.recordRestore).not.toHaveBeenCalled();
  });

  it('restores a card with no account without touching users', async () => {
    prisma.student.findFirst
      .mockReset()
      .mockResolvedValueOnce({ ...CARD, userId: null })
      .mockResolvedValueOnce(null);

    await restore();

    expect(tx.student.update).toHaveBeenCalled();
    expect(tx.user.findFirst).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('leaves an account that is still open alone', async () => {
    tx.user.findFirst.mockReset().mockResolvedValueOnce(null);

    await restore();

    expect(tx.user.update).not.toHaveBeenCalled();
    expect(history.recordUpdate).not.toHaveBeenCalled();
  });

  it('restores other entity types exactly as before', async () => {
    const group = { id: 'g-1', statusEnum: 'ARCHIVED', deletionBatchId: null };
    prisma.group = {
      findFirst: jest.fn().mockResolvedValue(group),
      update: jest.fn().mockResolvedValue({}),
    };

    await service.restore(ArchiveEntityType.GROUPS, 'g-1', 7, 1001);

    expect(prisma.group.update).toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
