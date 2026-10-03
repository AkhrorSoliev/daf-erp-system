import { BadRequestException } from '@nestjs/common';
import {
  EXTRA_PHONE_IS_MAIN_MESSAGE,
  EXTRA_PHONE_TAKEN_ACCOUNT_STAFF_MESSAGE,
  EXTRA_PHONE_TAKEN_STUDENT_MESSAGE,
  assertExtraPhoneFree,
  extraPhoneTakenStaffMessage,
  findExtraPhoneHolder,
  findStudentAccountOnNumber,
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
    const staffErr = await assertExtraPhoneFree(
      taken as any,
      NUMBER,
      SELF,
      'staff',
    ).catch((e) => e);
    expect(staffErr).toBeInstanceOf(BadRequestException);
    expect(staffErr.message).toBe(
      "Bu raqam boshqa o'quvchida bor: Vali Aliyev",
    );

    // Exact text, not a substring: a name leaking into it must fail here.
    const studentErr = await assertExtraPhoneFree(
      taken as any,
      NUMBER,
      SELF,
      'student',
    ).catch((e) => e);
    expect(studentErr).toBeInstanceOf(BadRequestException);
    expect(studentErr.message).toBe("Bu raqamni qo'shib bo'lmaydi");
    expect(studentErr.message).not.toContain('Vali');

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
    expect(extraPhoneTakenStaffMessage('Vali Aliyev')).toBe(staffErr.message);
    expect(EXTRA_PHONE_TAKEN_STUDENT_MESSAGE).toBe(studentErr.message);
  });

  it('a free number passes', async () => {
    await expect(
      assertExtraPhoneFree(db() as any, NUMBER, SELF, 'staff'),
    ).resolves.toBeUndefined();
  });

  describe('findStudentAccountOnNumber', () => {
    it('finds a live student account on the number, by phone or login', async () => {
      const d = db(null, { id: 20999 });
      expect(await findStudentAccountOnNumber(d as any, NUMBER, null)).toEqual({
        id: 20999,
      });
      expect(d.user.findFirst.mock.calls[0][0]).toEqual({
        where: {
          OR: [{ phone: NUMBER }, { login: NUMBER }],
          deletedAt: null,
          roles: { some: { roleId: 6 } },
        },
        select: { id: true },
      });
    });

    it('leaves the given account out of the search', async () => {
      const d = db();
      expect(
        await findStudentAccountOnNumber(d as any, NUMBER, 20077),
      ).toBeNull();
      expect(d.user.findFirst.mock.calls[0][0].where.id).toEqual({
        not: 20077,
      });
    });

    it('null excludes nothing', async () => {
      const d = db();
      await findStudentAccountOnNumber(d as any, NUMBER, null);
      expect(d.user.findFirst.mock.calls[0][0].where).not.toHaveProperty('id');
    });
  });
});
