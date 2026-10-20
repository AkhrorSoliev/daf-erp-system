jest.mock('./liga-hisob', () => ({ settleDue: jest.fn() }));

import { settleDue } from './liga-hisob';
import { LigaCron } from './liga.cron';

describe('LigaCron', () => {
  beforeEach(() => jest.resetAllMocks());

  it('dushanba 00:05 Toshkent', () => {
    expect(
      Reflect.getMetadata('SCHEDULE_CRON_OPTIONS', LigaCron.prototype.tick),
    ).toEqual(
      expect.objectContaining({
        cronTime: '0 5 0 * * 1',
        timeZone: 'Asia/Tashkent',
      }),
    );
  });

  it('har kompaniya alohida: birining xatosi boshqasini to`xtatmaydi', async () => {
    const prisma = {
      company: { findMany: jest.fn(async () => [{ id: 1 }, { id: 2 }]) },
    } as any;
    (settleDue as jest.Mock)
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce([
        {
          haftaBoshi: '2026-10-12',
          bajarildi: true,
          xonalar: 3,
          azolar: 70,
          kotarildi: 5,
          yangiXonalar: 3,
          guruhlar: 12,
        },
      ]);
    const jetzt = new Date('2026-10-18T19:05:00Z');
    expect(await new LigaCron(prisma).run(jetzt)).toBe(1);
    expect(settleDue).toHaveBeenCalledWith(prisma, 1, jetzt, { kutish: true });
    expect(settleDue).toHaveBeenCalledWith(prisma, 2, jetzt, { kutish: true });
  });
});
