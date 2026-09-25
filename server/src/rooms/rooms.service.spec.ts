import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RoomStatus } from '@prisma/client';
import { RoomsService } from './rooms.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { StatusHistoryService } from '../common/status';
import { EntityHistoryService } from '../common/entity-history';

describe('RoomsService — status methods', () => {
  let service: RoomsService;
  let prisma: any;
  let statusHistoryService: any;
  let entityHistoryService: any;

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
      roomCapacitySnapshot: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
      // Every id-addressed method checks the caller against the room's branch.
      // The tests above the branch block are about other things, so their
      // caller is a CEO; the branch rule has its own block at the end.
      user: {
        findFirst: jest.fn().mockResolvedValue({
          mainBranch: null,
          branches: [],
          roles: [{ role: { name: 'CEO' } }],
        }),
      },
    };

    entityHistoryService = {
      recordCreate: jest.fn(),
      recordUpdate: jest.fn(),
      recordDelete: jest.fn(),
      recordStatusChange: jest.fn(),
      recordRestore: jest.fn(),
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
        { provide: EntityHistoryService, useValue: entityHistoryService },
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
   * `@Roles()` proves the caller is staff, not that the room is theirs. These
   * methods looked the room up by `companyId` alone, so an Administrator of one
   * branch could pass another branch's room id and rename it, change its
   * capacity (which opens a new capacity snapshot in that branch's occupancy
   * report), take it out of service or archive it, and read its status trail.
   */
  describe("id-addressed methods — the caller must hold the room's branch", () => {
    const COMPANY = 1001;
    const FARGONA = 1;
    const NAMANGAN = 2;
    const ROOM_ID = 'room-1';
    const CEO_ID = 10001;
    const FARGONA_ADMIN_ID = 10011;
    const NAMANGAN_ADMIN_ID = 10022;
    const DELETED_USER_ID = 10099;

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

    type Call = (caller: number | undefined) => Promise<unknown>;

    // Each method called the way its controller calls it, paired with the
    // effect the method exists to have.
    const METHODS: [string, Call, () => jest.Mock][] = [
      [
        'update',
        (caller) =>
          service.update(
            ROOM_ID,
            { name: '102-xona', capacity: 20 },
            caller,
            COMPANY,
          ),
        () => prisma.room.update,
      ],
      [
        'changeStatus',
        (caller) =>
          service.changeStatus(
            ROOM_ID,
            { status: RoomStatus.UNDER_MAINTENANCE },
            caller as number,
            COMPANY,
          ),
        () => prisma.room.update,
      ],
      [
        'delete',
        (caller) => service.delete(ROOM_ID, caller as number, COMPANY),
        () => prisma.room.update,
      ],
      [
        'getStatusHistory',
        (caller) =>
          service.getStatusHistory(ROOM_ID, COMPANY, caller as number),
        () => statusHistoryService.getHistory,
      ],
    ];

    /** Every write these methods can make, plus the one read that returns data. */
    const sideEffects = () => ({
      roomUpdates: prisma.room.update.mock.calls.length,
      capacitySnapshots: prisma.roomCapacitySnapshot.create.mock.calls.length,
      statusRows: statusHistoryService.changeStatus.mock.calls.length,
      auditRows:
        entityHistoryService.recordUpdate.mock.calls.length +
        entityHistoryService.recordStatusChange.mock.calls.length +
        entityHistoryService.recordDelete.mock.calls.length,
      historyReads: statusHistoryService.getHistory.mock.calls.length,
    });
    const NOTHING = {
      roomUpdates: 0,
      capacitySnapshots: 0,
      statusRows: 0,
      auditRows: 0,
      historyReads: 0,
    };

    beforeEach(() => {
      prisma.room.findFirst.mockResolvedValue({
        ...mockRoom,
        branchId: FARGONA,
        capacity: 12,
      });
      prisma.user.findFirst.mockImplementation(
        ({ where }: { where: { id: number } }) =>
          Promise.resolve(CALLERS[where.id] ?? null),
      );
    });

    it.each(METHODS)(
      '%s refuses an Administrator of another branch and changes nothing',
      async (_name, call) => {
        const err = await call(NAMANGAN_ADMIN_ID).catch((e: unknown) => e);

        expect(err).toBeInstanceOf(ForbiddenException);
        expect((err as Error).message).toMatch(/xona boshqa filialga tegishli/);
        expect(sideEffects()).toEqual(NOTHING);
      },
    );

    it.each(METHODS)(
      '%s refuses a caller who cannot be identified (fail closed)',
      async (_name, call) => {
        await expect(call(undefined)).rejects.toBeInstanceOf(
          ForbiddenException,
        );
        await expect(call(DELETED_USER_ID)).rejects.toBeInstanceOf(
          ForbiddenException,
        );
        expect(sideEffects()).toEqual(NOTHING);
      },
    );

    it.each(METHODS)(
      "%s lets an Administrator of the room's own branch through",
      async (_name, call, effect) => {
        await call(FARGONA_ADMIN_ID);
        expect(effect()).toHaveBeenCalledTimes(1);
      },
    );

    it.each(METHODS)(
      '%s lets a CEO, who holds no branch, act on any room',
      async (_name, call, effect) => {
        await call(CEO_ID);
        expect(effect()).toHaveBeenCalledTimes(1);
      },
    );

    it.each(METHODS)(
      '%s still answers 404, not 403, for a room that does not exist',
      async (_name, call) => {
        prisma.room.findFirst.mockResolvedValue(null);
        await expect(call(NAMANGAN_ADMIN_ID)).rejects.toBeInstanceOf(
          NotFoundException,
        );
      },
    );
  });
});
