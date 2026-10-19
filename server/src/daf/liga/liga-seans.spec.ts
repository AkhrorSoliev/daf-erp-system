jest.mock('./liga-xona', () => ({
  ligaSharoiti: jest.fn(),
  joinRoom: jest.fn(),
}));
jest.mock('./liga-hisob', () => ({ settleDue: jest.fn() }));

import { joinRoom, ligaSharoiti } from './liga-xona';
import { settleDue } from './liga-hisob';
import { liganiYangilaXavfsiz } from './liga-seans';

const JETZT = new Date('2026-10-21T09:00:00Z');
const prisma = {} as any;
const holat = (o: Record<string, unknown> = {}) => ({
  tier: 0,
  azo: true,
  kechikkan: false,
  xonaGolib: false,
  guruhBirinchi: false,
  ...o,
});

describe('liganiYangilaXavfsiz — seans oxiri', () => {
  beforeEach(() => jest.resetAllMocks());

  it('xonada, kechikkan yo`q — bitta so`rov, yozuv yo`q', async () => {
    (ligaSharoiti as jest.Mock).mockResolvedValue(
      holat({ tier: 2, xonaGolib: true }),
    );
    expect(await liganiYangilaXavfsiz(prisma, 55, 1, JETZT)).toEqual({
      liga: 2,
      xonaGolib: true,
      guruhBirinchi: false,
    });
    expect(ligaSharoiti).toHaveBeenCalledTimes(1);
    expect(joinRoom).not.toHaveBeenCalled();
    expect(settleDue).not.toHaveBeenCalled();
  });

  it('shu hafta xonada emas — qo`shiladi', async () => {
    (ligaSharoiti as jest.Mock).mockResolvedValue(holat({ azo: false }));
    await liganiYangilaXavfsiz(prisma, 55, 1, JETZT);
    expect(joinRoom).toHaveBeenCalledWith(prisma, 55, 1, JETZT);
    expect(settleDue).not.toHaveBeenCalled();
  });

  it('kechikkan hafta — avval hisob (kutmaydi), so`ng holat qayta o`qiladi', async () => {
    (ligaSharoiti as jest.Mock)
      .mockResolvedValueOnce(holat({ kechikkan: true, azo: false }))
      .mockResolvedValueOnce(holat({ tier: 1, azo: true }));
    (settleDue as jest.Mock).mockResolvedValue([]);
    expect(await liganiYangilaXavfsiz(prisma, 55, 1, JETZT)).toEqual({
      liga: 1,
      xonaGolib: false,
      guruhBirinchi: false,
    });
    expect(settleDue).toHaveBeenCalledWith(prisma, 1, JETZT, { kutish: false });
    expect(joinRoom).not.toHaveBeenCalled();
  });

  it('kechikkan va hisobdan so`ng ham xonada emas — hisob JOIN dan oldin', async () => {
    (ligaSharoiti as jest.Mock)
      .mockResolvedValueOnce(holat({ kechikkan: true, azo: false }))
      .mockResolvedValueOnce(holat({ tier: 2, azo: false }));
    const tartib: string[] = [];
    (settleDue as jest.Mock).mockImplementation(async () => {
      tartib.push('settle');
      return [];
    });
    (joinRoom as jest.Mock).mockImplementation(async () => {
      tartib.push('join');
    });
    await liganiYangilaXavfsiz(prisma, 55, 1, JETZT);
    expect(tartib).toEqual(['settle', 'join']);
  });

  it('holat o`qilmadi — null, otilmaydi', async () => {
    (ligaSharoiti as jest.Mock).mockRejectedValue(new Error('db down'));
    await expect(
      liganiYangilaXavfsiz(prisma, 55, 1, JETZT),
    ).resolves.toBeNull();
  });

  it('qo`shilish yiqilsa ham holat qaytadi — nishonlar beriladi', async () => {
    (ligaSharoiti as jest.Mock).mockResolvedValue(
      holat({ azo: false, guruhBirinchi: true }),
    );
    (joinRoom as jest.Mock).mockRejectedValue(new Error('lock timeout'));
    expect(await liganiYangilaXavfsiz(prisma, 55, 1, JETZT)).toEqual({
      liga: 0,
      xonaGolib: false,
      guruhBirinchi: true,
    });
  });

  it('hisob yiqilsa ham otilmaydi — eski holat qaytadi', async () => {
    (ligaSharoiti as jest.Mock).mockResolvedValue(
      holat({ kechikkan: true, azo: false, tier: 1 }),
    );
    (settleDue as jest.Mock).mockRejectedValue(new Error('boom'));
    await expect(liganiYangilaXavfsiz(prisma, 55, 1, JETZT)).resolves.toEqual({
      liga: 1,
      xonaGolib: false,
      guruhBirinchi: false,
    });
  });
});
