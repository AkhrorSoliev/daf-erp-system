import { UserStatus } from '@prisma/client';
import {
  STUDENT_ONLY_ACCOUNT,
  isStudentOnlyAccount,
  openStudentAccount,
  signInAccountChange,
} from './student-account';
import { userArchiveData } from '../status/user-archive';

describe('student-only account (ADR-0033)', () => {
  it('matches accounts whose only role is Student', () => {
    expect(STUDENT_ONLY_ACCOUNT).toEqual({
      AND: [
        { roles: { some: { roleId: 6 } } },
        { roles: { every: { roleId: 6 } } },
      ],
    });
  });

  it.each([
    [[6], true],
    [[3, 6], false],
    [[4], false],
    [[], false],
  ])('isStudentOnlyAccount(%j) is %s', (roleIds, expected) => {
    expect(isStudentOnlyAccount(roleIds)).toBe(expected);
  });

  it('describes the account change as a card-history pair', () => {
    expect(signInAccountChange('Ochiq', 'Yopildi')).toEqual({
      oldValues: { kirishHisobi: 'Ochiq' },
      newValues: { kirishHisobi: 'Yopildi' },
    });
  });

  it('archives a user with the fields server/CLAUDE.md requires', () => {
    const data = userArchiveData(7);
    expect(data).toMatchObject({
      status: UserStatus.ARCHIVED,
      isActive: false,
      deletedById: 7,
      statusChangedById: 7,
    });
    expect(data.deletedAt).toBe(data.statusChangedAt);
  });
});

describe('openStudentAccount', () => {
  const card = {
    id: 20001,
    phone: '901112233',
    firstName: 'Ali',
    lastName: 'Valiyev',
    companyId: 1001,
  };
  let db: any;

  beforeEach(() => {
    db = {
      user: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 30001 }),
      },
      student: { update: jest.fn().mockResolvedValue({}) },
    };
  });

  it('opens a Student account on the card phone and links it', async () => {
    const result = await openStudentAccount(db, card);

    const data = db.user.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      login: '901112233',
      phone: '901112233',
      firstName: 'Ali',
      lastName: 'Valiyev',
      companyId: 1001,
      roles: { create: [{ roleId: 6 }] },
    });
    expect(data.password).toMatch(/^\$2[aby]\$10\$/);
    expect(db.student.update).toHaveBeenCalledWith({
      where: { id: 20001 },
      data: { userId: 30001 },
    });
    expect(result).toMatchObject({ userId: 30001, login: '901112233' });
    expect(result.plainPassword).toHaveLength(8);
  });

  it('leaves the login empty when the number is already a live login', async () => {
    db.user.findFirst.mockResolvedValue({ id: 30999 });

    const result = await openStudentAccount(db, card);

    expect(db.user.create.mock.calls[0][0].data.login).toBeNull();
    expect(db.user.create.mock.calls[0][0].data.phone).toBe('901112233');
    expect(result.login).toBeNull();
  });
});
