import { BadRequestException } from '@nestjs/common';
import {
  EXTRA_PHONE_IS_MAIN_MESSAGE,
  EXTRA_PHONE_TAKEN_ACCOUNT_STAFF_MESSAGE,
  EXTRA_PHONE_TAKEN_STUDENT_MESSAGE,
  assertExtraPhoneFree,
  extraPhoneTakenStaffMessage,
  findExtraPhoneHolder,
} from './extra-phone-rule';

const SELF = { studentId: 10077, userId: 20077, phone: '901234567' };
const NUMBER = '935554433';

function db(card: any = null, account: any = null) {
  return {
    student: { findFirst: jest.fn().mockResolvedValue(card) },
    user: { findFirst: jest.fn().mockResolvedValue(account) },
  };
}

describe('extra-phone-rule (ADR-0067)', () => {
  it('a free number has no holder', async () => {
    const d = db();
    expect(await findExtraPhoneHolder(d as any, NUMBER, SELF)).toBeNull();
    const cardWhere = d.student.findFirst.mock.calls[0][0].where;
    expect(cardWhere).toEqual({
      deletedAt: null,
      OR: [{ phone: NUMBER }, { extraPhone: NUMBER }],
      id: { not: SELF.studentId },
    });
    const accountWhere = d.user.findFirst.mock.calls[0][0].where;
    expect(accountWhere).toEqual({
      deletedAt: null,
      OR: [{ phone: NUMBER }, { login: NUMBER }],
      roles: { some: { roleId: 6 } },
      id: { not: SELF.userId },
    });
  });

  it("the student's own main number is never a backup number", async () => {
    const d = db();
    expect(await findExtraPhoneHolder(d as any, SELF.phone, SELF)).toEqual({
      kind: 'own-main',
    });
    expect(d.student.findFirst).not.toHaveBeenCalled();
  });

  it("another live card's main or backup number is taken", async () => {
    const d = db({ id: 10999, firstName: 'Vali', lastName: 'Aliyev' });
    expect(await findExtraPhoneHolder(d as any, NUMBER, SELF)).toEqual({
      kind: 'card',
      studentId: 10999,
      name: 'Vali Aliyev',
    });
    expect(d.user.findFirst).not.toHaveBeenCalled();
  });

  it("another live student account's sign-in number is taken", async () => {
    const d = db(null, { id: 20999 });
    expect(await findExtraPhoneHolder(d as any, NUMBER, SELF)).toEqual({
      kind: 'account',
      userId: 20999,
    });
  });

  it('a new card (no id yet) is compared against every live card and account', async () => {
    const d = db();
    await findExtraPhoneHolder(d as any, NUMBER, {
      studentId: null,
      userId: null,
      phone: '901234567',
    });
    expect(d.student.findFirst.mock.calls[0][0].where.id).toBeUndefined();
    expect(d.user.findFirst.mock.calls[0][0].where.id).toBeUndefined();
  });

  it('staff are told who holds the number, a student is not', async () => {
    const taken = db({ id: 10999, firstName: 'Vali', lastName: 'Aliyev' });
    await expect(
      assertExtraPhoneFree(taken as any, NUMBER, SELF, 'staff'),
    ).rejects.toThrow(extraPhoneTakenStaffMessage('Vali Aliyev'));
    await expect(
      assertExtraPhoneFree(taken as any, NUMBER, SELF, 'student'),
    ).rejects.toThrow(EXTRA_PHONE_TAKEN_STUDENT_MESSAGE);
    await expect(
      assertExtraPhoneFree(
        db(null, { id: 20999 }) as any,
        NUMBER,
        SELF,
        'staff',
      ),
    ).rejects.toThrow(EXTRA_PHONE_TAKEN_ACCOUNT_STAFF_MESSAGE);
    await expect(
      assertExtraPhoneFree(db() as any, SELF.phone, SELF, 'student'),
    ).rejects.toThrow(EXTRA_PHONE_IS_MAIN_MESSAGE);
    const err = await assertExtraPhoneFree(
      taken as any,
      NUMBER,
      SELF,
      'staff',
    ).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
  });

  it('a free number passes', async () => {
    await expect(
      assertExtraPhoneFree(db() as any, NUMBER, SELF, 'staff'),
    ).resolves.toBeUndefined();
  });
});
