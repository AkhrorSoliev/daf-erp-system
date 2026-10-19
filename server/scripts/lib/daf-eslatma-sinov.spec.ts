jest.mock('telegraf', () => ({
  Telegram: jest.fn(() => {
    throw new Error('Telegram must not be constructed on import');
  }),
}));

import { Telegram } from 'telegraf';
import {
  NAMUNA_ISM,
  SINOV_BELGISI,
  ceoWhere,
  parseSinovArgs,
  sinovXabarlari,
  yuborishTokeni,
} from './daf-eslatma-sinov';

describe('CEO sinov nusxasi', () => {
  it("uch xabar namunaviy ma'lumot bilan: seriyali, seriyasiz, dushanba (hamma qator)", () => {
    const x = sinovXabarlari();
    expect(x.map((m) => m.nomi)).toEqual([
      'Kechki eslatma — seriya bilan',
      'Kechki eslatma — seriyasiz',
      'Dushanba xulosasi',
    ]);
    for (const m of x)
      expect(m.matn).toContain(`Assalomu alaykum, ${NAMUNA_ISM}!`);
    expect(x[0].matn).toContain('5 kunlik seriyangiz');
    expect(x[1].matn).toContain("Nemis so'zlaringiz");
    for (const qator of ['• Liga:', '• Guruhingiz:', '• Yangi nishonlar:']) {
      expect(x[2].matn).toContain(qator);
    }
  });

  it('har xabar [SINOV] qatori bilan boshlanadi va 4096 belgidan oshmaydi', () => {
    for (const m of sinovXabarlari()) {
      expect(m.matn.startsWith(SINOV_BELGISI)).toBe(true);
      expect(SINOV_BELGISI).toContain('[SINOV]');
      expect(m.matn.length).toBeLessThanOrEqual(4096);
    }
  });

  it('argumentlar: aynan bitta manzil, --send ixtiyoriy', () => {
    expect(parseSinovArgs(['--user=10000'])).toEqual({
      user: 10000,
      chat: null,
      send: false,
    });
    expect(parseSinovArgs(['--chat=123456', '--send'])).toEqual({
      user: null,
      chat: '123456',
      send: true,
    });
    for (const yomon of [
      [],
      ['--send'],
      ['--user=1', '--chat=2'],
      ['--user=abc'],
      ['--chat=-100123'],
      ['--boshqa'],
    ]) {
      expect(() => parseSinovArgs(yomon)).toThrow(/Ishlatish/);
    }
  });

  it('--user faqat tirik, faol CEO hisobini qabul qiladi', () => {
    expect(ceoWhere(7)).toEqual({
      id: 7,
      deletedAt: null,
      status: 'ACTIVE',
      roles: { some: { role: { name: 'CEO' } } },
    });
  });

  it("yuborish uchun TELEGRAM_BOT_TOKEN shart; quruq yurishda talab yo'q", () => {
    const a = parseSinovArgs(['--chat=5']);
    const s = parseSinovArgs(['--chat=5', '--send']);
    expect(yuborishTokeni(a, undefined)).toBeNull();
    expect(() => yuborishTokeni(s, undefined)).toThrow(/TELEGRAM_BOT_TOKEN/);
    expect(() => yuborishTokeni(s, '')).toThrow(/TELEGRAM_BOT_TOKEN/);
    expect(yuborishTokeni(s, '1:abc')).toBe('1:abc');
  });

  it('skript import qilinganda hech narsa yubormaydi (main() faqat to`g`ridan-to`g`ri yurganda)', () => {
    jest.isolateModules(() => {
      require('../daf-eslatma-sinov');
    });
    expect(Telegram).not.toHaveBeenCalled();
  });
});
