import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { StatusHistoryService } from '../common/status';
import { EntityHistoryService } from '../common/entity-history';

describe('RoomsService — status methods', () => {
  let service: RoomsService;
  let prisma: any;
  let statusHistoryService: any;

  const mockRoom = {
    id: 'room-1',
    name: 'Room 101',
    status: 'ACTIVE',
    companyId: 1001,
    branchId: 1,
    deletedAt: null,
  };

  beforeEach(async () => {
    prisma = {
      room: {
        findFirst: jest.fn().mockResolvedValue(mockRoom),
        update: jest
          .fn()
          .mockResolvedValue({ ...mockRoom, branch: { name: 'Branch' } }),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
      },
      branch: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    statusHistoryService = {
      changeStatus: jest.fn().mockResolvedValue({
        statusChangedAt: new Date(),
        statusChangedById: 1,
        statusChangeReason: null,
      }),
      getHistory: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoomsService,
        { provide: PrismaService, useValue: prisma },
        { provide: StatusHistoryService, useValue: statusHistoryService },
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
        {
          provide: RedisService,
          useValue: {
            scanStream: jest.fn().mockReturnValue(
              (async function* () {
                /* no keys */
              })(),
            ),
            del: jest.fn().mockResolvedValue(0),
          },
        },
      ],
    }).compile();

    service = module.get(RoomsService);
  });

  describe('changeStatus', () => {
    it('updates room status (no cascade)', async () => {
      await service.changeStatus(
        'room-1',
        { status: 'UNDER_MAINTENANCE' as any },
        1,
        1001,
      );

      expect(prisma.room.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'UNDER_MAINTENANCE' }),
        }),
      );
    });

    it('throws NotFoundException for missing room', async () => {
      prisma.room.findFirst.mockResolvedValue(null);
      await expect(
        service.changeStatus('missing', { status: 'INACTIVE' as any }, 1, 1001),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('archives room with ARCHIVED status and deletedAt', async () => {
      await service.delete('room-1', 1, 1001);

      expect(prisma.room.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'ARCHIVED',
            deletedAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  describe('multi-tenant filter (companyId)', () => {
    it('changeStatus scopes lookup to companyId', async () => {
      await service.changeStatus(
        'room-1',
        { status: 'INACTIVE' as any },
        1,
        1001,
      );
      expect(prisma.room.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'room-1',
            deletedAt: null,
            companyId: 1001,
          }),
        }),
      );
    });
  });

  /**
   * `POST /rooms` names its branch in the body. "The branch exists in this
   * company" is not the same question as "the caller may act in it": an
   * Administrator of one branch could send another branch's id and the room
   * appeared in that branch's list and occupancy report.
   */
  describe('create — the caller must hold the branch', () => {
    const COMPANY = 1001;
    const FARGONA = 1;
    const NAMANGAN = 2;
    const CEO_ID = 10001;
    const FARGONA_ADMIN_ID = 10011;
    const NAMANGAN_ADMIN_ID = 10022;

    // The shape `resolveCallerBranchScope` selects. Keyed by id, so a service
    // that looked up anyone other than the caller finds nobody.
    const CALLERS: Record<number, unknown> = {
      [CEO_ID]: {
        mainBranch: null,
        branches: [],
        roles: [{ role: { name: 'CEO' } }],
      },
      [FARGONA_ADMIN_ID]: {
        mainBranch: FARGONA,
        branches: [{ branchId: FARGONA }],
        roles: [{ role: { name: 'Administrator' } }],
      },
      [NAMANGAN_ADMIN_ID]: {
        mainBranch: NAMANGAN,
        branches: [{ branchId: NAMANGAN }],
        roles: [{ role: { name: 'Administrator' } }],
      },
    };

    const dto = { name: '101-xona', capacity: 12, branchId: FARGONA };

    beforeEach(() => {
      prisma.user = {
        findFirst: jest.fn(({ where }: { where: { id: number } }) =>
          Promise.resolve(CALLERS[where.id] ?? null),
        ),
      };
      prisma.branch.findFirst.mockImplementation(
        ({ where }: { where: { id: number } }) =>
          Promise.resolve({
            id: where.id,
            companyId: COMPANY,
            deletedAt: null,
          }),
      );
      prisma.room.create.mockImplementation(({ data }: { data: object }) =>
        Promise.resolve({ id: 'room-new', ...data, createdAt: new Date() }),
      );
      prisma.roomCapacitySnapshot = { create: jest.fn().mockResolvedValue({}) };
    });

    it('refuses a caller who does not hold the branch, and writes nothing', async () => {
      const err = await service
        .create(dto, COMPANY, NAMANGAN_ADMIN_ID)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as Error).message).toMatch(/xona yaratish huquqingiz yo'q/);
      expect(prisma.room.create).not.toHaveBeenCalled();
    });

    it('lets a caller who holds the branch create the room in it', async () => {
      await service.create(dto, COMPANY, FARGONA_ADMIN_ID);

      expect(prisma.room.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            branchId: FARGONA,
            companyId: COMPANY,
          }),
        }),
      );
    });

    it('lets a CEO, who holds no branch, create a room in any branch', async () => {
      await service.create({ ...dto, branchId: NAMANGAN }, COMPANY, CEO_ID);

      expect(prisma.room.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ branchId: NAMANGAN }),
        }),
      );
    });

    it('refuses a caller who cannot be identified (fail closed)', async () => {
      await expect(
        service.create(dto, COMPANY, undefined),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.room.create).not.toHaveBeenCalled();
    });
  });
});
