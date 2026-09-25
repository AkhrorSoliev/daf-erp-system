import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TeachersService } from './teachers.service';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { StatusHistoryService, StatusCascadeService } from '../common/status';
import { EntityHistoryService } from '../common/entity-history';
import { RedisService } from '../redis/redis.service';

/**
 * `/teachers/:id` is a second door to the same `User` row as `/users/:id`, and
 * it matches ANY account holding the Teacher role, whatever else it holds. A
 * Branch Director who also teaches is therefore reachable through it, and
 * `PATCH /teachers/:id` accepts `password` and `login`.
 *
 * The writes answer to the same rank rule as `/users/:id` (ADR-0027); the
 * reads (status trail, groups, salary summary) keep the branch-only check,
 * because reading a colleague's record takes nothing from them.
 */
describe('TeachersService — rank rule on account writes', () => {
  let service: TeachersService;
  let prisma: any;
  let statusHistoryService: any;

  const FARGONA = 1;
  const ROLE_NAMES: Record<number, string> = {
    2: 'Branch Director',
    4: 'Teacher',
  };

  const DIRECTOR = 10002;
  const DIRECTOR_WHO_TEACHES = 10003;
  const TEACHER = 10004;

  const person = (id: number, roleIds: number[]) => ({
    id,
    firstName: 'Xodim',
    lastName: String(id),
    phone: '901234567',
    photo: null,
    login: `ustoz${id}`,
    status: 'ACTIVE',
    isActive: true,
    companyId: 1001,
    deletedAt: null,
    mainBranch: FARGONA,
    branches: [
      { branchId: FARGONA, branch: { id: FARGONA, name: "Farg'ona" } },
    ],
    roles: roleIds.map((roleId) => ({
      roleId,
      role: { id: roleId, name: ROLE_NAMES[roleId] },
    })),
    company: { id: 1001, name: 'Test' },
    groupTeachers: [],
  });

  const people = new Map(
    [
      person(DIRECTOR, [2]),
      person(DIRECTOR_WHO_TEACHES, [2, 4]),
      person(TEACHER, [4]),
    ].map((p) => [p.id, p]),
  );
  const lookup = ({ where }: any) => Promise.resolve(people.get(where?.id));

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
        update: jest
          .fn()
          .mockImplementation(({ where }: any) => lookup({ where })),
      },
      group: { findMany: jest.fn().mockResolvedValue([]) },
      groupTeacher: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
      },
    };
    statusHistoryService = {
      changeStatus: jest.fn().mockResolvedValue({}),
      getHistory: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeachersService,
        { provide: PrismaService, useValue: prisma },
        { provide: UploadService, useValue: { deleteFile: jest.fn() } },
        { provide: StatusHistoryService, useValue: statusHistoryService },
        { provide: StatusCascadeService, useValue: { cascade: jest.fn() } },
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
        { provide: RedisService, useValue: { set: jest.fn(), del: jest.fn() } },
      ],
    }).compile();

    service = module.get(TeachersService);
  });

  it('refuses a Branch Director setting the password of a peer who also teaches', async () => {
    await expectRefused(
      service.update(
        DIRECTOR_WHO_TEACHES,
        { password: 'tanlangan-parol' } as never,
        1001,
        DIRECTOR,
      ),
      OUTRANKED,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('refuses a Branch Director terminating a peer who also teaches', async () => {
    await expectRefused(
      service.changeStatus(
        DIRECTOR_WHO_TEACHES,
        { status: 'TERMINATED' } as never,
        DIRECTOR,
        1001,
      ),
      OUTRANKED,
    );
    expect(statusHistoryService.changeStatus).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('refuses a Branch Director archiving a peer who also teaches', async () => {
    await expectRefused(
      service.delete(DIRECTOR_WHO_TEACHES, DIRECTOR, 1001),
      OUTRANKED,
    );
    expect(prisma.groupTeacher.deleteMany).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it.each([
    {
      how: 'changing their status',
      act: (s: TeachersService) =>
        s.changeStatus(
          DIRECTOR_WHO_TEACHES,
          { status: 'INACTIVE' } as never,
          DIRECTOR_WHO_TEACHES,
          1001,
        ),
    },
    {
      how: 'archiving themselves',
      act: (s: TeachersService) =>
        s.delete(DIRECTOR_WHO_TEACHES, DIRECTOR_WHO_TEACHES, 1001),
    },
  ])('refuses a director who teaches $how', async ({ act }) => {
    await expectRefused(act(service), OWN_STATUS);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("lets a Branch Director reset their teacher's password", async () => {
    await service.update(
      TEACHER,
      { password: 'yangi-parol' } as never,
      1001,
      DIRECTOR,
    );

    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: TEACHER },
        data: expect.objectContaining({ password: expect.any(String) }),
      }),
    );
  });

  it("still lets a Branch Director read a peer's status trail and groups", async () => {
    await expect(
      service.getStatusHistory(DIRECTOR_WHO_TEACHES, 1001, DIRECTOR),
    ).resolves.toEqual([]);
    await expect(
      service.findGroupsByTeacherId(DIRECTOR_WHO_TEACHES, 1001, DIRECTOR),
    ).resolves.toBeDefined();
  });
});
