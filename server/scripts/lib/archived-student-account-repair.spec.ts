import { UserStatus } from '@prisma/client';
import {
  applyClose,
  applyLogin,
  applyOpen,
  findAccountsToClose,
  findCardsWithoutAccount,
  findLoginsToFill,
  systemArchiveData,
} from './archived-student-account-repair';
import { STUDENT_ONLY_ACCOUNT } from '../../src/common/auth/student-account';
import { userArchiveData } from '../../src/common/status/user-archive';

const txOf = (tx: any) => ({
  $transaction: jest.fn((fn: (t: any) => unknown) => fn(tx)),
});

describe('ADR-0033 repair — close accounts of archived cards', () => {
  it('writes the archive fields with no actor ("Tizim")', () => {
    const data = systemArchiveData();
    expect(Object.keys(data).sort()).toEqual(
      Object.keys(userArchiveData(1)).sort(),
    );
    expect(data).toMatchObject({
      status: UserStatus.ARCHIVED,
      isActive: false,
      deletedById: null,
      statusChangedById: null,
    });
  });

  it('finds live student-only accounts whose card is archived or gone', async () => {
    const db = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 30001,
            companyId: 1001,
            student: { id: 20001, companyId: 1001 },
          },
          { id: 30002, companyId: 1001, student: null },
        ]),
      },
    };

    const plans = await findAccountsToClose(db as any);

    expect(db.user.findMany.mock.calls[0][0].where).toEqual({
      deletedAt: null,
      ...STUDENT_ONLY_ACCOUNT,
      OR: [
        { student: { is: null } },
        { student: { is: { deletedAt: { not: null } } } },
      ],
    });
    expect(plans).toEqual([
      { accountId: 30001, studentId: 20001, companyId: 1001 },
      { accountId: 30002, studentId: null, companyId: 1001 },
    ]);
  });

  it('closes one and records it on the card', async () => {
    const tx = {
      user: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const history = { recordUpdate: jest.fn() };

    const result = await applyClose(txOf(tx) as any, history as any, {
      accountId: 30001,
      studentId: 20001,
      companyId: 1001,
    });

    expect(result).toBe('applied');
    expect(tx.user.updateMany.mock.calls[0][0].where).toMatchObject({
      id: 30001,
      deletedAt: null,
    });
    expect(history.recordUpdate).toHaveBeenCalledWith({
      entityType: 'Student',
      entityId: 20001,
      oldValues: { kirishHisobi: 'Ochiq' },
      newValues: { kirishHisobi: 'Yopildi' },
      companyId: 1001,
      tx,
    });
  });

  it('skips an account that changed since planning', async () => {
    const tx = {
      user: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const history = { recordUpdate: jest.fn() };

    const result = await applyClose(txOf(tx) as any, history as any, {
      accountId: 30001,
      studentId: 20001,
      companyId: 1001,
    });

    expect(result).toBe('skipped');
    expect(history.recordUpdate).not.toHaveBeenCalled();
  });
});

describe('ADR-0033 repair — give an empty login the card number', () => {
  it('plans only numbers nobody else holds, ignoring accounts about to close', async () => {
    const db = {
      student: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 20001,
            phone: '901112233',
            companyId: 1001,
            user: { id: 30001, phone: '901112233' },
          },
          {
            id: 20002,
            phone: '902223344',
            companyId: 1001,
            user: { id: 30002, phone: '902223344' },
          },
          {
            id: 20003,
            phone: '903334455',
            companyId: 1001,
            user: { id: 30003, phone: '909999999' },
          },
        ]),
      },
      user: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 30777 }),
      },
    };

    const plans = await findLoginsToFill(db as any, [30500]);

    expect(db.user.findFirst.mock.calls[0][0].where).toEqual({
      login: '901112233',
      deletedAt: null,
      id: { notIn: [30500] },
    });
    // 20002: the number is still someone's login; 20003: account and card disagree.
    expect(plans).toEqual([
      {
        studentId: 20001,
        accountId: 30001,
        companyId: 1001,
        login: '901112233',
      },
    ]);
  });

  it('writes the login and the card history, or skips when the number got taken', async () => {
    const history = { recordUpdate: jest.fn() };
    const plan = {
      studentId: 20001,
      accountId: 30001,
      companyId: 1001,
      login: '901112233',
    };
    const tx = {
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      student: { findFirst: jest.fn().mockResolvedValue({ id: 20001 }) },
    };

    expect(await applyLogin(txOf(tx) as any, history as any, plan)).toBe(
      'applied',
    );
    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: 30001, deletedAt: null, login: null },
      data: { login: '901112233' },
    });
    expect(history.recordUpdate).toHaveBeenCalledWith({
      entityType: 'Student',
      entityId: 20001,
      oldValues: { login: null },
      newValues: { login: '901112233' },
      companyId: 1001,
      tx,
    });

    tx.user.findFirst.mockResolvedValue({ id: 30888 });
    expect(await applyLogin(txOf(tx) as any, history as any, plan)).toBe(
      'skipped',
    );
  });
});

describe('ADR-0033 repair — open the missing accounts', () => {
  it('plans every live card without an account and previews its login', async () => {
    const db = {
      student: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 20001,
            phone: '901112233',
            firstName: 'Ali',
            lastName: 'Valiyev',
            companyId: 1001,
          },
          {
            id: 20002,
            phone: '902223344',
            firstName: 'Vali',
            lastName: 'Aliyev',
            companyId: 1001,
          },
        ]),
      },
      user: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 30777 }),
      },
    };

    const plans = await findCardsWithoutAccount(db as any, [30500]);

    expect(db.student.findMany.mock.calls[0][0].where).toEqual({
      deletedAt: null,
      userId: null,
    });
    expect(plans.map((p) => [p.studentId, p.loginIsPhone])).toEqual([
      [20001, true],
      [20002, false],
    ]);
  });

  it('opens the account like the admin form does, or skips a card that got one', async () => {
    const history = { recordUpdate: jest.fn() };
    const plan = {
      studentId: 20001,
      phone: '901112233',
      firstName: 'Ali',
      lastName: 'Valiyev',
      companyId: 1001,
      loginIsPhone: true,
    };
    const tx = {
      student: {
        findFirst: jest.fn().mockResolvedValue({ id: 20001 }),
        update: jest.fn().mockResolvedValue({}),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 30001 }),
      },
    };

    expect(await applyOpen(txOf(tx) as any, history as any, plan)).toBe(
      'applied',
    );
    expect(tx.user.create.mock.calls[0][0].data).toMatchObject({
      login: '901112233',
      phone: '901112233',
      roles: { create: [{ roleId: 6 }] },
    });
    expect(tx.student.update).toHaveBeenCalledWith({
      where: { id: 20001 },
      data: { userId: 30001 },
    });
    expect(history.recordUpdate).toHaveBeenCalledWith({
      entityType: 'Student',
      entityId: 20001,
      oldValues: { kirishHisobi: "Yo'q", login: null },
      newValues: { kirishHisobi: 'Ochiq', login: '901112233' },
      companyId: 1001,
      tx,
    });

    tx.student.findFirst.mockResolvedValue(null);
    tx.user.create.mockClear();
    expect(await applyOpen(txOf(tx) as any, history as any, plan)).toBe(
      'skipped',
    );
    expect(tx.user.create).not.toHaveBeenCalled();
  });
});
