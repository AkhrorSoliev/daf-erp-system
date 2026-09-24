import { BadRequestException } from '@nestjs/common';
import {
  findLiveStaffByPhone,
  loginForPhone,
  planPhoneChange,
  PHONE_HELD_BY_STAFF_MESSAGE,
  STAFF_ROLE_IDS,
} from './phone-account-rules';

function buildPrisma(findFirst: jest.Mock) {
  return { user: { findFirst } } as any;
}

describe('STAFF_ROLE_IDS', () => {
  it("o'quvchi roli (6) xodim emas", () => {
    expect([...STAFF_ROLE_IDS]).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('findLiveStaffByPhone', () => {
  it('faqat tirik va xodim rolli hisobni qidiradi', async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValue({ id: 10, firstName: 'Nodira', lastName: 'Yusupova' });

    const hit = await findLiveStaffByPhone(buildPrisma(findFirst), '901112233');

    expect(hit).toEqual({ id: 10, firstName: 'Nodira', lastName: 'Yusupova' });
    const { where, select } = findFirst.mock.calls[0][0];
    expect(where.phone).toBe('901112233');
    expect(where.deletedAt).toBeNull();
    expect(where.roles).toEqual({ some: { roleId: { in: [1, 2, 3, 4, 5] } } });
    expect(select).toEqual({ id: true, firstName: true, lastName: true });
  });

  it('topilmasa null', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    expect(
      await findLiveStaffByPhone(buildPrisma(findFirst), '901112233'),
    ).toBeNull();
  });
});

describe('loginForPhone', () => {
  it("nom bo'sh bo'lsa telefonni qaytaradi", async () => {
    const findFirst = jest.fn().mockResolvedValue(null);

    expect(await loginForPhone(buildPrisma(findFirst), '901112233')).toBe(
      '901112233',
    );
    expect(findFirst.mock.calls[0][0].where).toEqual({
      login: '901112233',
      deletedAt: null,
    });
  });

  it("nom tirik hisobda band bo'lsa null - hech narsa uydirilmaydi", async () => {
    const findFirst = jest.fn().mockResolvedValue({ id: 5 });
    expect(await loginForPhone(buildPrisma(findFirst), '901112233')).toBeNull();
  });
});

describe('findLiveStaffByPhone — the account being edited', () => {
  it('leaves the excluded account out of the search', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    await findLiveStaffByPhone(buildPrisma(findFirst), '901112233', 42);
    expect(findFirst.mock.calls[0][0].where.id).toEqual({ not: 42 });
  });

  it('adds no id condition when nothing is excluded', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    await findLiveStaffByPhone(buildPrisma(findFirst), '901112233');
    expect(findFirst.mock.calls[0][0].where).not.toHaveProperty('id');
  });
});

describe('planPhoneChange (ADR-0031)', () => {
  // One mock answers both lookups by the shape of `where`:
  // findLiveStaffByPhone filters on roles, loginForPhone on login.
  function prismaWith(
    opts: { staffHolder?: object | null; loginHolder?: object | null } = {},
  ) {
    const findFirst = jest
      .fn()
      .mockImplementation(({ where }: any) =>
        Promise.resolve(
          where.roles
            ? (opts.staffHolder ?? null)
            : where.login !== undefined
              ? (opts.loginHolder ?? null)
              : null,
        ),
      );
    return { prisma: buildPrisma(findFirst), findFirst };
  }
  const account = { id: 10, phone: '901112233', login: '901112233' };
  const holder = { id: 55, firstName: 'Nodira', lastName: 'Yusupova' };

  it('writes nothing new and asks nothing when the phone is unchanged', async () => {
    const { prisma, findFirst } = prismaWith();
    expect(
      await planPhoneChange(prisma, account, '901112233', { staff: true }),
    ).toEqual({ phone: '901112233' });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('moves a login that holds the old number to the new one', async () => {
    const { prisma } = prismaWith();
    expect(
      await planPhoneChange(prisma, account, '909998877', { staff: true }),
    ).toEqual({ phone: '909998877', login: '909998877' });
  });

  it('clears that login when the new number is already some live account login', async () => {
    const { prisma } = prismaWith({ loginHolder: { id: 77 } });
    expect(
      await planPhoneChange(prisma, account, '909998877', { staff: true }),
    ).toEqual({ phone: '909998877', login: null });
  });

  it('leaves a login that is not the old number alone', async () => {
    const { prisma } = prismaWith();
    expect(
      await planPhoneChange(
        prisma,
        { ...account, login: 'akmal' },
        '909998877',
        {
          staff: true,
        },
      ),
    ).toEqual({ phone: '909998877' });
  });

  it('leaves a missing login missing when the account had no phone', async () => {
    const { prisma } = prismaWith();
    expect(
      await planPhoneChange(
        prisma,
        { id: 10, phone: null, login: null },
        '909998877',
        { staff: true },
      ),
    ).toEqual({ phone: '909998877' });
  });

  it('refuses a number another live staff account holds, without naming them', async () => {
    const { prisma, findFirst } = prismaWith({ staffHolder: holder });
    const error = await planPhoneChange(prisma, account, '909998877', {
      staff: true,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as Error).message).toBe(PHONE_HELD_BY_STAFF_MESSAGE);
    expect((error as Error).message).not.toMatch(/Nodira|Yusupova|55/);
    expect(findFirst.mock.calls[0][0].where.id).toEqual({ not: 10 });
  });

  it('does not run the staff check for an account without a staff role', async () => {
    const { prisma } = prismaWith({ staffHolder: holder });
    expect(
      await planPhoneChange(prisma, account, '909998877', { staff: false }),
    ).toEqual({ phone: '909998877', login: '909998877' });
  });
});
