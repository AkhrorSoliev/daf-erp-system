import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TeachersService } from './teachers.service';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { StatusHistoryService, StatusCascadeService } from '../common/status';
import { EntityHistoryService } from '../common/entity-history';
import { RedisService } from '../redis/redis.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * A teacher IS a `User`, and there are two doors to that row.
 *
 * `PATCH /users/:id` has been branch-confined since the object-level sweep —
 * a Branch Director could otherwise pass another branch's employee id and edit
 * them, `password` included. `/teachers/:id` edits the SAME rows, accepts the
 * SAME `password` and `login`, and was never touched: `companyId` and nothing
 * else. Production has 15 teachers, 10 in Fargona and 5 in Namangan, so the
 * unlocked door led somewhere real.
 *
 * The rule is not re-derived here. `assertCallerMayTouchTeacher` calls the same
 * `assertCallerMayTouchUser` that `UsersService` calls — which is the point of
 * having moved it out of `UsersService` in the first place.
 */
describe('TeachersService — branch confinement', () => {
  let service: TeachersService;
  let prisma: any;

  const FARGONA = 1;
  const NAMANGAN = 2;
  const FARGONA_DIRECTOR = 7;
  const NAMANGAN_TEACHER = 10500;

  const teacherRow = {
    id: NAMANGAN_TEACHER,
    firstName: 'N',
    lastName: 'T',
    status: 'ACTIVE',
    isActive: true,
    companyId: 1001,
    photo: null,
    roles: [{ roleId: 4 }],
    mainBranch: NAMANGAN,
    branches: [{ branchId: NAMANGAN }],
  };

  const callerRow = {
    id: FARGONA_DIRECTOR,
    mainBranch: FARGONA,
    branches: [{ branchId: FARGONA }],
    roles: [{ role: { name: 'Branch Director' } }],
  };

  beforeEach(async () => {
    prisma = {
      user: {
        // Answers by id: the caller and the target are both read through this.
        findFirst: jest
          .fn()
          .mockImplementation(({ where }: any) =>
            Promise.resolve(
              where?.id === FARGONA_DIRECTOR ? callerRow : teacherRow,
            ),
          ),
        update: jest.fn().mockResolvedValue(teacherRow),
        create: jest.fn().mockResolvedValue(teacherRow),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      branch: { findFirst: jest.fn().mockResolvedValue({ id: NAMANGAN }) },
      group: { findMany: jest.fn().mockResolvedValue([]) },
      groupTeacher: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
      },
      statusHistory: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((fn: any) =>
        typeof fn === 'function' ? fn(prisma) : Promise.resolve([]),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeachersService,
        { provide: PrismaService, useValue: prisma },
        { provide: UploadService, useValue: { deleteFile: jest.fn() } },
        {
          provide: StatusHistoryService,
          useValue: { changeStatus: jest.fn(), getHistory: jest.fn() },
        },
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

    service = module.get<TeachersService>(TeachersService);
  });

  it('refuses a PASSWORD change on another branch teacher', async () => {
    // The whole point. `UpdateTeacherDto` carries `password` and `login`, so
    // this was account takeover across branches through a door nobody locked.
    await expect(
      service.update(
        NAMANGAN_TEACHER,
        { password: 'yangi-parol' } as never,
        1001,
        FARGONA_DIRECTOR,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('refuses deactivating another branch teacher', async () => {
    // Deactivating closes their salary config and stops their accruals —
    // someone else's payroll, from someone else's branch.
    await expect(
      service.changeStatus(
        NAMANGAN_TEACHER,
        { status: 'TERMINATED' } as never,
        FARGONA_DIRECTOR,
        1001,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses archiving another branch teacher', async () => {
    await expect(
      service.delete(NAMANGAN_TEACHER, FARGONA_DIRECTOR, 1001),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses reading another branch teacher groups and status trail', async () => {
    await expect(
      service.findGroupsByTeacherId(NAMANGAN_TEACHER, 1001, FARGONA_DIRECTOR),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.getStatusHistory(NAMANGAN_TEACHER, 1001, FARGONA_DIRECTOR),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('404s a missing teacher BEFORE the branch question', async () => {
    // Order matters: the guard sits after each method's own existence check,
    // so a stale id still reads "topilmadi" rather than a confinement error
    // about a teacher who does not exist.
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(
      service.update(999999, {} as never, 1001, FARGONA_DIRECTOR),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lets the teacher own director through', async () => {
    prisma.user.findFirst.mockImplementation(({ where }: any) =>
      Promise.resolve(
        where?.id === 8
          ? {
              id: 8,
              mainBranch: NAMANGAN,
              branches: [{ branchId: NAMANGAN }],
              roles: [{ role: { name: 'Branch Director' } }],
            }
          : teacherRow,
      ),
    );
    await service.getStatusHistory(NAMANGAN_TEACHER, 1001, 8);
    // Reaching the read at all is the assertion; a refusal would have thrown.
  });

  it('refuses creating a teacher into a branch the caller does not hold', async () => {
    // `dto.branchId` decides whose payroll carries the new teacher.
    await expect(
      service.create(
        {
          firstName: 'X',
          lastName: 'Y',
          phone: '901234567',
          branchId: NAMANGAN,
        } as never,
        1001,
        FARGONA_DIRECTOR,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});
