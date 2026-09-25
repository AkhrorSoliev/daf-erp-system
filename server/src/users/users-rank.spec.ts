import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { UploadService } from '../upload/upload.service';
import { EntityHistoryService } from '../common/entity-history';

/**
 * `PATCH /users/:id` and `DELETE /users/:id` answer to the rank rule
 * (ADR-0027): a non-CEO writes only to accounts that rank below them.
 *
 * The branch check these routes had before asked one question — do the two
 * share a branch? — so an Administrator could set the password, phone or
 * status of the Branch Director beside them, and of any CEO with a branch
 * attached. The rule itself is tested in `user-branch-scope.spec.ts`; this
 * file proves each door calls it, and with the right idea of what the write
 * does to the account's status.
 */
describe('UsersService — rank rule on account writes', () => {
  let service: UsersService;
  let prisma: any;

  const FARGONA = 1;
  const ROLE_NAMES: Record<number, string> = {
    1: 'CEO',
    2: 'Branch Director',
    3: 'Administrator',
    4: 'Teacher',
  };

  // Production has four CEO accounts with a branch attached; this is 11064's
  // shape (CEO + Branch Director + Administrator, Fargona).
  const CEO_WITH_BRANCH = 10001;
  const DIRECTOR = 10002;
  const PEER_DIRECTOR = 10003;
  const ADMIN = 10004;
  const PEER_ADMIN = 10005;

  // One row answers every read the service makes of a person: the target read
  // (`userSelect`: roles carry id and name, branches carry `branch.id`) and
  // the caller reads (`roles.role.name`, `branches.branchId`).
  const person = (id: number, roleIds: number[]) => ({
    id,
    firstName: 'Xodim',
    lastName: String(id),
    companyId: 1001,
    deletedAt: null,
    status: 'ACTIVE',
    isActive: true,
    password: '$2b$10$saqlangan.hash',
    login: `xodim${id}`,
    mainBranch: FARGONA,
    branches: [
      { branchId: FARGONA, branch: { id: FARGONA, name: "Farg'ona" } },
    ],
    roles: roleIds.map((roleId) => ({
      role: { id: roleId, name: ROLE_NAMES[roleId] },
    })),
    company: { id: 1001, name: 'Test' },
    groupTeachers: [],
  });

  const people = new Map(
    [
      person(CEO_WITH_BRANCH, [1, 2, 3]),
      person(DIRECTOR, [2]),
      person(PEER_DIRECTOR, [2]),
      person(ADMIN, [3]),
      person(PEER_ADMIN, [3]),
    ].map((p) => [p.id, p]),
  );
  const lookup = ({ where }: any) => Promise.resolve(people.get(where?.id));

  // Which rule refused matters: the branch check answers 403 too.
  const OUTRANKED = /sizdan yuqori yoki siz bilan bir darajada/;
  const OWN_STATUS = /O'z holatingizni o'zgartira olmaysiz/;
  const expectRefused = async (attempt: Promise<unknown>, rule: RegExp) => {
    await expect(attempt).rejects.toBeInstanceOf(ForbiddenException);
    await expect(attempt).rejects.toThrow(rule);
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findFirst: jest.fn().mockImplementation(lookup),
        findUnique: jest.fn().mockImplementation(lookup),
        update: jest
          .fn()
          .mockImplementation(({ where }: any) => lookup({ where })),
      },
      branch: {
        count: jest
          .fn()
          .mockImplementation(({ where }: any) =>
            Promise.resolve(where.id.in.length),
          ),
      },
      userRole: { deleteMany: jest.fn(), createMany: jest.fn() },
      userBranch: { deleteMany: jest.fn(), createMany: jest.fn() },
      $transaction: jest.fn((cb: any) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        // Written when a status change blocks or unblocks the account (ADR-0028).
        { provide: RedisService, useValue: { set: jest.fn(), del: jest.fn() } },
        { provide: UploadService, useValue: { deleteFile: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        {
          provide: EntityHistoryService,
          useValue: {
            recordCreate: jest.fn(),
            recordUpdate: jest.fn(),
            recordDelete: jest.fn(),
            recordStatusChange: jest.fn(),
            recordRestore: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  describe('editing another account', () => {
    it('refuses an Administrator setting the password of a CEO who has a branch', async () => {
      // With the role ceiling alone (ADR-0026) this went through: the role
      // set is unchanged, and the old "only a CEO grants CEO" check it
      // replaced was the one thing that had been refusing it.
      await expectRefused(
        service.updateUser(
          CEO_WITH_BRANCH,
          { password: 'tanlangan-parol' } as any,
          ADMIN,
          1001,
        ),
        OUTRANKED,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("refuses an Administrator changing their Branch Director's phone", async () => {
      // Telegram sign-in finds the account by phone and asks no password,
      // so the phone number is a credential.
      await expectRefused(
        service.updateUser(
          DIRECTOR,
          { phone: '901112233' } as any,
          ADMIN,
          1001,
        ),
        OUTRANKED,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('refuses a Branch Director setting the password of a peer Branch Director', async () => {
      await expectRefused(
        service.updateUser(
          PEER_DIRECTOR,
          { password: 'tanlangan-parol' } as any,
          DIRECTOR,
          1001,
        ),
        OUTRANKED,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('refuses a Branch Director locking a peer Branch Director out', async () => {
      await expectRefused(
        service.updateUser(
          PEER_DIRECTOR,
          { status: 'TERMINATED' } as any,
          DIRECTOR,
          1001,
        ),
        OUTRANKED,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('refuses an Administrator renaming a peer Administrator', async () => {
      // The whole account, not a list of sensitive fields.
      await expectRefused(
        service.updateUser(
          PEER_ADMIN,
          { firstName: 'Boshqa' } as any,
          ADMIN,
          1001,
        ),
        OUTRANKED,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("lets a Branch Director reset their Administrator's password and status", async () => {
      await service.updateUser(
        ADMIN,
        { password: 'yangi-parol', status: 'TERMINATED' } as any,
        DIRECTOR,
        1001,
      );

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: ADMIN },
          data: expect.objectContaining({
            status: 'TERMINATED',
            password: expect.any(String),
          }),
        }),
      );
    });
  });

  describe('editing your own account', () => {
    it('refuses a Branch Director changing their own status', async () => {
      await expectRefused(
        service.updateUser(
          DIRECTOR,
          { status: 'INACTIVE' } as any,
          DIRECTOR,
          1001,
        ),
        OWN_STATUS,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('lets a Branch Director save their own record with the status resent unchanged', async () => {
      // The employee form sends `status` on every save, beside `roleIds`.
      await service.updateUser(
        DIRECTOR,
        {
          firstName: 'Yangi',
          position: 'Filial direktori',
          status: 'ACTIVE',
          roleIds: [2],
          branchIds: [FARGONA],
        } as any,
        DIRECTOR,
        1001,
      );

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: DIRECTOR },
          data: expect.objectContaining({ firstName: 'Yangi' }),
        }),
      );
    });
  });

  describe('archiving', () => {
    it('refuses a Branch Director archiving a peer Branch Director', async () => {
      await expectRefused(
        service.softDelete(PEER_DIRECTOR, DIRECTOR, 1001),
        OUTRANKED,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('refuses a Branch Director archiving themselves', async () => {
      // Archiving is the last status change there is.
      await expectRefused(
        service.softDelete(DIRECTOR, DIRECTOR, 1001),
        OWN_STATUS,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('lets a Branch Director archive their Administrator', async () => {
      await service.softDelete(ADMIN, DIRECTOR, 1001);

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: ADMIN } }),
      );
    });
  });
});
