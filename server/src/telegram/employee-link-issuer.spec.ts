import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { StudentLeadOriginService } from '../common/student-origin';
import { StatementService } from '../statements/statement.service';
import { EntityHistoryService } from '../common/entity-history';
import { PaymentLinkService } from '../payment-gateways/payment-link.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { UploadService } from '../upload/upload.service';
import { UsersService } from '../users/users.service';
import { EMPLOYEE_DEEP_LINK_RE } from './constants';
import { TelegramChannelGateStatsService } from './telegram-channel-gate-stats.service';
import { TelegramService } from './telegram.service';
import { checkEmployeePayload } from './utils/signed-link.util';

/**
 * A signed employee link works for three days (ADR-0029), so whatever
 * authority the issuer has at the moment of signing is baked in for that long.
 * That authority must be read from the database. The access token is up to an
 * hour stale: it still says CEO after the CEO is archived, and still says
 * Branch Director after a demotion, and a link minted in that hour would carry
 * the old authority.
 */
describe('TelegramService.generateEmployeeLinkPayload — the issuer comes from the database', () => {
  const CEO = 1;
  const BRANCH_DIRECTOR = 2;
  const ADMINISTRATOR = 3;
  const TEACHER = 4;
  const CASHIER = 5;

  const FERGANA = 7;
  const NAMANGAN = 8;

  type UserRow = {
    id: number;
    deletedAt: Date | null;
    status: string;
    mainBranch: number | null;
    branches: { branchId: number }[];
    roles: { role: { name: string } }[];
  };
  const person = (
    id: number,
    roleNames: string[],
    branchId: number | null,
    { deletedAt = null, status = 'ACTIVE' }: Partial<UserRow> = {},
  ): UserRow => ({
    id,
    deletedAt,
    status,
    mainBranch: branchId,
    branches: branchId == null ? [] : [{ branchId }],
    roles: roleNames.map((name) => ({ role: { name } })),
  });

  const ceo = person(101, ['CEO'], null);
  const archivedCeo = person(102, ['CEO'], null, {
    deletedAt: new Date('2026-09-20T10:00:00Z'),
  });
  const director = person(103, ['Branch Director'], FERGANA);
  const admin = person(104, ['Administrator'], FERGANA);
  const teacher = person(105, ['Teacher'], FERGANA);
  const suspendedDirector = person(106, ['Branch Director'], FERGANA, {
    status: 'SUSPENDED',
  });
  const terminatedCeo = person(107, ['CEO'], null, { status: 'TERMINATED' });
  // Archived by status alone: the teacher page's status dialog accepts
  // ARCHIVED without setting `deletedAt`.
  const statusArchivedAdmin = person(108, ['Administrator'], FERGANA, {
    status: 'ARCHIVED',
  });
  const inactiveDirector = person(109, ['Branch Director'], FERGANA, {
    status: 'INACTIVE',
  });

  /**
   * `findFirst` over an in-memory table, honouring the parts of the query
   * that decide the outcome: the soft-delete and status filters are applied
   * only when the query asks for them, and only the selected fields come
   * back. A lookup that forgets any of them behaves here the way it would
   * against Postgres.
   */
  function fakeFindFirst(
    rows: { id: number; deletedAt: Date | null; status?: string }[],
  ) {
    return jest.fn(
      (args: {
        where: {
          id: number;
          deletedAt?: null;
          status?: { notIn?: string[] };
        };
        select?: Record<string, unknown>;
      }) => {
        const { where, select } = args;
        const row = rows.find(
          (r) =>
            r.id === where.id &&
            (where.deletedAt === null ? r.deletedAt === null : true) &&
            !(r.status && where.status?.notIn?.includes(r.status)),
        );
        if (!row) return Promise.resolve(null);
        if (!select) return Promise.resolve(row);
        const picked = Object.fromEntries(
          Object.keys(select)
            .filter((key) => select[key])
            .map((key) => [key, (row as Record<string, unknown>)[key]]),
        );
        return Promise.resolve(picked);
      },
    );
  }

  let service: TelegramService;

  beforeEach(async () => {
    const prisma = {
      user: {
        findFirst: fakeFindFirst([
          ceo,
          archivedCeo,
          director,
          admin,
          teacher,
          suspendedDirector,
          terminatedCeo,
          statusArchivedAdmin,
          inactiveDirector,
        ]),
      },
      branch: {
        findFirst: fakeFindFirst([
          { id: FERGANA, deletedAt: null },
          { id: NAMANGAN, deletedAt: null },
        ]),
      },
    };

    // The bot is built in `onModuleInit`, which `compile()` does not run, so
    // everything but Prisma can be an empty stand-in.
    const module = await Test.createTestingModule({
      providers: [
        TelegramService,
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: RedisService, useValue: {} },
        { provide: PrismaService, useValue: prisma },
        { provide: UploadService, useValue: {} },
        { provide: UsersService, useValue: {} },
        { provide: EntityHistoryService, useValue: {} },
        { provide: PaymentLinkService, useValue: {} },
        { provide: TelegramChannelGateStatsService, useValue: {} },
        { provide: StudentLeadOriginService, useValue: {} },
        { provide: StatementService, useValue: {} },
      ],
    }).compile();

    service = module.get(TelegramService);
  });

  /** `request.user` as `JwtStrategy.validate` builds it from the token. */
  const token = (id: number, roles: string[]) => ({
    id,
    roles,
    companyId: 1001,
  });

  /** The link the bot will accept: right branch, right roles, valid HMAC, fresh. */
  function expectSignedLink(
    payload: string,
    branchId: number,
    roleIds: number[],
  ) {
    const match = payload.match(EMPLOYEE_DEEP_LINK_RE);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBe(branchId);
    expect(match![2]).toBe(roleIds.join('-'));
    expect(
      checkEmployeePayload(branchId, roleIds, match![3], match![4], new Date()),
    ).toBe('valid');
  }

  describe('a token that outlived the account', () => {
    it('refuses an archived CEO whose token still says CEO', async () => {
      await expect(
        service.generateEmployeeLinkPayload(
          NAMANGAN,
          [CEO],
          token(archivedCeo.id, ['CEO']),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses a token whose account does not exist at all', async () => {
      await expect(
        service.generateEmployeeLinkPayload(
          FERGANA,
          [TEACHER],
          token(999, ['CEO']),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    // A blocked account signs nothing, even while Redis is down and the
    // guard's cache lets its token through (ADR-0028).
    it.each([
      {
        who: 'a SUSPENDED Branch Director',
        caller: suspendedDirector,
        claims: ['Branch Director'],
        branchId: FERGANA,
        roleIds: [ADMINISTRATOR],
      },
      {
        who: 'a TERMINATED CEO',
        caller: terminatedCeo,
        claims: ['CEO'],
        branchId: NAMANGAN,
        roleIds: [CEO],
      },
      {
        who: 'an Administrator archived by status alone',
        caller: statusArchivedAdmin,
        claims: ['Administrator'],
        branchId: FERGANA,
        roleIds: [TEACHER],
      },
    ])('refuses $who', async ({ caller, claims, branchId, roleIds }) => {
      await expect(
        service.generateEmployeeLinkPayload(
          branchId,
          roleIds,
          token(caller.id, claims),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('still serves an INACTIVE Branch Director, who may sign in', async () => {
      const payload = await service.generateEmployeeLinkPayload(
        FERGANA,
        [TEACHER],
        token(inactiveDirector.id, ['Branch Director']),
      );
      expectSignedLink(payload, FERGANA, [TEACHER]);
    });
  });

  describe('a token that claims more than the account holds', () => {
    it.each([
      ['CEO', CEO],
      ['Branch Director', BRANCH_DIRECTOR],
      ['Administrator', ADMINISTRATOR],
    ])(
      'gives an Administrator whose token says CEO no %s link',
      async (_label, roleId) => {
        await expect(
          service.generateEmployeeLinkPayload(
            FERGANA,
            [roleId],
            token(admin.id, ['CEO']),
          ),
        ).rejects.toThrow(ForbiddenException);
      },
    );

    it('keeps an Administrator whose token says CEO inside their own branch', async () => {
      await expect(
        service.generateEmployeeLinkPayload(
          NAMANGAN,
          [TEACHER],
          token(admin.id, ['CEO']),
        ),
      ).rejects.toThrow("o'z filialingiz");
    });

    it('gives a Branch Director demoted to Administrator no Administrator link', async () => {
      await expect(
        service.generateEmployeeLinkPayload(
          FERGANA,
          [ADMINISTRATOR],
          token(admin.id, ['Branch Director']),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lets an account holding no granting role mint nothing, not an Administrator ceiling', async () => {
      await expect(
        service.generateEmployeeLinkPayload(
          FERGANA,
          [TEACHER],
          token(teacher.id, ['Branch Director']),
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('the ordinary paths still work', () => {
    it('lets a CEO mint a CEO link for a branch they are not attached to', async () => {
      const payload = await service.generateEmployeeLinkPayload(
        NAMANGAN,
        [CEO],
        token(ceo.id, ['CEO']),
      );
      expectSignedLink(payload, NAMANGAN, [CEO]);
    });

    it('lets a Branch Director mint staff links for their own branch', async () => {
      const payload = await service.generateEmployeeLinkPayload(
        FERGANA,
        [ADMINISTRATOR, TEACHER, CASHIER],
        token(director.id, ['Branch Director']),
      );
      expectSignedLink(payload, FERGANA, [ADMINISTRATOR, TEACHER, CASHIER]);
    });

    it('refuses a Branch Director a Branch Director link', async () => {
      await expect(
        service.generateEmployeeLinkPayload(
          FERGANA,
          [BRANCH_DIRECTOR],
          token(director.id, ['Branch Director']),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses a Branch Director a link for another branch', async () => {
      await expect(
        service.generateEmployeeLinkPayload(
          NAMANGAN,
          [TEACHER],
          token(director.id, ['Branch Director']),
        ),
      ).rejects.toThrow("o'z filialingiz");
    });

    it('lets an Administrator mint Teacher and Cashier links for their own branch', async () => {
      const payload = await service.generateEmployeeLinkPayload(
        FERGANA,
        [TEACHER, CASHIER],
        token(admin.id, ['Administrator']),
      );
      expectSignedLink(payload, FERGANA, [TEACHER, CASHIER]);
    });
  });
});
