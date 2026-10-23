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
  SINOV_ORASI_MS,
  parseSinovArgs,
  runSinov,
  sinovXabarlari,
  yuborishTokeni,
  type SinovDeps,
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
      ['--chat=1', '--chat=2'],
      ['--user=1', '--user=2'],
      ['--user=2147483648'],
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

describe('runSinov (no real Telegram, no real database)', () => {
  const TOKEN = '123456:SECRET-token-value';
  function fake(over: Partial<SinovDeps> = {}) {
    const logs: string[] = [];
    const sendMessage = jest.fn().mockResolvedValue({});
    const getMe = jest.fn().mockResolvedValue({ username: 'sinov_bot' });
    const telegramFactory = jest.fn(() => ({ getMe, sendMessage }));
    const chatOfCeo = jest.fn().mockResolvedValue('777');
    const pause = jest.fn().mockResolvedValue(undefined);
    const deps: SinovDeps = {
      token: TOKEN,
      log: (l) => logs.push(l),
      chatOfCeo,
      dbInfo: () => 'db.example [DEV · .env]',
      telegram: telegramFactory,
      pause,
      ...over,
    };
    return {
      deps,
      logs,
      sendMessage,
      getMe,
      telegramFactory,
      chatOfCeo,
      pause,
    };
  }

  it('dry run: prints the texts, no database, no Telegram', async () => {
    const f = fake();
    await runSinov(['--user=5'], f.deps);
    expect(f.logs.join('\n')).toContain('Quruq yurish');
    expect(f.chatOfCeo).not.toHaveBeenCalled();
    expect(f.telegramFactory).not.toHaveBeenCalled();
  });

  it('--send without a token refuses before any database call', async () => {
    const f = fake({ token: undefined });
    await expect(runSinov(['--user=5', '--send'], f.deps)).rejects.toThrow(
      /TELEGRAM_BOT_TOKEN/,
    );
    expect(f.chatOfCeo).not.toHaveBeenCalled();
    expect(f.telegramFactory).not.toHaveBeenCalled();
  });

  it('--chat --send makes no database call, announces target first, never prints the token', async () => {
    const f = fake();
    await runSinov(['--chat=42', '--send'], f.deps);
    expect(f.chatOfCeo).not.toHaveBeenCalled();
    expect(f.sendMessage).toHaveBeenCalledTimes(3);
    expect(f.pause).toHaveBeenCalledTimes(2);
    expect(f.pause).toHaveBeenCalledWith(SINOV_ORASI_MS);
    const out = f.logs.join('\n');
    expect(out).toContain('Manzil: chat 42');
    expect(out).toContain('DB: ishlatilmaydi');
    expect(out).toContain('Bot: @sinov_bot');
    for (const p of ['1/3 yuborildi', '2/3 yuborildi', '3/3 yuborildi']) {
      expect(out).toContain(p);
    }
    expect(out.indexOf('Manzil: chat 42')).toBeLessThan(
      out.indexOf('1/3 yuborildi'),
    );
    expect(out).toContain('Yuborildi: chat 42');
    expect(out).not.toContain('SECRET');
    expect(f.sendMessage.mock.calls[0][2]).toMatchObject({
      parse_mode: 'HTML',
    });
  });

  it('--user --send reads the CEO chat and prints the database', async () => {
    const f = fake();
    await runSinov(['--user=5', '--send'], f.deps);
    expect(f.chatOfCeo).toHaveBeenCalledWith(5);
    const out = f.logs.join('\n');
    expect(out).toContain('Manzil: chat 777 (CEO 5)');
    expect(out).toContain('DB: db.example [DEV · .env]');
    expect(f.sendMessage.mock.calls[0][0]).toBe('777');
  });

  it('--user: no CEO, or a non-positive stored chat id, sends nothing', async () => {
    for (const stored of [null, '-100123', '0']) {
      const f = fake({ chatOfCeo: jest.fn().mockResolvedValue(stored) });
      await expect(runSinov(['--user=5', '--send'], f.deps)).rejects.toThrow();
      expect(f.sendMessage).not.toHaveBeenCalled();
      expect(f.telegramFactory).not.toHaveBeenCalled();
    }
  });

  it('a failure on message 2 says how many were delivered and hides the token', async () => {
    const f = fake();
    f.sendMessage
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error(`boom at /bot${TOKEN}/sendMessage`));
    const err = await runSinov(['--chat=42', '--send'], f.deps).catch(
      (e: Error) => e,
    );
    expect((err as Error).message).toContain('1/3 yuborilgan');
    expect((err as Error).message).toContain('takrorlanadi');
    expect((err as Error).message).not.toContain('SECRET');
    expect(f.sendMessage).toHaveBeenCalledTimes(2);
  });
});
