import {
  findLiveStaffByPhone,
  loginForPhone,
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
