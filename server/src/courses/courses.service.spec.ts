import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { CoursesService } from './courses.service';
import { PrismaService } from '../prisma/prisma.service';
import { StatusHistoryService, StatusCascadeService } from '../common/status';
import { EntityHistoryService } from '../common/entity-history';

describe('CoursesService — status methods', () => {
  let service: CoursesService;
  let prisma: any;
  let statusHistoryService: any;
  let statusCascadeService: any;

  const mockCourse = {
    id: 'course-1',
    name: 'English',
    status: 'ACTIVE',
    isActive: true,
    companyId: 1001,
    deletedAt: null,
  };

  beforeEach(async () => {
    prisma = {
      course: {
        findFirst: jest.fn().mockResolvedValue(mockCourse),
        update: jest.fn().mockResolvedValue(mockCourse),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
      },
      branch: { findFirst: jest.fn() },
    };

    statusHistoryService = {
      changeStatus: jest.fn().mockResolvedValue({
        statusChangedAt: new Date(), statusChangedById: 1, statusChangeReason: null,
      }),
    };

    statusCascadeService = {
      cascade: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CoursesService,
        { provide: PrismaService, useValue: prisma },
        { provide: StatusHistoryService, useValue: statusHistoryService },
        { provide: StatusCascadeService, useValue: statusCascadeService },
        { provide: EntityHistoryService, useValue: { recordCreate: jest.fn(), recordUpdate: jest.fn(), recordDelete: jest.fn(), recordStatusChange: jest.fn(), recordRestore: jest.fn() } },
      ],
    }).compile();

    service = module.get(CoursesService);
  });

  describe('changeStatus', () => {
    it('updates status and sets isActive=true for ACTIVE', async () => {
      prisma.course.findFirst.mockResolvedValue({ ...mockCourse, status: 'INACTIVE' });

      await service.changeStatus('course-1', { status: 'ACTIVE' as any }, 1);

      expect(prisma.course.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'ACTIVE', isActive: true }),
        }),
      );
    });

    it('cascades on status change', async () => {
      await service.changeStatus('course-1', { status: 'DEPRECATED' as any }, 1);

      expect(statusCascadeService.cascade).toHaveBeenCalledWith(
        'Course', 'course-1', 'DEPRECATED', 1,
      );
    });

    it('throws NotFoundException for missing course', async () => {
      prisma.course.findFirst.mockResolvedValue(null);
      await expect(
        service.changeStatus('missing', { status: 'INACTIVE' as any }, 1),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('archives course with ARCHIVED status', async () => {
      await service.delete('course-1', 1);

      expect(prisma.course.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'ARCHIVED',
            isActive: false,
            deletedAt: expect.any(Date),
          }),
        }),
      );
    });
  });
});
