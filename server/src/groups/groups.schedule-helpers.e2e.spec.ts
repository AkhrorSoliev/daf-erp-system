import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';
import { GroupScheduleService } from './group-schedule.service';
import { PrismaService } from '../prisma/prisma.service';
import { BranchScopeGuard } from '../common/auth/branch-scope.guard';

/**
 * The five schedule helpers used to hand the raw `?branchId=` to the service,
 * so an Administrator of branch 1 read branch 2's rooms, teachers (name,
 * photo, busy group), timetable and next group number by editing it. They now
 * answer for the scope the REAL `BranchScopeGuard` resolves — and the guard
 * reads `branch_id` before `branchId`, which is why a fix that checked the
 * scope but kept the raw value would still leak.
 */
describe('GroupsController schedule helpers — branch scope (e2e)', () => {
  let app: INestApplication;
  // The account `BranchScopeGuard` reads for the signed-in caller.
  let caller: unknown;

  const ADMIN_OF_BRANCH_1 = {
    mainBranch: 1,
    branches: [{ branchId: 1 }],
    roles: [{ role: { name: 'Administrator' } }],
  };
  const CEO = {
    mainBranch: null,
    branches: [],
    roles: [{ role: { name: 'CEO' } }],
  };

  const schedule = {
    getScheduleConflicts: jest.fn().mockResolvedValue({}),
    getAvailableRooms: jest.fn().mockResolvedValue([]),
    getAvailableTeachers: jest.fn().mockResolvedValue([]),
    getAvailableSlots: jest.fn().mockResolvedValue({}),
  };
  const groups = {
    getNextName: jest.fn().mockResolvedValue({ nextName: '#001' }),
  };
  const prisma = {
    user: { findFirst: jest.fn(() => Promise.resolve(caller)) },
  };

  const TIMES = { exactDays: 'MON,WED', startTime: '10:00', endTime: '11:30' };
  // Each helper, the rest of its query, and the branch its service received
  // (undefined = the service was never called).
  const HELPERS: [string, Record<string, string>, () => unknown][] = [
    [
      '/groups/available-rooms',
      TIMES,
      () => schedule.getAvailableRooms.mock.calls[0]?.[0]?.branchId,
    ],
    [
      '/groups/available-teachers',
      TIMES,
      () => schedule.getAvailableTeachers.mock.calls[0]?.[0]?.branchId,
    ],
    [
      '/groups/schedule-conflicts',
      TIMES,
      () => schedule.getScheduleConflicts.mock.calls[0]?.[0]?.branchId,
    ],
    [
      '/groups/available-slots',
      { roomId: 'room-1', exactDays: 'MON' },
      () => schedule.getAvailableSlots.mock.calls[0]?.[0]?.branchId,
    ],
    ['/groups/next-name', {}, () => groups.getNextName.mock.calls[0]?.[0]],
  ];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [GroupsController],
      providers: [
        { provide: GroupsService, useValue: groups },
        { provide: GroupScheduleService, useValue: schedule },
        { provide: PrismaService, useValue: prisma },
        { provide: APP_GUARD, useClass: BranchScopeGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    // Same pipe as main.ts.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    // Stands in for JwtStrategy.
    app.use((req: any, _res: any, next: any) => {
      req.user = { id: 10011, companyId: 1001, roles: [] };
      next();
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    caller = ADMIN_OF_BRANCH_1;
  });

  describe.each(HELPERS)('GET %s', (path, rest, branchReceived) => {
    it('serves an Administrator their own branch, as the client asks for it (query + header)', async () => {
      await request(app.getHttpServer())
        .get(path)
        .set('X-Branch-Id', '1')
        .query({ ...rest, branchId: '1' })
        .expect(200);

      expect(branchReceived()).toBe(1);
    });

    it('refuses another branch named in ?branchId= with 403 and never queries it', async () => {
      const res = await request(app.getHttpServer())
        .get(path)
        .query({ ...rest, branchId: '2' });

      expect(res.status).toBe(403);
      expect(res.body.message).toBe("Bu amal uchun filial huquqingiz yo'q");
      expect(branchReceived()).toBeUndefined();
    });

    it('answers for the RESOLVED branch, not the raw ?branchId=, when branch_id is sent too', async () => {
      await request(app.getHttpServer())
        .get(path)
        .query({ ...rest, branch_id: '1', branchId: '2' })
        .expect(200);

      expect(branchReceived()).toBe(1);
    });

    it('lets the CEO read any branch', async () => {
      caller = CEO;

      await request(app.getHttpServer())
        .get(path)
        .query({ ...rest, branchId: '2' })
        .expect(200);

      expect(branchReceived()).toBe(2);
    });

    it('asks a CEO who named no branch to pick one (400) and never queries', async () => {
      caller = CEO;

      const res = await request(app.getHttpServer()).get(path).query(rest);

      expect(res.status).toBe(400);
      expect(branchReceived()).toBeUndefined();
    });
  });
});
