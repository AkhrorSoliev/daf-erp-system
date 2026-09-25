import { EMPLOYEE_DEEP_LINK_RE } from './constants';
import { TelegramService } from './telegram.service';
import {
  checkEmployeePayload,
  signEmployeePayload,
} from './utils/signed-link.util';

/**
 * A registration link creates a working staff account for whoever opens it,
 * so it stops working three days after it is minted, and links minted before
 * links carried an issue time stop working at once (ADR-0029). The person
 * holding a dead link is told to ask for a new one, not that it is broken.
 *
 * The service's DI graph is large and its bot is only built in
 * `onModuleInit`, so (as in `telegram-channel-gate-resume.spec.ts`) the
 * methods run on a bare prototype instance.
 */
describe('TelegramService — employee registration links expire', () => {
  const EXPIRED_REPLY =
    "Bu havolaning muddati tugagan. Administratordan yangi havola so'rang.";
  const INVALID_REPLY =
    "Noto'g'ri yoki buzilgan havola. Administrator bilan bog'laning.";

  const MINUTE_MS = 60 * 1000;
  const DAY_MS = 24 * 60 * MINUTE_MS;
  const FERGANA = 7;
  const CLOSED_BRANCH = 8;
  const TEACHER = 4;
  const CASHIER = 5;
  const CEO_ID = 1;

  const ago = (ms: number) => new Date(Date.now() - ms);

  function makeService() {
    const branches = [
      { id: FERGANA, deletedAt: null, status: 'ACTIVE' },
      { id: CLOSED_BRANCH, deletedAt: null, status: 'CLOSED' },
    ];
    const inst = Object.create(TelegramService.prototype);
    inst.logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    inst.prisma = {
      branch: {
        // Honours every field the query filters on, like Postgres would.
        findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) =>
          Promise.resolve(
            branches.find((row) =>
              Object.entries(where).every(
                ([key, value]) => row[key as keyof typeof row] === value,
              ),
            ) ?? null,
          ),
        ),
      },
      user: {
        // The issuer lookup. Unused while a CEO is taken from the token; read
        // once the issuer comes from the database instead.
        findFirst: jest.fn(({ where }: { where: { id: number } }) =>
          Promise.resolve(
            where.id === CEO_ID
              ? {
                  mainBranch: null,
                  branches: [],
                  roles: [{ role: { name: 'CEO' } }],
                }
              : null,
          ),
        ),
      },
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

  describe('opening a link in the bot (/start)', () => {
    it('lets a link minted a few minutes ago into employee registration', async () => {
      const service = makeService();
      const ctx = makeCtx();

      const handled = await service.startEmployeeRegistration(
        ctx,
        signEmployeePayload(FERGANA, [TEACHER, CASHIER], ago(5 * MINUTE_MS)),
      );

      expect(handled).toBe(true);
      expect(ctx.scene.enter).toHaveBeenCalledWith('employee-registration');
      expect(ctx.session.data).toEqual({
        branchId: FERGANA,
        roleIds: [TEACHER, CASHIER],
      });
      expect(ctx.reply).not.toHaveBeenCalled();
      expect(ctx.session.processing).toBe(false);
    });

    it('turns away a fresh link for a branch that has closed', async () => {
      const service = makeService();
      const ctx = makeCtx();

      const handled = await service.startEmployeeRegistration(
        ctx,
        signEmployeePayload(CLOSED_BRANCH, [TEACHER], ago(MINUTE_MS)),
      );

      expect(handled).toBe(true);
      expect(ctx.reply).toHaveBeenCalledWith(
        "Filial topilmadi. Administrator bilan bog'laning.",
      );
      expect(ctx.scene.enter).not.toHaveBeenCalled();
      expect(ctx.session.processing).toBe(false);
    });

    it('turns away a link minted three days and five minutes ago, telling them to ask for a new one', async () => {
      const service = makeService();
      const ctx = makeCtx();

      const handled = await service.startEmployeeRegistration(
        ctx,
        signEmployeePayload(
          FERGANA,
          [TEACHER],
          ago(3 * DAY_MS + 5 * MINUTE_MS),
        ),
      );

      expect(handled).toBe(true);
      expect(ctx.reply).toHaveBeenCalledWith(EXPIRED_REPLY);
      expect(ctx.scene.enter).not.toHaveBeenCalled();
      // `/start` ignores a chat whose previous `/start` is still processing,
      // so a refusal that left the flag set would mute the bot for them.
      expect(ctx.session.processing).toBe(false);
    });

    it('turns away a link shared before links carried an issue time the same way', async () => {
      const service = makeService();
      const ctx = makeCtx();
      // The only format links had before ADR-0029; its age cannot be known.
      const undated = 'employee_7_roles_4_sig_0123456789abcdef';

      const handled = await service.startEmployeeRegistration(ctx, undated);

      expect(handled).toBe(true);
      expect(ctx.reply).toHaveBeenCalledWith(EXPIRED_REPLY);
      expect(ctx.scene.enter).not.toHaveBeenCalled();
      expect(ctx.session.processing).toBe(false);
    });

    it('calls an old link with its issue time moved forward broken, not expired', async () => {
      const service = makeService();
      const ctx = makeCtx();
      const old = signEmployeePayload(FERGANA, [TEACHER], ago(10 * DAY_MS));
      const fresh = signEmployeePayload(FERGANA, [TEACHER], ago(MINUTE_MS));
      const freshTime = fresh.match(EMPLOYEE_DEEP_LINK_RE)![3];
      const forged = old.replace(/_t_[0-9a-z]+_/, `_t_${freshTime}_`);

      const handled = await service.startEmployeeRegistration(ctx, forged);

      expect(handled).toBe(true);
      expect(ctx.reply).toHaveBeenCalledWith(INVALID_REPLY);
      expect(ctx.scene.enter).not.toHaveBeenCalled();
      expect(ctx.session.processing).toBe(false);
    });

    it('leaves every other payload to the rest of /start', async () => {
      const service = makeService();
      const ctx = makeCtx();

      const handled = await service.startEmployeeRegistration(
        ctx,
        'student_7_group_abc',
      );

      expect(handled).toBe(false);
      expect(ctx.reply).not.toHaveBeenCalled();
      expect(ctx.scene.enter).not.toHaveBeenCalled();
    });
  });

  describe('minting a link (POST /telegram/employee-link)', () => {
    it('stamps it with the moment it is minted: accepted now, refused after three days', async () => {
      const service = makeService();

      const payload: string = await service.generateEmployeeLinkPayload(
        FERGANA,
        [TEACHER],
        { id: CEO_ID, roles: ['CEO'] },
      );

      const match = payload.match(EMPLOYEE_DEEP_LINK_RE);
      expect(match).not.toBeNull();
      const verdictAt = (now: Date) =>
        checkEmployeePayload(
          Number(match![1]),
          match![2].split('-').map(Number),
          match![3],
          match![4],
          now,
        );
      expect(verdictAt(new Date())).toBe('valid');
      expect(verdictAt(new Date(Date.now() + 3 * DAY_MS + MINUTE_MS))).toBe(
        'expired',
      );
    });
  });
});
