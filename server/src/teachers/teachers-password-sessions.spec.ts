import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TeachersService } from './teachers.service';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { StatusHistoryService } from '../common/status';
import { EntityHistoryService } from '../common/entity-history';
import { RedisService } from '../redis/redis.service';

/** The teacher page's password field ends the teacher's other sessions (ADR-0029). */
describe('TeachersService.update — a new password ends the sessions', () => {
  const CEO_CALLER = {
    mainBranch: null,
    branches: [],
    roles: [{ role: { name: 'CEO' } }],
  };
  const teacherRow = {
    id: 30,
    companyId: 1001,
    photo: null,
    login: '901112233',
    mainBranch: 500,
    roles: [{ role: { id: 4, name: 'Teacher' } }],
    branches: [{ branch: { id: 500, name: 'Main' } }],
    groupTeachers: [],
  };

  let service: TeachersService;
  let prisma: any;
  let redis: { set: jest.Mock; del: jest.Mock };
  let history: { recordUpdate: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: {
        findFirst: jest.fn().mockImplementation(({ select }: any) => {
          if (select?.roles) return Promise.resolve(CEO_CALLER); // the caller
          if (select?.id) {
            // the target, as `assertCallerMayTouchUser` loads it
            return Promise.resolve({
              id: 30,
              mainBranch: 500,
              branches: [{ branchId: 500 }],
            });
          }
          return Promise.resolve(teacherRow); // `update`'s own lookup
        }),
        update: jest
          .fn()
          .mockImplementation(({ data }: any) =>
            Promise.resolve({ ...teacherRow, ...data, sessionVersion: 2 }),
          ),
      },
    };
    redis = { set: jest.fn().mockResolvedValue('OK'), del: jest.fn() };
    history = { recordUpdate: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        TeachersService,
        { provide: PrismaService, useValue: prisma },
        { provide: UploadService, useValue: { deleteFile: jest.fn() } },
        {
          provide: StatusHistoryService,
          useValue: { changeStatus: jest.fn() },
        },
        { provide: EntityHistoryService, useValue: history },
        { provide: RedisService, useValue: redis },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get(TeachersService);
  });

  it('bumps the version with the hash, mirrors it and journals who set it', async () => {
    const res = await service.update(
      30,
      { password: 'yangiParol1' } as any,
      1001,
      99,
    );

    const call = prisma.user.update.mock.calls[0][0];
    expect(call.data.sessionVersion).toEqual({ increment: 1 });
    expect(typeof call.data.password).toBe('string');
    expect(call.select.sessionVersion).toBe(true);
    expect(redis.set).toHaveBeenCalledWith(
      'user:session-version:30',
      '2',
      'EX',
      expect.any(Number),
    );
    expect(history.recordUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'User',
        entityId: 30,
        newValues: { parol: "yangi parol o'rnatildi" },
        changedById: 99,
        companyId: 1001,
      }),
    );
    expect(res).not.toHaveProperty('sessionVersion');
  });

  it('leaves the sessions alone when no password is sent', async () => {
    await service.update(30, { firstName: 'Olim' } as any, 1001, 99);

    expect(
      prisma.user.update.mock.calls[0][0].data.sessionVersion,
    ).toBeUndefined();
    expect(redis.set).not.toHaveBeenCalled();
    expect(history.recordUpdate).not.toHaveBeenCalled();
  });
});
