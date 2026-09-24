import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { EntityHistoryService } from '../common/entity-history';
import { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * Archiving an employee from the employee page (`DELETE /users/:id`) must leave
 * the row exactly as archiving a teacher (`TeachersService.delete`) does.
 * Writing only `deletedAt` left the archived employee `status: ACTIVE,
 * isActive: true`, so anything reading `status` / `isActive` instead of
 * `deletedAt` still saw them as active (server/CLAUDE.md, "User Status &
 * isActive Synchronization").
 */
describe('UsersService.softDelete — the archived row', () => {
  let service: UsersService;
  let update: jest.Mock;

  const employee = {
    id: 7,
    firstName: 'Target',
    lastName: 'Admin',
    companyId: 1001,
    mainBranch: null,
    status: 'ACTIVE',
    isActive: true,
    statusChangedAt: new Date('2026-01-10T08:00:00.000Z'),
    statusChangedById: 1,
    statusChangeReason: null,
    deletedAt: null,
    deletedById: null,
  };

  beforeEach(async () => {
    update = jest.fn().mockResolvedValue(employee);
    const prisma = {
      user: {
        // The target lookup has no `select`; the branch guard's caller lookup
        // selects roles. A CEO caller spans every branch, so the guard passes
        // and these tests stay about what the archive writes.
        findFirst: jest.fn().mockImplementation(({ select }: any) =>
          Promise.resolve(
            select?.roles && !select?.status
              ? {
                  mainBranch: null,
                  branches: [],
                  roles: [{ role: { name: 'CEO' } }],
                }
              : employee,
          ),
        ),
        update,
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
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

  it('marks the employee ARCHIVED and inactive, not only deleted', async () => {
    await service.softDelete(7, 99, 1001);

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: expect.objectContaining({
        status: 'ARCHIVED',
        isActive: false,
        deletedAt: expect.any(Date),
        deletedById: 99,
      }),
    });
  });

  it('records the archive as the latest status change: when, by whom, why', async () => {
    const before = Date.now();
    await service.softDelete(7, 99, 1001);
    const after = Date.now();

    const { data } = update.mock.calls[0][0];
    expect(data).toEqual(
      expect.objectContaining({
        statusChangedById: 99,
        statusChangeReason: "O'chirildi",
      }),
    );
    // The status changed at the moment of archiving, not at the stale
    // timestamp the row carried before.
    expect(data.statusChangedAt).toBeInstanceOf(Date);
    expect(data.statusChangedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(data.statusChangedAt.getTime()).toBeLessThanOrEqual(after);
    expect(data.statusChangedAt).toEqual(data.deletedAt);
  });
});
