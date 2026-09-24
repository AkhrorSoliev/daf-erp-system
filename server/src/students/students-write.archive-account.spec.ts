import { UserStatus } from '@prisma/client';
import { StudentsWriteService } from './students-write.service';
import { STUDENT_ONLY_ACCOUNT } from '../common/auth/student-account';

jest.mock('../common/auth/student-branch-scope', () => ({
  assertCallerMayTouchStudent: jest.fn().mockResolvedValue(1),
}));

/**
 * ADR-0033: the card and its sign-in account are archived together. Before
 * this the account stayed ACTIVE, kept the student's number as its login and
 * went on signing in to a portal with no card behind it.
 */
describe('StudentsWriteService.delete — the sign-in account (ADR-0033)', () => {
  const CARD = {
    id: 20001,
    status: 'ACTIVE',
    companyId: 1001,
    userId: 30001,
    phone: '901112233',
  };
  let prisma: any;
  let tx: any;
  let history: any;
  let service: StudentsWriteService;

  beforeEach(() => {
    tx = {
      student: { update: jest.fn().mockResolvedValue({}) },
      user: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    prisma = {
      student: {
        findFirst: jest.fn().mockResolvedValue(CARD),
        update: jest.fn(),
      },
      user: { updateMany: jest.fn() },
      $transaction: jest.fn((fn: (t: any) => unknown) => fn(tx)),
    };
    history = {
      recordDelete: jest.fn(),
      recordUpdate: jest.fn(),
    };
    service = new StudentsWriteService(
      prisma,
      {} as any,
      { changeStatus: jest.fn().mockResolvedValue({}) } as any,
      { cascade: jest.fn().mockResolvedValue([]) } as any,
      history,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  it('archives the card and its student-only account in one transaction', async () => {
    await service.delete(20001, 7, "Qayta ro'yxatdan o'tadi", 1001);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.student.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 20001 },
        data: expect.objectContaining({ status: 'ARCHIVED', deletedById: 7 }),
      }),
    );
    expect(prisma.student.update).not.toHaveBeenCalled();

    const call = tx.user.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({
      id: 30001,
      deletedAt: null,
      ...STUDENT_ONLY_ACCOUNT,
    });
    expect(call.data).toMatchObject({
      status: UserStatus.ARCHIVED,
      isActive: false,
      deletedAt: expect.any(Date),
      deletedById: 7,
    });
  });

  it("writes 'Kirish hisobi: Ochiq → Yopildi' on the card, inside the transaction", async () => {
    await service.delete(20001, 7, 'Sabab', 1001);

    expect(history.recordUpdate).toHaveBeenCalledWith({
      entityType: 'Student',
      entityId: 20001,
      oldValues: { kirishHisobi: 'Ochiq' },
      newValues: { kirishHisobi: 'Yopildi' },
      changedById: 7,
      companyId: 1001,
      tx,
    });
  });

  it('writes no account row when the account was not closed (already closed, or staff)', async () => {
    tx.user.updateMany.mockResolvedValue({ count: 0 });

    await service.delete(20001, 7, 'Sabab', 1001);

    expect(history.recordUpdate).not.toHaveBeenCalled();
  });

  it('archives a card with no account without touching users', async () => {
    prisma.student.findFirst.mockResolvedValue({ ...CARD, userId: null });

    await service.delete(20001, 7, 'Sabab', 1001);

    expect(tx.student.update).toHaveBeenCalled();
    expect(tx.user.updateMany).not.toHaveBeenCalled();
    expect(history.recordUpdate).not.toHaveBeenCalled();
  });
});
