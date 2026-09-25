import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { EntityHistoryService } from '../common/entity-history';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { UploadService } from '../upload/upload.service';
import { UsersService } from './users.service';

/**
 * The role ceiling reads the caller from the database (ADR-0026). A blocked
 * caller — SUSPENDED, TERMINATED, or ARCHIVED by status — must read as nobody
 * there, not only an archived one: their access token can outlive the block
 * by up to an hour, and the guard's cache that would stop it lets requests
 * through whenever Redis is down (ADR-0028).
 */
describe('UsersService — a blocked caller grants no role', () => {
  const FARGONA = 1;
  const ROLE_NAMES: Record<number, string> = {
    1: 'CEO',
    2: 'Branch Director',
    3: 'Administrator',
    4: 'Teacher',
    5: 'Cashier',
  };

  const SUSPENDED_DIRECTOR = 20001;
  const TERMINATED_CEO = 20002;
  const STATUS_ARCHIVED_DIRECTOR = 20003;
  const INACTIVE_DIRECTOR = 20004;
  const TEACHER = 20005;

  const person = (id: number, roleIds: number[], status: string) => {
    const isCeo = roleIds.includes(1);
    return {
      id,
      firstName: 'Xodim',
      lastName: String(id),
      companyId: 1001,
      deletedAt: null,
      status,
      isActive: status === 'ACTIVE',
      password: '$2b$10$saqlangan.hash',
      mainBranch: isCeo ? null : FARGONA,
      branches: isCeo
        ? []
        : [{ branchId: FARGONA, branch: { id: FARGONA, name: "Farg'ona" } }],
      roles: roleIds.map((roleId) => ({
        role: { id: roleId, name: ROLE_NAMES[roleId] },
      })),
      company: { id: 1001, name: 'Test' },
      groupTeachers: [],
    };
  };

  const people = new Map(
    [
      person(SUSPENDED_DIRECTOR, [2], 'SUSPENDED'),
      person(TERMINATED_CEO, [1], 'TERMINATED'),
      person(STATUS_ARCHIVED_DIRECTOR, [2], 'ARCHIVED'),
      person(INACTIVE_DIRECTOR, [2], 'INACTIVE'),
      person(TEACHER, [4], 'ACTIVE'),
    ].map((p) => [p.id, p]),
  );

  // Honours the soft-delete and status filters the way the database does,
  // and only when the query asks for them: a lookup that leaves the status
  // filter out finds the suspended caller.
  const lookup = ({ where }: any) => {
    const found = people.get(where?.id);
    if (!found) return Promise.resolve(null);
    if (where.deletedAt === null && found.deletedAt !== null) {
      return Promise.resolve(null);
    }
    if (where.status?.notIn?.includes(found.status)) {
      return Promise.resolve(null);
    }
    return Promise.resolve(found);
  };

  let service: UsersService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      user: {
        findFirst: jest.fn().mockImplementation(lookup),
        findUnique: jest.fn().mockImplementation(lookup),
        create: jest.fn().mockResolvedValue(person(20999, [], 'ACTIVE')),
        update: jest
          .fn()
          .mockImplementation(({ where }: any) => lookup({ where })),
      },
      role: {
        findMany: jest
          .fn()
          .mockImplementation(({ where }: any) =>
            Promise.resolve(where.id.in.map((id: number) => ({ id }))),
          ),
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

    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: UploadService, useValue: { deleteFile: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: RedisService, useValue: { set: jest.fn(), del: jest.fn() } },
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

  // Everything but the caller is valid and inside the caller's own branch,
  // so the ceiling is the only rule left that can refuse.
  const newEmployee = (roleIds: number[], inBranch = true) => ({
    firstName: 'Yangi',
    lastName: 'Xodim',
    companyId: 1001,
    position: 'Xodim',
    password: 'parol123',
    roleIds,
    ...(inBranch ? { branchIds: [FARGONA], mainBranch: FARGONA } : {}),
  });
  const CANNOT_GRANT = /rolni tayinlay olmaysiz/;

  it.each([
    {
      who: 'a SUSPENDED Branch Director',
      caller: SUSPENDED_DIRECTOR,
      roleIds: [3],
      inBranch: true,
    },
    {
      who: 'a Branch Director archived by status alone',
      caller: STATUS_ARCHIVED_DIRECTOR,
      roleIds: [3],
      inBranch: true,
    },
    // A CEO needs no branch, so the branch check never runs and the ceiling's
    // own lookup is all that stands between this token and a new CEO.
    {
      who: 'a TERMINATED CEO',
      caller: TERMINATED_CEO,
      roleIds: [1],
      inBranch: false,
    },
  ])(
    'refuses $who creating an employee',
    async ({ caller, roleIds, inBranch }) => {
      const attempt = service.create(newEmployee(roleIds, inBranch), {
        kind: 'user',
        id: caller,
      });

      await expect(attempt).rejects.toBeInstanceOf(ForbiddenException);
      await expect(attempt).rejects.toThrow(CANNOT_GRANT);
      expect(prisma.user.create).not.toHaveBeenCalled();
    },
  );

  it('refuses a SUSPENDED Branch Director reshaping a Teacher of their branch', async () => {
    const attempt = service.updateUser(
      TEACHER,
      { roleIds: [4, 5] },
      SUSPENDED_DIRECTOR,
      1001,
    );

    await expect(attempt).rejects.toThrow(CANNOT_GRANT);
    expect(prisma.userRole.createMany).not.toHaveBeenCalled();
  });

  it('still lets an INACTIVE Branch Director, who may sign in, grant Administrator', async () => {
    await service.create(newEmployee([3]), {
      kind: 'user',
      id: INACTIVE_DIRECTOR,
    });

    expect(prisma.user.create).toHaveBeenCalledTimes(1);
  });
});
