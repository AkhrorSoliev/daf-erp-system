import { signInStaffWhere } from '../../common/auth/staff-telegram';
import { linkStaffChatByPhone } from './staff-link';

const CHAT = '700000001';
const PHONE = '901234567';

const DOSTON = {
  id: 30401,
  firstName: 'Doston',
  companyId: 1001,
  telegramChatId: null as string | null,
  roles: [{ roleId: 4 }],
};

function setup(matches: unknown[], othersOnChat: unknown[] = []) {
  const tx = {
    user: {
      findMany: jest.fn().mockResolvedValue(othersOnChat),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    user: { findMany: jest.fn().mockResolvedValue(matches) },
    $transaction: jest.fn((work: (t: typeof tx) => Promise<unknown>) =>
      work(tx),
    ),
  };
  const history = { recordUpdate: jest.fn().mockResolvedValue(undefined) };
  return { prisma, tx, history };
}

describe('linkStaffChatByPhone (ADR-0045)', () => {
  it("telefon bo'yicha faqat tizimga kira oladigan xodim hisobini qidiradi", async () => {
    const { prisma, history } = setup([]);

    await linkStaffChatByPhone(prisma as any, history, CHAT, PHONE);

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ...signInStaffWhere(), phone: PHONE },
        take: 2,
      }),
    );
  });

  it('hisob topilmasa — `not_found`, hech narsa yozilmaydi', async () => {
    const { prisma, history } = setup([]);

    await expect(
      linkStaffChatByPhone(prisma as any, history, CHAT, PHONE),
    ).resolves.toEqual({ kind: 'not_found' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(history.recordUpdate).not.toHaveBeenCalled();
  });

  it('raqam bir nechta xodim hisobida — `ambiguous` (yopiq holat), hech narsa yozilmaydi', async () => {
    const { prisma } = setup([DOSTON, { ...DOSTON, id: 30499 }]);

    await expect(
      linkStaffChatByPhone(
        prisma as any,
        { recordUpdate: jest.fn() },
        CHAT,
        PHONE,
      ),
    ).resolves.toEqual({ kind: 'ambiguous' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("bog'lanmagan hisobni shu chatga bog'laydi va tarixga xodimning o'zi nomidan yozadi", async () => {
    const { prisma, tx, history } = setup([DOSTON]);

    await expect(
      linkStaffChatByPhone(prisma as any, history, CHAT, PHONE),
    ).resolves.toEqual({
      kind: 'linked',
      account: {
        id: 30401,
        firstName: 'Doston',
        roleIds: [4],
        portal: 'lehrer',
      },
      previousChatId: null,
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 30401 },
      data: { telegramChatId: CHAT },
    });
    expect(history.recordUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'User',
        entityId: 30401,
        oldValues: { telegramChatId: null },
        newValues: { telegramChatId: CHAT },
        changedById: 30401,
        companyId: 1001,
        tx,
      }),
    );
  });

  it("boshqa Telegram'ga bog'langan hisob yangi chatga o'tadi; eski chat qaytariladi", async () => {
    const { prisma, tx } = setup([{ ...DOSTON, telegramChatId: '600000009' }]);

    const result = await linkStaffChatByPhone(
      prisma as any,
      { recordUpdate: jest.fn() },
      CHAT,
      PHONE,
    );

    expect(result).toEqual(
      expect.objectContaining({ kind: 'linked', previousChatId: '600000009' }),
    );
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 30401 },
      data: { telegramChatId: CHAT },
    });
  });

  it("shu chatni ko'rsatib turgan boshqa hisobdan bog'lanish olinadi — bitta Telegram, bitta xodim hisobi", async () => {
    const { prisma, tx, history } = setup(
      [DOSTON],
      [{ id: 30777, companyId: 1001 }],
    );

    await linkStaffChatByPhone(prisma as any, history, CHAT, PHONE);

    expect(tx.user.findMany).toHaveBeenCalledWith({
      where: { telegramChatId: CHAT, deletedAt: null, id: { not: 30401 } },
      select: { id: true, companyId: true },
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 30777 },
      data: { telegramChatId: null },
    });
    expect(history.recordUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: 30777,
        oldValues: { telegramChatId: CHAT },
        newValues: { telegramChatId: null },
        changedById: 30401,
      }),
    );
  });

  it("allaqachon shu chatga bog'langan bo'lsa — yozuv ham, tarix ham yo'q", async () => {
    const { prisma, tx, history } = setup([
      { ...DOSTON, telegramChatId: CHAT },
    ]);

    const result = await linkStaffChatByPhone(
      prisma as any,
      history,
      CHAT,
      PHONE,
    );

    expect(result).toEqual(
      expect.objectContaining({ kind: 'linked', previousChatId: null }),
    );
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(history.recordUpdate).not.toHaveBeenCalled();
  });
});
