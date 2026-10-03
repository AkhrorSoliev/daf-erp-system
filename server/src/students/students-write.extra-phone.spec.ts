import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { StudentsWriteService } from './students-write.service';
import { StudentLeadOriginService } from '../common/student-origin/student-lead-origin.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { UploadService } from '../upload/upload.service';
import { StatusHistoryService } from '../common/status/status-history.service';
import { StatusCascadeService } from '../common/status/status-cascade.service';
import { EntityHistoryService } from '../common/entity-history';
import { TransactionsService } from '../transactions/transactions.service';
import {
  EXTRA_PHONE_IS_MAIN_MESSAGE,
  EXTRA_PHONE_TAKEN_ELSEWHERE_STAFF_MESSAGE,
  extraPhoneTakenStaffMessage,
} from './shared/extra-phone-rule';

/**
 * ADR-0070: a backup number is a sign-in key, so staff may not give a student
 * a number another student already signs in with, nor the card's own number.
 */
describe('StudentsWriteService — backup number (ADR-0070)', () => {
  let service: StudentsWriteService;
  let prisma: any;

  const COMPANY = 1001;
  const CEO = 10001;
  const HOLDER = { id: 10999, firstName: 'Vali', lastName: 'Aliyev' };
  const student = {
    id: 10077,
    phone: '901234567',
    extraPhone: null,
    userId: 20077,
    companyId: COMPANY,
    photo: null,
    deletedAt: null,
  };

  beforeEach(async () => {
    prisma = {
      studentBranch: {
        findFirst: jest.fn().mockResolvedValue({ branchId: 1 }),
      },
      user: {
        findFirst: jest.fn().mockResolvedValue({
          id: CEO,
          mainBranch: null,
          branches: [],
          roles: [{ role: { name: 'CEO' } }],
        }),
      },
      student: { findFirst: jest.fn() },
      branch: { findFirst: jest.fn().mockResolvedValue({ id: 1 }) },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentsWriteService,
        { provide: RedisService, useValue: { set: jest.fn() } },
        { provide: PrismaService, useValue: prisma },
        { provide: UploadService, useValue: { deleteFile: jest.fn() } },
        { provide: StatusHistoryService, useValue: {} },
        { provide: StatusCascadeService, useValue: {} },
        {
          provide: EntityHistoryService,
          useValue: { recordCreate: jest.fn(), recordUpdate: jest.fn() },
        },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: TransactionsService, useValue: {} },
        {
          provide: StudentLeadOriginService,
          useValue: {
            assertSourceUsable: jest.fn(),
            recordDirectOrigin: jest.fn(),
          },
        },
      ],
    }).compile();
    service = module.get(StudentsWriteService);
  });

  describe('update', () => {
    it("refuses a backup number another student's card holds, naming them", async () => {
      // 1st: the card being edited; 2nd: the branch guard's existence check;
      // 3rd: the rule's "another card on the number"; 4th: the naming check's
      // existence lookup (the caller is a CEO, who may open every student).
      prisma.student.findFirst
        .mockResolvedValueOnce(student)
        .mockResolvedValueOnce({ id: 10077 })
        .mockResolvedValueOnce(HOLDER)
        .mockResolvedValueOnce({ id: HOLDER.id });

      await expect(
        service.update(10077, { extraPhone: '935554433' }, CEO, COMPANY),
      ).rejects.toThrow(extraPhoneTakenStaffMessage('Vali Aliyev'));
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('does not name a holder the caller may not open (another branch)', async () => {
      const ADMIN = 10002;
      prisma.user.findFirst.mockResolvedValue({
        id: ADMIN,
        mainBranch: 1,
        branches: [{ branchId: 1 }],
        roles: [{ role: { name: 'Administrator' } }],
      });
      // The edited card is in branch 1 (the caller's), the holder in branch 2.
      prisma.studentBranch.findFirst
        .mockResolvedValueOnce({ branchId: 1 })
        .mockResolvedValueOnce({ branchId: 2 });
      prisma.student.findFirst
        .mockResolvedValueOnce(student)
        .mockResolvedValueOnce({ id: 10077 })
        .mockResolvedValueOnce(HOLDER)
        .mockResolvedValueOnce({ id: HOLDER.id });

      const err = await service
        .update(10077, { extraPhone: '935554433' }, ADMIN, COMPANY)
        .catch((e) => e);
      expect(err).toBeInstanceOf(BadRequestException);
      expect(err.message).toBe(EXTRA_PHONE_TAKEN_ELSEWHERE_STAFF_MESSAGE);
      expect(err.message).not.toContain('Vali');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("refuses the card's own main number as its backup number", async () => {
      // 1st: the card being edited; 2nd: the branch guard's existence check.
      prisma.student.findFirst
        .mockResolvedValueOnce(student)
        .mockResolvedValueOnce({ id: 10077 });

      await expect(
        service.update(10077, { extraPhone: '901234567' }, CEO, COMPANY),
      ).rejects.toThrow(EXTRA_PHONE_IS_MAIN_MESSAGE);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses a main number change that lands on the own backup number', async () => {
      prisma.student.findFirst
        .mockResolvedValueOnce({ ...student, extraPhone: '935554433' })
        // the branch guard's existence check
        .mockResolvedValueOnce({ id: 10077 })
        // the main-number "taken by another card" check
        .mockResolvedValueOnce(null);

      await expect(
        service.update(10077, { phone: '935554433' }, CEO, COMPANY),
      ).rejects.toThrow(EXTRA_PHONE_IS_MAIN_MESSAGE);
    });

    it('does not ask the rule when the backup number is unchanged', async () => {
      prisma.student.findFirst
        .mockResolvedValueOnce({ ...student, extraPhone: '935554433' })
        // the branch guard's existence check
        .mockResolvedValueOnce({ id: 10077 });
      // `formatStudent` maps `branches` and `enrollments`, so the fake row carries both.
      prisma.$transaction.mockResolvedValue({
        ...student,
        extraPhone: '935554433',
        branches: [],
        enrollments: [],
      });

      await service.update(
        10077,
        { extraPhone: '935554433', firstName: 'Ali' },
        CEO,
        COMPANY,
      );
      // Only the card load and the branch guard ask; the rule's card lookup
      // (`OR: [{ phone }, { extraPhone }]`) is never made.
      expect(prisma.student.findFirst).toHaveBeenCalledTimes(2);
      expect(prisma.student.findFirst).not.toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ OR: expect.anything() }),
        }),
      );
    });
  });

  describe('create', () => {
    it('refuses a taken backup number before anything is written', async () => {
      // 1st: "is the main number taken?" → no; 2nd: the rule → another card.
      prisma.student.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(HOLDER);

      await expect(
        service.create(
          {
            firstName: 'Ali',
            lastName: 'Valiyev',
            phone: '901234567',
            extraPhone: '935554433',
            branchIds: [1],
          } as any,
          COMPANY,
          CEO,
          { kind: 'DIRECT', sourceId: 'src-1' } as any,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
