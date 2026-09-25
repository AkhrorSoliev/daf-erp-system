import { TelegramService } from './telegram.service';
import { signEmployeePayload } from './utils/signed-link.util';

/**
 * Whatever happens to an employee link, `/start` answers it and the chat can
 * use `/start` again afterwards.
 *
 * - An error half-way must not leave `processing` set. Telegraf saves the
 *   session even when the handler throws, and `/start` ignores a chat whose
 *   flag is set, re-saving it each time, so its 24-hour TTL never runs out
 *   while the person keeps trying.
 * - A link damaged on the way, so that it parses as neither the dated nor the
 *   undated format, is called broken. Falling through would show the plain
 *   menu, as if the link did nothing.
 *
 * As in `employee-link-expiry.spec.ts`, the methods run on a bare prototype
 * instance.
 */
describe('TelegramService — /start always answers an employee link', () => {
  const INVALID_REPLY =
    "Noto'g'ri yoki buzilgan havola. Administrator bilan bog'laning.";

  const FERGANA = 7;
  const TEACHER = 4;

  const freshLink = () =>
    signEmployeePayload(FERGANA, [TEACHER], new Date(Date.now() - 60 * 1000));

  function makeService() {
    const inst = Object.create(TelegramService.prototype);
    inst.logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    inst.prisma = {
      branch: { findFirst: jest.fn().mockResolvedValue({ id: FERGANA }) },
    };
    return inst;
  }

  function makeCtx() {
    return {
      session: { processing: false, data: {} as Record<string, unknown> },
      reply: jest.fn().mockResolvedValue(undefined),
      scene: { enter: jest.fn().mockResolvedValue(undefined) },
    };
  }

  describe('an error while the link is checked', () => {
    const savedEnv = {
      NODE_ENV: process.env.NODE_ENV,
      TELEGRAM_LINK_SECRET: process.env.TELEGRAM_LINK_SECRET,
    };

    afterEach(() => {
      for (const [key, value] of Object.entries(savedEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });

    it('releases the /start lock when the branch lookup fails, and lets the error through', async () => {
      const service = makeService();
      const ctx = makeCtx();
      const outage = new Error('Connection terminated unexpectedly');
      service.prisma.branch.findFirst.mockRejectedValueOnce(outage);

      await expect(
        service.startEmployeeRegistration(ctx, freshLink()),
      ).rejects.toBe(outage);

      expect(ctx.session.processing).toBe(false);
      expect(ctx.scene.enter).not.toHaveBeenCalled();
    });

    it('releases the /start lock when the link secret is missing in production', async () => {
      const service = makeService();
      const ctx = makeCtx();
      const link = freshLink();
      process.env.NODE_ENV = 'production';
      delete process.env.TELEGRAM_LINK_SECRET;

      await expect(
        service.startEmployeeRegistration(ctx, link),
      ).rejects.toThrow('TELEGRAM_LINK_SECRET');

      expect(ctx.session.processing).toBe(false);
      expect(ctx.scene.enter).not.toHaveBeenCalled();
    });
  });

  describe('a link damaged on the way', () => {
    it.each([
      [
        'whose issue time was cut out',
        (link: string) => link.replace(/_t_[0-9a-z]+_/, '_t__'),
      ],
      [
        'whose signature was cut off',
        (link: string) => link.replace(/_sig_[0-9a-f]+$/, ''),
      ],
      [
        'whose signature is not hex',
        (link: string) =>
          link.replace(/_sig_[0-9a-f]+$/, `_sig_${'z'.repeat(16)}`),
      ],
    ])(
      'answers a link %s as broken, not with the plain menu',
      async (_label, damage) => {
        const service = makeService();
        const ctx = makeCtx();

        const handled = await service.startEmployeeRegistration(
          ctx,
          damage(freshLink()),
        );

        expect(handled).toBe(true);
        expect(ctx.reply).toHaveBeenCalledWith(INVALID_REPLY);
        expect(ctx.scene.enter).not.toHaveBeenCalled();
        expect(service.prisma.branch.findFirst).not.toHaveBeenCalled();
        expect(ctx.session.processing).toBe(false);
      },
    );
  });
});
