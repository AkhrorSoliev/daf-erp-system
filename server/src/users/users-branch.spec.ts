import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { EntityHistoryService } from '../common/entity-history';
import { RedisService } from '../redis/redis.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * `PATCH /users/:id` has been branch-confined since the object-level sweep.
 * The two routes either side of it were not.
 *
 * `POST /users` already validated branches — `assertRoleAndBranchRules` counts
 * them and rejects ones outside the company. That is exactly the trap
 * `assertSingleValidBranch` set on students: it asks whether the branch is
 * REAL, never whether the caller holds it. And creating a user IS granting
 * access, so a Fargona director could create a BRANCH DIRECTOR OF NAMANGAN,
 * with a password of their choosing, in a branch they cannot even view.
 *
 * `DELETE /users/:id` checked only the company. An archived employee loses
 * their account; doing that to another branch's staff is the same severity as
 * editing them, through the door beside the locked one.
 */
describe('UsersService — branch confinement', () => {
  let service: UsersService;
  let prisma: any;

  const FARGONA = 1;
  const NAMANGAN = 2;
  const FARGONA_DIRECTOR = 7;
  const NAMANGAN_STAFF = 10500;

  const fargonaDirector = {
    id: FARGONA_DIRECTOR,
    mainBranch: FARGONA,
    branches: [{ branchId: FARGONA }],
    roles: [{ role: { name: 'Branch Director' } }],
  };
  const namanganStaff = {
    id: NAMANGAN_STAFF,
    companyId: 1001,
    deletedAt: null,
    mainBranch: NAMANGAN,
    branches: [{ branchId: NAMANGAN }],
    roles: [{ role: { name: 'Administrator' } }],
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findFirst: jest.fn().mockImplementation(({ where }: any) =>
          Promise.resolve(
            where?.id === FARGONA_DIRECTOR ? fargonaDirector : namanganStaff,
          ),
        ),
        findUnique: jest.fn().mockResolvedValue(fargonaDirector),
        create: jest.fn().mockResolvedValue({ id: 999, roles: [], branches: [] }),
        update: jest.fn().mockResolvedValue(namanganStaff),
      },
      // Every named branch is real and in the company — the point is that
      // being real was never the question. Counting them back matches the
      // company check so the case under test is the AUTHORISATION one.
      branch: {
        count: jest
          .fn()
          .mockImplementation(({ where }: any) =>
            Promise.resolve(where.id.in.length),
          ),
      },
      role: {
        findMany: jest.fn().mockResolvedValue([{ id: 2 }, { id: 3 }]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: UploadService, useValue: { deleteFile: jest.fn() } },
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
        { provide: RedisService, useValue: { set: jest.fn(), del: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('refuses creating staff in a branch the caller does not hold', async () => {
    await expect(
      service.create(
        {
          firstName: 'X',
          lastName: 'Y',
          companyId: 1001,
          password: 'p',
          roleIds: [2], // Branch Director
          branchIds: [NAMANGAN],
          mainBranch: NAMANGAN,
        },
        FARGONA_DIRECTOR,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('refuses when only ONE of several branches is out of reach', async () => {
    // The loop covers every entry, not just the first — a caller cannot smuggle
    // a second branch in behind one they legitimately hold.
    await expect(
      service.create(
        {
          firstName: 'X',
          lastName: 'Y',
          companyId: 1001,
          password: 'p',
          roleIds: [3],
          branchIds: [FARGONA, NAMANGAN],
          mainBranch: FARGONA,
        },
        FARGONA_DIRECTOR,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('allows creating staff in the caller own branch', async () => {
    await service.create(
      {
        firstName: 'X',
        lastName: 'Y',
        companyId: 1001,
        password: 'p',
        roleIds: [3],
        branchIds: [FARGONA],
        mainBranch: FARGONA,
      },
      FARGONA_DIRECTOR,
    );
    expect(prisma.user.create).toHaveBeenCalled();
  });

  it('validates the request SHAPE before asking about authorisation', async () => {
    // A mainBranch outside branchIds is malformed whoever sends it. Answering
    // that first keeps the precise error, instead of telling an admin they
    // lack a permission when what they actually have is a typo.
    await expect(
      service.create(
        {
          firstName: 'X',
          lastName: 'Y',
          companyId: 1001,
          password: 'p',
          roleIds: [3],
          branchIds: [NAMANGAN],
          mainBranch: FARGONA,
        },
        FARGONA_DIRECTOR,
      ),
    ).rejects.toThrow(/Asosiy filial.*orasida/);
  });

  it('refuses archiving another branch employee', async () => {
    await expect(
      service.softDelete(NAMANGAN_STAFF, FARGONA_DIRECTOR, 1001),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('lets a CEO create and archive across branches', async () => {
    prisma.user.findFirst.mockImplementation(({ where }: any) =>
      Promise.resolve(
        where?.id === 1
          ? {
              id: 1,
              mainBranch: null,
              branches: [],
              roles: [{ role: { name: 'CEO' } }],
            }
          : namanganStaff,
      ),
    );
    prisma.user.findUnique.mockResolvedValue({
      roles: [{ role: { name: 'CEO' } }],
    });
    await service.create(
      {
        firstName: 'X',
        lastName: 'Y',
        companyId: 1001,
        password: 'p',
        roleIds: [3],
        branchIds: [NAMANGAN],
        mainBranch: NAMANGAN,
      },
      1,
    );
    expect(prisma.user.create).toHaveBeenCalled();
    await service.softDelete(NAMANGAN_STAFF, 1, 1001);
    expect(prisma.user.update).toHaveBeenCalled();
  });
});
