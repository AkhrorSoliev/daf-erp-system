import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { StudentsService } from './students.service';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
import { StatusHistoryService, StatusCascadeService } from '../common/status';
import { EntityHistoryService } from '../common/entity-history';

describe('StudentsService — status methods', () => {
  let service: StudentsService;
  let prisma: any;
  let statusHistoryService: any;
  let statusCascadeService: any;

  const mockStudent = {
    id: 1,
    firstName: 'Ali',
    lastName: 'Valiyev',
    phone: '901234567',
    status: 'ACTIVE',
    isActive: true,
    companyId: 1001,
    photo: null,
    deletedAt: null,
  };

  const auditData = {
    statusChangedAt: new Date(),
    statusChangedById: 1,
    statusChangeReason: null,
  };

  const mockStudentSelect = {
    ...mockStudent,
    enrollments: [],
    branches: [],
    deletedBy: null,
    gender: null,
    dateOfBirth: null,
    comment: null,
    balance: 0,
    extraPhone: null,
    parentPhone: null,
    parentName: null,
    telegram: null,
    telegramChatId: null,
    placeOfStudy: null,
    address: null,
    passportSeries: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    statusChangedAt: null,
    statusChangedById: null,
    statusChangeReason: null,
  };

  beforeEach(async () => {
    prisma = {
      student: {
        findFirst: jest.fn().mockResolvedValue(mockStudent),
        update: jest.fn().mockResolvedValue(mockStudentSelect),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    statusHistoryService = {
      changeStatus: jest.fn().mockResolvedValue(auditData),
      getHistory: jest.fn().mockResolvedValue([]),
    };

    statusCascadeService = {
      cascade: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: UploadService, useValue: { deleteFile: jest.fn() } },
        { provide: StatusHistoryService, useValue: statusHistoryService },
        { provide: StatusCascadeService, useValue: statusCascadeService },
        { provide: EntityHistoryService, useValue: { recordCreate: jest.fn(), recordUpdate: jest.fn(), recordDelete: jest.fn(), recordStatusChange: jest.fn(), recordRestore: jest.fn() } },
      ],
    }).compile();

    service = module.get(StudentsService);
  });

  describe('changeStatus', () => {
    it('calls statusHistoryService, updates student, and cascades', async () => {
      await service.changeStatus(1, { status: 'INACTIVE' as any }, 2);

      expect(statusHistoryService.changeStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Student',
          entityId: '1',
          fromStatus: 'ACTIVE',
          toStatus: 'INACTIVE',
        }),
      );

      expect(prisma.student.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 1 },
          data: expect.objectContaining({
            status: 'INACTIVE',
            isActive: false,
          }),
        }),
      );

      expect(statusCascadeService.cascade).toHaveBeenCalledWith(
        'Student', '1', 'INACTIVE', 2,
      );
    });

    it('sets isActive=true only when status is ACTIVE', async () => {
      await service.changeStatus(1, { status: 'ACTIVE' as any }, 2);

      expect(prisma.student.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isActive: true }),
        }),
      );
    });

    it('sets isActive=false for non-ACTIVE statuses', async () => {
      await service.changeStatus(1, { status: 'GRADUATED' as any }, 2);

      expect(prisma.student.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isActive: false }),
        }),
      );
    });

    it('throws NotFoundException when student not found', async () => {
      prisma.student.findFirst.mockResolvedValue(null);

      await expect(
        service.changeStatus(999, { status: 'INACTIVE' as any }, 1),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('archives student: status ARCHIVED + deletedAt + statusHistory', async () => {
      await service.delete(1, 2);

      expect(statusHistoryService.changeStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'Student',
          toStatus: 'ARCHIVED',
        }),
      );

      expect(prisma.student.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'ARCHIVED',
            isActive: false,
            deletedAt: expect.any(Date),
            deletedById: 2,
          }),
        }),
      );
    });

    it('throws NotFoundException when student not found', async () => {
      prisma.student.findFirst.mockResolvedValue(null);

      await expect(service.delete(999, 1)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getStatusHistory', () => {
    it('delegates to statusHistoryService.getHistory', async () => {
      prisma.student.findFirst.mockResolvedValue({ id: 1 });

      await service.getStatusHistory(1);

      expect(statusHistoryService.getHistory).toHaveBeenCalledWith('Student', '1');
    });

    it('throws NotFoundException when student not found', async () => {
      prisma.student.findFirst.mockResolvedValue(null);

      await expect(service.getStatusHistory(999)).rejects.toThrow(NotFoundException);
    });
  });
});
