import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { StudentEnrollmentService } from './student-enrollment.service';
import { PrismaService } from '../prisma/prisma.service';
import { EntityHistoryService } from '../common/entity-history';
import { TransactionsService } from '../transactions/transactions.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('StudentEnrollmentService', () => {
  let service: StudentEnrollmentService;
  let prisma: any;

  const mockStudent = {
    id: 1,
    firstName: 'Ali',
    lastName: 'Valiyev',
    phone: '901234567',
    status: 'ACTIVE',
    isActive: true,
    companyId: 1001,
    deletedAt: null,
  };

  beforeEach(async () => {
    prisma = {
      student: {
        findFirst: jest.fn().mockResolvedValue(mockStudent),
        findUnique: jest.fn().mockResolvedValue(mockStudent),
      },
      enrollment: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'enroll-1', studentId: 1, groupId: 'group-1' }),
        update: jest.fn(),
      },
      group: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'group-1', name: 'A1', deletedAt: null, statusEnum: 'ACTIVE',
          courseId: 'course-1', branchId: 1,
          course: { name: 'Deutsch A1' },
          days: 'ODD', exactDays: [], lessonStartTime: '09:00', lessonEndTime: '10:30',
        }),
        findUnique: jest.fn().mockResolvedValue({ name: 'A1' }),
      },
      course: {
        findUnique: jest.fn().mockResolvedValue({ price: 800000, lessonPaymentCount: 12 }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentEnrollmentService,
        { provide: PrismaService, useValue: prisma },
        { provide: EntityHistoryService, useValue: { recordCreate: jest.fn(), recordUpdate: jest.fn(), recordDelete: jest.fn(), recordStatusChange: jest.fn(), recordRestore: jest.fn() } },
        { provide: TransactionsService, useValue: { deductLessonFee: jest.fn() } },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get(StudentEnrollmentService);
  });

  describe('enrollToGroup', () => {
    it('throws BadRequestException for non-ACTIVE student', async () => {
      prisma.student.findFirst.mockResolvedValue({ ...mockStudent, status: 'FROZEN' });
      await expect(service.enrollToGroup(1, 'group-1', 2)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for GRADUATED student', async () => {
      prisma.student.findFirst.mockResolvedValue({ ...mockStudent, status: 'GRADUATED' });
      await expect(service.enrollToGroup(1, 'group-1', 2)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for COMPLETED group', async () => {
      prisma.group.findFirst.mockResolvedValue({
        id: 'group-1', name: 'A1', deletedAt: null, statusEnum: 'COMPLETED',
        course: { name: 'Deutsch A1' },
      });
      await expect(service.enrollToGroup(1, 'group-1', 2)).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for CANCELLED group', async () => {
      prisma.group.findFirst.mockResolvedValue({
        id: 'group-1', name: 'A1', deletedAt: null, statusEnum: 'CANCELLED',
        course: { name: 'Deutsch A1' },
      });
      await expect(service.enrollToGroup(1, 'group-1', 2)).rejects.toThrow(BadRequestException);
    });

    it('allows enrollment to FORMING group', async () => {
      prisma.group.findFirst.mockResolvedValue({
        id: 'group-1', name: 'A1', deletedAt: null, statusEnum: 'FORMING',
        course: { name: 'Deutsch A1' },
        days: 'ODD', exactDays: [], lessonStartTime: '09:00', lessonEndTime: '10:30',
      });
      await expect(service.enrollToGroup(1, 'group-1', 2)).resolves.not.toThrow();
    });

    it('allows enrollment to PAUSED group', async () => {
      prisma.group.findFirst.mockResolvedValue({
        id: 'group-1', name: 'A1', deletedAt: null, statusEnum: 'PAUSED',
        course: { name: 'Deutsch A1' },
        days: 'ODD', exactDays: [], lessonStartTime: '09:00', lessonEndTime: '10:30',
      });
      await expect(service.enrollToGroup(1, 'group-1', 2)).resolves.not.toThrow();
    });
  });
});
