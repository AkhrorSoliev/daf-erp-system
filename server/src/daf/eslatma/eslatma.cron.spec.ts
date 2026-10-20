jest.mock('./eslatma-auditoriya', () => ({ haftaTayyormi: jest.fn() }));
jest.mock('./eslatma-jurnali', () => ({
  eskilariniTozala: jest.fn(async () => 0),
}));

import { utcMidnightFromDateStr } from '../../common/date/tashkent';
import { haftaTayyormi } from './eslatma-auditoriya';
import { eskilariniTozala } from './eslatma-jurnali';
import { EslatmaCron } from './eslatma.cron';

const tayyor = haftaTayyormi as jest.Mock;
const tozala = eskilariniTozala as jest.Mock;

const SESHANBA_1930 = new Date('2026-10-20T14:30:00Z');
const YAKSHANBA_1930 = new Date('2026-10-18T14:30:00Z');
const DUSHANBA = (soat: number) => new Date(Date.UTC(2026, 9, 19, soat - 5));

function make(o: { bayram?: boolean } = {}) {
  const prisma = {
    company: { findMany: jest.fn(async () => [{ id: 1 }, { id: 2 }]) },
  } as any;
  const holidays = {
    findActiveHolidayCovering: jest.fn(async () =>
      o.bayram ? { id: 9 } : null,
    ),
  } as any;
  const n = { auditoriya: 3, yuborildi: 3, xato: 0, otkazildi: 0 };
  const yuborish = {
    kechki: jest.fn(async () => n),
    haftalik: jest.fn(async () => n),
  } as any;
  return {
    cron: new EslatmaCron(prisma, holidays, yuborish),
    prisma,
    holidays,
    yuborish,
  };
}

describe('EslatmaCron', () => {
  const oldin = process.env.DAF_ESLATMALAR;
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DAF_ESLATMALAR = 'on';
  });
  afterAll(() => {
    if (oldin === undefined) delete process.env.DAF_ESLATMALAR;
    else process.env.DAF_ESLATMALAR = oldin;
  });

  it('jadval: kechki du–sha 19:30, xulosa dushanba 9:00–18:00 har soat, Toshkent', () => {
    const meta = (fn: object) =>
      Reflect.getMetadata('SCHEDULE_CRON_OPTIONS', fn);
    expect(meta(EslatmaCron.prototype.kechkiTick)).toEqual(
      expect.objectContaining({
        cronTime: '0 30 19 * * 1-6',
        timeZone: 'Asia/Tashkent',
      }),
    );
    expect(meta(EslatmaCron.prototype.haftalikTick)).toEqual(
      expect.objectContaining({
        cronTime: '0 0 9-18 * * 1',
        timeZone: 'Asia/Tashkent',
      }),
    );
  });

  it('off (standart, o`zgaruvchi yo`q): hech narsa — kompaniyalar ham o`qilmaydi', async () => {
    delete process.env.DAF_ESLATMALAR;
    const { cron, prisma, yuborish } = make();
    expect(await cron.kechki(SESHANBA_1930)).toBe(0);
    expect(await cron.haftalik(DUSHANBA(9))).toBe(0);
    expect(prisma.company.findMany).not.toHaveBeenCalled();
    expect(yuborish.kechki).not.toHaveBeenCalled();
    expect(yuborish.haftalik).not.toHaveBeenCalled();
  });

  it("log: auditoriya so'raladi, rejim uzatiladi, jurnal tozalanmaydi", async () => {
    process.env.DAF_ESLATMALAR = 'log';
    const { cron, yuborish } = make();
    expect(await cron.kechki(SESHANBA_1930)).toBe(2);
    expect(yuborish.kechki).toHaveBeenCalledWith(1, '2026-10-20', 'log');
    expect(tozala).not.toHaveBeenCalled();
  });

  it('on: har kompaniya, oxirida 90 kunlik tozalash', async () => {
    const { cron, prisma, yuborish } = make();
    expect(await cron.kechki(SESHANBA_1930)).toBe(2);
    expect(yuborish.kechki).toHaveBeenCalledWith(1, '2026-10-20', 'on');
    expect(yuborish.kechki).toHaveBeenCalledWith(2, '2026-10-20', 'on');
    expect(tozala).toHaveBeenCalledWith(prisma, 1, '2026-10-20');
    expect(tozala).toHaveBeenCalledWith(prisma, 2, '2026-10-20');
  });

  it("yakshanba va umumiy bayram kuni kechki eslatma yo'q", async () => {
    const yak = make();
    expect(await yak.cron.kechki(YAKSHANBA_1930)).toBe(0);
    expect(yak.holidays.findActiveHolidayCovering).not.toHaveBeenCalled();
    const bayram = make({ bayram: true });
    expect(await bayram.cron.kechki(SESHANBA_1930)).toBe(0);
    expect(bayram.holidays.findActiveHolidayCovering).toHaveBeenCalledWith(
      utcMidnightFromDateStr('2026-10-20'),
      null,
    );
    expect(bayram.yuborish.kechki).not.toHaveBeenCalled();
  });

  it("bir kompaniyaning xatosi boshqasini to'xtatmaydi", async () => {
    const { cron, yuborish } = make();
    yuborish.kechki.mockRejectedValueOnce(new Error('db down'));
    expect(await cron.kechki(SESHANBA_1930)).toBe(1);
    expect(yuborish.kechki).toHaveBeenCalledTimes(2);
  });

  it('xulosa: hafta tayyor — yuboriladi, bayram dushanbasida ham', async () => {
    tayyor.mockResolvedValue(true);
    const { cron, yuborish, holidays, prisma } = make({ bayram: true });
    expect(await cron.haftalik(DUSHANBA(9))).toBe(2);
    expect(tayyor).toHaveBeenCalledWith(prisma, 1, '2026-10-19');
    expect(yuborish.haftalik).toHaveBeenCalledWith(1, '2026-10-19', 'on');
    expect(holidays.findActiveHolidayCovering).not.toHaveBeenCalled();
  });

  it('xulosa: tayyor emas — 17:00 da kutadi, 18:00 da shu hafta tashlanadi; ikkalasida yubormaydi', async () => {
    tayyor.mockResolvedValue(false);
    const { cron, yuborish } = make();
    expect(await cron.haftalik(DUSHANBA(17))).toBe(0);
    expect(await cron.haftalik(DUSHANBA(18))).toBe(0);
    expect(yuborish.haftalik).not.toHaveBeenCalled();
  });

  it('xulosa: dushanba emas — hech narsa', async () => {
    const { cron } = make();
    expect(await cron.haftalik(SESHANBA_1930)).toBe(0);
    expect(tayyor).not.toHaveBeenCalled();
  });
});
