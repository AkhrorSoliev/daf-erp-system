import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as bcrypt from 'bcryptjs';
import { StudentPortalWriteService } from './student-portal-write.service';
import { StudentsWriteService } from './students-write.service';
import { StudentLeadOriginService } from '../common/student-origin/student-lead-origin.service';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { StatusHistoryService } from '../common/status/status-history.service';
import { StatusCascadeService } from '../common/status/status-cascade.service';
import { EntityHistoryService } from '../common/entity-history';
import { TransactionsService } from '../transactions/transactions.service';
import { RedisService } from '../redis/redis.service';

/** Both student password writes end the student's other sessions (ADR-0030). */
describe('student password writes end the other sessions', () => {
  describe('StudentPortalWriteService.changePassword (the student themself)', () => {
    let service: StudentPortalWriteService;
    let prisma: any;
    let redis: { set: jest.Mock };
    let history: { recordUpdate: jest.Mock };

    beforeEach(async () => {
      prisma = {
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: 99001,
            password: await bcrypt.hash('eskiParol1', 4),
          }),
          update: jest.fn().mockResolvedValue({ sessionVersion: 3 }),
        },
        student: {
          findFirst: jest.fn().mockResolvedValue({ companyId: 1001 }),
        },
      };
      redis = { set: jest.fn().mockResolvedValue('OK') };
      history = { recordUpdate: jest.fn() };

      const module = await Test.createTestingModule({
        providers: [
          StudentPortalWriteService,
          { provide: PrismaService, useValue: prisma },
          { provide: UploadService, useValue: { deleteFile: jest.fn() } },
          { provide: EntityHistoryService, useValue: history },
          { provide: RedisService, useValue: redis },
        ],
      }).compile();
      service = module.get(StudentPortalWriteService);
    });

    it('bumps the version with the hash, mirrors it and keeps the journal entry', async () => {
      const res = await service.changePassword(99001, 10001, {
        oldPassword: 'eskiParol1',
        newPassword: 'yangiParol1',
      });

      expect(res.sessionVersion).toBe(3);
      const call = prisma.user.update.mock.calls[0][0];
      expect(call.data.sessionVersion).toEqual({ increment: 1 });
      expect(call.select).toEqual({ sessionVersion: true });
      expect(redis.set).toHaveBeenCalledWith(
        'user:session-version:99001',
        '3',
        'EX',
        expect.any(Number),
      );
      expect(history.recordUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Student',
          entityId: 10001,
          newValues: { parol: "o'zgartirildi" },
        }),
      );
    });
  });

  describe('StudentsWriteService.update (staff set a student password)', () => {
    const CEO_CALLER = {
      mainBranch: null,
      branches: [],
      roles: [{ role: { name: 'CEO' } }],
    };
    const studentRow = {
      id: 10001,
      userId: 99001,
      companyId: 1001,
      phone: '901234567',
      photo: null,
      branches: [],
      enrollments: [],
    };

    let service: StudentsWriteService;
    let prisma: any;
    let redis: { set: jest.Mock };
    let history: { recordUpdate: jest.Mock };

    beforeEach(async () => {
      prisma = {
        student: {
          findFirst: jest.fn().mockResolvedValue(studentRow),
          update: jest.fn().mockResolvedValue(studentRow),
        },
        studentBranch: {
          findFirst: jest.fn().mockResolvedValue({ branchId: 1 }),
        },
        user: {
          findFirst: jest.fn().mockResolvedValue(CEO_CALLER),
          update: jest.fn().mockResolvedValue({ sessionVersion: 6 }),
        },
        $transaction: jest.fn((cb: any) => cb(prisma)),
      };
      redis = { set: jest.fn().mockResolvedValue('OK') };
      history = { recordUpdate: jest.fn() };

      const module = await Test.createTestingModule({
        providers: [
          StudentsWriteService,
          { provide: PrismaService, useValue: prisma },
          { provide: UploadService, useValue: { deleteFile: jest.fn() } },
          { provide: StatusHistoryService, useValue: {} },
          { provide: StatusCascadeService, useValue: {} },
          { provide: EntityHistoryService, useValue: history },
          { provide: EventEmitter2, useValue: { emit: jest.fn() } },
          { provide: TransactionsService, useValue: {} },
          { provide: StudentLeadOriginService, useValue: {} },
          { provide: RedisService, useValue: redis },
        ],
      }).compile();
      service = module.get(StudentsWriteService);
    });

    it('ends the student sessions and journals it on the student card', async () => {
      await service.update(10001, { password: 'yangiParol1' } as any, 7, 1001);

      const call = prisma.user.update.mock.calls[0][0];
      expect(call.where).toEqual({ id: 99001 });
      expect(call.data.sessionVersion).toEqual({ increment: 1 });
      expect(call.select).toEqual({ sessionVersion: true });
      expect(redis.set).toHaveBeenCalledWith(
        'user:session-version:99001',
        '6',
        'EX',
        expect.any(Number),
      );
      expect(history.recordUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Student',
          entityId: 10001,
          newValues: { parol: "yangi parol o'rnatildi" },
          changedById: 7,
          companyId: 1001,
        }),
      );
    });

    it('mirrors the bump after the commit, even if the journal then fails', async () => {
      const order: string[] = [];
      prisma.$transaction = jest.fn(async (cb: any) => {
        const result = await cb(prisma);
        order.push('commit');
        return result;
      });
      redis.set.mockImplementation(async () => {
        order.push('mirror');
        return 'OK';
      });
      history.recordUpdate.mockRejectedValueOnce(new Error('journal down'));

      await expect(
        service.update(10001, { password: 'yangiParol1' } as any, 7, 1001),
      ).rejects.toThrow('journal down');

      expect(order).toEqual(['commit', 'mirror']);
    });

    it('leaves the sessions alone when no password is sent', async () => {
      await service.update(10001, { firstName: 'Ali' } as any, 7, 1001);

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(redis.set).not.toHaveBeenCalled();
    });
  });
});
